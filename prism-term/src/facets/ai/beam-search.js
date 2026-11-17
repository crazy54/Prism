// Beam search with width 3: each step expands the kept beams into candidates with cumulative log-probs, prunes
// back to the best 3, and the winning path is starred at the end.
import { ATTR, uni, phase } from './_ai.js';
import { sub, mark, runs, fitRows } from './_kit7.js';

const LOOP = 14, R0 = 12.8, R1 = 13.5, STAR = 9.2, PROMPT = 'The refund was';
// per step: [expands at, prunes at, [lane, row offset (0 kept, 1 pruned), token, score]]
const STEPS = [
  [0.8, 1.8, [[0, 0, 'issued', -0.41], [1, 0, 'approved', -0.88], [2, 0, 'sent', -1.3], [3, 0, 'denied', -2.1]]],
  [3.0, 4.0, [[0, 0, 'twice', -1.02], [0, 1, 'today', -1.95], [1, 0, 'but', -1.4], [1, 1, 'and', -2.2], [2, 0, 'back', -1.62], [2, 1, 'late', -2.65]]],
  [5.2, 6.2, [[0, 0, 'by', -1.38], [0, 1, 'because', -2.1], [1, 0, 'never', -1.9], [1, 1, 'not', -2.3], [2, 0, 'to', -2.05], [2, 1, 'after', -2.6]]],
  [7.4, 8.4, [[0, 0, 'mistake', -1.52], [0, 1, 'again', -2.45], [1, 0, 'paid', -2.25], [1, 1, 'out', -2.7], [2, 0, 'the', -2.4], [2, 1, 'early', -2.9]]],
];
// a candidate is pruned when it is not among the step's best 3
const KEPT = STEPS.map(([, , c]) => new Set(c.slice().sort((a, b) => b[3] - a[3]).slice(0, 3).map((n) => n[2])));

export default {
  id: 'ai-beam-search',
  since: '0.3.0',
  title: 'Beam Search',
  category: 'Model Internals',
  description: 'Beam search with width 3: each step expands the kept beams into scored candidates, prunes back to the best 3, and the winning path is starred at the end.',
  tags: ['beam search', 'decoding', 'log probability', 'search', 'tokens', 'model'],
  kind: 'tui',
  size: { w: 72, h: 12 },
  minSize: { w: 48, h: 8 },
  loop: LOOP,
  color: '16',
  order: 240,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', X = u ? '×' : 'x', MINUS = u ? '−' : '-';
      const cw = W >= 70 ? 17 : 15, vis = Math.max(1, Math.floor((W - 1) / cw)), cur = STEPS.filter(([a]) => p >= a).length - 1;
      // the beat folds the tree back to the prompt, newest step first
      const keep = kb >= 0 ? STEPS.length - Math.ceil(Math.min(1, kb / 0.8) * STEPS.length) : STEPS.length;
      const first = Math.max(0, Math.min(cur, keep - 1) - vis + 1), star = p >= STAR && kb < 0;
      const rows = fitRows([{ k: 'head' }, { k: 'gap', drop: 3 }, ...[0, 1, 2].flatMap((l) => [{ k: 'lane', l, o: 0 }, { k: 'lane', l, o: 1, drop: 1 }]), { k: 'lane', l: 3, o: 0, drop: 2 },
        { k: 'gap', drop: 4 }, { k: 'foot' }], H);
      const score = (v) => `${v < 0 ? MINUS : ''}${Math.abs(v).toFixed(2)}`;
      rows.forEach((r, y) => {
        if (r.k === 'head') runs(ctx, b, 0, y, W, [['beam search', th.ink, ATTR.BOLD], [` ${MID} width 3`, th.ink], [` ${MID} "${PROMPT}"`, th.ink, 0, true], [first ? ` ${MID} step ${first + 1}+` : '', sub(th), 0, true]]);
        else if (r.k === 'lane') {
          STEPS.forEach(([a, pruneAt, cands], s) => {
            if (p < a || s < first || s >= first + vis || s >= keep) return;
            const n = cands.find(([l, o]) => l === r.l && o === r.o);
            if (!n) return;
            const x = 1 + (s - first) * cw, judged = p >= pruneAt, cut = judged && !KEPT[s].has(n[2]), win = star && r.l === 0 && r.o === 0;
            if (r.o === 1 || r.l === 3) b.text(x - 1, y, u ? '└' : '`', th.line);
            else if (s > first) b.text(x - 2, y, u ? '──' : '--', th.line);
            const ink = cut ? sub(th) : th.ink, attr = win ? ATTR.BOLD : judged && !cut ? ATTR.BOLD : 0;
            const nx = cut ? mark(ctx, b, x, y, X, 'x', th.neg) + 1 : x;
            const word = n[2];
            // a column shows its scores only when every kept word in it has room for one
            const scored = cands.filter((c) => KEPT[s].has(c[2])).every((c) => c[2].length + 1 + score(c[3]).length <= cw - 2);
            const ex = runs(ctx, b, nx, y, cw - (nx - x) - 2, [[word, ink, attr], [cut || !scored ? '' : ` ${score(n[3])}`, ink, 0, true]]);
            if (win && s === STEPS.length - 1 && ex + 2 <= W) mark(ctx, b, ex + 1, y, '★', '*', th.accent);
          });
        } else if (r.k === 'foot' && star) {
          const x = mark(ctx, b, 0, y, '★', '*', th.accent);
          runs(ctx, b, x + 1, y, W - x - 1, [[`${PROMPT} issued twice by mistake`, th.ink, ATTR.BOLD], [`  ${score(-1.52)}`, th.ink, 0, true]]);
        }
      });
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
