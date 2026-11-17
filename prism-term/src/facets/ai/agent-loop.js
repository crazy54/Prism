// The agent loop as think, act and observe cycles: a phase strip with the active phase inverted, a cycle counter
// against its cap, and a short log, until the goal check passes and the loop stops.
import { ATTR, uni, phase, spin } from './_ai.js';
import { sub, inv, mark, runs, fitRows, beat, BEATS } from './_kit7.js';

const LOOP = 14, T0 = 0.3, CYCLE = 2.0, THINK = 0.5, ACT = 0.8, R0 = 12.8, R1 = 13.5;
// [act, observation] per cycle
const CYCLES = [
  ['run_tests -> 2 failing', 'TestRefund needs a fixture'],
  ['read_file tests/fixtures/', 'refund.json is missing'],
  ['write_file refund.json', 'fixture added'],
  ['run_tests -> 1 failing', 'rounding is off by one cent'],
  ['apply_patch money.go', 'run_tests -> 41 passed'],
];
const END = T0 + CYCLES.length * CYCLE, PHASES = ['think', 'act', 'observe'];

export default {
  id: 'ai-agent-loop',
  since: '0.3.0',
  title: 'Agent Loop',
  category: 'Agents & Pipelines',
  description: 'The agent loop as think, act and observe cycles: the active phase, a cycle counter against its cap and a short log, until the goal check passes and it stops.',
  tags: ['agent loop', 'react', 'think act observe', 'cycles', 'goal', 'agent'],
  kind: 'tui',
  size: { w: 64, h: 9 },
  minSize: { w: 44, h: 6 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', SEP = u ? ' › ' : ' > ', AR = u ? '→' : '->';
      const done = p >= END, c = Math.min(CYCLES.length - 1, Math.max(0, Math.floor((p - T0) / CYCLE))), into = p - T0 - c * CYCLE;
      const ph = done ? -1 : p < T0 || into < THINK ? 0 : into < THINK + ACT ? 1 : 2;
      const log = [];
      CYCLES.forEach(([act, obs], i) => {
        const a = T0 + i * CYCLE + THINK + ACT, o = T0 + (i + 1) * CYCLE;
        if (p >= a) log.push([i + 1, 'act', act]);
        if (p >= o) log.push([i + 1, 'observe', obs]);
      });
      const rows = fitRows([{ k: 'goal', drop: 3 }, { k: 'strip' }, { k: 'gap', drop: 4 }, { k: 'log' }, { k: 'log' }, { k: 'log' }, { k: 'log' }, { k: 'gap', drop: 5 }, { k: 'status' }], H);
      const logRows = rows.filter((r) => r.k === 'log').length, recent = log.slice(Math.max(0, log.length - logRows));
      let li = 0;
      rows.forEach((r, y) => {
        if (r.k === 'goal') runs(ctx, b, 0, y, W, [['goal ', sub(th)], ['make the refund tests pass', th.ink, ATTR.BOLD]]);
        else if (r.k === 'strip') {
          let x = 0;
          PHASES.forEach((name, i) => {
            if (i) x = b.text(x, y, SEP, th.muted);
            x = i === ph ? inv(ctx, b, x, y, ` ${name} `) : b.text(x, y, ` ${name} `, sub(th));
          });
          const n = done ? CYCLES.length : p < T0 ? 0 : c + 1, cnt = [`cycle ${n} / max 12`, `cycle ${n}`].find((s) => x + 2 + s.length <= W);
          if (cnt) b.text(W - cnt.length, y, cnt, th.ink);
        } else if (r.k === 'log') {
          const e = recent[li++];
          if (!e) return;
          const x = b.text(0, y, String(e[0]), sub(th));
          runs(ctx, b, x + 1, y, W - x - 1, [[`${e[1]}: `, sub(th)], [e[2].replace('->', AR), th.ink]]);
        } else if (r.k === 'status') {
          if (done) { const x = mark(ctx, b, 0, y, '✔', '+', th.pos); runs(ctx, b, x + 1, y, W - x - 1, [['goal check passed', th.ink, ATTR.BOLD], [` ${MID} 5 cycles ${MID} stopped`, th.ink]]); }
          else if (p >= T0) { b.set(0, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD); runs(ctx, b, 2, y, W - 2, [[`cycle ${c + 1} ${MID} ${['thinking', 'acting', 'observing'][ph]}`, th.ink]]); }
          else runs(ctx, b, 0, y, W, [['starting', sub(th)]]);
        }
      });
    };
    const plan = BEATS.clear('top', 2);
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
