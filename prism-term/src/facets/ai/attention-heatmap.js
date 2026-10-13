// An attention heatmap for one sentence: rows attend to earlier columns
// (causal mask), the query row walks down, and the view flips between a
// previous-token head and a coreference head.
import { ATTR, uni, phase, mix, fit } from './_ai.js';

const TOK = ['The', 'pool', 'is', 'too', 'small', 'for', '32', 'worker', 's'];
const N = TOK.length;
// Head 2: "previous token". Head 7: content links (small→pool, s→worker, 32→pool …).
const LINKS = { 2: [[1, 0.3]], 3: [[1, 0.25], [2, 0.35]], 4: [[1, 0.7]], 5: [[4, 0.5]], 6: [[1, 0.35], [5, 0.3]], 7: [[6, 0.55]], 8: [[7, 0.75]] };
function weights(head) {
  return TOK.map((_, i) => {
    const row = TOK.map((__, j) => {
      if (j > i) return 0;
      if (head === 2) return j === i - 1 ? 0.7 : j === i ? 0.18 : j === 0 ? 0.08 : 0.02;
      const l = (LINKS[i] || []).find(([k]) => k === j);
      return (l ? l[1] : 0) + (j === 0 ? 0.12 : 0) + (j === i ? 0.1 : 0.02);
    });
    const s = row.reduce((a, c) => a + c, 0);
    return row.map((v) => v / s);
  });
}
const HEADS = [[2, 'previous-token', weights(2)], [7, 'coreference', weights(7)]];
const LOOP = 10;

export default {
  id: 'ai-attention-heatmap',
  title: 'Attention Heatmap',
  category: 'Model Internals',
  description: 'An attention heatmap over one sentence with a causal mask: the query row walks down showing its strongest link, flipping between a previous-token and a coreference head.',
  tags: ['attention', 'heatmap', 'transformer', 'heads', 'interpretability'],
  kind: 'chart',
  size: { w: 66, h: 13 },
  minSize: { w: 50, h: 12 },
  loop: LOOP,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, LOOP);
      const hi = p < LOOP / 2 ? 0 : 1;
      const [hid, hname, A] = HEADS[hi];
      const q = Math.min(N - 1, Math.floor(((p % (LOOP / 2)) / (LOOP / 2)) * N));
      const lw = 7, cw = Math.max(4, Math.min(6, Math.floor((W - lw - 1) / N)));
      const SH = u ? ' ░▒▓█' : ' .:+#';
      // Column labels.
      TOK.forEach((tk, j) => b.text(lw + j * cw, 0, fit(tk, cw - 1, undefined, ctx).trimEnd(), j === A[q].indexOf(Math.max(...A[q])) ? th.accent : th.muted, undefined, ATTR.BOLD));
      for (let i = 0; i < N; i++) {
        const y = 1 + i;
        if (y >= H - 2) break;
        const on = i === q;
        b.text(0, y, fit(TOK[i], lw - 1, undefined, ctx), on ? th.ink : th.muted, undefined, on ? ATTR.BOLD : 0);
        for (let j = 0; j < N; j++) {
          const w = A[i][j];
          const masked = j > i;
          const level = masked ? 0 : Math.max(1, Math.min(4, Math.round(Math.sqrt(w) * 4.4)));
          const c = masked ? th.line : mix(th.bg, on ? th.accent : th.info, 0.25 + Math.sqrt(w) * 0.75);
          const ch = masked ? (u ? '·' : '.') : SH[level];
          for (let k = 0; k < cw - 1; k++) b.set(lw + j * cw + k, y, ch, c);
        }
        if (on) b.text(lw + N * cw, y, u ? '◂' : '<', th.accent, undefined, ATTR.BOLD);
      }
      // Readout for the query row.
      const best = A[q].indexOf(Math.max(...A[q]));
      const msg = `head ${hid} (${hname}) ${u ? '·' : '.'} "${TOK[q]}" attends to "${TOK[best]}" ${(A[q][best] * 100).toFixed(0)}%`;
      b.text(0, H - 1, fit(msg, W, undefined, ctx), th.ink);
      b.text(0, H - 2, fit(`layer 14 ${u ? '·' : '.'} causal mask ${u ? '·' : '.'} darker = more attention`, W, undefined, ctx), th.dim);
    };
  },
};
