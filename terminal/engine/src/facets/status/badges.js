// Badges & Pills: level and state badges with live counts, README-style
// shields, and a CI pipeline whose jobs pass, fail and retry.
import { mix } from '../../color.js';
import { glyphs, put, putR, safe, clamp, lift, onFill, ATTR } from '../charts/_data.js';
import { LEVEL_KEYS, levelColor } from './_logs.js';

/** A rounded pill: half-block caps on Unicode terminals, a padded chip otherwise. */
function pill(b, g, x, y, text, fg, bg) {
  if (!g.u) return b.text(x, y, ` ${text} `, fg, bg, ATTR.BOLD);
  b.set(x, y, '▐', bg);
  const e = b.text(x + 1, y, text, fg, bg, ATTR.BOLD);
  b.set(e, y, '▌', bg);
  return e + 1;
}

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const spin = (g, t) => (g.u ? SPIN[Math.floor(t * 12) % SPIN.length] : '|/-\\'[Math.floor(t * 8) % 4]);

const badges = {
  id: 'status-badges',
  title: 'Badges & Pills',
  category: 'Badges & Pills',
  description: 'Log-level badges with ticking counts, state chips, outline tags, environment pills and notification counters, all theme-tinted.',
  tags: ['badge', 'pill', 'chip', 'tag', 'counter'],
  kind: 'widget',
  size: { w: 72, h: 9 },
  minSize: { w: 36, h: 4 },
  loop: 10,
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const rates = { debug: 9.2, info: 21.5, warn: 2.1, error: 0.45, crit: 0.06 };
    const base = { debug: 41210, info: 120488, warn: 882, error: 121, crit: 3 };
    const step = H >= 9 ? 2 : 1;
    return (t) => {
      let y = 0;
      // Level badges with counts.
      let x = 0;
      for (const l of LEVEL_KEYS) {
        const n = Math.floor(base[l] + rates[l] * t);
        const c = levelColor(th, l);
        const bump = (rates[l] * t) % 1 < 0.12 && rates[l] < 3;
        const lab = l.toUpperCase();
        if (x + lab.length + 10 > W) break;
        x = pill(b, g, x, y, lab, th.bg, bump ? lift(th, c, 0.35) : c);
        x = b.text(x + 1, y, n.toLocaleString('en-US'), bump ? th.ink : th.muted, undefined, bump ? ATTR.BOLD : 0) + 2;
      }
      y += step;
      if (y >= H) return;
      // State chips (soft style), the pending one breathing.
      const states = [
        ['running', g.dot, th.info], ['pending', g.u ? '◌' : '.', th.warn], ['passed', g.check, th.pos],
        ['failed', g.cross, th.neg], ['skipped', g.u ? '⊘' : '-', th.dim], ['paused', g.u ? '‖' : '=', th.muted],
      ];
      x = 0;
      for (const [name, ic, c] of states) {
        if (x + name.length + 5 > W) break;
        const breathe = name === 'pending' ? 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(t * 4)) : 0.22;
        const icon = name === 'running' ? spin(g, t) : ic;
        x = b.text(x, y, ` ${icon} ${name} `, c, mix(th.bg, c, breathe), ATTR.BOLD) + 1;
      }
      y += step;
      if (y >= H) return;
      // Outline tags.
      x = 0;
      const pct = 10 + Math.floor(clamp((t % 10) / 8, 0, 1) * 4) * 15;
      for (const [tag, c] of [['v2.14.2', th.accent], ['prod', th.neg], ['us-east-1', th.info], [`canary ${pct}%`, th.warn], ['owner: payments', th.muted]]) {
        if (x + tag.length + 3 > W) break;
        x = b.text(x, y, `[${tag}]`, c, undefined, ATTR.BOLD) + 1;
      }
      y += step;
      if (y >= H) return;
      // Environment pills: the selected one is solid, others soft.
      x = 0;
      const envs = ['dev', 'staging', 'canary', 'prod'];
      const sel = Math.floor(t / 2.5) % envs.length;
      x = b.text(x, y, 'env ', th.dim);
      envs.forEach((e, i) => {
        const c = e === 'prod' ? th.neg : e === 'canary' ? th.warn : e === 'staging' ? th.info : th.pos;
        if (x + e.length + 4 > W) return;
        x = i === sel ? pill(b, g, x, y, e.toUpperCase(), th.bg, c) + 1 : b.text(x, y, ` ${e.toUpperCase()} `, c, mix(th.bg, c, 0.14)) + 1;
      });
      y += step;
      if (y >= H) return;
      // Notification counters.
      x = 0;
      const counters = [['Inbox', 3 + Math.floor(t / 3.3) % 4, th.accent], ['PRs', 12, th.info], ['Alerts', 2 + (Math.floor(t / 2) % 3), th.neg], ['Mentions', 0, th.dim]];
      for (const [name, n, c] of counters) {
        if (x + name.length + 6 > W) break;
        x = b.text(x, y, name, th.ink) + 1;
        x = n ? pill(b, g, x, y, String(n), th.bg, c) + 2 : b.text(x, y, '0', th.dim) + 2;
      }
    };
  },
};

const shields = {
  id: 'status-shields',
  title: 'README Shields',
  category: 'Badges & Pills',
  description: 'Two-tone README shields — build, tests, coverage, version, licence, downloads — with the build badge running, passing and failing.',
  tags: ['shields', 'badges', 'readme', 'build status', 'coverage'],
  kind: 'widget',
  size: { w: 72, h: 6 },
  minSize: { w: 30, h: 3 },
  loop: 12,
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const label = mix(th.bg, th.muted, 0.55);
    return (t) => {
      const lt = t % 12;
      const build = lt < 3 ? ['running', th.warn] : lt < 8 ? ['passing', th.pos] : lt < 9 ? ['running', th.warn] : ['failing', th.neg];
      const cov = 86.2 + Math.min(1.2, lt * 0.12);
      const tests = lt < 9 ? 1204 : 1203;
      const list = [
        ['build', build[0] === 'running' ? `${spin(g, t)} running` : build[0], build[1]],
        ['tests', lt < 9 ? `${tests.toLocaleString('en-US')} passed` : `1 failed, ${tests.toLocaleString('en-US')} passed`, lt < 9 ? th.pos : th.neg],
        ['coverage', `${cov.toFixed(1)}%`, cov >= 87 ? th.pos : th.warn],
        ['release', 'v2.14.2', th.accent],
        ['license', 'MIT', th.info],
        ['downloads', `${(12.3 + t * 0.01).toFixed(1)}k/week`, th.pos],
        ['uptime', '99.98%', th.pos],
        ['vulns', lt < 6 ? '0 known' : '1 moderate', lt < 6 ? th.pos : th.warn],
        ['docs', 'passing', th.pos],
        ['chat', '412 online', th.accent],
      ];
      let x = 0, y = 0;
      for (const [k, v, c] of list) {
        const w = k.length + v.length + 4;
        if (x + w > W) { x = 0; y += H >= 6 ? 2 : 1; }
        if (y >= H) break;
        x = b.text(x, y, ` ${k} `, th.ink, label);
        x = b.text(x, y, ` ${v} `, onFill(th, mix(c, th.bg, 0.15)), mix(c, th.bg, 0.15), ATTR.BOLD) + 1;
      }
    };
  },
};

const STAGES = [
  ['build', [['compile', 1.1], ['docker-image', 1.8]]],
  ['test', [['unit', 1.6], ['integration', 2.6], ['lint', 0.8]]],
  ['security', [['sast', 1.2], ['deps-audit', 0.9]]],
  ['staging', [['deploy', 1.4], ['smoke', 1.1]]],
  ['production', [['canary 10%', 1.6], ['promote', 1.0]]],
];

const pipeline = {
  id: 'status-ci-pipeline',
  title: 'CI Pipeline',
  category: 'Badges & Pills',
  description: 'A CI pipeline graph: stages of jobs going pending → running → passed, one flaky test failing and retrying, and the overall badge.',
  tags: ['ci', 'pipeline', 'build', 'jobs', 'deploy'],
  kind: 'widget',
  size: { w: 80, h: 10 },
  minSize: { w: 44, h: 6 },
  loop: 18,
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    // Schedule: stages run sequentially, jobs within a stage in parallel. The
    // integration job fails once and is retried.
    const sched = [];
    let at = 0.6;
    for (const [, jobs] of STAGES) {
      let end = at;
      const row = jobs.map(([name, d]) => {
        const flaky = name === 'integration';
        const j = { name, start: at, end: at + d, flaky, retryEnd: flaky ? at + d + 1.8 : 0 };
        end = Math.max(end, flaky ? j.retryEnd : j.end);
        return j;
      });
      sched.push(row);
      at = end + 0.25;
    }
    const total = at;
    const colW = Math.floor(W / STAGES.length);
    const state = (j, lt) => {
      if (lt < j.start) return 'pending';
      if (lt < j.end) return 'running';
      if (j.flaky && lt < j.end + 0.5) return 'failed';
      if (j.flaky && lt < j.retryEnd) return 'retrying';
      return 'passed';
    };
    const look = {
      pending: [g.u ? '○' : 'o', th.dim], running: [null, th.info], retrying: [null, th.warn],
      failed: [g.cross, th.neg], passed: [g.check, th.pos],
    };
    return (t) => {
      const lt = t % 18;
      const done = lt >= total;
      const anyFail = sched.flat().some((j) => state(j, lt) === 'failed');
      const head = done ? ['passed', th.pos] : anyFail ? ['failing', th.neg] : ['running', th.info];
      const el = Math.min(lt, total);
      let x = b.text(0, 0, ` ${head[0] === 'running' ? spin(g, t) : head[0] === 'passed' ? g.check : g.cross} ${head[0]} `, th.bg, head[1], ATTR.BOLD);
      x = put(b, x + 1, 0, `Pipeline #48213 · main · 4c1e9a2 "await sleep in pool"`, W - x - 10, th.ink);
      putR(b, W, 0, `${Math.floor(el / 60 * 20)}m ${String(Math.floor(el * 20) % 60).padStart(2, '0')}s`, th.muted);
      const top = H >= 8 ? 2 : 1;
      STAGES.forEach(([stage], si) => {
        const x0 = si * colW;
        const jobs = sched[si];
        const states = jobs.map((j) => state(j, lt));
        const sc = states.includes('failed') ? th.neg : states.every((s) => s === 'passed') ? th.pos : states.some((s) => s === 'running' || s === 'retrying') ? th.info : th.dim;
        put(b, x0, top, stage, colW - 3, sc, undefined, ATTR.BOLD);
        jobs.forEach((j, ji) => {
          const y = top + 1 + ji + (H >= 10 ? 1 : 0);
          if (y >= H) return;
          const st = states[ji];
          const [ic, c] = look[st];
          const icon = ic ?? spin(g, t + ji * 0.3);
          const bg = st === 'running' || st === 'retrying' ? mix(th.bg, c, 0.14) : undefined;
          b.set(x0, y, icon, c, bg, ATTR.BOLD);
          put(b, x0 + 2, y, st === 'retrying' ? `${j.name} #2` : j.name, colW - 5, st === 'pending' ? th.dim : th.ink, bg);
        });
        if (si < STAGES.length - 1) {
          const y = top + 1 + (H >= 10 ? 1 : 0);
          const passed = states.every((s) => s === 'passed');
          for (let k = colW - 3; k < colW; k++) b.set(x0 + k, y, g.h, passed ? th.pos : th.line);
        }
      });
      if (H >= 10) {
        const flat = sched.flat();
        const n = flat.filter((j) => state(j, lt) === 'passed').length;
        put(b, 0, H - 1, `${n}/${flat.length} jobs passed · 1 retried · artifacts 3 · coverage 87.4%`, W, th.muted);
      }
    };
  },
};

export default [badges, shields, pipeline];
