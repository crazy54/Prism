// A rollout Gantt chart: the "now" line sweeps the maintenance window, bars
// fill as tasks complete, and when the schema migration overruns the
// dependent tasks slide 15 minutes later.
import { ATTR, glyphs, uni, phase, ease, fit, tint } from '../callouts/_kit.js';

// [label, start, end] in minutes after midnight; index 1 overruns by SLIP.
const TASKS = [
  ['snapshot db', 60, 90], ['migrate schema', 90, 150], ['canary 5%', 150, 210], ['canary 25%', 210, 255],
  ['full rollout', 255, 330], ['verify & soak', 330, 390],
];
const MILESTONE = ['all-clear', 390];
const T0 = 60, T1 = 420, SLIP = 15;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

export default {
  id: 'diagrams-gantt',
  title: 'Gantt Chart',
  category: 'Sequence & Timelines',
  description: 'A rollout Gantt chart for a maintenance window: the now-line sweeps, bars fill as tasks finish, and an overrunning migration slides every dependent task later.',
  tags: ['gantt', 'schedule', 'timeline', 'plan', 'rollout'],
  kind: 'diagram',
  size: { w: 72, h: 12 },
  minSize: { w: 54, h: 11 },
  loop: 9,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      const now = T0 + Math.min(1, p / 7.5) * (T1 - T0);
      // The migration overruns once "now" reaches its planned end.
      const slipAt = (TASKS[1][2] - T0) / (T1 - T0) * 7.5;
      const slip = SLIP * ease(p, slipAt, slipAt + 0.6);
      const tasks = TASKS.map(([l, a, z], i) => (i === 1 ? [l, a, z + slip] : i > 1 ? [l, a + slip, z + slip] : [l, a, z]));
      const mile = MILESTONE[1] + slip;
      const lw = Math.min(16, Math.floor(W * 0.25)), x0 = lw + 1, cw = W - x0 - 1;
      const col = (m) => x0 + Math.round(((m - T0) / (T1 - T0)) * (cw - 1));
      // Axis.
      for (let m = T0; m <= T1; m += 60) {
        const x = col(m);
        const lab = hhmm(m);
        if (x + lab.length <= W && (m < T1 || W - x >= lab.length)) b.text(Math.min(x, W - lab.length), 0, lab, th.muted);
        b.set(x, 1, u ? '┬' : '+', th.line);
      }
      for (let x = x0; x < x0 + cw; x++) if (b.get(x, 1)?.ch === ' ') b.set(x, 1, u ? '─' : '-', th.line);
      // Bars.
      tasks.forEach(([label, a, z], i) => {
        const y = 2 + i;
        if (y >= H - 2) return;
        const state = now >= z ? 'done' : now >= a ? 'run' : 'todo';
        const late = i === 1 && slip > 0.5;
        b.text(0, y, fit(label, lw, undefined, ctx), state === 'todo' ? th.muted : th.ink, undefined, state === 'run' ? ATTR.BOLD : 0);
        const xa = col(a), xz = Math.max(xa + 1, col(z));
        for (let x = xa; x < xz; x++) {
          const m = T0 + ((x - x0) / (cw - 1)) * (T1 - T0);
          const filled = m < now;
          const over = late && m >= TASKS[1][2];
          const c = over ? th.neg : filled ? (state === 'done' ? th.pos : th.accent) : tint(ctx, th.accent, 0.55);
          b.set(x, y, u ? (filled ? '█' : '▒') : (filled ? '#' : '='), c);
        }
        if (late && xz + 5 <= W) b.text(xz + 1, y, `+${Math.round(slip)}m`, th.neg, undefined, ATTR.BOLD);
      });
      // Milestone.
      const my = 2 + tasks.length;
      if (my < H - 2) {
        b.text(0, my, fit(MILESTONE[0], lw, undefined, ctx), now >= mile ? th.pos : th.muted, undefined, ATTR.BOLD);
        b.text(col(mile), my, u ? '◆' : '<>', now >= mile ? th.pos : th.warn, undefined, ATTR.BOLD);
        if (col(mile) + 9 <= W) b.text(col(mile) + 2, my, hhmm(mile), th.dim);
      }
      // Now line.
      const nx = col(now);
      // Through the gaps only: on a bar, the fill edge already marks "now".
      for (let y = 1; y < Math.min(H - 2, my + 1); y++) {
        const cell = b.get(nx, y);
        if (y === 1 || !cell || cell.ch === ' ') b.set(nx, y, u ? (y === 1 ? '╋' : '┃') : '|', th.warn, undefined, ATTR.BOLD);
      }
      b.text(Math.max(0, Math.min(W - 5, nx - 2)), H - 2, hhmm(now), th.warn, undefined, ATTR.BOLD);
      const msg = now >= mile ? `${g.check} all-clear at ${hhmm(mile)} ${g.mid} 15m late, inside the window`
        : slip > 0.5 ? `${g.warn} migrate schema +${Math.round(slip)}m ${g.mid} all-clear now ${hhmm(mile)}`
        : `maintenance window 01:00-07:00 ${g.mid} ${tasks.filter(([, , z]) => now >= z).length}/${tasks.length} done`;
      b.text(0, H - 1, fit(msg, W, undefined, ctx), now >= mile ? th.pos : slip > 0.5 ? th.warn : th.muted);
    };
  },
};
