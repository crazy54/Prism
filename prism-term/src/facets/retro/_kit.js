// Shared helpers for the retro and fx galleries (underscore → not a facet).
//
// Bitmap text as pixel masks (for scrollers and logos drawn on a Canvas), the
// IBM VGA 16-color palette BBS art was painted in, and small color helpers.

import { mix, rgb, NONE } from '../../color.js';
import { glyph, getFont } from '../../text/fonts.js';

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const fract = (v) => v - Math.floor(v);
export const lerpc = (a, b, t) => mix(a, b, clamp01(t));

/**
 * Shade the theme background by k (0..1): toward black at Night; by Day toward the
 * theme's hairline tone, so depth reads as a pearl shadow instead of a gray wash.
 */
export function shade(theme, k) {
  return theme.mode === 'light' ? lerpc(theme.bg, theme.line, k * 2.2) : lerpc(theme.bg, 0x000000, k);
}

/** The color a light-emitting effect rises out of: black at Night, the page by Day. */
export const ground = (theme) => (theme.mode === 'light' ? theme.bg : 0x000000);

/** Scale a packed color's brightness (0..1+), clamped. */
export function dim(c, k) {
  if (c === NONE) return NONE;
  return rgb(((c >> 16) & 255) * k, ((c >> 8) & 255) * k, (c & 255) * k);
}

// IBM VGA text-mode palette, in DOS attribute order.
export const VGA = [
  0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
  0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
];
export const VGA_NAME = {
  black: 0, blue: 1, green: 2, cyan: 3, red: 4, magenta: 5, brown: 6, gray: 7,
  dark: 8, lblue: 9, lgreen: 10, lcyan: 11, lred: 12, lmagenta: 13, yellow: 14, white: 15,
};

/**
 * VGA palette, or the active theme mapped onto the same 16 slots
 * (`--set colors=theme`) so BBS screens can follow a design system.
 */
export function bbsPalette(ctx) {
  if (ctx.param('colors', 'vga') !== 'theme') return VGA;
  const t = ctx.theme;
  const d = (c, k) => dim(c, k);
  return [
    t.bg, d(t.info, 0.65), d(t.pos, 0.65), d(t.accent, 0.65), d(t.neg, 0.65), d(t.crit, 0.65), d(t.warn, 0.6), t.muted,
    t.dim, t.info, t.pos, t.accent, t.neg, t.crit, t.warn, t.ink,
  ];
}

/**
 * Rasterize text into a 0/1 mask using a bitmap font.
 * Returns { w, h, bits: Uint8Array, cols: [startX per char] }.
 */
export function textMask(text, { font = 'bold', spacing = 1 } = {}) {
  const f = getFont(font);
  const glyphs = [...String(text)].map((ch) => (ch === ' ' ? { w: Math.max(2, f.width - 2), h: f.height, bits: null } : glyph(f, ch)));
  const h = f.height;
  let w = 0;
  const cols = [];
  for (const g of glyphs) { cols.push(w); w += g.w + spacing; }
  w = Math.max(1, w - spacing);
  const bits = new Uint8Array(w * h);
  glyphs.forEach((g, i) => {
    if (!g.bits) return;
    const gh = Math.min(h, g.h);
    for (let y = 0; y < gh; y++) for (let x = 0; x < g.w; x++) if (g.bits[y * g.w + x]) bits[y * w + cols[i] + x] = 1;
  });
  return { w, h, bits, cols, glyphs };
}

/** Sample a mask at (x, y) with integer scaling; out of range → 0. */
export function maskAt(m, x, y, sx = 1, sy = sx) {
  const mx = Math.floor(x / sx), my = Math.floor(y / sy);
  if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) return 0;
  return m.bits[my * m.w + mx];
}

/** Cheap deterministic hash → [0, 1). */
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Canvas-pixel scale for bitmap-font text so one font pixel is visually square
 * in any canvas mode and the text stands `targetCells` rows tall.
 */
export function fontPx(cv, targetCells, fontH = 7) {
  const L = Math.max(0.5, (targetCells * 2) / fontH); // visual units (cell widths) per font pixel
  return { sx: Math.max(1, Math.round(L * cv.sx)), sy: Math.max(1, Math.round((L * cv.sy) / 2)) };
}

/** A deterministic starfield: [x, y, layer] in canvas pixels. */
export function makeStars(rng, w, h, n) {
  return Array.from({ length: n }, () => [rng() * w, rng() * h, rng()]);
}
