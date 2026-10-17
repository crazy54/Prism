// span-digital-rain — the deck kin of the terminal catalog's Digital Rain: streams of glyphs
// (mirrored katakana-like forms, digits, a few symbols, set dot by dot on a 5 × 7 matrix)
// fall down every column of keys. Heads burn white, trails fade in four steps, glyphs mutate
// as they fade, and the rows continue behind the bezels, so a stream slips out of one key
// and into the next. Day prints it: ink on paper with a spectral head.
//
// Characters step a whole row at a time — the cadence of the original — so the low frame
// rate a whole-wall span gets (1–4 fps) reads as the code's own rhythm.

import { surface } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { hash } from '../../scene/noise.js';
import { FONT5, charOf } from '../../themes/_d2-pixfont.js';
import { BUDGET, frameClock, materials, Batch, fillP, backdrop, isFlat, lit, f1 } from './_d6-wall.js';

const LOOP = 24;
const KANA = [
  '##### ....# ..##. ..#.. ..#.. .#... #....', '....# ...#. ..##. .#.#. #..#. ...#. ...#.', '..#.. ##### #...# ....# ...#. ..#.. .#...',
  '..... ##### ..#.. ..#.. ..#.. ..#.. #####', '..#.. ##### ..#.# ..#.# .#..# .#..# #..##', '..#.. ##### ..#.. ##### ..#.. ..#.. ..#..',
  '.#... .#### #...# ....# ...#. ..#.. ##...', '..... ##### ....# ....# ....# ....# #####', '.#.#. ##### .#.#. .#.#. ...#. ..#.. .#...',
  '#.... .#..# #...# .#..# ....# ...#. ###..', '##### ....# ...#. ..#.. .#.#. #...# .....', '#.#.# #.#.# ....# ....# ...#. ..#.. ##...',
  '.###. ..... ##### ..#.. ..#.. .#... #....', '.#... .#... .##.. .#.#. .#... .#... .#...', '..#.. ##### ..#.. ..#.. ..#.. .#... #....',
  '..... .#.#. .#.#. #...# #...# #...# .....', '#.... #...# ####. #.... #.... #.... .####', '....# #..#. .##.. ..#.. .#.#. #...# .....',
  '##### ..#.. ##### ..#.. ..#.. ..#.. ..###', '##### ....# ....# ##### ....# ....# #####', '.###. ..... ##### ....# ...#. ..#.. ##...',
  '#..#. #..#. #..#. #..#. ...#. ..#.. .#...', '##### #...# #...# ....# ...#. ..#.. ##...', '#.... .#..# ....# ....# ...#. ..#.. ###..',
];
/** Every glyph as [row, col, len] runs on a 5 × 7 matrix (kana, then digits and symbols from the pixel font). */
const GLYPHS = [
  ...KANA.map((s) => {
    const runs = [];
    s.split(' ').forEach((row, r) => { let c = 0; while (c < 5) { if (row[c] === '#') { let e = c; while (row[e] === '#') e++; runs.push([r, c, e - c]); c = e; } else c++; } });
    return runs;
  }),
  ...'0123456789:=+<>'.split('').map((ch) => { const g = charOf(FONT5, ch); const off = Math.floor((5 - g.w) / 2); return g.runs.map(([r, c, l]) => [r, c + off, l]); }),
];
const mirror = (runs) => runs.map(([r, c, l]) => [r, 5 - c - l, l]);

export default {
  id: 'span-digital-rain',
  title: 'Digital Rain',
  category: 'Text & Marquee',
  description: 'Streams of mirrored glyphs fall down every column of keys: white-hot heads, fading trails, mutating characters, rows that continue behind the bezels.',
  tags: ['digital rain', 'code', 'glyphs', 'katakana', 'hacker', 'terminal', 'retro', 'wall', 'ambient'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 6,
  loop: LOOP,
  params: {
    color: { type: 'select', default: 'green', options: ['green', 'spectrum', 'hue'], label: 'Color' },
    hue: { type: 'hue', default: 296, min: 0, max: 360, step: 1, label: 'Hue' },
    density: { type: 'number', default: 1, min: 0.4, max: 1.6, step: 0.1, label: 'Streams' },
    budget: BUDGET,
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, h } = ctx;
    const cells = grid.cells;
    const { t } = frameClock(ctx, { fps: 6, changing: cells.length, still: 9.6 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const KW = grid.key.w;
    const d = Math.max(2, Math.floor(KW / 40));          // whole device px per dot: crisp
    const cw = d * 6, ch = d * 8;                        // a character cell (5 × 7 dots + spacing)
    const perKey = Math.floor(KW / cw), padX = (KW - perKey * cw + d) / 2;
    const rows = Math.ceil((h + ch) / ch);
    backdrop(k, [[0, dark ? mix(T.colors.bg, '#000000', 0.5) : T.colors.surface, 0.94], [1, dark ? mix(T.colors.bg, T.spectral(150), flat ? 0 : 0.06) : T.colors.surface, 0.94]], { y2: h });
    const B = new Batch(grid);
    const hot = lit(T);
    const colorOf = (x) => {
      if (flat) return hot;
      const m = ctx.params.color;
      const hue = m === 'green' ? 145 : m === 'hue' ? ctx.params.hue : 24 + 276 * (x / ctx.w);
      return dark ? T.spectral(hue, { dl: 0.04 }) : T.spectral(hue, { tier: 'ink' });
    };
    // one char column = a key column's slot; streams per slot from a hash (density thins them)
    const keyCols = [...new Set(cells.map((c) => c.col))].sort((a, b) => a - b);
    for (const kc of keyCols) {
      const col0 = cells.find((c) => c.col === kc);
      for (let s = 0; s < perKey; s++) {
        const slot = kc * 16 + s;
        if (hash(slot, ctx.seed, 1) > 0.72 * ctx.params.density) continue;
        const x = col0.x + padX + s * cw;
        const L = 5 + Math.floor(hash(slot, 2) * 9);                  // trail length (rows)
        const P = rows + L + 2 + Math.floor(hash(slot, 3) * rows * 0.6); // a lap, including a pause above the top
        const m = 2 + Math.floor(hash(slot, ctx.seed, 4) * 3);         // laps per loop (2–4): seamless
        const head = Math.floor(((t / LOOP) * m + hash(slot, ctx.seed, 5)) % 1 * P) - 1;
        const c = colorOf(x);
        for (let i = 0; i < L; i++) {
          const r = head - i;
          if (r < 0 || r >= rows) continue;
          const y = r * ch + d;
          const b = i === 0 ? 1 : 1 - i / L;
          const step = i === 0 ? 'head' : b > 0.7 ? 1 : b > 0.45 ? 0.72 : b > 0.22 ? 0.46 : 0.24;
          // the glyph mutates now and then while it fades
          const g = Math.floor(hash(slot, r, Math.floor(t * 0.5 + hash(slot, r, 9) * 4)) * GLYPHS.length);
          let runs = GLYPHS[g];
          if (hash(slot, r, 7) < 0.5) runs = mirror(runs);
          let dd = '';
          for (const [rr, cc, ll] of runs) dd += `M${f1(x + cc * d)} ${f1(y + rr * d)}h${f1(ll * d)}v${f1(d)}h${f1(-ll * d)}Z`;
          const paint = step === 'head' ? fillP(hot, 1) : fillP(c, step);
          B.add([x, y, x + cw - d, y + ch - d], paint, dd, step === 'head' ? 2 : 1);
        }
      }
    }
    B.emit(k);
    return k.svg();
  },
};
