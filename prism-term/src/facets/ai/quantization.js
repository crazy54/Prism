// One 7B model at FP16, INT8 and INT4 compared on memory, tokens per second and eval score, with the chosen
// format starred.
import { ATTR, uni, phase, ease } from './_ai.js';
import { sub, inv, mark, runs, putR, fitRows } from './_kit7.js';

const LOOP = 12, GROW = [0.5, 2.0], WALK = [2.5, 4.0, 5.5], PICK = 7.0, R0 = 10.8, R1 = 11.5;
// [format, memory GB, tokens/s, eval score, note]
const ROWS = [
  ['FP16', 13.5, 38, 71.2, 'baseline, full precision'],
  ['INT8', 7.1, 61, 70.8, '2x smaller, 1.6x faster, -0.4 score'],
  ['INT4', 3.9, 94, 68.1, '3.5x smaller, 2.5x faster, -3.1 score'],
];
const MAX = [13.5, 94, 71.2], CHOSEN = 1, EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

export default {
  id: 'ai-quantization',
  since: '0.3.0',
  title: 'Quantization Trade-off',
  category: 'Model Internals',
  description: 'One 7B model at FP16, INT8 and INT4 compared on memory, tokens per second and eval score, with the chosen number format starred.',
  tags: ['quantization', 'int8', 'int4', 'memory', 'inference', 'model'],
  kind: 'tui',
  size: { w: 64, h: 9 },
  minSize: { w: 44, h: 6 },
  loop: LOOP,
  color: '16',
  order: 260,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', MINUS = u ? '−' : '-';
      // the beat clears the star, eases the bars to zero and blanks the values
      const bars = W >= 56, bw = bars ? Math.floor((W - 7 - 23 - 4) / 3) : 0, grow = kb >= 0 ? 1 - ease(Math.min(1, kb / 0.7), 0, 1) : ease(p, ...GROW);
      const cur = kb >= 0 || p >= PICK ? -1 : WALK.filter((t) => p >= t).length - 1, picked = p >= PICK && kb < 0;
      // columns: name, then three groups of [bar] value
      const VW = [7, 5, 5], X = [7];
      for (let g = 0; g < 3; g++) X.push(X[g] + (bars ? bw + 1 : 0) + VW[g] + 2);
      const rows = fitRows([{ k: 'head', drop: 3 }, { k: 'cols' }, ...ROWS.map((r, i) => ({ k: 'row', i })), { k: 'gap', drop: 4 }, { k: 'note' }, { k: 'pick', drop: 1 }], H);
      rows.forEach((r, y) => {
        if (r.k === 'head') runs(ctx, b, 0, y, W, [['7B model', th.ink, ATTR.BOLD], [` ${MID} FP16 vs INT8 vs INT4`, th.ink]]);
        else if (r.k === 'cols') (bars ? ['memory', 'tok/s', 'eval score'] : ['memory', 'tok/s', 'score']).forEach((name, g) => runs(ctx, b, X[g], y, X[g + 1] - X[g] - 1, [[name, sub(th), ATTR.BOLD]]));
        else if (r.k === 'row') {
          const [name, ...vals] = ROWS[r.i], on = r.i === cur, star = picked && r.i === CHOSEN;
          if (on) inv(ctx, b, 0, y, name); else b.text(0, y, name, th.ink, undefined, ATTR.BOLD);
          if (star) mark(ctx, b, 5, y, '★', '*', th.accent);
          vals.slice(0, 3).forEach((v, g) => {
            let x = X[g];
            if (bars) {
              // eighth blocks end the bar, so close values still differ; 7-bit keeps whole cells
              const f = (v / MAX[g]) * bw * grow, n = u ? Math.floor(f) : Math.round(f), rem = f - Math.floor(f);
              for (let i = 0; i < bw; i++) {
                const ch = i < n ? (u ? '█' : '#') : u && i === n && rem >= 1 / 16 ? EIGHTHS[Math.max(1, Math.round(rem * 8))] : ' ';
                b.set(x + i, y, ch, g === 2 ? (th.mode === 'light' ? th.ink : th.muted) : th.accent);
              }
              x += bw + 1;
            }
            const text = g === 0 ? `${v.toFixed(1)} GB` : g === 1 ? String(v) : v.toFixed(1);
            if (grow > 0.02) putR(b, x + VW[g], y, text, th.ink, star ? ATTR.BOLD : 0);
          });
        } else if (r.k === 'note') {
          if (cur < 0 && !picked) return runs(ctx, b, 0, y, W, [['walking the formats', sub(th)]]);
          if (cur >= 0) { const x = mark(ctx, b, 0, y, '›', '>', th.accent); runs(ctx, b, x + 1, y, W - x - 1, [[`${ROWS[cur][0]}: `, th.ink, ATTR.BOLD], [ROWS[cur][4].replace('-', MINUS), th.ink]]); }
        } else if (r.k === 'pick' && picked) {
          const x = mark(ctx, b, 0, y, '★', '*', th.accent);
          runs(ctx, b, x + 1, y, W - x - 1, [['INT8', th.ink, ATTR.BOLD], [`: 2x smaller, ${MINUS}0.4 score`, th.ink]]);
        }
      });
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
