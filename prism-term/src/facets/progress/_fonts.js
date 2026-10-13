// Pixel fonts, seven-segment maps and a ring rasterizer for the counter and
// timer facets. Glyph rows are strings of '#' (lit) and '.' (dark).

const rows = (s) => s.split(' ');

/** 4×7 digits — the odometer drums and flip cards. */
export const FONT47 = {
  0: rows('.##. #..# #..# #..# #..# #..# .##.'),
  1: rows('..#. .##. ..#. ..#. ..#. ..#. .###'),
  2: rows('.##. #..# ...# ..#. .#.. #... ####'),
  3: rows('###. ...# ...# .##. ...# ...# ###.'),
  4: rows('#..# #..# #..# #### ...# ...# ...#'),
  5: rows('#### #... ###. ...# ...# #..# .##.'),
  6: rows('.##. #... #... ###. #..# #..# .##.'),
  7: rows('#### ...# ..#. ..#. .#.. .#.. .#..'),
  8: rows('.##. #..# #..# .##. #..# #..# .##.'),
  9: rows('.##. #..# #..# .### ...# ...# .##.'),
  ':': rows('. # # . # # .'),
  '%': rows('##.# ##.# ..#. .#.. .#.. #.## #.##'),
  '.': rows('.. .. .. .. .. ## ##'),
  ' ': rows('.... .... .... .... .... .... ....'),
};

/** 3×5 banner digits — big percentages and countdowns. */
export const FONT35 = {
  0: rows('### #.# #.# #.# ###'),
  1: rows('.#. ##. .#. .#. ###'),
  2: rows('### ..# ### #.. ###'),
  3: rows('### ..# .## ..# ###'),
  4: rows('#.# #.# ### ..# ..#'),
  5: rows('### #.. ### ..# ###'),
  6: rows('### #.. ### #.# ###'),
  7: rows('### ..# ..# .#. .#.'),
  8: rows('### #.# ### #.# ###'),
  9: rows('### #.# ### ..# ###'),
  '%': rows('#.# ..# .#. #.. #.#'),
  ':': rows('. # . # .'),
  '.': rows('. . . . #'),
  ' ': rows('. . . . .'),
};

/**
 * Lay `text` out in a pixel font: returns { w, h, px } where px is a list of
 * [x, y, k] lit pixels (k = character index). `scale` repeats pixels across
 * columns so glyphs on 1×2-pixel half-block cells come out square.
 */
export function layout(text, font, { scale = 1, gap = 1 } = {}) {
  const px = [];
  let x = 0;
  [...text].forEach((ch, k) => {
    const gl = font[ch] || font[' '];
    gl.forEach((row, y) => [...row].forEach((on, gx) => {
      if (on === '#') for (let s = 0; s < scale; s++) px.push([x + gx * scale + s, y, k]);
    }));
    x += (gl[0].length + gap) * scale;
  });
  return { w: Math.max(0, x - gap * scale), h: (font[0] || font['0']).length, px };
}

/** Width in font pixels of `text` set in FONT35 with a 1-pixel gap. */
export const width35 = (text) => [...text].reduce((w, ch) => w + (FONT35[ch] || FONT35[' '])[0].length + 1, -1);

/** Seven-segment masks, bits a b c d e f g = 1 2 4 8 16 32 64. */
export const SEG7 = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

/** The classic 3×3 ASCII seven-segment digit (" _ ", "|_|", "|_|"). */
export function seg7Ascii(d) {
  const m = SEG7[d] ?? 0, on = (bit) => (m >> bit) & 1;
  return [
    ` ${on(0) ? '_' : ' '} `,
    `${on(5) ? '|' : ' '}${on(6) ? '_' : ' '}${on(1) ? '|' : ' '}`,
    `${on(4) ? '|' : ' '}${on(3) ? '_' : ' '}${on(2) ? '|' : ' '}`,
  ];
}

/** Pixel runs for each segment of a 6×9 seven-segment digit: [x, y, w, h]. */
export const SEG7_RECTS = [
  [1, 0, 4, 1], [5, 1, 1, 3], [5, 5, 1, 3], [1, 8, 4, 1], [0, 5, 1, 3], [0, 1, 1, 3], [1, 4, 4, 1],
];

/**
 * Rasterize a ring (or elliptical ring) into canvas pixels, filled clockwise
 * from 12 o'clock to `frac`. `color(u)` colors lit pixels (u = 0..1 along the
 * arc); the unlit track is drawn as a dotted outer line so fill reads by shape,
 * not only by color.
 */
export function ring(cv, { cx, cy, rx, ry, thick = 2, frac = 1, color, track }) {
  const inner = 1 - thick / Math.min(rx, ry);
  const edge = 1 - 1 / Math.min(rx, ry);
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      const d = Math.hypot(nx, ny);
      if (d > 1 || d < inner) continue;
      const u = (Math.atan2(nx, -ny) / (Math.PI * 2) + 1) % 1;
      if (u <= frac) cv.set(x, y, color(u));
      else if (track !== undefined && d >= edge && (x + y) % 2 === 0) cv.set(x, y, track);
    }
  }
}

/** The same ring in whole cells, for ASCII terminals: calls put(x, y, lit, u). */
export function ringCells(cols, rows, frac, put, thick = 1.15) {
  const rx = cols / 2, ry = rows / 2;
  const inner = 1 - thick / ry;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const nx = (x + 0.5 - rx) / rx, ny = (y + 0.5 - ry) / ry;
    const d = Math.hypot(nx, ny);
    if (d > 1.02 || d < inner) continue;
    const u = (Math.atan2(nx, -ny) / (Math.PI * 2) + 1) % 1;
    put(x, y, u <= frac, u);
  }
}
