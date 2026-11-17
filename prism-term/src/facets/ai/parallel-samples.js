// Three samples of one prompt stream side by side at their own speeds, are tested, and the best by tests is
// picked.
import { ATTR, uni, phase, spin } from './_ai.js';
import { sub, mark, runs, fitRows, fitText, beat, BEATS } from './_kit7.js';

const LOOP = 14, T0 = 0.5, TEST = 0.8, PICK = 6.9, R0 = 12.8, R1 = 13.5;
// [chars per second, tests passed, code]
const SAMPLES = [
  [34, 2, ['slug = (s) =>', '  s.toLowerCase()', "   .split(' ')", "   .join('-')"]],
  [17, 5, ['slug = (s) => s', "  .normalize('NFKD')", "  .replace(/\\W+/g,'-')", '  .toLowerCase()', '  .slice(0, 60)']],
  [24, 4, ['slug = (s) => s', '  .trim()', '  .toLowerCase()', "  .replace(/\\s+/g,'-')"]],
].map(([cps, pass, code]) => { const n = code.join('\n').length; return { cps, pass, code, end: T0 + n / cps }; });
const BEST = 1;

export default {
  id: 'ai-parallel-samples',
  since: '0.3.0',
  title: 'Parallel Samples',
  category: 'Token Streams',
  description: 'Three samples of the same prompt stream side by side at their own speeds, each is run against the tests, and the best one by tests passed is picked.',
  tags: ['sampling', 'best of n', 'parallel', 'code generation', 'tests', 'model'],
  kind: 'tui',
  size: { w: 72, h: 10 },
  minSize: { w: 48, h: 7 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', picked = p >= PICK;
      const cols = W >= 70 ? 3 : 2, cw = Math.floor((W - 2 * (cols - 1)) / cols), show = cols === 3 ? [0, 1, 2] : [0, 1];
      const codeRows = Math.max(...SAMPLES.map((s) => s.code.length));
      const rows = fitRows([{ k: 'ask', drop: 2 }, { k: 'gap', drop: 4 }, { k: 'head' }, ...Array.from({ length: codeRows }, (_, i) => ({ k: 'code', i, drop: 1 })),
        { k: 'gap', drop: 5 }, { k: 'foot', drop: 3 }], H);
      rows.forEach((r, y) => {
        if (r.k === 'ask') { const x = mark(ctx, b, 0, y, '›', '>', th.accent); runs(ctx, b, x + 1, y, W - x - 1, [['write slug(s) for post URLs', th.ink, ATTR.BOLD], [`  n=3 ${MID} temperature 0.8`, sub(th), 0, true]]); }
        else if (r.k === 'foot' && picked) { const x = mark(ctx, b, 0, y, '★', '*', th.accent); runs(ctx, b, x + 1, y, W - x - 1, [['best by test pass: ', th.ink], [`sample ${BEST + 1}`, th.ink, ATTR.BOLD], [` ${MID} 5 of 5 tests`, th.ink, 0, true]]); }
        show.forEach((si, c) => {
          const s = SAMPLES[si], x0 = c * (cw + 2), win = picked && si === BEST, ink = picked && !win ? sub(th) : th.ink, attr = win ? ATTR.BOLD : 0;
          if (r.k === 'head') {
            let x = x0;
            if (win) x = mark(ctx, b, x, y, '★', '*', th.accent) + 1;
            else if (p < s.end + TEST) { b.set(x, y, spin(ctx, p + si * 0.25), th.accent, undefined, ATTR.BOLD); x += 2; }
            const state = p < s.end ? 'streaming' : p < s.end + TEST ? 'testing' : `${s.pass}/5 tests`;
            const room = x0 + cw - x - (cols === 2 && c === 1 ? 3 : 0);
            fitText(b, x, y, room, [`sample ${si + 1} ${MID} ${state}`, `#${si + 1} ${MID} ${state}`, `#${si + 1}`], ink, undefined, ATTR.BOLD);
            if (c === show.length - 1 && cols === 2) runs(ctx, b, W - 2, y, 2, [['+1', ink]]);
          } else if (r.k === 'code') {
            // characters stream through the sample's lines in order
            let left = Math.max(0, Math.floor((p - T0) * s.cps));
            for (let i = 0; i < r.i && left > 0; i++) left -= s.code[i].length + 1;
            const line = s.code[r.i] || '';
            if (left > 0) runs(ctx, b, x0, y, cw, [[line.slice(0, left), ink, attr]]);
          }
        });
      });
    };
    // the losing columns clear first, then the winner; the prompt line stays
    const plan = (k, info) => {
      if (k >= 0.9) return BEATS.clear()(1, info);
      const cols = info.W >= 70 ? 3 : 2, cw = Math.floor((info.W - 2 * (cols - 1)) / cols), win = [BEST * (cw + 2), BEST * (cw + 2) + cw];
      return { rows: Array.from({ length: info.H }, (_, y) => (y === 0 ? { src: 'end', y } : k >= 0.45 || y === info.last ? null : { src: 'end', y, mask: (x) => x < win[0] || x >= win[1] })) };
    };
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
