// Big text. Text is laid out in font pixels, then rasterized onto a Canvas so
// one banner renders in any resolution mode:
//
//   half     each font pixel is one half-block — square pixels, the default
//   quad     2×1 canvas pixels per font pixel (same size as half, crisper edges)
//   sextant  compact hi-res (Unicode 13 2×3 blocks)
//   braille  tiny hi-res: a 5×7 letter fits in ~2.5×2 cells
//   block    every font pixel is a full '█' cell (`wide: true` doubles it to '██')
//   ascii    '#' cells, for terminals without Unicode
//
// Fills are a color, a palette name, stop list or gradient function, swept
// horizontally / vertically / diagonally, and animated by passing `t`.

import { Canvas, pickMode, MODES } from '../canvas.js';
import { CellBuffer } from '../buffer.js';
import { NONE, parse, mix, gradient, fgParam, normalizeDepth, luminance } from '../color.js';
import { getTheme, palette as makePalette, PALETTES, legible } from '../palettes.js';
import { detect } from '../caps.js';
import { getFont, glyph } from './fonts.js';

export const BANNER_MODES = ['half', 'quad', 'sextant', 'braille', 'block', 'ascii'];

// Font pixel → canvas pixel scale per mode, chosen so letters keep their
// designed proportions (a terminal cell is ~1:2).
const MODE_SCALE = { half: [1, 1], quad: [2, 1], sextant: [1, 1], braille: [1, 1], block: [1, 1], ascii: [2, 1] };

const fract = (x) => x - Math.floor(x);
const pingpong = (x) => 1 - Math.abs(fract(x / 2) * 2 - 1);

/**
 * Resolve a fill spec into { at(g) → color, cyclic }.
 * @param {*} fill   color | palette name | stop array | gradient fn
 */
export function resolveFill(fill, theme) {
  const th = getTheme(theme);
  if (fill == null) return { at: gradient([th.accent, th.crit]), cyclic: false };
  if (typeof fill === 'function') return { at: fill, cyclic: false };
  if (Array.isArray(fill)) return { at: gradient(fill), cyclic: false };
  if (typeof fill === 'string' && (PALETTES[fill] || fill === 'theme' || fill === 'theme-heat')) {
    // Most field palettes start near black (great for fire, invisible as text ink):
    // skip the dark head so every letter reads.
    let fn = makePalette(fill, th);
    // On a light page the pale end is the invisible one: every palette color is
    // drawn as ink at large-text contrast (3:1), same hue and chroma.
    if (th.mode === 'light' && th.bg !== NONE) {
      const lut = Int32Array.from(fn.lut, (c) => legible(th, c, 3)), last = lut.length - 1;
      const cyc = !!PALETTES[fill]?.cyclic;
      fn = cyc ? (t) => lut[((Math.floor(t * lut.length) % lut.length) + lut.length) % lut.length] : (t) => lut[t <= 0 ? 0 : t >= 1 ? last : (t * last) | 0];
      fn.lut = lut;
      fn.at = (i) => lut[i < 0 ? 0 : i > last ? last : i | 0];
    }
    let lo = 0;
    while (lo < 160 && luminance(fn.lut[lo]) < 0.22) lo++;
    const span = fn.lut.length - 1 - lo;
    return { at: lo ? (g) => fn.at(lo + g * span) : fn, cyclic: !!PALETTES[fill]?.cyclic };
  }
  if (typeof fill === 'string' && fill in th && typeof th[fill] === 'number') { const c = th[fill]; return { at: () => c, cyclic: false, solid: c }; }
  const c = parse(fill);
  return { at: () => c, cyclic: false, solid: c };
}

function resolveMode(mode, caps) {
  if (!mode || mode === 'auto') return pickMode('field', caps || detect());
  if (mode === 'block' || mode === 'ascii' || MODES[mode]) return mode;
  return 'half';
}

// scale: a number multiplies the mode's base; an [x, y] array replaces it (exact canvas pixels per font pixel).
// stretch: an [x, y] array multiplies whatever scale resolved to, so condensed/tall type keeps the mode's aspect fix.
function resolveScale(mode, scale, wide, stretch) {
  let [x, y] = MODE_SCALE[mode] || [1, 1];
  if (Array.isArray(scale)) [x, y] = scale;
  else if (typeof scale === 'number' && scale > 0) { x *= scale; y *= scale; }
  if (Array.isArray(stretch)) { x *= stretch[0] || 1; y *= stretch[1] || 1; }
  if (wide && mode === 'block') x *= 2;
  return [Math.max(1, Math.round(x)), Math.max(1, Math.round(y))];
}

/** Lay out text in font pixels. Returns glyph placements and the bitmap size. */
export function layoutText(text, { font, letterSpacing, lineSpacing, align = 'left' } = {}) {
  const f = getFont(font);
  const sp = letterSpacing ?? f.spacing, ls = lineSpacing ?? f.lineSpacing;
  const lines = String(text ?? '').replace(/\t/g, '  ').replace(/\r/g, '').split('\n');
  let ci = 0, desc = false;
  const out = lines.map((line) => {
    const glyphs = [];
    let x = 0;
    for (const ch of line) {
      const gl = glyph(f, ch);
      if (gl.h > f.height) desc = true;
      glyphs.push({ gl, x, ci: ci++, ch });
      x += gl.w + sp;
    }
    return { glyphs, width: Math.max(0, x - sp) };
  });
  const width = Math.max(0, ...out.map((l) => l.width));
  if (!width) return { font: f, lines: out, width: 0, height: 0, lineHeight: 0, count: ci };
  const lineHeight = f.height + (desc ? f.descent : 0);
  out.forEach((l, i) => {
    l.y = i * (lineHeight + ls);
    l.x = align === 'center' ? Math.floor((width - l.width) / 2) : align === 'right' ? width - l.width : 0;
  });
  return { font: f, lines: out, width, height: out.length * lineHeight + (out.length - 1) * ls, lineHeight, count: ci };
}

function geometry(text, opts = {}) {
  const mode = resolveMode(opts.mode, opts.caps);
  const [kx, ky] = resolveScale(mode, opts.scale, opts.wide, opts.stretch);
  const lay = layoutText(text, opts);
  const padF = opts.outline ? 1 : 0;
  const shOff = opts.shadow ? (opts.shadowOffset || [1, 1]) : [0, 0];
  const padX = Math.max(0, Math.round(opts.padX || 0)), padY = Math.max(0, Math.round(opts.padY || 0));
  const { sx, sy } = MODES[mode === 'block' || mode === 'ascii' ? 'ascii' : mode];
  const empty = !lay.width;
  const wPx = empty ? 0 : (lay.width + 2 * padF + Math.abs(shOff[0])) * kx + 2 * padX;
  const hPx = empty ? 0 : (lay.height + 2 * padF + Math.abs(shOff[1])) * ky + 2 * padY;
  return {
    mode, kx, ky, lay, padF, shOff, padX, padY, sx, sy, wPx, hPx,
    cols: Math.ceil(wPx / sx), rows: Math.ceil(hPx / sy),
    // Canvas-pixel origin of font pixel (0,0) of the text body.
    ox: padX + (padF + Math.max(0, -shOff[0])) * kx,
    oy: padY + (padF + Math.max(0, -shOff[1])) * ky,
  };
}

/** Size of a banner in terminal cells: { width, height }. */
export function measureBanner(text, opts = {}) {
  const g = geometry(text, opts);
  return { width: g.cols, height: g.rows };
}

function makeCanvas(cols, rows, mode) {
  if (mode === 'block') return new Canvas(cols, rows, { mode: 'ascii', ramp: ' █' });
  if (mode === 'ascii') return new Canvas(cols, rows, { mode: 'ascii', ramp: ' #' });
  if (mode === 'braille') return new Canvas(cols, rows, { mode: 'braille', threshold: 0 });
  return new Canvas(cols, rows, { mode });
}

/**
 * Rasterize text into a Canvas sized to fit it.
 * @param {string} text
 * @param {object} opts
 *   font, mode, scale (number | [x,y]), stretch ([x,y] on top of scale), wide (block), letterSpacing, lineSpacing, align
 *   fill        color | palette name | stops | gradient fn (default theme accent→crit)
 *   direction   'horizontal' | 'vertical' | 'diagonal'
 *   t, speed    animate the fill: phase = t × speed (default speed 0.25/s)
 *   shadow      true (fill tinted toward the theme bg) | color;  shadowOffset [dx, dy] in font pixels
 *   outline     true (theme ink) | color
 *   theme       theme id or resolved theme
 *   shader      (color, u, v, ci) → color   per-pixel color hook (u,v ∈ 0..1)
 *   charStyle   (ci) → { fg, dx, dy, hidden }   per-character overrides (dx/dy in canvas px)
 *   ghosts      [{ dx, dy, color }]   extra offset copies drawn under the text (glitch)
 *   cursorAt    character index to draw a text cursor before (typewriter)
 *   padX, padY  extra canvas-pixel margin (room for displacement effects)
 * @returns {Canvas} with `.layout` and `.geometry` attached
 */
export function bannerCanvas(text, opts = {}) {
  const th = getTheme(opts.theme);
  const G = geometry(text, opts);
  const { mode, kx, ky, lay, padF, shOff, ox, oy } = G;
  const cv = makeCanvas(G.cols, G.rows, mode);
  cv.layout = lay;
  cv.geometry = G;
  if (!lay.width) return cv;

  const fill = resolveFill(opts.fill, th);
  const dir = opts.direction || 'horizontal';
  const animated = opts.t !== undefined && opts.t !== null;
  const phase = animated ? opts.t * (opts.speed ?? 0.25) : 0;
  const tw = Math.max(1, lay.width * kx), thh = Math.max(1, lay.height * ky);
  const shader = opts.shader, charStyle = opts.charStyle;
  const colorAt = (X, Y, ci) => {
    const u = (X - ox) / tw, v = (Y - oy) / thh;
    let gpos = dir === 'vertical' ? v : dir === 'diagonal' ? (u + v) / 2 : u;
    gpos += phase;
    if (fill.cyclic) gpos = fract(gpos);
    else if (animated) gpos = pingpong(gpos);
    let c = fill.at(Math.min(1, Math.max(0, gpos)));
    if (shader) c = shader(c, u, v, ci);
    return c;
  };

  // Gather ink pixels once: [fontX, fontY, ci, style]
  const ink = [];
  const styles = new Map();
  for (const line of lay.lines) {
    for (const { gl, x, ci } of line.glyphs) {
      let st = styles.get(ci);
      if (st === undefined) { st = charStyle ? charStyle(ci) || null : null; styles.set(ci, st); }
      if (st && st.hidden) continue;
      for (let gy = 0; gy < gl.h; gy++)
        for (let gx = 0; gx < gl.w; gx++)
          if (gl.bits[gy * gl.w + gx]) ink.push(line.x + x + gx, line.y + gy, ci, st);
    }
  }

  const block = (fx, fy, st, color) => {
    const X0 = ox + fx * kx + (st?.dx || 0), Y0 = oy + fy * ky + (st?.dy || 0);
    for (let py = 0; py < ky; py++)
      for (let px = 0; px < kx; px++) {
        const X = X0 + px, Y = Y0 + py;
        cv.set(X, Y, typeof color === 'function' ? color(X - (st?.dx || 0), Y - (st?.dy || 0)) : color);
      }
  };
  const inkColor = (ci, st) => {
    if (st && st.fg !== undefined && st.fg !== null) {
      const c = typeof st.fg === 'number' ? st.fg : parse(st.fg);
      return shader ? (X, Y) => shader(c, (X - ox) / tw, (Y - oy) / thh, ci) : c;
    }
    return (X, Y) => colorAt(X, Y, ci);
  };

  if (opts.shadow) {
    const sc = opts.shadow === true ? null : parse(opts.shadow);
    for (let i = 0; i < ink.length; i += 4) {
      const ci = ink[i + 2], st = ink[i + 3];
      const base = inkColor(ci, st);
      // Default shadow: the ink color pulled 70% back toward the theme background, so it
      // stays tinted, works on light themes, and fades along with fading text.
      const col = sc !== null ? sc : (X, Y) => {
        const c = typeof base === 'function' ? base(X - shOff[0] * kx, Y - shOff[1] * ky) : base;
        return c === NONE ? NONE : mix(th.bg, c, 0.3);
      };
      block(ink[i] + shOff[0], ink[i + 1] + shOff[1], st, col);
    }
  }
  if (opts.outline) {
    const oc = opts.outline === true ? th.ink : parse(opts.outline);
    for (let i = 0; i < ink.length; i += 4)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) block(ink[i] + dx, ink[i + 1] + dy, ink[i + 3], oc);
  }
  if (opts.ghosts) {
    for (const gh of opts.ghosts) {
      const gc = parse(gh.color);
      for (let i = 0; i < ink.length; i += 4) {
        const st = ink[i + 3];
        block(ink[i], ink[i + 1], { dx: (st?.dx || 0) + (gh.dx || 0), dy: (st?.dy || 0) + (gh.dy || 0) }, gc);
      }
    }
  }
  for (let i = 0; i < ink.length; i += 4) block(ink[i], ink[i + 1], ink[i + 3], inkColor(ink[i + 2], ink[i + 3]));

  if (opts.cursorAt !== undefined && opts.cursorAt !== null) {
    const pos = cursorPosition(lay, opts.cursorAt);
    const cc = opts.cursorColor !== undefined ? parse(opts.cursorColor) : th.accent;
    const cw = Math.max(1, Math.round(lay.font.width / 4));
    for (let fy = 0; fy < lay.font.height; fy++) for (let fx = 0; fx < cw; fx++) block(pos.x + fx, pos.y + fy, null, cc);
  }
  return cv;
}

/** Font-pixel position where a cursor before character `ci` sits. */
function cursorPosition(lay, ci) {
  let last = { x: 0, y: 0 };
  for (const line of lay.lines) {
    last = { x: line.x + line.width + (line.glyphs.length ? lay.font.spacing : 0), y: line.y };
    for (const gp of line.glyphs) if (gp.ci === ci) return { x: line.x + gp.x, y: line.y };
  }
  return last;
}

/**
 * Draw a banner onto a surface. `x`/`y` may be 'center'.
 * @returns {{ x, y, width, height }} placement in cells
 */
export function drawBanner(surface, x, y, text, opts = {}) {
  const cv = bannerCanvas(text, opts);
  const cx = x === 'center' ? Math.floor((surface.width - cv.cols) / 2) : Math.round(x || 0);
  const cy = y === 'center' ? Math.floor((surface.height - cv.rows) / 2) : Math.round(y || 0);
  cv.paint(surface, cx, cy);
  return { x: cx, y: cy, width: cv.cols, height: cv.rows };
}

/**
 * Render a banner to an ANSI string for printing into scrollback:
 *   console.log(banner('PROTEUS', { fill: 'prism', shadow: true }))
 * opts.depth defaults to the detected depth of stdout. In 'mono' the shape is
 * kept with solid glyphs (shadow/outline are dropped — they'd be invisible).
 */
export function banner(text, opts = {}) {
  const depth = normalizeDepth(opts.depth || detect().depth);
  const o = depth === 'mono' ? { ...opts, shadow: false, outline: false } : opts;
  const { width, height } = measureBanner(text, o);
  if (!width || !height) return '';
  const buf = new CellBuffer(width, height);
  drawBanner(buf, 0, 0, text, o);
  if (depth === 'mono') {
    // Background-colored cells (half/quad/sextant solid areas) carry no glyph; make
    // them ink, and drop colors entirely so the output has no escapes at all.
    for (let yy = 0; yy < height; yy++)
      for (let xx = 0; xx < width; xx++) {
        const c = buf.get(xx, yy);
        buf.set(xx, yy, c.bg !== NONE ? '█' : undefined, NONE, NONE);
      }
  }
  return buf.toAnsi(depth);
}

/**
 * Per-character gradient text as an ANSI string (no big font):
 *   console.log(gradientText('Analyzing 1,204 traces…', 'aurora'))
 * @param {string} str
 * @param {*} fill     palette name | stops | gradient fn | color
 * @param {object} opts { depth, bold, theme, t (phase shift) }
 */
export function gradientText(str, fill = 'prism', opts = {}) {
  const s = String(str ?? '');
  const depth = normalizeDepth(opts.depth || detect().depth);
  if (depth === 'mono' || !s) return s;
  const f = resolveFill(fill, opts.theme);
  const chars = [...s];
  // Cyclic palettes wrap, so spread over [0,1) — otherwise the last char repeats the first color.
  const n = f.cyclic ? Math.max(1, chars.length) : Math.max(1, chars.length - 1);
  const phase = opts.t ? opts.t * (opts.speed ?? 0.25) : 0;
  let out = opts.bold ? '\x1b[1m' : '', last = null;
  chars.forEach((ch, i) => {
    if (ch === ' ' || ch === '\n') { out += ch; return; }
    let g = i / n + phase;
    g = f.cyclic ? fract(g) : phase ? pingpong(g) : Math.min(1, g);
    const p = fgParam(f.at(g), depth);
    if (p !== last) { out += `\x1b[${p}m`; last = p; }
    out += ch;
  });
  return out + '\x1b[0m';
}
