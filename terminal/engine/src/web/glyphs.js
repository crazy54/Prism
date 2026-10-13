// Procedural glyph geometry for the browser renderer.
//
// Terminal art leans on four Unicode ranges whose look depends entirely on the
// font: block elements, braille, sextants and box drawing. Fonts disagree on all
// of them (gaps between half blocks, missing sextants, braille dots of every
// size), so — like xterm.js's custom glyphs — the web renderer draws these from
// geometry instead. This module is the pure, testable half: it describes each
// glyph in cell-relative units; renderer.js turns that into pixels.

/** Classify a code point: 'block' | 'braille' | 'sextant' | 'box' | null. */
export function glyphClass(cp) {
  if (cp >= 0x2580 && cp <= 0x259f) return 'block';
  if (cp >= 0x2800 && cp <= 0x28ff) return 'braille';
  if (cp >= 0x1fb00 && cp <= 0x1fb3b) return 'sextant';
  if (cp >= 0x2500 && cp <= 0x257f) return 'box';
  return null;
}

// ── Block elements ─────────────────────────────────────────────────────────
// [x, y, w, h] rectangles in cell units (0..1), plus optional alpha (shades).
const Q = { ul: [0, 0, 0.5, 0.5], ur: [0.5, 0, 0.5, 0.5], ll: [0, 0.5, 0.5, 0.5], lr: [0.5, 0.5, 0.5, 0.5] };
const BLOCKS = new Map([
  [0x2580, [[0, 0, 1, 0.5]]],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => [0x2580 + k, [[0, 1 - k / 8, 1, k / 8]]]),          // ▁ … █
  ...[7, 6, 5, 4, 3, 2, 1].map((k, i) => [0x2589 + i, [[0, 0, k / 8, 1]]]),                // ▉ … ▏
  [0x2590, [[0.5, 0, 0.5, 1]]],
  [0x2594, [[0, 0, 1, 1 / 8]]],
  [0x2595, [[7 / 8, 0, 1 / 8, 1]]],
  [0x2596, [Q.ll]], [0x2597, [Q.lr]], [0x2598, [Q.ul]],
  [0x2599, [Q.ul, Q.ll, Q.lr]], [0x259a, [Q.ul, Q.lr]], [0x259b, [Q.ul, Q.ur, Q.ll]],
  [0x259c, [Q.ul, Q.ur, Q.lr]], [0x259d, [Q.ur]], [0x259e, [Q.ur, Q.ll]], [0x259f, [Q.ur, Q.ll, Q.lr]],
]);
const SHADES = new Map([[0x2591, 0.25], [0x2592, 0.5], [0x2593, 0.75]]);

/** Rectangles for a block element, or { shade } for ░▒▓. */
export function blockGeometry(cp) {
  if (SHADES.has(cp)) return { shade: SHADES.get(cp) };
  return { rects: BLOCKS.get(cp) || [] };
}

// ── Braille ────────────────────────────────────────────────────────────────
// Dot (dx, dy) ↔ bit, as in src/canvas.js.
export const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];

/** [dx, dy] of every raised dot (dx 0..1, dy 0..3). */
export function brailleDots(cp) {
  const mask = cp - 0x2800;
  const out = [];
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) if (mask & BRAILLE_BITS[dy][dx]) out.push([dx, dy]);
  return out;
}

// ── Sextants ───────────────────────────────────────────────────────────────
// U+1FB00 + n encodes masks 1..62 except 21 (left half ▌) and 42 (right half ▐).
// Bits: 1 TL, 2 TR, 4 ML, 8 MR, 16 BL, 32 BR — the same order src/canvas.js encodes.
const SEXTANT_MASK = new Map();
for (let m = 1; m < 63; m++) {
  if (m === 21 || m === 42) continue;
  SEXTANT_MASK.set(0x1fb00 + m - 1 - (m > 21 ? 1 : 0) - (m > 42 ? 1 : 0), m);
}

/** [col, row] of each filled sixth (col 0..1, row 0..2). */
export function sextantCells(cp) {
  const m = SEXTANT_MASK.get(cp) || 0;
  const out = [];
  for (let k = 0; k < 6; k++) if (m & (1 << k)) out.push([k & 1, k >> 1]);
  return out;
}

// ── Box drawing ────────────────────────────────────────────────────────────
// Each glyph: [up, right, down, left] with 0 none, 1 light, 2 heavy, 3 double,
// plus a style: 'dash2' | 'dash3' | 'dash4' (dashed), 'arc' (rounded corner),
// or a diagonal ('/', '\\', 'x').
const B = (u, r, d, l, style) => ({ arms: [u, r, d, l], style });
const BOX = new Map([
  [0x2500, B(0, 1, 0, 1)], [0x2501, B(0, 2, 0, 2)], [0x2502, B(1, 0, 1, 0)], [0x2503, B(2, 0, 2, 0)],
  [0x2504, B(0, 1, 0, 1, 'dash3')], [0x2505, B(0, 2, 0, 2, 'dash3')], [0x2506, B(1, 0, 1, 0, 'dash3')], [0x2507, B(2, 0, 2, 0, 'dash3')],
  [0x2508, B(0, 1, 0, 1, 'dash4')], [0x2509, B(0, 2, 0, 2, 'dash4')], [0x250a, B(1, 0, 1, 0, 'dash4')], [0x250b, B(2, 0, 2, 0, 'dash4')],
  [0x250c, B(0, 1, 1, 0)], [0x250d, B(0, 2, 1, 0)], [0x250e, B(0, 1, 2, 0)], [0x250f, B(0, 2, 2, 0)],
  [0x2510, B(0, 0, 1, 1)], [0x2511, B(0, 0, 1, 2)], [0x2512, B(0, 0, 2, 1)], [0x2513, B(0, 0, 2, 2)],
  [0x2514, B(1, 1, 0, 0)], [0x2515, B(1, 2, 0, 0)], [0x2516, B(2, 1, 0, 0)], [0x2517, B(2, 2, 0, 0)],
  [0x2518, B(1, 0, 0, 1)], [0x2519, B(1, 0, 0, 2)], [0x251a, B(2, 0, 0, 1)], [0x251b, B(2, 0, 0, 2)],
  [0x251c, B(1, 1, 1, 0)], [0x251d, B(1, 2, 1, 0)], [0x251e, B(2, 1, 1, 0)], [0x251f, B(1, 1, 2, 0)],
  [0x2520, B(2, 1, 2, 0)], [0x2521, B(2, 2, 1, 0)], [0x2522, B(1, 2, 2, 0)], [0x2523, B(2, 2, 2, 0)],
  [0x2524, B(1, 0, 1, 1)], [0x2525, B(1, 0, 1, 2)], [0x2526, B(2, 0, 1, 1)], [0x2527, B(1, 0, 2, 1)],
  [0x2528, B(2, 0, 2, 1)], [0x2529, B(2, 0, 1, 2)], [0x252a, B(1, 0, 2, 2)], [0x252b, B(2, 0, 2, 2)],
  [0x252c, B(0, 1, 1, 1)], [0x252d, B(0, 1, 1, 2)], [0x252e, B(0, 2, 1, 1)], [0x252f, B(0, 2, 1, 2)],
  [0x2530, B(0, 1, 2, 1)], [0x2531, B(0, 1, 2, 2)], [0x2532, B(0, 2, 2, 1)], [0x2533, B(0, 2, 2, 2)],
  [0x2534, B(1, 1, 0, 1)], [0x2535, B(1, 1, 0, 2)], [0x2536, B(1, 2, 0, 1)], [0x2537, B(1, 2, 0, 2)],
  [0x2538, B(2, 1, 0, 1)], [0x2539, B(2, 1, 0, 2)], [0x253a, B(2, 2, 0, 1)], [0x253b, B(2, 2, 0, 2)],
  [0x253c, B(1, 1, 1, 1)], [0x253d, B(1, 1, 1, 2)], [0x253e, B(1, 2, 1, 1)], [0x253f, B(1, 2, 1, 2)],
  [0x2540, B(2, 1, 1, 1)], [0x2541, B(1, 1, 2, 1)], [0x2542, B(2, 1, 2, 1)], [0x2543, B(2, 1, 1, 2)],
  [0x2544, B(2, 2, 1, 1)], [0x2545, B(1, 1, 2, 2)], [0x2546, B(1, 2, 2, 1)], [0x2547, B(2, 2, 1, 2)],
  [0x2548, B(1, 2, 2, 2)], [0x2549, B(2, 1, 2, 2)], [0x254a, B(2, 2, 2, 1)], [0x254b, B(2, 2, 2, 2)],
  [0x254c, B(0, 1, 0, 1, 'dash2')], [0x254d, B(0, 2, 0, 2, 'dash2')], [0x254e, B(1, 0, 1, 0, 'dash2')], [0x254f, B(2, 0, 2, 0, 'dash2')],
  [0x2550, B(0, 3, 0, 3)], [0x2551, B(3, 0, 3, 0)],
  [0x2552, B(0, 3, 1, 0)], [0x2553, B(0, 1, 3, 0)], [0x2554, B(0, 3, 3, 0)],
  [0x2555, B(0, 0, 1, 3)], [0x2556, B(0, 0, 3, 1)], [0x2557, B(0, 0, 3, 3)],
  [0x2558, B(1, 3, 0, 0)], [0x2559, B(3, 1, 0, 0)], [0x255a, B(3, 3, 0, 0)],
  [0x255b, B(1, 0, 0, 3)], [0x255c, B(3, 0, 0, 1)], [0x255d, B(3, 0, 0, 3)],
  [0x255e, B(1, 3, 1, 0)], [0x255f, B(3, 1, 3, 0)], [0x2560, B(3, 3, 3, 0)],
  [0x2561, B(1, 0, 1, 3)], [0x2562, B(3, 0, 3, 1)], [0x2563, B(3, 0, 3, 3)],
  [0x2564, B(0, 3, 1, 3)], [0x2565, B(0, 1, 3, 1)], [0x2566, B(0, 3, 3, 3)],
  [0x2567, B(1, 3, 0, 3)], [0x2568, B(3, 1, 0, 1)], [0x2569, B(3, 3, 0, 3)],
  [0x256a, B(1, 3, 1, 3)], [0x256b, B(3, 1, 3, 1)], [0x256c, B(3, 3, 3, 3)],
  [0x256d, B(0, 1, 1, 0, 'arc')], [0x256e, B(0, 0, 1, 1, 'arc')], [0x256f, B(1, 0, 0, 1, 'arc')], [0x2570, B(1, 1, 0, 0, 'arc')],
  [0x2571, B(0, 0, 0, 0, '/')], [0x2572, B(0, 0, 0, 0, '\\')], [0x2573, B(0, 0, 0, 0, 'x')],
  [0x2574, B(0, 0, 0, 1)], [0x2575, B(1, 0, 0, 0)], [0x2576, B(0, 1, 0, 0)], [0x2577, B(0, 0, 1, 0)],
  [0x2578, B(0, 0, 0, 2)], [0x2579, B(2, 0, 0, 0)], [0x257a, B(0, 2, 0, 0)], [0x257b, B(0, 0, 2, 0)],
  [0x257c, B(0, 2, 0, 1)], [0x257d, B(1, 0, 2, 0)], [0x257e, B(0, 1, 0, 2)], [0x257f, B(2, 0, 1, 0)],
]);

/** { arms: [up, right, down, left], style } for a box-drawing glyph. */
export function boxGeometry(cp) {
  return BOX.get(cp) || null;
}

/** Every box-drawing code point this table covers (for tests). */
export const BOX_CODEPOINTS = [...BOX.keys()];
