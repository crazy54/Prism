// PROTEUS — live metrics + AI troubleshooting console (prism-term demo).
//
//   prism-term dashboard          or   node examples/proteus-dashboard.js
//
// Keys: i inject incident · r apply fix · a auto incidents on/off · t theme · space pause · q quit
//
// Everything on screen is driven by examples/proteus-sim.js (synthetic
// telemetry with injectable incidents). The AI panel replays an investigation
// the way PROTEUS teaches it: evidence via tool calls → ranked hypotheses →
// fix → the lesson to take away.

import { fileURLToPath } from 'node:url';
import { Screen } from '../src/screen.js';
import { Canvas, pickMode } from '../src/canvas.js';
import { resolveCaps } from '../src/player.js';
import { THEME_IDS, getTheme } from '../src/palettes.js';
import { mix, scale } from '../src/color.js';
import { ATTR } from '../src/buffer.js';
import { wrap, truncate } from '../src/width.js';
import { box, kpi, lineChart, heatmap, gauge, barChart, logView, badge, statusDot, progressBar } from '../src/widgets/index.js';
import { drawSpinner } from '../src/spinners.js';
import { drawBanner, shimmer } from '../src/text/index.js';
import { createSim, INCIDENT_IDS } from './proteus-sim.js';

const TIPS = [
  'p99 describes your unhappiest users; p50 describes the typical one. Page on the tail.',
  'Correlate with change events first — most incidents start at a deploy or config change.',
  'USE for resources (Utilization, Saturation, Errors); RED for services (Rate, Errors, Duration).',
  'An idle dependency behind a slow service usually means a queue in between: pool, lock, semaphore.',
  'Errors without latency change → logic bug. Latency without errors → saturation or contention.',
];

// Service-map node positions (normalized to the panel).
const NODES = {
  gateway: [0.08, 0.5], auth: [0.36, 0.16], checkout: [0.36, 0.5], catalog: [0.36, 0.84],
  payments: [0.66, 0.3], postgres: [0.92, 0.42], redis: [0.66, 0.84],
};

export async function runDashboard(opts = {}) {
  const caps = resolveCaps(opts);
  const screen = new Screen({ caps, depth: caps.depth }); // no window title: it belongs to the user
  const sim = createSim({ seed: opts.seed ?? 42 });
  const params = opts.params || {};
  const st = {
    themeId: opts.theme, auto: !/^(0|false|off)$/i.test(params.auto ?? '1'), next: 0,
    triage: null, resolvedAt: -99, nextAuto: 7, tip: 0,
  };

  const inject = (now) => {
    if (sim.incident) return;
    sim.inject(INCIDENT_IDS[st.next++ % INCIDENT_IDS.length]);
    st.triage = { start: now + 2.5, done: Infinity };
  };
  const resolve = (now) => {
    if (!sim.incident) return;
    sim.resolve();
    st.triage = null;
    st.resolvedAt = now;
    st.nextAuto = now + 16;
    st.tip = (st.tip + 1) % TIPS.length;
  };

  let now = 0;
  screen.on('key', (k) => {
    if (k.name === 'q' || k.name === 'escape') screen.stop();
    else if (k.name === 'i') inject(now);
    else if (k.name === 'r') resolve(now);
    else if (k.name === 'a') st.auto = !st.auto;
    else if (k.name === 't') st.themeId = THEME_IDS[(THEME_IDS.indexOf(getTheme(st.themeId).id) + 1) % THEME_IDS.length];
    else if (k.name === 'space') screen.ticker?.toggle();
  });

  await screen.run((t, dt) => {
    now = t;
    sim.step(dt);
    if (st.auto) {
      if (!sim.incident && t >= st.nextAuto) inject(t);
      if (sim.incident && st.triage && t > st.triage.done + 14) resolve(t);
    }
    draw(screen.buffer, t, getTheme(st.themeId), sim, st, caps);
  }, { fps: opts.fps || 60 });
}

export function draw(b, t, th, sim, st, caps) {
  const W = b.width, H = b.height;
  b.clear(th.bg, th.ink);
  if (W < 100 || H < 34) {
    b.text(1, 1, `PROTEUS needs at least 100×34 cells (this terminal is ${W}×${H}).`, th.warn);
    b.text(1, 2, 'Enlarge the window or reduce the font size.', th.muted);
    return;
  }
  const T = { theme: th };
  const inc = sim.incident;

  // ── header ────────────────────────────────────────────────────────────
  drawBanner(b, 1, 0, 'PROTEUS', { font: 'tiny', mode: caps.unicode ? 'half' : 'ascii', fill: 'prism', t, speed: 0.15, theme: th });
  b.text(31, 0, 'metrics · troubleshooting · learning', th.muted);
  b.text(31, 1, 'prod-us-east-1 · 7 services · powered by prism-term', th.dim);
  const status = sim.status;
  const sc = status === 'HEALTHY' ? 'pos' : status === 'DEGRADED' ? 'warn' : 'neg';
  let x = W - 2 - 14 - status.length - 4;
  x += badge(b, x, 0, ` ${status} `, { ...T, color: sc, style: inc && Math.sin(t * 6) > 0 ? 'solid' : 'pill' }) + 1;
  const clock = new Date(Date.UTC(2026, 9, 12, 14, 0, 0) + sim.t * 1000).toISOString().slice(11, 19) + ' UTC';
  b.text(W - 1 - clock.length, 0, clock, th.muted);
  statusDot(b, W - 26, 1, st.auto ? 'ok' : 'off', { ...T, label: st.auto ? 'auto incidents' : 'manual', t });

  // ── KPI row ───────────────────────────────────────────────────────────
  const kw = Math.floor(W / 4);
  // Deltas compare against 10 s ago; sparklines get one sample per braille column.
  const pct = (a) => { const v0 = a.at(-1 - Math.min(a.length - 1, sim.sampleHz * 10)) || 1e-9; return ((a.at(-1) - v0) / v0) * 100; };
  const spark = (a) => a.slice(-Math.max(8, (kw - 4) * 2));
  const kpis = [
    { label: 'throughput', value: Math.round(sim.rps).toLocaleString('en-US'), unit: 'rps', delta: pct(sim.h.rps), trend: spark(sim.h.rps), color: 'info' },
    { label: 'p95 latency', value: Math.round(sim.p95 * 1000), unit: 'ms', delta: pct(sim.h.p95), goodWhen: 'down', trend: spark(sim.h.p95), color: sim.p95 > 1 ? 'neg' : 'accent' },
    { label: 'error rate', value: (sim.err * 100).toFixed(2), unit: '%', delta: pct(sim.h.err), goodWhen: 'down', trend: spark(sim.h.err), color: sim.err > 0.02 ? 'neg' : 'pos' },
    { label: 'saturation', value: Math.round(Math.max(sim.cpu, sim.mem) * 100), unit: '%', delta: pct(sim.h.mem), goodWhen: 'down', trend: spark(sim.h.mem), color: sim.mem > 0.85 ? 'warn' : 'crit' },
  ];
  kpis.forEach((k, i) => kpi(b, i * kw, 3, i === 3 ? W - 3 * kw : kw - 1, 5, { ...T, ...k }));

  // ── bands ─────────────────────────────────────────────────────────────
  const top = 8, avail = H - top - 1;
  const midH = Math.max(9, Math.floor(avail * 0.34));
  const lowH = Math.max(8, Math.floor(avail * 0.26));
  const botY = top + midH + lowH, botH = H - 1 - botY;

  // Latency percentiles.
  const lw = Math.floor(W * 0.58);
  // One sample per braille pixel column, so the chart scrolls a pixel at a time.
  const samples = Math.min(sim.h.p50.length, Math.max(20, (lw - 8) * 2));
  const span = Math.round(samples / sim.sampleHz);
  const lc = box(b, 0, top, lw, midH, { ...T, title: 'Latency (ms) · p50 · p95 · p99', footer: `last ${span}s` });
  const ms = (a) => a.slice(-samples).map((v) => v * 1000);
  lineChart(lc, 0, 0, lc.width, lc.height, [
    { data: ms(sim.h.p50), label: 'p50', color: 'pos' },
    { data: ms(sim.h.p95), label: 'p95', color: 'warn' },
    { data: ms(sim.h.p99), label: 'p99', color: 'neg' },
  ], { ...T, min: 0, grid: true, labels: [`-${span}s`, `-${Math.round(span / 2)}s`, 'now'], fill: false });

  // Service map.
  const sm = box(b, lw, top, W - lw, midH, { ...T, title: 'Service map', footer: inc ? `⚠ ${inc.service}` : 'all healthy' });
  drawServiceMap(sm, t, th, sim, caps);

  // Latency histogram heatmap · gauges · endpoints.
  const ly = top + midH;
  const hw = Math.floor(W * 0.4), gw = Math.floor(W * 0.24);
  const hm = box(b, 0, ly, hw, lowH, { ...T, title: 'Latency distribution', footer: 'log buckets × time' });
  heatmap(hm, 0, 0, resampleRows(sim.heat.slice().reverse(), hm.height * 2).map((row) => row.slice(-Math.max(4, hm.width))), { ...T, palette: 'magma', width: hm.width, height: hm.height });
  const gb = box(b, hw, ly, gw, lowH, { ...T, title: 'Saturation' });
  const half = Math.floor(gb.width / 2);
  gauge(gb, 0, 0, half, gb.height, sim.cpu, { ...T, label: 'CPU' });
  gauge(gb, half, 0, gb.width - half, gb.height, sim.mem, { ...T, label: 'MEM', style: 'ring' });
  const eb = box(b, hw + gw, ly, W - hw - gw, lowH, { ...T, title: 'Errors by endpoint (/min)' });
  barChart(eb, 0, 0, eb.width, eb.height, sim.endpoints.map((e) => ({ label: e.name, value: Math.max(0, e.err) })).sort((a, c) => c.value - a.value),
    { ...T, horizontal: true, gradient: ['pos', 'warn', 'neg'], max: 80, format: (v) => v.toFixed(0) });

  // Logs · AI troubleshooter.
  const logW = Math.floor(W * 0.44);
  const lg = box(b, 0, botY, logW, botH, { ...T, title: 'Logs', style: 'single' });
  logView(lg, 0, 0, lg.width, lg.height, sim.logs.slice(-lg.height), { ...T });
  const ai = box(b, logW, botY, W - logW, botH, { ...T, title: '✦ PROTEUS AI · troubleshooter', color: inc ? 'crit' : 'line' });
  drawTriage(ai, t, th, sim, st);

  // ── key bar ───────────────────────────────────────────────────────────
  b.fill(0, H - 1, W, 1, ' ', th.muted, th.panel);
  b.text(1, H - 1, ' i inject incident   r apply fix   a auto   t theme   space pause   q quit ', th.muted, th.panel);
  const right = ` ${th.name} · ${caps.depth} `;
  b.text(W - right.length - 1, H - 1, right, th.ink, th.panel);
}

/** Linearly resample a matrix to `n` rows so a heatmap fills its panel. */
function resampleRows(m, n) {
  if (m.length < 2 || n <= m.length) return m;
  return Array.from({ length: n }, (_, i) => {
    const f = (i / (n - 1)) * (m.length - 1), a = Math.floor(f), k = f - a, b = Math.min(m.length - 1, a + 1);
    return m[a].map((v, j) => v + (m[b][j] - v) * k);
  });
}

function drawServiceMap(v, t, th, sim, caps) {
  if (v.width < 10 || v.height < 4) return;
  const cv = new Canvas(v.width, v.height, { mode: pickMode('line', caps), threshold: 0 });
  const P = (name) => [NODES[name][0] * (cv.width - 1), NODES[name][1] * (cv.height - 1)];
  const health = Object.fromEntries(sim.services.map((s) => [s.name, s.health]));
  const hc = (h) => (h > 0.8 ? th.pos : h > 0.5 ? th.warn : th.neg);
  for (const [a, c] of sim.links) {
    const [x0, y0] = P(a), [x1, y1] = P(c);
    const bad = Math.min(health[a], health[c]) < 0.8;
    cv.line(x0, y0, x1, y1, mix(th.bg, bad ? th.neg : th.line, bad ? 0.55 : 0.9));
    // Packets flow from caller to callee; they bunch up and redden on a sick link.
    const n = 3, speed = bad ? 0.18 : 0.45;
    for (let j = 0; j < n; j++) {
      const f = (t * speed + j / n + (x0 + y1) * 0.01) % 1;
      const px = x0 + (x1 - x0) * f, py = y0 + (y1 - y0) * f;
      const c = bad ? th.neg : th.info;
      cv.set(px, py, c); cv.set(px + 1, py, scale(c, 0.6));
    }
  }
  for (const name of Object.keys(NODES)) {
    const [x, y] = P(name);
    const h = health[name], c = hc(h);
    const r = Math.max(2.5, cv.width / 60) + (h < 0.8 ? Math.sin(t * 8) * 0.9 + 0.9 : 0);
    cv.circle(x, y, r + 2, scale(c, 0.4));
    cv.circle(x, y, r, c, true);
  }
  cv.paint(v);
  for (const name of Object.keys(NODES)) {
    const [x, y] = P(name);
    const cx = Math.round(x / cv.sx), cy = Math.round(y / cv.sy);
    const label = name;
    const lx = Math.max(0, Math.min(v.width - label.length, cx - Math.floor(label.length / 2)));
    const ly = cy + 1 < v.height ? cy + 1 : cy - 1;
    v.text(lx, ly, label, health[name] < 0.8 ? hc(health[name]) : th.muted, undefined, health[name] < 0.8 ? ATTR.BOLD : 0);
  }
}

function drawTriage(v, t, th, sim, st) {
  const W = v.width, H = v.height;
  let y = 0;
  const line = (fn) => { if (y < H) fn(y); y++; };
  const inc = sim.incident;

  if (!inc) {
    const recovered = t - st.resolvedAt < 7;
    line((yy) => {
      const x = drawSpinner(v, 0, yy, recovered ? 'dots' : 'radar', t, { theme: th, color: recovered ? th.pos : th.accent });
      v.text(x + 1, yy, recovered ? 'Mitigation applied — metrics recovering' : 'Watching 7 services · no anomalies', recovered ? th.pos : th.ink, undefined, ATTR.BOLD);
    });
    line(() => {});
    line((yy) => v.text(0, yy, 'LEARN', th.accent, undefined, ATTR.BOLD));
    for (const l of wrap(TIPS[st.tip], W)) line((yy) => v.text(0, yy, l, th.muted, undefined, ATTR.ITALIC));
    line(() => {});
    line((yy) => v.text(0, yy, truncate(st.auto ? 'An incident will be injected shortly — or press i now.' : 'Press i to inject an incident and watch the investigation.', W), th.dim));
    return;
  }

  const tr = st.triage;
  const rt = t - tr.start; // seconds into the investigation
  const sev = sim.status === 'INCIDENT' ? 'neg' : 'warn';
  line((yy) => {
    const x = badge(v, 0, yy, sim.status, { theme: th, color: sev, style: 'soft' }) + 1;
    v.text(x, yy, truncate(rt < 2 ? `Anomaly on ${inc.service}` : inc.title, W - x), th.ink, undefined, ATTR.BOLD);
  });
  if (rt < 0) {
    line((yy) => { const x = drawSpinner(v, 0, yy, 'pulse', t, { theme: th }); v.text(x + 1, yy, 'Alert fired · waiting for signal to stabilize…', th.muted); });
    return;
  }
  if (rt < 2) {
    line((yy) => { const x = drawSpinner(v, 0, yy, 'thinking', t, { theme: th }); shimmer(v, x + 1, yy, `Correlating signals across 7 services…`, t, { theme: th, color: th.muted }); });
    return;
  }
  for (const l of wrap(inc.summary, W).slice(0, 2)) line((yy) => v.text(0, yy, l, th.muted));

  // Evidence: one tool call every 1.3s, each "running" for 1s.
  const ev = inc.evidence;
  const evT = rt - 2;
  for (let i = 0; i < ev.length; i++) {
    const s = evT - i * 1.3;
    if (s < 0) break;
    const [tool, finding] = ev[i];
    line((yy) => {
      let x;
      if (s < 1) x = drawSpinner(v, 0, yy, 'dots', t, { theme: th, color: th.info });
      else { v.text(0, yy, '✔', th.pos); x = 1; }
      v.text(x + 1, yy, tool.padEnd(16), th.info);
      v.text(x + 18, yy, truncate(s < 1 ? '…' : finding, Math.max(0, W - x - 18)), s < 1 ? th.dim : th.ink);
    });
  }
  const hypT = evT - ev.length * 1.3 + 0.3;
  if (hypT < 0) return;

  line((yy) => v.text(0, yy, 'HYPOTHESES', th.accent, undefined, ATTR.BOLD));
  const grow = Math.min(1, hypT / 1.2);
  inc.hypotheses.forEach(([name, p], i) => line((yy) => {
    const lw = Math.min(30, Math.floor(W * 0.45));
    v.text(0, yy, truncate(name, lw - 1), i === 0 ? th.ink : th.muted, undefined, i === 0 ? ATTR.BOLD : 0);
    progressBar(v, lw, yy, W - lw, p * grow, { theme: th, gradient: i === 0 ? ['warn', 'neg'] : ['dim', 'muted'], showPercent: true });
  }));
  const fixT = hypT - 1.5;
  if (fixT < 0) return;

  const cps = 70;
  const typed = (text, at) => text.slice(0, Math.max(0, Math.floor((fixT - at) * cps)));
  const fixLines = wrap(`FIX ▸ ${inc.fix}`, W);
  const fixText = typed(fixLines.join('\n'), 0);
  for (const l of fixText.split('\n')) line((yy) => { v.text(0, yy, l, th.pos); });
  const lessonAt = inc.fix.length / cps + 0.6;
  if (fixT > lessonAt) {
    const lessonText = typed(wrap(`LESSON ▸ ${inc.lesson}`, W).join('\n'), lessonAt);
    for (const l of lessonText.split('\n')) line((yy) => v.text(0, yy, l, th.crit, undefined, ATTR.ITALIC));
    const end = lessonAt + inc.lesson.length / cps + 0.5;
    if (fixT > end) {
      if (tr.done === Infinity) tr.done = t;
      line(() => {});
      line((yy) => v.text(0, yy, truncate(st.auto ? 'Applying fix automatically in a moment — or press r.' : 'Press r to apply the fix.', W), th.dim));
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runDashboard().catch((e) => { console.error(e); process.exit(1); });
}
