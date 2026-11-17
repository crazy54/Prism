// A retrieval pipeline step by step: the query is embedded, the top 8 chunks come back with scores, a reranker
// reorders them, the top 3 are kept and the answer cites them.
import { ATTR, uni, phase, spin, reveal, span } from './_ai.js';
import { sub, mark, runs, putR, flow, fitRows } from './_kit7.js';

const LOOP = 14, R0 = 12.8, R1 = 13.5;
// [name, starts, ends, timing]
const STAGES = [['embed', 0.6, 1.0, '12 ms'], ['retrieve', 1.2, 1.6, '8 ms'], ['rerank', 3.0, 3.8, '37 ms'], ['answer', 6.0, 8.2, '']];
const SWAP_AT = [3.8, 5.0], KEEP_AT = [5.2, 5.4, 5.6], ANSWER = 6.0;
// [path, vector score, rerank score]
const DOCS = [
  ['refunds/overview.md', 0.83, 0.71], ['shipping/split-orders.md', 0.81, 0.88], ['refunds/partial.md', 0.79, 0.94], ['billing/credits.md', 0.77, 0.40],
  ['refunds/faq.md', 0.74, 0.52], ['support/macros/refunds.md', 0.72, 0.33], ['shipping/carriers.md', 0.70, 0.08], ['billing/invoices.md', 0.68, 0.12],
];
// the rerank as adjacent swaps (a bubble sort), so rows trade places one step at a time
const SWAPS = (() => {
  const a = DOCS.map((_, i) => i), out = [];
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a.length - 1 - i; j++) if (DOCS[a[j]][2] < DOCS[a[j + 1]][2]) { [a[j], a[j + 1]] = [a[j + 1], a[j]]; out.push(j); }
  return out;
})();
const TEXT = 'Partial shipments refund per item once lost or returned [1][2].';

export default {
  id: 'ai-rag-trace',
  since: '0.3.0',
  title: 'Retrieval Trace',
  category: 'Agents & Pipelines',
  description: 'A retrieval pipeline step by step: the query is embedded, the top 8 chunks return with scores, a reranker reorders them, and the answer cites the top 3.',
  tags: ['rag', 'retrieval', 'rerank', 'embeddings', 'search', 'pipeline'],
  kind: 'tui',
  size: { w: 72, h: 11 },
  minSize: { w: 48, h: 8 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), SEP = u ? ' › ' : ' > ', timing = W >= 64;
      const order = DOCS.map((_, i) => i), k = Math.floor(span(p, ...SWAP_AT) * SWAPS.length), reranked = p >= SWAP_AT[0];
      for (let s = 0; s < k; s++) { const j = SWAPS[s]; [order[j], order[j + 1]] = [order[j + 1], order[j]]; }
      const kept = KEEP_AT.filter((t) => p >= t).length;
      // the beat un-lights the stages in reverse and clears the lists from the bottom
      const unlit = kb >= 0 ? Math.ceil(Math.min(1, kb / 0.5) * STAGES.length) : 0;
      const said = p >= ANSWER ? reveal(TEXT, p, ANSWER + 0.2, 14).text.trimStart() : '';
      const lines = flow((said.match(/\s*\S+/g) || []).map((t) => ({ t, fg: th.ink })), W - 2), want = flow((TEXT.match(/\s*\S+/g) || []).map((t) => ({ t })), W - 2).length;
      // the list gives up rows 8 to 5 so the query and the whole answer (with its citations) fit
      const rows = fitRows([{ k: 'ask', drop: 3 }, { k: 'stages' }, ...DOCS.map((d, i) => ({ k: 'doc', i, drop: i >= 4 ? i : 0 })), ...Array.from({ length: want }, (_, i) => ({ k: 'answer', i }))], H);
      const listRows = rows.filter((r) => r.k === 'doc' || r.k === 'answer').length, gone = kb >= 0.2 ? Math.ceil(Math.min(1, (kb - 0.2) / 0.6) * listRows) : 0;
      let li = 0;
      rows.forEach((r, y) => {
        if ((r.k === 'doc' || r.k === 'answer') && li++ >= listRows - gone) return;
        if (r.k === 'ask') { const x = mark(ctx, b, 0, y, '›', '>', th.accent); runs(ctx, b, x + 1, y, W - x - 1, [['how do refunds work for partial shipments?', th.ink, ATTR.BOLD]]); }
        else if (r.k === 'stages') {
          let x = 0;
          STAGES.forEach(([name, a, e, ms], i) => {
            if (i) x = runs(ctx, b, x, y, W - x, [[SEP, th.muted]]);
            const parts = [[name, th.ink, p >= a && p < e ? ATTR.BOLD : 0]];
            x = runs(ctx, b, x, y, W - x, parts) + 1;
            if (x >= W) return;
            const lit = i < STAGES.length - unlit;
            if (p >= e && lit) x = mark(ctx, b, x, y, '✔', '+', th.pos);
            else if (p >= a && lit) { b.set(x, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD); x++; }
            else x = mark(ctx, b, x, y, '·', '.', th.muted);
            if (timing && ms && p >= e && lit) x = runs(ctx, b, x, y, W - x, [[` ${ms}`, sub(th)]]);
          });
        } else if (r.k === 'doc') {
          const at = 1.6 + r.i * 0.1;
          if (p < at) return;
          const d = DOCS[order[r.i]], keep = r.i < kept;
          if (keep) mark(ctx, b, 0, y, '✓', '+', th.pos);
          b.text(2, y, d[1].toFixed(2), th.ink);
          const right = reranked ? W - 9 : W;
          runs(ctx, b, 8, y, right - 8, [[d[0], th.ink, keep ? ATTR.BOLD : 0]]);
          if (reranked) putR(b, W, y, `rr ${d[2].toFixed(2)}`, th.ink, keep ? ATTR.BOLD : 0);
        } else if (r.k === 'answer' && p >= ANSWER) {
          if (r.i === 0) mark(ctx, b, 0, y, '→', '>', th.accent);
          (lines[r.i] || []).forEach((it) => b.text(2 + it.x, y, it.t, it.fg));
        }
      });
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
