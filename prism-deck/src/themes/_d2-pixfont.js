// Bitmap type for the `pixel` and `phosphor` deck themes — two hand-set caps fonts
// drawn dot by dot on the key's real pixel grid (no outlines, no antialiasing):
//
//   FONT5  5 × 7 caps (the classic LCD / terminal character cell) — labels, values, heroes
//   FONT3  3 × 5 caps (the 8-bit status-bar face)                 — eyebrows, captions at small sizes
//
//   import { pickFace, measureDots, textRuns } from './_d2-pixfont.js';
//   const face = pickFace(capPx);                // { font, d } — font + whole-pixel dot size for a cap height
//   const w = measureDots('VOLUME', face.font) * face.d;
//   const runs = textRuns('VOLUME', { font, d, x, y });   // [[x, y, len]] horizontal dot runs in px
//
// Lower case is set in caps (8-bit machines did). Characters a font lacks fall back to
// the other font's shape scaled into the cell, then to a hollow box.

const rows = (s) => s.trim().split(/\s+/);

/** 5 × 7 caps. Rows top → bottom; '#' = dot. Widths vary for punctuation. */
const F5 = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .####',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '### .#. .#. .#. .#. .#. ###',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  0: '.###. #...# #..## #.#.# ##..# #...# .###.',
  1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####',
  3: '##### ...#. ..#.. ...#. ....# #...# .###.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. .#... .#... .#...',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ...#. .##..',
  ' ': '... ... ... ... ... ... ...',
  '!': '# # # # # . #',
  '"': '#.# #.# ... ... ... ... ...',
  '#': '.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.',
  $: '..#.. .#### #.#.. .###. ..#.# ####. ..#..',
  '%': '##... ##..# ...#. ..#.. .#... #..## ...##',
  '&': '.##.. #..#. #.#.. .#... #.#.# #..#. .##.#',
  "'": '# # . . . . .',
  '(': '.# #. #. #. #. #. .#',
  ')': '#. .# .# .# .# .# #.',
  '*': '..... ..#.. #.#.# .###. #.#.# ..#.. .....',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  ',': '.. .. .. .. .# .# #.',
  '-': '.... .... .... #### .... .... ....',
  '.': '. . . . . . #',
  '/': '..... ....# ...#. ..#.. .#... #.... .....',
  ':': '. . # . # . .',
  ';': '.. .. .# .. .# .# #.',
  '<': '...# ..#. .#.. #... .#.. ..#. ...#',
  '=': '..... ..... ##### ..... ##### ..... .....',
  '>': '#... .#.. ..#. ...# ..#. .#.. #...',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '@': '.###. #...# ....# .##.# #.#.# #.#.# .###.',
  '[': '## #. #. #. #. #. ##',
  '\\': '..... #.... .#... ..#.. ...#. ....# .....',
  ']': '## .# .# .# .# .# ##',
  '^': '..#.. .#.#. #...# ..... ..... ..... .....',
  _: '..... ..... ..... ..... ..... ..... #####',
  '`': '#. .# .. .. .. .. ..',
  '{': '..# .#. .#. #.. .#. .#. ..#',
  '|': '# # # # # # #',
  '}': '#.. .#. .#. ..# .#. .#. #..',
  '~': '..... ..... .#... #.#.# ...#. ..... .....',
  '·': '. . . # . . .',
  '•': '... ... .#. ### .#. ... ...',
  '…': '..... ..... ..... ..... ..... ..... #.#.#',
  '°': '.#. #.# .#. ... ... ... ...',
  '–': '.... .... .... #### .... .... ....',
  '—': '..... ..... ..... ##### ..... ..... .....',
  '×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
  '→': '..... ..#.. ...#. ##### ...#. ..#.. .....',
  '←': '..... ..#.. .#... ##### .#... ..#.. .....',
  '↑': '..#.. .###. #.#.# ..#.. ..#.. ..#.. .....',
  '↓': '..... ..#.. ..#.. ..#.. #.#.# .###. ..#..',
  'λ': '#.... .#... .#... ..#.. .#.#. #...# #...#',
  '±': '..#.. ..#.. ##### ..#.. ..#.. ..... #####',
  '€': '..### .#... ####. .#... ####. .#... ..###',
  '£': '..##. .#..# .#... ###.. .#... .#... #####',
  '©': '.###. #...# #.### #.#.. #.### #...# .###.',
  '’': '# # . . . . .',
  '‘': '# # . . . . .',
  '“': '#.# #.# ... ... ... ... ...',
  '”': '#.# #.# ... ... ... ... ...',
  '▲': '..... ..... ..#.. .###. ##### ..... .....',
  '▼': '..... ..... ##### .###. ..#.. ..... .....',
  '●': '..... .###. ##### ##### ##### .###. .....',
  '✓': '..... ....# ...#. #.#.. .#... ..... .....',
};

/** 3 × 5 caps. */
const F3 = {
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#...# ##.## #.#.# #...# #...#', N: '#..# ##.# #.## #..# #..#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ### .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#...# #...# #.#.# ##.## #...#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###',
  0: '### #.# #.# #.# ###', 1: '.#. ##. .#. .#. ###', 2: '##. ..# .#. #.. ###', 3: '##. ..# .#. ..# ##.',
  4: '#.# #.# ### ..# ..#', 5: '### #.. ##. ..# ##.', 6: '.## #.. ### #.# ###', 7: '### ..# .#. .#. .#.',
  8: '### #.# ### #.# ###', 9: '### #.# ### ..# ##.',
  ' ': '.. .. .. .. ..', '.': '. . . . #', ',': '.. .. .. .# #.', ':': '. # . # .', ';': '.. .# .. .# #.',
  '-': '... ... ### ... ...', '–': '... ... ### ... ...', '—': '.... .... #### .... ....', '+': '... .#. ### .#. ...',
  '/': '..# ..# .#. #.. #..', '\\': '#.. #.. .#. ..# ..#', '%': '#.# ..# .#. #.. #.#', '!': '# # # . #', '?': '##. ..# .#. ... .#.',
  '·': '. . # . .', '•': '... .#. ### .#. ...', '°': '.#. #.# .#. ... ...', 'λ': '#.. .#. .#. #.# #.#',
  '(': '.# #. #. #. .#', ')': '#. .# .# .# #.', '[': '## #. #. #. ##', ']': '## .# .# .# ##',
  '×': '... #.# .#. #.# ...', '…': '..... ..... ..... ..... #.#.#', '#': '#.# ### #.# ### #.#', '=': '... ### ... ### ...',
  "'": '# # . . .', '’': '# # . . .', '‘': '# # . . .', '"': '#.# #.# ... ... ...', '“': '#.# #.# ... ... ...', '”': '#.# #.# ... ... ...',
  _: '... ... ... ... ###', '&': '.#. #.# .#. #.# .##', '@': '### #.# #.# #.. .##', '<': '..# .#. #.. .#. ..#', '>': '#.. .#. ..# .#. #..',
  '*': '#.# .#. #.# ... ...', $: '.## ##. .#. .## ##.', '|': '# # # # #', '^': '.#. #.# ... ... ...', '~': '... .## ##. ... ...',
  '→': '.... ..#. #### ..#. ....', '←': '.... .#.. #### .#.. ....', '↑': '.#. ### .#. .#. .#.', '↓': '.#. .#. .#. ### .#.',
  '▲': '..... ..#.. .###. ##### .....', '▼': '..... ##### .###. ..#.. .....', '●': '... ### ### ### ...', '✓': '... ..# #.# .#. ...',
  '±': '.#. ### .#. ... ###', '€': '.## ##. #.. ##. .##', '£': '.## .#. ### .#. ###', '©': '### #.. #.. ### ...',
};

function compile(table, h) {
  const out = new Map();
  for (const [ch, src] of Object.entries(table)) {
    const r = rows(src);
    if (r.length !== h) throw new Error(`pixfont: "${ch}" has ${r.length} rows, expected ${h}`);
    const w = r[0].length;
    if (r.some((x) => x.length !== w)) throw new Error(`pixfont: "${ch}" rows differ in width`);
    // horizontal runs per row: [row, col, len]
    const runs = [];
    r.forEach((line, y) => { for (let x = 0; x < w; x++) if (line[x] === '#') { let e = x; while (line[e + 1] === '#') e++; runs.push([y, x, e - x + 1]); x = e; } });
    out.set(String(ch), { w, runs });
  }
  return out;
}

export const FONT5 = { id: 'f5', h: 7, space: 1, map: compile(F5, 7) };
export const FONT3 = { id: 'f3', h: 5, space: 1, map: compile(F3, 5) };

const BOX5 = { w: 4, runs: [[0, 0, 4], [1, 0, 1], [1, 3, 1], [2, 0, 1], [2, 3, 1], [3, 0, 1], [3, 3, 1], [4, 0, 1], [4, 3, 1], [5, 0, 1], [5, 3, 1], [6, 0, 4]] };
const BOX3 = { w: 3, runs: [[0, 0, 3], [1, 0, 1], [1, 2, 1], [2, 0, 1], [2, 2, 1], [3, 0, 1], [3, 2, 1], [4, 0, 3]] };

/** The bitmap for one character in a font (caps; unknown → hollow box). */
export function charOf(font, ch) {
  const m = font.map;
  return m.get(ch) || m.get(ch.toUpperCase()) || m.get(ch.normalize('NFD')[0]?.toUpperCase()) || (font === FONT3 ? BOX3 : BOX5);
}

/** Width in dots (no trailing space). tracking = extra dots between characters. */
export function measureDots(str, font = FONT5, tracking = 0) {
  const chars = [...String(str)];
  if (!chars.length) return 0;
  let w = 0;
  for (const ch of chars) w += charOf(font, ch).w + font.space + tracking;
  return w - font.space - tracking;
}

/**
 * Horizontal dot runs for a string, in px: [[x, y, len], …] with every run d px tall.
 * x, y = top-left of the text box (snapped to whole px by the caller).
 */
export function textRuns(str, { font = FONT5, d = 1, x = 0, y = 0, tracking = 0 } = {}) {
  const out = [];
  let cx = x;
  for (const ch of String(str)) {
    const g = charOf(font, ch);
    for (const [r, c, len] of g.runs) out.push([cx + c * d, y + r * d, len * d]);
    cx += (g.w + font.space + tracking) * d;
  }
  return out;
}

/** Path data for runs (each d px tall): one subpath per run. */
export function runsPath(runs, d) {
  let s = '';
  for (const [x, y, len] of runs) s += `M${x} ${y}h${len}v${d}h-${len}Z`;
  return s;
}

/**
 * The face for a cap height in px: the candidate (5 × 7 or 3 × 5 at a whole-pixel dot
 * size) whose height is nearest the request. Body roles lean to 5 × 7 (more legible);
 * small roles (eyebrow, caption) take 3 × 5 freely.
 */
export function pickFace(capPx, { small = true } = {}) {
  let best = null, score = Infinity;
  for (const font of [FONT5, FONT3]) for (let d = 1; d <= 8; d++) {
    const s = Math.abs(font.h * d - capPx) + (font === FONT3 && !small ? 1.5 : 0) + (font === FONT5 && small && capPx < 6.2 ? 1 : 0);
    if (s < score - 1e-9) { score = s; best = { font, d }; }
  }
  return best;
}

/** Faces to try, largest first, when a string must fit a width. */
export function fallbackFaces(face) {
  const list = [face];
  for (let d = face.d - 1; d >= 1; d--) list.push({ font: face.font, d });
  if (face.font === FONT5) list.push({ font: FONT3, d: Math.max(1, Math.round(face.d * 1.2)) }, { font: FONT3, d: 1 });
  const seen = new Set();
  return list.filter((f) => { const k = `${f.font.id}${f.d}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Fit a string into maxWidth px: { font, d, text, width } (ellipsis as the last resort). */
export function fitFace(str, face, maxWidth, tracking = 0) {
  for (const f of fallbackFaces(face)) {
    const w = measureDots(str, f.font, tracking) * f.d;
    if (w <= maxWidth) return { ...f, text: str, width: w };
  }
  const f = fallbackFaces(face).pop();
  let s = [...String(str)];
  while (s.length > 1 && measureDots(`${s.join('')}…`, f.font, tracking) * f.d > maxWidth) s.pop();
  const text = `${s.join('')}…`;
  return { ...f, text, width: measureDots(text, f.font, tracking) * f.d };
}
