// Exploration as a short list of candidate approaches: each expands, children are tried, losers are pruned with a
// reason, and one path is chosen.
import { ATTR, uni, phase, spin } from './_ai.js';
import { sub, mark, runs, fitRows } from './_kit7.js';

const LOOP = 14, R0 = 12.8, R1 = 13.5, CHOSE = 8.8;
// [appears, settles, depth, label, outcome (+ kept, x pruned), reason]
const NODES = [
  [0.6, 3.9, 0, 'A: cache results at the handler', 'x', 'no safe TTL'],
  [1.3, 2.4, 1, 'A1: 60s TTL', 'x', 'stale reads after edits'],
  [2.7, 3.6, 1, 'A2: invalidate on write', 'x', '9 write paths to cover'],
  [4.3, 6.6, 0, 'B: batch the N+1 queries', '+', '41 queries become 6'],
  [5.0, 6.2, 1, 'B1: one IN (...) query per page', '+', 'p95 380 ms to 60 ms'],
  [7.0, 8.0, 0, 'C: add an index on owner_id', 'x', 'already indexed'],
];

export default {
  id: 'ai-thought-branches',
  since: '0.3.0',
  title: 'Branch & Prune',
  category: 'Thinking States',
  description: 'Exploration as a list of candidate approaches that expand into sub-ideas and get pruned with a reason until one path is chosen.',
  tags: ['reasoning', 'branches', 'tree of thought', 'pruning', 'planning', 'assistant'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const k = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (k >= 0.9) return draw(b, 0);
      const p = k >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', chose = p >= CHOSE;
      const shown = NODES.filter(([a]) => p >= a), pruned = shown.filter(([, s, d, , o]) => !d && o === 'x' && p >= s).length;
      const list = [{ k: 'status', drop: 1 }];
      for (const n of shown) list.push({ k: 'node', n, drop: n[2] ? (n[4] === 'x' ? 3 : 2) : 0 });
      if (chose) list.push({ k: 'gap', drop: 5 }, { k: 'chose' });
      let rows = fitRows(list, H);
      if (k >= 0) {
        // the reset beat: pruned rows fold away (last first), then the rest clears from the top
        const cut = rows.filter((r) => r.k === 'node' && r.n[4] === 'x'), gone = new Set(cut.slice(cut.length - Math.ceil(Math.min(1, k / 0.45) * cut.length)));
        rows = rows.filter((r) => !gone.has(r));
        const cleared = k < 0.45 ? 0 : Math.ceil(((k - 0.45) / 0.45) * rows.length);
        rows = rows.map((r, i) => (i < cleared ? { k: 'none' } : r));
      }
      rows.forEach((r, y) => {
        if (r.k === 'status') {
          const x = chose ? mark(ctx, b, 0, y, '◆', '*', th.accent) : (b.set(0, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD), 1);
          runs(ctx, b, x + 1, y, W - x - 1, [[chose ? 'decided' : 'exploring approaches', th.ink, ATTR.BOLD], [` ${MID} ${shown.filter((n) => !n[2]).length} tried ${MID} ${pruned} pruned`, th.ink, 0, true]]);
        } else if (r.k === 'node') {
          const [, settles, depth, label, outcome, reason] = r.n, done = p >= settles, x0 = 2 * depth;
          const onPath = chose && outcome === '+', cut = done && outcome === 'x';
          let x = x0;
          if (!done) { b.set(x0, y, spin(ctx, p + depth * 0.3), th.accent, undefined, ATTR.BOLD); x = x0 + 1; }
          else x = outcome === '+' ? mark(ctx, b, x0, y, '✓', '+', th.pos) : mark(ctx, b, x0, y, '✗', 'x', th.neg);
          const ink = cut ? sub(th) : th.ink;
          runs(ctx, b, x + 1, y, W - x - 1, [[label, ink, onPath ? ATTR.BOLD : 0], [done ? ` ${MID} ${reason}` : '', ink, 0, true]]);
        } else if (r.k === 'chose') {
          const x = mark(ctx, b, 0, y, '→', '->', th.accent);
          runs(ctx, b, x + 1, y, W - x - 1, [['going with B: batch the N+1 queries', th.ink, ATTR.BOLD]]);
        }
      });
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
