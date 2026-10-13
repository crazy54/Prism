// Shared helpers for the Pure ASCII gallery. Everything here emits printable
// 7-bit ASCII only (0x20–0x7e), so facets built on it run on a VT100, a serial
// console, TERM=linux or LANG=C without a single byte of mojibake.

import { layoutText } from '../../text/banner.js';

export const RAMP = ' .:-=+*#%@';
export const RAMP_DONUT = '.,-~:;=!*#$@';
export const RAMP_FIRE = ' .:*sS#$';

/** Deterministic hash of up to three ints → [0, 1). */
export function hash(a, b = 0, c = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Replace anything outside printable ASCII with '?' (defensive; art is authored ASCII). */
export const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, '?');

/**
 * Draw multi-line ASCII art at (x, y). Spaces are transparent unless `opaque`.
 * `color` is a packed color or a function (ch, col, row) → color.
 */
export function sprite(b, x, y, lines, color, { opaque = false, attr } = {}) {
  x = Math.round(x); y = Math.round(y);
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === ' ' && !opaque) continue;
      const fg = typeof color === 'function' ? color(ch, c, r) : color;
      b.set(x + c, y + r, ch, fg, undefined, attr);
    }
  }
}

export const spriteWidth = (lines) => Math.max(0, ...lines.map((l) => l.length));

/** Mirror ASCII art horizontally, swapping directional glyphs. */
export function mirror(lines) {
  const swap = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[', '{': '}', '}': '{', '`': "'", "'": '`' };
  const w = spriteWidth(lines);
  return lines.map((l) => [...l.padEnd(w)].reverse().map((ch) => swap[ch] || ch).join(''));
}

/** Character for a line segment's direction (cells are ~2× taller than wide). */
export function slopeChar(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy) * 2;
  if (ax > ay * 2.2) return '-';
  if (ay > ax * 2.2) return '|';
  return (dx > 0) === (dy > 0) ? '\\' : '/';
}

/**
 * Bresenham line in cells. Each cell's glyph follows the step it takes to the
 * next cell — x-only → '-', y-only → '|', diagonal → '/' or '\' — so shallow
 * and steep lines read as "--/--/" and "|/|/" instead of doubled slashes.
 * Pass `ch` to force one glyph.
 */
export function line(b, x0, y0, x1, y1, color, ch) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  const diag = sx === sy ? '\\' : '/';
  let err = dx + dy;
  for (let n = 0; n < 4000; n++) {
    if (x0 === x1 && y0 === y1) { b.set(x0, y0, ch || (dx > -dy * 2 ? '-' : dx * 2 < -dy ? '|' : diag), color); break; }
    const e2 = 2 * err;
    const mx = e2 >= dy, my = e2 <= dx;
    b.set(x0, y0, ch || (mx && my ? diag : mx ? '-' : '|'), color);
    if (mx) { err += dy; x0 += sx; }
    if (my) { err += dx; y0 += sy; }
  }
}

/** Centered text on a row (clipped by the surface). */
export function center(b, y, s, color, attr) {
  const str = ascii(s);
  b.text(Math.floor((b.width - str.length) / 2), y, str, color, undefined, attr);
}

/** ASCII box: +---+ / |   | / +---+ with an optional title. */
export function box(b, x, y, w, h, color, title) {
  if (w < 2 || h < 2) return;
  b.text(x, y, '+' + '-'.repeat(w - 2) + '+', color);
  for (let r = 1; r < h - 1; r++) { b.set(x, y + r, '|', color); b.set(x + w - 1, y + r, '|', color); }
  b.text(x, y + h - 1, '+' + '-'.repeat(w - 2) + '+', color);
  if (title && w > title.length + 4) b.text(x + 2, y, ` ${ascii(title)} `, color);
}

/** Triangle wave in [0, span] with the given speed (cells/second); also returns the bounce count. */
export function bounce(t, span, speed, phase = 0) {
  if (span <= 0) return { pos: 0, hits: 0 };
  const d = Math.abs(t * speed + phase);
  const hits = Math.floor(d / span);
  const r = d - hits * span;
  return { pos: hits % 2 === 0 ? r : span - r, hits };
}

// ── bitmap text helpers ─────────────────────────────────────────────────────

/** Rasterize text with a Prism bitmap font into rows of 0/1 (optionally x-stretched). */
export function bitmap(text, font, stretch = 1) {
  const lay = layoutText(text, { font });
  const w = lay.width * stretch, h = lay.height;
  const px = Array.from({ length: h }, () => new Uint8Array(w));
  for (const l of lay.lines) for (const { gl, x } of l.glyphs) {
    for (let gy = 0; gy < gl.h; gy++) for (let gx = 0; gx < gl.w; gx++) {
      if (!gl.bits[gy * gl.w + gx]) continue;
      for (let s = 0; s < stretch; s++) px[l.y + gy][(l.x + x + gx) * stretch + s] = 1;
    }
  }
  return { w, h, px };
}

// Marching squares over the pixel lattice → a figlet-style outline in _ and |.
// Index = TL·8 + TR·4 + BL·2 + BR.
const OUTLINE = [' ', ' ', ' ', '_', '|', '|', '|', '|', '|', '|', '|', '|', '_', '_', '_', ' '];

/** Figlet-style outline lines for text. */
export function figlet(text, font = 'standard') {
  const { w, h, px } = bitmap(text, font, 2);
  const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? px[y][x] : 0);
  const out = [];
  for (let y = 0; y <= h; y++) {
    let s = '';
    for (let x = 0; x <= w; x++) s += OUTLINE[at(x - 1, y - 1) * 8 + at(x, y - 1) * 4 + at(x - 1, y) * 2 + at(x, y)];
    out.push(s);
  }
  return out;
}

/** banner(1)-style block letters made of a single character. */
export function blockText(text, font, ch = '#') {
  const { w, h, px } = bitmap(text, font, 2);
  return px.map((row) => Array.from(row, (v) => (v ? ch : ' ')).join('')).slice(0, h);
}
