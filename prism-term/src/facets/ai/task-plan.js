// An agent's task plan as a live checklist: items move from pending to
// in progress (spinner, bold) to done (ticked, dimmed), with timings.
import { ATTR, glyphs, uni, phase, fit, spin } from './_ai.js';

// [task, start, end] in seconds; the approval step waits on a human.
const TASKS = [
  ['Reproduce the p99 spike from traces', 0.3, 1.4],
  ['Correlate p99 with deploys and pool metrics', 1.4, 2.9],
  ['Draft a fix: DB_POOL_SIZE 20 -> 40', 2.9, 4.0],
  ['Get approval from on-call', 4.0, 5.6],
  ['Apply and verify p99 < 300ms', 5.6, 7.4],
];

export default {
  id: 'ai-task-plan',
  title: 'Task Plan',
  category: 'Agents & Pipelines',
  description: 'An agent\'s plan as a live checklist: each task moves from pending to in progress with a spinner to done and dimmed, with timings and a waiting-on-human step.',
  tags: ['plan', 'todo', 'checklist', 'agent', 'progress'],
  kind: 'tui',
  size: { w: 60, h: 8 },
  minSize: { w: 40, h: 7 },
  loop: 9,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      const n = TASKS.filter(([, , z]) => p >= z).length;
      b.text(0, 0, u ? '●' : '*', n === TASKS.length ? th.pos : th.accent, undefined, ATTR.BOLD);
      const x = b.text(2, 0, 'Plan', th.ink, undefined, ATTR.BOLD);
      b.text(x + 1, 0, `${n}/${TASKS.length} done`, th.muted);
      TASKS.forEach(([task, a, z], i) => {
        const y = 1 + i;
        if (y >= H - (H > TASKS.length + 2 ? 1 : 0)) return;
        const state = p >= z ? 'done' : p >= a ? 'run' : 'todo';
        const waiting = state === 'run' && i === 3;
        b.text(2, y, i === 0 ? (u ? '⎿' : '\\_') : '  ', th.dim);
        const mark = state === 'done' ? g.check : state === 'run' ? (waiting ? (u ? '‖' : '=') : spin(ctx, t)) : (u ? '☐' : '[ ]');
        const mx = b.text(5, y, mark, state === 'done' ? th.pos : waiting ? th.warn : state === 'run' ? th.accent : th.dim, undefined, ATTR.BOLD);
        const label = u ? task.replace('->', '→') : task;
        const tail = state === 'done' ? `${(z - a).toFixed(1)}s` : waiting ? 'waiting on you' : state === 'run' ? `${(p - a).toFixed(1)}s` : '';
        const room = W - mx - 2 - (tail ? tail.length + 1 : 0);
        b.text(mx + 1, y, fit(label, Math.max(0, room), undefined, ctx).trimEnd(),
          state === 'done' ? th.dim : state === 'run' ? th.ink : th.muted, undefined,
          state === 'done' ? ATTR.STRIKE : state === 'run' ? ATTR.BOLD : 0);
        if (tail) b.text(W - tail.length, y, tail, waiting ? th.warn : th.dim);
      });
      if (H > TASKS.length + 2) {
        const msg = n === TASKS.length ? `${g.check} incident mitigated in 7.1s of agent time` : `${g.mid} ctrl+t to hide plan`;
        b.text(0, H - 1, fit(msg, W, undefined, ctx), n === TASKS.length ? th.pos : th.dim);
      }
    };
  },
};
