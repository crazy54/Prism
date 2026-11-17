// A mixture-of-experts layer routing each token to its top 2 of 8 experts: per-expert load bars rise, one expert
// overloads, and the router rebalances until the load evens out.
import { ATTR, uni, phase, ease } from './_ai.js';
import { sub, inv, mark, runs } from './_kit7.js';

const LOOP = 14, T0 = 0.6, STEP = 0.55, R0 = 12.8, R1 = 13.5, E = 8, DECAY = 0.92, BASE = 2.0;
const TOKENS = ['The', ' refund', ' for', ' order', ' 4471', ' was', ' issued', ' twice', ' because', ' the', ' retry', ' fired', ' after', ' a', ' slow', ' time', 'out'];
// [top expert, second expert]; the first half leans on E3, then the router spreads the load
const ROUTES = [[3, 1], [5, 3], [0, 6], [3, 6], [2, 7], [3, 7], [4, 1], [3, 0], [0, 2], [5, 6], [4, 7], [1, 6], [2, 5], [0, 4], [7, 5], [6, 2], [1, 4]];
const W1 = 0.62;
// loads after each token (a decaying sum of gate weights), and the imbalance max / mean
const LOADS = (() => {
  let L = Array(E).fill(BASE);
  const out = [L.slice()];
  for (const [a, b2] of ROUTES) { L = L.map((v) => v * DECAY); L[a] += W1; L[b2] += 1 - W1; out.push(L.slice()); }
  return out;
})();
const IMB = LOADS.map((L) => Math.max(...L) / (L.reduce((s, v) => s + v, 0) / E)), PEAK = Math.max(...IMB), PEAK_AT = IMB.indexOf(PEAK), CROSS = IMB.findIndex((v) => v > 1.6) - 1;
const EIGHTHS = ' ▁▂▃▄▅▆▇█';

export default {
  id: 'ai-moe-routing',
  since: '0.3.0',
  title: 'Expert Routing',
  category: 'Model Internals',
  description: 'A mixture-of-experts layer routes each token to its top 2 of 8 experts: per-expert load bars rise, one expert overloads, and the router rebalances.',
  tags: ['mixture of experts', 'moe', 'routing', 'load balancing', 'gating', 'model'],
  kind: 'tui',
  size: { w: 72, h: 10 },
  minSize: { w: 48, h: 7 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', AR = u ? '→' : '->';
      // the beat eases the loads back to where they started and the tokens back to the first
      const back = kb >= 0 ? ease(Math.min(1, kb / 0.7), 0, 1) : 0, run = p < T0 ? -1 : Math.min(TOKENS.length - 1, Math.floor((p - T0) / STEP));
      const k = kb >= 0 ? Math.round((TOKENS.length - 1) * (1 - back)) - (back >= 1 ? 1 : 0) : run;
      const L = kb >= 0 ? LOADS[run + 1].map((v, e) => v + (LOADS[0][e] - v) * back) : LOADS[k + 1], imb = Math.max(...L) / (L.reduce((s, v) => s + v, 0) / E);
      const all = W >= 64, shown = all ? E : 4, cw = Math.floor((W - (all ? 0 : 4)) / shown), bh = Math.max(2, H - 5);
      // the tokens so far, the current one inverted; older ones scroll off the left a whole token at a time
      let x = 0;
      const seen = TOKENS.slice(0, k + 1);
      let s0 = 0;
      while (s0 < seen.length - 1 && seen.slice(s0).join('').trimStart().length > W - 2) s0++;
      let col = -(seen.slice(0, s0).join('').length + (seen[s0] || '').length - (seen[s0] || '').trimStart().length);
      seen.forEach((t, i) => {
        const end = col + t.length;
        if (end > 0) {
          const s = t.slice(Math.max(0, -col)), lead = s.length - s.trimStart().length, at = Math.max(0, col);
          x = i === k ? inv(ctx, b, at + lead, 0, s.trimStart()) : b.text(at, 0, s, th.ink);
        }
        col = end;
      });
      if (k < 0) runs(ctx, b, 0, 0, W, [['routing 17 tokens to 2 of 8 experts', sub(th)]]);
      // routing marks, load bars and labels per expert column
      const route = k >= 0 && kb < 0 ? ROUTES[k] : [], max = Math.max(...LOADS.flat());
      // the overload mark holds from the first crossing until the status says rebalanced
      const over = kb < 0 && k >= CROSS && k <= PEAK_AT + 2;
      for (let e = 0; e < shown; e++) {
        const cx = e * cw + Math.floor(cw / 2) - 1, on = route.includes(e);
        if (on) mark(ctx, b, cx + 1, 1, '▼', 'v', th.accent);
        const h = (L[e] / max) * bh;
        for (let r = 0; r < bh; r++) {
          const fill = Math.max(0, Math.min(1, h - r)), y = 1 + bh - r;
          const ch = u ? EIGHTHS[Math.round(fill * 8)] : fill >= 0.5 ? '#' : ' ';
          if (ch !== ' ') for (let c = 0; c < 3; c++) b.set(cx + c, y, ch, th.accent);
        }
        b.text(cx, bh + 2, `E${e}`, th.ink, undefined, on ? ATTR.BOLD | ATTR.UNDERLINE : 0);
        if (e === 3 && over) mark(ctx, b, cx + 2, bh + 2, '▲', '!', th.warn);
      }
      if (!all) {
        // a route to an expert that isn't drawn marks the "+4" column instead
        const away = route.some((e) => e >= shown);
        if (away) mark(ctx, b, W - 2, 1, '▼', 'v', th.accent);
        b.text(W - 3, bh + 2, '+4', th.ink, undefined, away ? ATTR.BOLD | ATTR.UNDERLINE : 0);
      }
      // status: the imbalance now, and the peak once the router has spread the load
      const sy = H - 1;
      const parts = kb < 0 && k > PEAK_AT + 2 ? [['load imbalance ', th.ink], [`${PEAK.toFixed(1)}x `, th.ink, ATTR.BOLD], [AR, th.accent, ATTR.BOLD], [` ${imb.toFixed(1)}x`, th.ink, ATTR.BOLD], [` ${MID} rebalanced`, th.ink, 0, true]]
        : [['load imbalance ', th.ink], [`${imb.toFixed(1)}x`, th.ink, ATTR.BOLD]];
      x = runs(ctx, b, 0, sy, W, parts);
      if (over && x + 16 <= W) { const gx = mark(ctx, b, x + 2, sy, '▲', '!', th.warn); runs(ctx, b, gx + 1, sy, W - gx - 1, [['E3 overloaded', th.ink, ATTR.BOLD]]); }
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
