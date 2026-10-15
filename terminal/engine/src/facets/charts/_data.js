// Shared helpers for the charts, status and maps galleries: deterministic
// telemetry streams, glyph sets with ASCII fallbacks, and small drawing utilities.
// Everything derives from t and ctx.noise, so frames are reproducible per seed.

import { NONE, mix } from '../../color.js';
import { ATTR, CellBuffer, Surface } from '../../buffer.js';
import { stringWidth, truncate } from '../../width.js';

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (k) => k * k * (3 - 2 * k);

/**
 * A believable metric stream. `at(k)` is the k-th sample (one per 1/rate s),
 * `window(t, n)` the last n samples at time t, `now(t)` the interpolated value.
 */
export function signal(ctx, { seed = 1, base = 50, amp = 20, rate = 4, spike = 0, min = -Infinity, max = Infinity, trend = 0 } = {}) {
  const n2 = ctx.noise.noise2;
  const s = seed * 17.31 + 3.7;
  const at = (k) => {
    // Perlin output mostly sits within ±0.4, so the noise terms are scaled up to make `amp` the real swing.
    let v = base + amp * (1.15 * n2(k * 0.085, s) + 0.7 * n2(k * 0.29, s + 9.1)) + amp * 0.3 * Math.sin(k * 0.047 + s) + trend * k;
    if (spike) { const p = n2(k * 0.021, s + 33.3); if (p > 0.38) v += spike * (p - 0.38) * 6; }
    return clamp(v, min, max);
  };
  return {
    at,
    window(t, n) { const k0 = Math.floor(t * rate); const out = new Array(n); for (let i = 0; i < n; i++) out[i] = at(k0 - n + 1 + i); return out; },
    now(t) { const x = t * rate, k = Math.floor(x); return lerp(at(k), at(k + 1), x - k); },
  };
}

/** Glyphs with 7-bit fallbacks for terminals without Unicode. */
export function glyphs(ctx) {
  const u = ctx.caps?.unicode !== false;
  return u
    ? { u, h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯', dot: '●', ring: '○', up: '▲', down: '▼', bullet: '•', full: '█', shade: '░', mid: '▒', check: '✔', cross: '✖', warn: '▲', info: 'ℹ', arrowR: '▶', tick: '┼', cornerL: '└', dash: '┄', block: '▌', sep: '│' }
    : { u, h: '-', v: '|', tl: '+', tr: '+', bl: '+', br: '+', dot: 'o', ring: 'o', up: '^', down: 'v', bullet: '*', full: '#', shade: '.', mid: ':', check: '+', cross: 'x', warn: '!', info: 'i', arrowR: '>', tick: '+', cornerL: '+', dash: '-', block: '|', sep: '|' };
}

const FOLD = { '→': '->', '←': '<-', '↑': '^', '↓': 'v', '–': '-', '—': '-', '·': '-', '…': '.', '×': 'x', '±': '+/-', '≥': '>=', '≤': '<=', '°': 'o', 'µ': 'u', '•': '*', '✔': '+', '✓': '+', '✖': 'x', '✗': 'x', '▲': '^', '▼': 'v', '●': 'o', '○': 'o', '│': '|', '─': '-', '⇡': '^', '⇣': 'v', '★': '*' };
// Glyph classes for single-cell folding: boxes, blocks and shapes.
for (const c of '╭╮╰╯┌┐└┘├┤┬┴┼┏┓┗┛╋╔╗╚╝') FOLD[c] = '+';
for (const c of '━┄┈╌═▔') FOLD[c] = c === '═' ? '=' : '-';
for (const c of '┃┆┊║▏▎▍▌▐▕') FOLD[c] = '|';
for (const c of '█▓▉▊▋■▪▮◼') FOLD[c] = '#';
Object.assign(FOLD, { '▒': ':', '░': '.', '▀': '"', '▁': '.', '▂': '.', '▃': '_', '▄': '_', '▅': '=', '▆': '=', '▇': '#', '▬': '=', '▯': '.', '◆': '*', '◇': 'o', '◉': '@', '◌': '.', '◀': '<', '▶': '>', '▸': '>', '◂': '<', '▴': '^', '▾': 'v', '✦': '*', '☼': '*', '☾': 'C', '⎇': 'Y', '⎈': '*', '‹': '<', '›': '>', '∙': '.', '❯': '>', '⊘': '-', '‖': '=', 'ℹ': 'i' });
// Braille folds by dot count, so plotted lines degrade to a dotted ASCII trail.
const BRAILLE = ' ..::++##';
const foldChar = (c) => {
  const cp = c.codePointAt(0);
  if (cp >= 0x2800 && cp <= 0x28ff) { let n = cp - 0x2800, k = 0; while (n) { k += n & 1; n >>= 1; } return BRAILLE[k]; }
  return FOLD[c] ?? '?';
};
/** 7-bit transliteration for LANG=C terminals; unknown characters become '?'. */
export const fold = (s) => { let out = ''; for (const c of String(s)) out += c.codePointAt(0) < 128 ? c : foldChar(c); return out; };
/** Identity on Unicode terminals, `fold` otherwise. */
export const textFor = (g) => (g.u ? (s) => s : fold);

/** A pass-through surface that folds every glyph and string to 7-bit ASCII. */
class Folded extends Surface {
  constructor(inner) { super(); this.inner = inner; }
  get width() { return this.inner.width; }
  get height() { return this.inner.height; }
  set(x, y, ch, fg, bg, attr) {
    if (ch && ch.length && ch.codePointAt(0) > 127) ch = foldChar(ch)[0];
    return this.inner.set(x, y, ch, fg, bg, attr);
  }
  get(x, y) { return this.inner.get(x, y); }
  clear(bg, fg) { return this.inner.clear(bg, fg); }
  text(x, y, str, fg, bg, attr) { return super.text(x, y, fold(str), fg, bg, attr); }
}
/** The surface itself on Unicode terminals; an ASCII-folding wrapper otherwise. */
export const safe = (s, g) => (g.u ? s : new Folded(s));

/** Eighth blocks, bottom-anchored (index 0..8) and left-anchored. */
export const VBLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
export const HBLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
const ASCII_V = [' ', '.', '.', '_', '_', '=', '=', '#', '#'];

/** A vertical bar of fractional height (cells) growing upward from y0 (bottom row). */
export function vbar(s, x, y0, height, color, g, bg) {
  const full = Math.floor(height), rem = Math.round((height - full) * 8);
  for (let i = 0; i < full; i++) s.set(x, y0 - i, g.u ? '█' : '#', color, bg);
  if (rem > 0) s.set(x, y0 - full, g.u ? VBLOCKS[rem] : ASCII_V[rem], color, bg);
}

/** A horizontal bar of fractional length (cells) starting at x0. */
export function hbar(s, x0, y, len, color, g, bg) {
  const full = Math.floor(len), rem = Math.round((len - full) * 8);
  for (let i = 0; i < full; i++) s.set(x0 + i, y, g.u ? '█' : '#', color, bg);
  if (rem > 0) s.set(x0 + full, y, g.u ? HBLOCKS[rem] : (rem > 4 ? '#' : '-'), color, bg);
}

/** Text clipped to `w` columns. */
export function put(s, x, y, text, w, fg, bg, attr) {
  if (w <= 0) return x;
  return s.text(x, y, stringWidth(text) > w ? truncate(text, w) : text, fg, bg, attr);
}

/** Right-aligned text ending at column x (exclusive). */
export function putR(s, xEnd, y, text, fg, bg, attr) {
  return s.text(xEnd - stringWidth(text), y, text, fg, bg, attr);
}

/** A rounded frame with an optional title; returns the inner rect. */
export function frame(s, x, y, w, h, color, g, title, titleColor) {
  if (w < 2 || h < 2) return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
  s.text(x, y, g.tl + g.h.repeat(w - 2) + g.tr, color);
  for (let yy = y + 1; yy < y + h - 1; yy++) { s.set(x, yy, g.v, color); s.set(x + w - 1, yy, g.v, color); }
  s.text(x, y + h - 1, g.bl + g.h.repeat(w - 2) + g.br, color);
  if (title && w > 6) s.text(x + 2, y, ` ${truncate(title, w - 6)} `, titleColor ?? color, undefined, ATTR.BOLD);
  return { x: x + 1, y: y + 1, w: w - 2, h: h - 2 };
}

/** Compact number formatting. */
export function num(v, d = 1) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(d) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(d) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(d) + 'k';
  if (a >= 100) return v.toFixed(0);
  return v.toFixed(d);
}

/** Health → theme color. */
export const healthColor = (th, h) => (h >= 0.8 ? th.pos : h >= 0.5 ? th.warn : th.neg);

/**
 * The theme's "white light" for highlights — peaks, markers, needles, the newest
 * sample. White on Night glass; ink on Day pearl, where a white mark would vanish.
 */
export const light = (th) => (th.mode === 'light' ? th.ink : 0xffffff);

/** Brighten a color toward the light at Night, deepen it toward ink by Day. */
export const lift = (th, c, k) => mix(c, light(th), k);

/** WCAG relative luminance (0 black … 1 white). */
export function relLum(c) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f((c >> 16) & 255) + 0.7152 * f((c >> 8) & 255) + 0.0722 * f(c & 255);
}

/** Text that reads on a fill: white on dark fills, the theme's darkest on light ones. */
export const onFill = (th, fill) => (relLum(fill) > 0.18 ? (th.mode === 'light' ? th.ink : th.bg) : 0xffffff);

/** Soft tint of color c over the background. */
export const tint = (th, c, k = 0.18) => mix(th.bg, c, k);

/**
 * Memoised drawing: `draw(buf)` renders into a private offscreen buffer only when
 * `key` changes (e.g. a new data sample), and the cached cells are stamped onto
 * the target every frame. Expensive widget renders then cost a blit per frame.
 */
export function memo() {
  let key = null, buf = null;
  return (target, x, y, w, h, k, draw) => {
    if (w <= 0 || h <= 0) return;
    if (!buf || buf.width !== w || buf.height !== h || key !== k) {
      buf = new CellBuffer(w, h);
      draw(buf);
      key = k;
    }
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const i = yy * w + xx, ch = buf.ch[i];
        if (ch === ' ' && buf.bg[i] === NONE && !buf.at[i]) continue;
        target.set(x + xx, y + yy, ch, buf.fg[i], buf.bg[i], buf.at[i]);
      }
    }
  };
}

export { NONE, ATTR };
