// Cell buffers — the in-memory screen.
//
// A CellBuffer is a grid of cells (char, fg, bg, attr) stored as parallel typed
// arrays so the renderer can diff whole frames cheaply. A View is a clipped,
// offset window onto a CellBuffer (or another View) with the same drawing API —
// widgets draw into views and never need to know where they sit on screen.
//
// Write semantics shared by every surface: an `undefined` fg/bg/attr keeps the
// cell's current value (so text can be laid over an effect without erasing its
// background); NONE (-1) means the terminal's default color.
//
// Wide characters (CJK, emoji) occupy two cells: the glyph in the first and an
// empty-string continuation marker in the second, which the renderer skips.

import { NONE, fgParam, bgParam, normalizeDepth } from './color.js';
import { charWidth } from './width.js';

export const ATTR = Object.freeze({
  BOLD: 1, DIM: 2, ITALIC: 4, UNDERLINE: 8, BLINK: 16, INVERSE: 32, STRIKE: 64,
});

const ATTR_SGR = [[1, '1'], [2, '2'], [4, '3'], [8, '4'], [16, '5'], [32, '7'], [64, '9']];

/**
 * True when `surface` (or the buffer it draws into) renders for a light terminal:
 * createContext() sets `light16` on the root buffer from the theme's mode. At 16
 * colors that keeps white / bright-white text off the default background (color.js
 * ansi16Text); other depths ignore it.
 */
export function lightTerminal(surface) {
  for (let s = surface, i = 0; s && i < 16; s = s.parent || s.inner, i++) if (s.light16 !== undefined) return !!s.light16;
  return false;
}

/**
 * The color the serializers send as the terminal's own foreground (SGR 39), or -2:
 * with --transparent createContext() sets `inkAsDefault` on the root buffer to the
 * theme's ink, so body text follows the terminal (readable on a light or a dark
 * background even when the theme guess is wrong).
 */
export function defaultInk(surface) {
  for (let s = surface, i = 0; s && i < 16; s = s.parent || s.inner, i++) if (s.inkAsDefault !== undefined) return s.inkAsDefault ?? -2;
  return -2;
}

/**
 * Is `ch` text (as opposed to a pixel glyph whose fg is a fill: block elements,
 * shades, braille, sextants)? Only text gets the light-terminal rule.
 */
export function lightText(ch) {
  const cp = ch ? ch.codePointAt(0) : 32;
  return !((cp >= 0x2580 && cp <= 0x259f) || (cp >= 0x2800 && cp <= 0x28ff) || (cp >= 0x1fb00 && cp <= 0x1fb3b));
}

/** SGR parameter fragment for an attribute bitmask (empty string for none). */
export function attrParams(a) {
  if (!a) return '';
  let s = '';
  for (const [bit, code] of ATTR_SGR) if (a & bit) s += (s ? ';' : '') + code;
  return s;
}

/** Parse 'bold,italic' / ['bold'] / number into an attribute mask. */
export function parseAttr(v) {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  const names = Array.isArray(v) ? v : String(v).split(/[\s,|]+/);
  let a = 0;
  for (const n of names) {
    const k = String(n).toUpperCase();
    if (k === 'UNDERLINED') a |= ATTR.UNDERLINE;
    else if (k === 'REVERSE') a |= ATTR.INVERSE;
    else if (ATTR[k]) a |= ATTR[k];
  }
  return a;
}

/** Shared drawing API. Subclasses implement width/height/set/get. */
export class Surface {
  /** Write `str` starting at (x,y). Returns the column after the last glyph. */
  text(x, y, str, fg, bg, attr) {
    x = Math.round(x); y = Math.round(y);
    if (y < 0 || y >= this.height) return x + [...String(str)].length;
    for (const ch of String(str)) {
      const cp = ch.codePointAt(0);
      if (ch === '\n') continue;
      const w = charWidth(cp);
      if (w === 0) continue; // zero-width marks are dropped rather than mis-attached
      if (x >= 0 && x < this.width) {
        if (w === 2 && x + 1 >= this.width) { this.set(x, y, ' ', fg, bg, attr); x++; break; }
        this.set(x, y, ch, fg, bg, attr);
        if (w === 2) this.set(x + 1, y, '', fg, bg, attr);
      }
      x += w;
    }
    return x;
  }

  /** Fill a rectangle. `ch` undefined keeps characters (recolor only). */
  fill(x, y, w, h, ch, fg, bg, attr) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + w)), y1 = Math.min(this.height, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.set(xx, yy, ch, fg, bg, attr);
  }

  /** A clipped window onto this surface. */
  view(x, y, w, h) {
    return new View(this, x, y, w, h);
  }

  /** Copy another surface onto this one. With `transparent`, NONE-bg spaces are skipped. */
  blit(src, dx = 0, dy = 0, { transparent = false } = {}) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const c = src.get(x, y);
        if (!c) continue;
        if (transparent && c.ch === ' ' && c.bg === NONE) continue;
        this.set(x + dx, y + dy, c.ch, c.fg, c.bg, c.attr);
      }
    }
  }

  /** Plain text of the surface, one line per row, trailing spaces trimmed. */
  toString() {
    const lines = [];
    for (let y = 0; y < this.height; y++) {
      let line = '';
      for (let x = 0; x < this.width; x++) line += this.get(x, y).ch;
      lines.push(line.replace(/\s+$/, ''));
    }
    return lines.join('\n');
  }

  /**
   * Serialize as an ANSI string (rows separated by '\n', styles reset at line
   * ends) — for printing static art into normal scrollback.
   */
  toAnsi(depth = 'truecolor') {
    depth = normalizeDepth(depth);
    const light = depth === '16' && lightTerminal(this), ink = defaultInk(this);
    const lines = [];
    for (let y = 0; y < this.height; y++) {
      let line = '', fg = NONE, bg = NONE, at = 0, styled = false, fgP = '39';
      let end = this.width;
      // Trim trailing default-styled blanks so lines don't wrap in narrow terminals.
      while (end > 0) { const c = this.get(end - 1, y); if (c.ch === ' ' && c.bg === NONE && !c.attr) end--; else break; }
      for (let x = 0; x < end; x++) {
        const c = this.get(x, y);
        if (c.ch === '') continue;
        if (c.fg === ink) c.fg = NONE;
        // Light 16: the fg slot depends on the fill and on whether the glyph is text (color.js ansi16Text).
        const fp = light ? fgParam(c.fg, depth, c.bg, lightText(c.ch)) : null;
        if (depth === 'mono') {
          if (c.attr !== at) { line += `\x1b[0${c.attr ? ';' + attrParams(c.attr) : ''}m`; at = c.attr; styled = true; }
        } else if (c.attr !== at) {
          const ap = attrParams(c.attr);
          line += `\x1b[0${ap ? ';' + ap : ''};${fp ?? fgParam(c.fg, depth)};${bgParam(c.bg, depth)}m`;
          fg = c.fg; bg = c.bg; at = c.attr; styled = true; fgP = fp;
        } else if (light ? fp !== fgP || c.bg !== bg : c.fg !== fg || c.bg !== bg) {
          const parts = [];
          if (light ? fp !== fgP : c.fg !== fg) parts.push(fp ?? fgParam(c.fg, depth));
          if (c.bg !== bg) parts.push(bgParam(c.bg, depth));
          line += `\x1b[${parts.join(';')}m`;
          fg = c.fg; bg = c.bg; styled = true; fgP = fp;
        }
        line += c.ch;
      }
      if (styled) line += '\x1b[0m';
      lines.push(line);
    }
    return lines.join('\n');
  }
}

export class CellBuffer extends Surface {
  constructor(width, height) {
    super();
    this.resize(width, height);
  }

  resize(width, height) {
    this.width = Math.max(0, width | 0);
    this.height = Math.max(0, height | 0);
    const n = this.width * this.height;
    this.ch = new Array(n).fill(' ');
    this.fg = new Int32Array(n).fill(NONE);
    this.bg = new Int32Array(n).fill(NONE);
    this.at = new Uint8Array(n);
    return this;
  }

  clear(bg = NONE, fg = NONE) {
    this.ch.fill(' ');
    this.fg.fill(fg);
    this.bg.fill(bg);
    this.at.fill(0);
    return this;
  }

  set(x, y, ch, fg, bg, attr) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    if (ch !== undefined) this.ch[i] = ch;
    if (fg !== undefined) this.fg[i] = fg;
    if (bg !== undefined) this.bg[i] = bg;
    if (attr !== undefined) this.at[i] = attr;
  }

  get(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const i = y * this.width + x;
    return { ch: this.ch[i], fg: this.fg[i], bg: this.bg[i], attr: this.at[i] };
  }

  /** Deep copy (used for transitions / snapshots). */
  clone() {
    const b = new CellBuffer(this.width, this.height);
    b.ch = this.ch.slice();
    b.fg.set(this.fg);
    b.bg.set(this.bg);
    b.at.set(this.at);
    return b;
  }

  /** Copy every cell of a same-sized buffer into this one (fast path). */
  copyFrom(src) {
    if (src.width !== this.width || src.height !== this.height) return this.resize(src.width, src.height).copyFrom(src);
    for (let i = 0; i < src.ch.length; i++) this.ch[i] = src.ch[i];
    this.fg.set(src.fg);
    this.bg.set(src.bg);
    this.at.set(src.at);
    return this;
  }
}

export class View extends Surface {
  constructor(parent, x, y, w, h) {
    super();
    this.parent = parent;
    this.ox = Math.round(x);
    this.oy = Math.round(y);
    this.width = Math.max(0, Math.round(w));
    this.height = Math.max(0, Math.round(h));
  }

  set(x, y, ch, fg, bg, attr) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.parent.set(x + this.ox, y + this.oy, ch, fg, bg, attr);
  }

  get(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return this.parent.get(x + this.ox, y + this.oy);
  }

  clear(bg = NONE, fg = NONE) {
    this.fill(0, 0, this.width, this.height, ' ', fg, bg, 0);
    return this;
  }
}
