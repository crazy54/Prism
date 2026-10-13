// Synthetic telemetry for the PROTEUS dashboard demo: a small service mesh with
// believable metrics (traffic, latency percentiles, errors, saturation), a log
// stream, and injectable incidents — each with the evidence trail and
// reasoning an AI troubleshooter would walk a learner through.

import { rng } from '../src/easing.js';

const SERVICES = ['gateway', 'auth', 'checkout', 'payments', 'catalog', 'postgres', 'redis'];
const LINKS = [['gateway', 'auth'], ['gateway', 'checkout'], ['gateway', 'catalog'], ['checkout', 'payments'], ['checkout', 'postgres'], ['catalog', 'redis'], ['auth', 'redis'], ['payments', 'postgres']];
const ENDPOINTS = ['POST /checkout', 'GET /cart', 'POST /login', 'GET /catalog', 'POST /pay', 'GET /health'];

export const INCIDENTS = {
  'db-pool': {
    title: 'Connection pool exhaustion',
    service: 'checkout',
    summary: 'p95 latency on checkout climbed ~4× and 5xx errors spiked while postgres CPU stayed flat.',
    evidence: [
      ['query_metrics', 'checkout p95 1.9s (baseline 420ms), 5xx 6.1%'],
      ['search_logs', '"pool exhausted: 20/20 connections in use" ×312'],
      ['diff_deploys', 'v2.14.1 raised worker concurrency 8 → 32 at T-4m'],
      ['check_dependency', 'postgres CPU 31%, no slow queries — DB is waiting, not working'],
    ],
    hypotheses: [['DB connection pool exhaustion', 0.82], ['Slow payments upstream', 0.11], ['Noisy neighbor / CPU steal', 0.07]],
    fix: 'Roll back v2.14.1 or size the pool to concurrency (pool ≥ workers). Add pool-wait-time to the SLO dashboard.',
    lesson: 'Latency up + errors up + the dependency idle ⇒ suspect a queue in front of it (pools, locks, semaphores), not the dependency itself.',
  },
  'memory-leak': {
    title: 'Memory leak in catalog cache',
    service: 'catalog',
    summary: 'catalog memory grows linearly with periodic latency spikes that line up with GC pauses.',
    evidence: [
      ['query_metrics', 'catalog RSS +38 MB/min, never plateaus'],
      ['search_logs', '"GC pause 740ms" every ~45s, rising'],
      ['heap_profile', 'LRU entries 2.1M — eviction disabled by config flag'],
      ['diff_config', 'cache.maxEntries removed in config rev 88'],
    ],
    hypotheses: [['Unbounded cache (eviction off)', 0.76], ['Leaked event listeners', 0.15], ['Traffic growth', 0.09]],
    fix: 'Restore cache.maxEntries, restart catalog pods in a rolling fashion, alert on RSS slope not just absolute value.',
    lesson: 'A sawtooth in latency that tracks GC is a memory problem wearing a latency costume — look at the slope of memory.',
  },
  'bad-deploy': {
    title: 'Regression in auth deploy',
    service: 'auth',
    summary: 'Login errors jumped from 0.2% to 9% within a minute of a deploy; latency is normal.',
    evidence: [
      ['query_metrics', 'POST /login 5xx 9.3%, p95 unchanged'],
      ['search_logs', 'TypeError: cannot read "tenantId" of undefined ×1.4k'],
      ['diff_deploys', 'auth v5.2.0 deployed at T-1m (canary skipped)'],
      ['trace_sample', 'failures only for SSO users without a tenant claim'],
    ],
    hypotheses: [['Code regression in v5.2.0', 0.88], ['IdP outage', 0.08], ['Expired signing key', 0.04]],
    fix: 'Roll back auth to v5.1.4, add a contract test for tokens without tenant claims, re-enable the canary gate.',
    lesson: 'Errors without latency change, starting at a deploy boundary, usually mean a logic bug — correlate with the change log first.',
  },
};

export const INCIDENT_IDS = Object.keys(INCIDENTS);

/**
 * Create a simulation. Call step(dt) each frame; read fields directly.
 * Metric histories (`h.*`) are sampled at `sampleHz` so charts can scroll one
 * braille pixel per sample — smooth at any frame rate. The latency heatmap
 * keeps its own, slower 4 Hz column clock.
 */
export function createSim({ seed = 42, sampleHz = 15, window = 60, heatHz = 4, heatHistory = 240 } = {}) {
  const r = rng(seed);
  const history = Math.round(sampleHz * window);
  const hist = (v) => Array.from({ length: history }, () => v);
  const sim = {
    t: 0,
    rps: 1200, p50: 0.12, p95: 0.42, p99: 0.9, err: 0.002, cpu: 0.38, mem: 0.52, disk: 0.61,
    h: { rps: hist(1200), p50: hist(0.12), p95: hist(0.42), p99: hist(0.9), err: hist(0.002), cpu: hist(0.38), mem: hist(0.52) },
    heat: Array.from({ length: 16 }, () => []), // latency buckets (fast → slow) × time
    services: SERVICES.map((name) => ({ name, health: 1, rps: 0, err: 0 })),
    links: LINKS,
    endpoints: ENDPOINTS.map((name) => ({ name, err: r() * 4 })),
    logs: [],
    incident: null,
    status: 'HEALTHY',
    sampleHz,
    _acc: 0,
    _heatAcc: 0,
    _j: { rps: 0, p50: 0, p95: 0, p99: 0, err: 0, cpu: 0 }, // noise, refreshed per sample
  };

  // One histogram column: log-spaced latency buckets, mass centered on p50 with a p99 tail.
  const heatColumn = (p50, p99) => sim.heat.map((_, b) => {
    const edge = 0.015 * 2 ** (b * 0.55);
    const m = Math.exp(-(((Math.log(edge) - Math.log(p50)) / 0.55) ** 2)) + 0.4 * Math.exp(-(((Math.log(edge) - Math.log(p99)) / 0.45) ** 2));
    return m * (0.85 + r() * 0.3);
  });
  for (let i = 0; i < heatHistory; i++) heatColumn(0.12, 0.9).forEach((v, b) => sim.heat[b].push(v));

  const log = (level, msg) => {
    const ts = new Date(Date.UTC(2026, 9, 12, 14, 0, 0) + sim.t * 1000).toISOString().slice(11, 19);
    sim.logs.push({ time: ts, level, msg });
    if (sim.logs.length > 200) sim.logs.shift();
  };

  sim.inject = (kind = r.pick(INCIDENT_IDS)) => {
    sim.incident = { kind, ...INCIDENTS[kind], start: sim.t };
    log('warn', kind === 'bad-deploy' ? 'deploy auth v5.2.0 → prod (canary: skipped)' : kind === 'db-pool' ? 'deploy checkout v2.14.1 → prod' : 'config rev 88 applied to catalog');
  };
  sim.resolve = () => { if (sim.incident) log('info', `mitigation applied: ${sim.incident.title.toLowerCase()} resolved`); sim.incident = null; };

  sim.step = (dt) => {
    sim.t += dt;
    const t = sim.t;
    const inc = sim.incident;
    const age = inc ? t - inc.start : 0;
    const ramp = inc ? Math.min(1, age / 6) : 0;
    const wave = Math.sin(t * 0.21) * 0.08 + Math.sin(t * 0.047) * 0.12;
    const jitter = () => (r() - 0.5) * 2;
    const J = sim._j;

    // Targets: trend + incident effects + noise that changes per *sample*, not per
    // frame — so values don't flicker faster at higher fps.
    let rps = 1200 * (1 + wave) + J.rps * 40;
    let p50 = 0.12 + J.p50 * 0.008, p95 = 0.42 + J.p95 * 0.03, p99 = 0.9 + J.p99 * 0.08;
    let err = 0.002 + Math.max(0, J.err) * 0.0015;
    let cpu = 0.38 + wave * 0.6 + J.cpu * 0.02, mem = sim.mem;

    if (inc?.kind === 'db-pool') { p50 += 0.25 * ramp; p95 += 1.5 * ramp; p99 += 3.2 * ramp; err += 0.06 * ramp; rps *= 1 - 0.12 * ramp; }
    if (inc?.kind === 'bad-deploy') { err += 0.09 * ramp; }
    if (inc?.kind === 'memory-leak') {
      mem = Math.min(0.97, mem + dt * 0.006);
      const gc = Math.max(0, Math.sin(t * 0.14)) ** 24;
      p95 += gc * 1.2 * ramp; p99 += gc * 2.4 * ramp;
    } else mem += (0.52 - mem) * dt * 0.3 + jitter() * 0.002;

    // Ease displayed values toward their targets (frame-rate independent).
    const a = 1 - Math.exp(-dt * 10);
    const ease = (k, v) => { sim[k] += (v - sim[k]) * a; };
    ease('rps', rps); ease('p50', p50); ease('p95', p95); ease('p99', p99);
    ease('err', Math.max(0, err)); ease('cpu', Math.min(1, Math.max(0, cpu)));
    sim.mem = mem;
    sim.disk = 0.61 + Math.sin(t * 0.01) * 0.02;
    sim.status = !inc ? 'HEALTHY' : age < 4 ? 'DEGRADED' : 'INCIDENT';

    sim._acc += dt;
    while (sim._acc >= 1 / sampleHz) {
      sim._acc -= 1 / sampleHz;
      for (const k of Object.keys(sim.h)) { sim.h[k].push(sim[k]); sim.h[k].shift(); }
      for (const k of Object.keys(J)) J[k] = jitter();
    }
    sim._heatAcc += dt;
    while (sim._heatAcc >= 1 / heatHz) {
      sim._heatAcc -= 1 / heatHz;
      heatColumn(sim.p50, sim.p99).forEach((v, b) => { sim.heat[b].push(v); sim.heat[b].shift(); });
    }

    for (const s of sim.services) {
      const hit = inc && (s.name === inc.service || (inc.kind === 'db-pool' && s.name === 'gateway'));
      s.health += ((hit ? 1 - 0.8 * ramp : 1) - s.health) * Math.min(1, dt * 2);
      s.rps = rps * (s.name === 'gateway' ? 1 : 0.2 + r() * 0.05);
      s.err = hit ? err : 0.002;
    }
    for (const e of sim.endpoints) {
      const hit = inc && ((inc.kind === 'db-pool' && /checkout|pay/.test(e.name)) || (inc.kind === 'bad-deploy' && /login/.test(e.name)) || (inc.kind === 'memory-leak' && /catalog/.test(e.name)));
      e.err += ((hit ? 60 + r() * 20 : r() * 4) - e.err) * Math.min(1, dt);
    }

    // Logs: a steady trickle, with incident-specific signal mixed in.
    if (r() < dt * 3) log(r() < 0.8 ? 'info' : 'debug', r.pick(['GET /catalog 200 34ms', 'POST /login 200 88ms', 'cache hit ratio 0.94', 'GET /cart 200 41ms', 'healthcheck ok', 'POST /checkout 201 212ms']));
    if (inc && r() < dt * (2 + 6 * ramp)) {
      if (inc.kind === 'db-pool') log(r() < 0.7 ? 'error' : 'warn', r() < 0.7 ? 'pool exhausted: 20/20 connections in use (waited 2000ms)' : 'POST /checkout 503 2004ms');
      if (inc.kind === 'bad-deploy') log('error', 'TypeError: cannot read "tenantId" of undefined at verifyToken (auth.js:214)');
      if (inc.kind === 'memory-leak') log(r() < 0.5 ? 'warn' : 'info', r() < 0.5 ? `GC pause ${(400 + age * 9).toFixed(0)}ms` : `catalog rss ${(sim.mem * 4096).toFixed(0)}MB`);
      if (ramp > 0.9 && r() < dt * 0.3) log('crit', `SLO burn rate ${(8 + r() * 6).toFixed(1)}× on ${inc.service}`);
    }
  };

  return sim;
}
