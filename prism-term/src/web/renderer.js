// Canvas2D renderer for prism-term cell buffers — the browser's terminal.
//
// Cells are drawn on an integer device-pixel grid (cell width cw, height 2·cw,
// matching the 1:2 cell aspect the engine's canvases assume) so neighbouring
// cells tile without seams. Block elements, braille, sextants and box drawing
// are rasterised from geometry (glyphs.js); everything else is fillText with a
// monospace stack. Frames are diffed against the previous one and only changed
// cells are repainted, so mostly-static widgets cost almost nothing.

import { NONE, ANSI16, to256, normalizeDepth, ansi16Fg, ansi16Bg, parse } from '../color.js';
import { terminalScheme } from '../palettes.js';
import { ATTR } from '../buffer.js';
import { charWidth } from '../width.js';
import { glyphClass, blockGeometry, brailleDots, sextantCells, boxGeometry } from './glyphs.js';

export const FONT_STACK = '"Cascadia Mono","Cascadia Code","JetBrains Mono","SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono","Liberation Mono",monospace';

// Color as a terminal of a given depth would show it (default colors stay default).
function xterm256(n) {
  if (n < 16) return ANSI16[n];
  if (n >= 232) { const v = 8 + (n - 232) * 10; return (v << 16) | (v << 8) | v; }
  const i = n - 16, lv = [0, 95, 135, 175, 215, 255];
  return (lv[Math.floor(i / 36)] << 16) | (lv[Math.floor(i / 6) % 6] << 8) | lv[i % 6];
}
const QUANT = {
  truecolor: null,
  '256': (c) => (c === NONE ? c : xterm256(to256(c))),
  mono: () => NONE,
};

// The 16 colors a terminal set to this theme's scheme shows (Prism Night / Day ship
// their own, src/themes.js › TERMINAL_SCHEMES); any other theme gets the xterm defaults.
function ansiOf(theme) {
  const s = theme?.id ? terminalScheme(theme.id) : null;
  return s && s.id === theme.id ? s.ansi.map(parse) : ANSI16;
}

// Refraction's Prism Night canvas (design/tokens.json › terminal.night) until a theme is set.
const NIGHT = { id: 'prism-dark', bg: 0x0a0c12, ink: 0xe6e6ef };

// Relative ink of common ASCII-art glyphs, for minimap text (default 0.62).
const INK = { '.': 0.7, ':': 0.8, '-': 0.75, '=': 0.7, '+': 0.42, '*': 0.5, '#': 0.78, '%': 0.72, '@': 0.9, '|': 0.5, '/': 0.48, '\\': 0.48, 'o': 0.5, 'O': 0.62, 'x': 0.5 };

const css = new Map();
function cssColor(c) {
  let s = css.get(c);
  if (s === undefined) {
    if (css.size > 8192) css.clear();
    s = '#' + (c & 0xffffff).toString(16).padStart(6, '0');
    css.set(c, s);
  }
  return s;
}

export class TermCanvas {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts { theme (resolved prism theme), font (CSS font-family), depth }
   */
  constructor(canvas, { theme, font = FONT_STACK, depth = 'truecolor' } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.font = font;
    this.theme = theme || NIGHT;
    this.ansi = ansiOf(this.theme);
    this.setDepth(depth);
    this.cols = 0; this.rows = 0; this.cw = 8; this.chh = 16;
    this.prev = null;
    this.full = true;
  }

  setTheme(theme) { this.theme = theme; this.ansi = ansiOf(theme); this.setDepth(this.depth); }

  /** Show colors as a 'truecolor' | '256' | '16' | 'mono' terminal would. */
  setDepth(depth) {
    this.depth = normalizeDepth(depth);
    // 16 colors: the engine's designed ANSI slots — separately for text and fills, slot -1 being
    // the terminal's default color — exactly what real 16-color output sends (color.js › fgParam/bgParam).
    // `quant` maps a fill (letterbox backgrounds use it); cells map text and fills apart.
    this.quant = this.depth === '16' ? (c) => this._slot(c, ansi16Bg) : QUANT[this.depth];
    this.full = true;
  }

  _slot(c, role) {
    if (c === NONE) return c;
    const n = role(c);
    return n < 0 ? NONE : this.ansi[n] ?? ANSI16[n];
  }

  /**
   * Size the backing store: cols × rows cells of cw device pixels (height 2·cw).
   * The caller sets the CSS size (usually cw / devicePixelRatio per cell).
   */
  layout(cols, rows, cw) {
    cw = Math.max(2, Math.round(cw));
    if (cols === this.cols && rows === this.rows && cw === this.cw) return;
    this.cols = cols; this.rows = rows; this.cw = cw; this.chh = cw * 2;
    this.canvas.width = cols * cw;
    this.canvas.height = rows * this.chh;
    const lw = Math.max(1, Math.round(cw / 7));
    this.metrics = {
      lw,                                   // light line
      hw: Math.max(lw + 1, Math.round(lw * 2.2)), // heavy line
      gap: Math.max(lw, Math.round(cw / 4.5)),     // half-distance between double lines
      dot: Math.max(1, Math.round(Math.min(cw / 2, this.chh / 4) * 0.66)),
      fontPx: Math.max(4, Math.min(Math.floor(cw * 1.62), Math.floor(this.chh * 0.86))),
    };
    // Below ~7px, real glyphs turn to mush: draw text as minimap strokes instead.
    this.minimap = this.metrics.fontPx < 7;
    this.prev = null;
    this.full = true;
    this.fontKey = null; // resizing the canvas resets its 2D state
  }

  /** Paint `buffer` (a CellBuffer of exactly cols × rows), repainting only changed cells. */
  draw(buffer) {
    const { cols, rows, ctx } = this;
    if (!cols || !rows) return 0;
    const W = buffer.width, n = cols * rows;
    if (!this.prev || this.prev.ch.length !== n) {
      this.prev = { ch: new Array(n).fill(null), fg: new Int32Array(n), bg: new Int32Array(n), at: new Uint8Array(n) };
      this.full = true;
    }
    const p = this.prev;
    if (this.full) {
      ctx.fillStyle = cssColor(this.theme.bg);
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    let painted = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x, bi = y * W + x;
        const ch = buffer.ch[bi], fg = buffer.fg[bi], bg = buffer.bg[bi], at = buffer.at[bi];
        // A wide glyph and its '' continuation repaint together.
        const wide = x + 1 < cols && buffer.ch[bi + 1] === '' && ch !== '';
        let dirty = this.full || ch !== p.ch[i] || fg !== p.fg[i] || bg !== p.bg[i] || at !== p.at[i];
        if (!dirty && wide) { const j = i + 1, bj = bi + 1; dirty = buffer.ch[bj] !== p.ch[j] || buffer.fg[bj] !== p.fg[j] || buffer.bg[bj] !== p.bg[j]; }
        if (!dirty) continue;
        if (ch === '' && x > 0 && buffer.ch[bi - 1] !== '' && !this.full) {
          // Continuation changed alone: its owner (to the left) repaints both.
          const owner = bi - 1;
          this._cell(x - 1, y, buffer.ch[owner], buffer.fg[owner], buffer.bg[owner], buffer.at[owner], true);
        } else if (ch !== '') {
          this._cell(x, y, ch, fg, bg, at, wide);
        }
        p.ch[i] = ch; p.fg[i] = fg; p.bg[i] = bg; p.at[i] = at;
        if (wide) { const j = i + 1, bj = bi + 1; p.ch[j] = buffer.ch[bj]; p.fg[j] = buffer.fg[bj]; p.bg[j] = buffer.bg[bj]; p.at[j] = buffer.at[bj]; }
        painted++;
      }
    }
    this.full = false;
    return painted;
  }

  _cell(x, y, ch, fg, bg, at, wide) {
    const { ctx, cw, chh, theme } = this;
    const X = x * cw, Y = y * chh, w = wide ? cw * 2 : cw;
    if (this.depth === '16') { fg = this._slot(fg, ansi16Fg); bg = this._slot(bg, ansi16Bg); }
    else if (this.quant) { fg = this.quant(fg); bg = this.quant(bg); }
    let f = fg === NONE ? theme.ink : fg, b = bg === NONE ? theme.bg : bg;
    if (at & ATTR.INVERSE) [f, b] = [b, f];
    ctx.fillStyle = cssColor(b);
    ctx.fillRect(X, Y, w, chh);
    if (ch === ' ' && !(at & (ATTR.UNDERLINE | ATTR.STRIKE))) return;
    ctx.fillStyle = cssColor(f);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.globalAlpha = at & ATTR.DIM ? 0.55 : 1;
    if (ch !== ' ') {
      const cp = ch.codePointAt(0);
      const kind = glyphClass(cp);
      if (kind === 'block') this._block(X, Y, cp);
      else if (kind === 'braille') this._braille(X, Y, cp);
      else if (kind === 'sextant') this._sextant(X, Y, cp);
      else if (kind === 'box') this._box(X, Y, cp);
      else if (this.minimap) this._mini(X, Y, w, ch);
      else this._text(X, Y, w, ch, at);
    }
    const { lw } = this.metrics;
    if (at & ATTR.UNDERLINE) ctx.fillRect(X, Y + chh - lw * 2, w, lw);
    if (at & ATTR.STRIKE) ctx.fillRect(X, Y + Math.round(chh / 2), w, lw);
    ctx.globalAlpha = 1;
  }

  _rect(X, Y, rx, ry, rw, rh) {
    const { cw, chh } = this;
    const x0 = X + Math.round(rx * cw), x1 = X + Math.round((rx + rw) * cw);
    const y0 = Y + Math.round(ry * chh), y1 = Y + Math.round((ry + rh) * chh);
    if (x1 > x0 && y1 > y0) this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  _block(X, Y, cp) {
    const g = blockGeometry(cp);
    if (g.shade) {
      const a = this.ctx.globalAlpha;
      this.ctx.globalAlpha = a * g.shade;
      this.ctx.fillRect(X, Y, this.cw, this.chh);
      this.ctx.globalAlpha = a;
      return;
    }
    for (const [rx, ry, rw, rh] of g.rects) this._rect(X, Y, rx, ry, rw, rh);
  }

  _braille(X, Y, cp) {
    const { ctx, cw, chh } = this;
    const d = this.metrics.dot;
    const dots = brailleDots(cp);
    if (d >= 4) {
      ctx.beginPath();
      for (const [dx, dy] of dots) {
        const cx = X + (dx + 0.5) * cw / 2, cy = Y + (dy + 0.5) * chh / 4;
        ctx.moveTo(cx + d / 2, cy);
        ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      }
      ctx.fill();
    } else {
      for (const [dx, dy] of dots) {
        const cx = X + (dx + 0.5) * cw / 2, cy = Y + (dy + 0.5) * chh / 4;
        ctx.fillRect(Math.round(cx - d / 2), Math.round(cy - d / 2), d, d);
      }
    }
  }

  _sextant(X, Y, cp) {
    const { cw, chh, ctx } = this;
    for (const [col, row] of sextantCells(cp)) {
      const x0 = X + Math.round(col * cw / 2), x1 = X + Math.round((col + 1) * cw / 2);
      const y0 = Y + Math.round(row * chh / 3), y1 = Y + Math.round((row + 1) * chh / 3);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  _box(X, Y, cp) {
    const g = boxGeometry(cp);
    if (!g) return;
    const { ctx, cw, chh } = this;
    const { lw, hw, gap } = this.metrics;
    const cx = X + Math.floor(cw / 2), cy = Y + Math.floor(chh / 2);
    const [up, right, down, left] = g.arms;
    const thick = (w) => (w === 2 ? hw : lw);
    const half = (t) => Math.floor(t / 2);

    if (g.style === '/' || g.style === '\\' || g.style === 'x') {
      ctx.lineWidth = lw;
      ctx.beginPath();
      if (g.style !== '\\') { ctx.moveTo(X, Y + chh); ctx.lineTo(X + cw, Y); }
      if (g.style !== '/') { ctx.moveTo(X, Y); ctx.lineTo(X + cw, Y + chh); }
      ctx.stroke();
      return;
    }

    if (g.style === 'arc') {
      // Stroke along the same center line the straight segments fill.
      const r = Math.max(1, Math.min(cw, chh) / 2);
      const ax = cx - half(lw) + lw / 2, ay = cy - half(lw) + lw / 2;
      ctx.lineWidth = lw;
      ctx.beginPath();
      if (right && down) { ctx.moveTo(X + cw, ay); ctx.arcTo(ax, ay, ax, Y + chh, r); ctx.lineTo(ax, Y + chh); }
      else if (left && down) { ctx.moveTo(X, ay); ctx.arcTo(ax, ay, ax, Y + chh, r); ctx.lineTo(ax, Y + chh); }
      else if (left && up) { ctx.moveTo(X, ay); ctx.arcTo(ax, ay, ax, Y, r); ctx.lineTo(ax, Y); }
      else if (right && up) { ctx.moveTo(X + cw, ay); ctx.arcTo(ax, ay, ax, Y, r); ctx.lineTo(ax, Y); }
      ctx.stroke();
      return;
    }

    if (g.style && g.style.startsWith('dash')) {
      const n = Number(g.style.slice(4));
      const t = thick(Math.max(up, right, down, left));
      if (right || left) {
        const seg = cw / n;
        for (let k = 0; k < n; k++) ctx.fillRect(Math.round(X + k * seg + seg * 0.15), cy - half(t), Math.max(1, Math.round(seg * 0.7)), t);
      } else {
        const seg = chh / n;
        for (let k = 0; k < n; k++) ctx.fillRect(cx - half(t), Math.round(Y + k * seg + seg * 0.15), t, Math.max(1, Math.round(seg * 0.7)));
      }
      return;
    }

    const hDouble = right === 3 || left === 3, vDouble = up === 3 || down === 3;
    const hline = (x0, x1, yy, t) => { if (x1 > x0) ctx.fillRect(x0, yy - half(t), x1 - x0, t); };
    const vline = (y0, y1, xx, t) => { if (y1 > y0) ctx.fillRect(xx - half(t), y0, t, y1 - y0); };

    // Single and heavy arms: from the center (overlapping it by half the
    // crossing line's thickness) out to the edge; a single arm meeting a
    // double crossing reaches the far double line.
    const tv = Math.max(thick(up === 3 ? 0 : up), thick(down === 3 ? 0 : down));
    const th = Math.max(thick(left === 3 ? 0 : left), thick(right === 3 ? 0 : right));
    if (right && right !== 3) hline(cx - (vDouble ? gap : half(tv)), X + cw, cy, thick(right));
    if (left && left !== 3) hline(X, cx + (vDouble ? gap : tv - half(tv)), cy, thick(left));
    if (down && down !== 3) vline(cy - (hDouble ? gap : half(th)), Y + chh, cx, thick(down));
    if (up && up !== 3) vline(Y, cy + (hDouble ? gap : th - half(th)), cx, thick(up));

    // Double arms: two parallel light lines whose inner ends depend on what they meet.
    if (right === 3) {
      const s1 = up === 3 ? cx + gap : left === 3 ? cx : down === 3 ? cx - gap : cx;
      const s2 = down === 3 ? cx + gap : left === 3 ? cx : up === 3 ? cx - gap : cx;
      hline(s1 - half(lw), X + cw, cy - gap, lw);
      hline(s2 - half(lw), X + cw, cy + gap, lw);
    }
    if (left === 3) {
      const e1 = up === 3 ? cx - gap : right === 3 ? cx : down === 3 ? cx + gap : cx;
      const e2 = down === 3 ? cx - gap : right === 3 ? cx : up === 3 ? cx + gap : cx;
      hline(X, e1 + lw - half(lw), cy - gap, lw);
      hline(X, e2 + lw - half(lw), cy + gap, lw);
    }
    if (down === 3) {
      const s1 = left === 3 ? cy + gap : up === 3 ? cy : right === 3 ? cy - gap : cy;
      const s2 = right === 3 ? cy + gap : up === 3 ? cy : left === 3 ? cy - gap : cy;
      vline(s1 - half(lw), Y + chh, cx - gap, lw);
      vline(s2 - half(lw), Y + chh, cx + gap, lw);
    }
    if (up === 3) {
      const e1 = left === 3 ? cy - gap : down === 3 ? cy : right === 3 ? cy + gap : cy;
      const e2 = right === 3 ? cy - gap : down === 3 ? cy : left === 3 ? cy + gap : cy;
      vline(Y, e1 + lw - half(lw), cx - gap, lw);
      vline(Y, e2 + lw - half(lw), cx + gap, lw);
    }
  }

  _text(X, Y, w, ch, at) {
    const { ctx, chh } = this;
    const { fontPx } = this.metrics;
    const key = (at & ATTR.ITALIC ? 1 : 0) | (at & ATTR.BOLD ? 2 : 0);
    if (key !== this.fontKey) {
      ctx.font = `${key & 1 ? 'italic ' : ''}${key & 2 ? '700' : '400'} ${fontPx}px ${this.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.fontKey = key;
    }
    ctx.fillText(ch, X + w / 2, Y + chh / 2 + Math.round(fontPx * 0.04));
  }

  /** Thumbnail text: a soft stroke as dense as the glyph's ink, like an editor minimap. */
  _mini(X, Y, w, ch) {
    const { ctx, cw, chh } = this;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * (INK[ch] ?? 0.62);
    if (".,:;'`".includes(ch)) ctx.fillRect(X + Math.floor(cw / 3), Y + Math.round(chh * 0.6), Math.max(1, Math.round(cw / 3)), Math.max(1, Math.round(chh / 6)));
    else if ('-_=~'.includes(ch)) ctx.fillRect(X, Y + Math.round(chh * (ch === '_' ? 0.78 : 0.46)), w, Math.max(1, Math.round(chh / (ch === '=' ? 6 : 10))));
    else ctx.fillRect(X + (cw > 3 ? 1 : 0), Y + Math.round(chh * 0.22), Math.max(1, w - (cw > 3 ? 1 : 0)), Math.max(1, Math.round(chh * 0.6)));
    ctx.globalAlpha = a;
  }

}

/**
 * Pick a cell width (device px) that fits cols × rows into a CSS box.
 * Returns { cw, cssWidth, cssHeight }.
 */
export function fitCells(cols, rows, maxCssW, maxCssH, dpr = globalThis.devicePixelRatio || 1) {
  const byW = Math.floor((maxCssW * dpr) / cols);
  const byH = maxCssH ? Math.floor((maxCssH * dpr) / (rows * 2)) : byW;
  const cw = Math.max(2, Math.min(byW, byH));
  return { cw, cssWidth: (cols * cw) / dpr, cssHeight: (rows * cw * 2) / dpr };
}

/** One-shot: draw a CellBuffer onto a canvas sized to `opts.cellWidth` (CSS px) or `opts.width`. */
export function renderToCanvas(buffer, canvas, opts = {}) {
  const dpr = opts.dpr || globalThis.devicePixelRatio || 1;
  const tc = canvas.__prismTerm || (canvas.__prismTerm = new TermCanvas(canvas, opts));
  if (opts.theme) tc.setTheme(opts.theme);
  const fit = opts.cellWidth
    ? { cw: Math.round(opts.cellWidth * dpr), cssWidth: buffer.width * opts.cellWidth, cssHeight: buffer.height * opts.cellWidth * 2 }
    : fitCells(buffer.width, buffer.height, opts.width || canvas.clientWidth || 640, opts.height || 0, dpr);
  tc.layout(buffer.width, buffer.height, fit.cw);
  canvas.style.width = `${fit.cssWidth}px`;
  canvas.style.height = `${fit.cssHeight}px`;
  tc.draw(buffer);
  return tc;
}

export { charWidth };
