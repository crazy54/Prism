// Continuous batching on a GPU serving loop: requests join free slots the step another finishes, so no slot sits
// idle while the queue drains; throughput is compared with static batching.
import { ATTR, uni, phase, span, ease } from './_ai.js';
import { sub, mark, runs, putR } from './_kit7.js';

const LOOP = 14, T0 = 0.5, T1 = 11.5, R0 = 12.8, R1 = 13.5, SLOTS = 8, QW = 8;
const LENS = [9, 14, 6, 11, 18, 7, 12, 5, 16, 8, 10, 13, 6, 15, 9, 7, 12, 11, 8, 14, 6, 10, 9, 12, 7, 13];
const NAME = (i) => String.fromCharCode(65 + i);
// schedule for a grid of `steps` columns: each slot takes the next queued request the step it frees up
// (request lengths scale with the grid, so the queue drains just before the right edge at every size)
const schedule = (steps, slots) => {
  const scale = (steps * slots) / (LENS.reduce((n, v) => n + v, 0) * 0.97), free = Array(slots).fill(0), runs = [];
  let next = 0;
  while (next < LENS.length) {
    const s = free.indexOf(Math.min(...free)), len = Math.max(3, Math.round(LENS[next] * scale));
    if (free[s] >= steps) break;
    runs.push({ i: next, slot: s, from: free[s], to: free[s] + len });
    free[s] += len; next++;
  }
  return runs;
};

export default {
  id: 'ai-continuous-batching',
  since: '0.3.0',
  title: 'Continuous Batching',
  category: 'Model Internals',
  description: 'A GPU serving loop with continuous batching: requests join free slots the step another finishes, so no slot idles as the queue drains; throughput beats static batching.',
  tags: ['continuous batching', 'inference', 'serving', 'gpu', 'throughput', 'scheduling'],
  kind: 'tui',
  size: { w: 72, h: 10 },
  minSize: { w: 48, h: 7 },
  loop: LOOP,
  color: '16',
  order: 250,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      const slots = Math.min(SLOTS, H - 2), gx = QW, gw = W - gx, now = Math.floor(span(p, T0, T1) * gw * (kb >= 0 ? 1 - ease(Math.min(1, kb / 0.8), 0, 1) : 1));   // the beat drains the slots back into the queue
      const plan = schedule(gw, slots), started = plan.filter((r) => r.from < now || (r.from === 0 && kb < 0 && p >= T0));
      // header: the comparison goes first when narrow
      runs(ctx, b, 0, 0, W, [['continuous batching', th.ink, ATTR.BOLD], [` ${MID} ${slots} slots`, th.ink]]);
      const tps = [`1,840 tok/s ${MID} static 1,020`, '1,840 tok/s'].find((s) => 30 + s.length <= W);
      if (tps) putR(b, W, 0, tps, th.ink, ATTR.BOLD);
      // the queue: requests not yet in a slot, oldest first
      b.text(0, 1, 'queue', sub(th), undefined, ATTR.BOLD);
      const waiting = LENS.map((_, i) => i).filter((i) => !started.some((r) => r.i === i)).slice(0, slots - 1);
      waiting.forEach((i, k) => b.text(1, 2 + k, NAME(i), th.ink, undefined, ATTR.BOLD));
      for (let y = 1; y <= slots; y++) b.set(gx - 1, y, u ? '│' : '|', th.line);
      // the grid: each request a run in its slot up to now, alternating glyphs, its letter at the start
      for (const r of started) {
        const y = 1 + r.slot, even = r.i % 2 === 0, end = Math.min(r.to, now);
        for (let c = r.from; c < end && c < gw; c++) b.set(gx + c, y, even ? (u ? '█' : '#') : (u ? '▓' : '='), even ? th.accent : th.mode === 'light' ? th.ink : th.muted);
        if (end > r.from) b.text(gx + r.from, y, NAME(r.i), th.ink, undefined, ATTR.BOLD | ATTR.INVERSE);
      }
      if (H >= slots + 2) {
        const fy = slots + 1, done = plan.filter((r) => r.to <= now).length;
        if (now < gw) mark(ctx, b, gx + now, fy, '▲', '^', th.accent);
        runs(ctx, b, 0, fy, Math.min(gx - 1, W), [[`${done} done`, th.ink]]);
      }
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
