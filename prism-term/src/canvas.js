// Canvas — a sub-cell pixel framebuffer that paints into a cell buffer.
//
// You draw in pixels; `paint()` encodes those pixels into terminal glyphs using
// one of five resolution modes (pixels per cell, W×H):
//
//   braille  2×4  ⣿  8 dots/cell, one color per cell — best for lines, plots, wireframes
//   sextant  2×3  🬗  Unicode 13 legacy-computing blocks, two colors per cell
//   quad     2×2  ▚  quadrant blocks, two colors per cell
//   half     1×2  ▀  half blocks, both pixels keep exact color — best for color fields
//   ascii    1×1  @  luminance ramp, works on anything
//
// So scenes are written once at pixel resolution and degrade gracefully on any
// terminal. Pixel aspect differs per mode (a cell is ~1:2), exposed as `aspect`
// (pixel height ÷ width) so geometry can stay round.
//
// Mono depth (NO_COLOR, pipes, TERM=dumb) has no color to carry a picture, so a
// canvas built with `mono` paints every mode except braille as a luminance ramp
// instead: each cell's ink (contrast against the theme background, coverage-
// weighted) normalized to the canvas's brightest cell, as ' ░▒▓█' (Unicode) or the
// 10-level ASCII_RAMP (7-bit). Braille keeps its dots: they already carry shape.
//
// The NONE color is the transparent pixel: transparent areas leave the target
// buffer untouched, so canvases compose over text, panels and other canvases.

import { NONE, luminance, distance2 } from './color.js';

export const MODES = Object.freeze({
  braille: { sx: 2, sy: 4 },
  sextant: { sx: 2, sy: 3 },
  quad: { sx: 2, sy: 2 },
  half: { sx: 1, sy: 2 },
  ascii: { sx: 1, sy: 1 },
});

export const MODE_NAMES = Object.keys(MODES);

const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
const QUAD_CHARS = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
const SEXTANT_CHARS = (() => {
  const out = new Array(64);
  for (let m = 0; m < 64; m++) {
    if (m === 0) out[m] = ' ';
    else if (m === 63) out[m] = '█';
    else if (m === 21) out[m] = '▌';
    else if (m === 42) out[m] = '▐';
    else out[m] = String.fromCodePoint(0x1fb00 + m - 1 - (m > 21 ? 1 : 0) - (m > 42 ? 1 : 0));
  }
  return out;
})();
export const ASCII_RAMP = ' .:-=+*#%@';
/** Mono-depth shading ramp for Unicode terminals (blank → full block). */
export const MONO_RAMP = ' ░▒▓█';
const HALF_SHAPES = [' ', '▀', '▄', '█']; // bit 0 = top pixel, bit 1 = bottom
const popcount = (m) => { let c = 0; for (; m; m &= m - 1) c++; return c; };

/**
 * The mono paint hint of a surface: createContext() sets `surface.monoPaint` =
 * { ramp, ref } at mono depth (null otherwise); views / wrappers inherit it from
 * the surface they draw into. So every canvas painted into a mono scene, also
 * ones a facet builds itself (banners, meters), gets the ramp.
 */
export function monoHint(surface) {
  for (let s = surface, i = 0; s && i < 16; s = s.parent || s.inner, i++) if (s.monoPaint !== undefined) return s.monoPaint;
  return null;
}
// Normalization floor: a canvas whose brightest cell has less ink than this is not
// stretched to full blocks (keeps faint fields faint instead of amplifying noise).
const MONO_FLOOR = 0.3;
// 4×4 Bayer matrix, normalized to (0,1), for ordered-dither braille shading.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Pick the best mode for a kind of content given terminal caps. */
export function pickMode(kind = 'field', caps = {}) {
  if (MODES[kind]) return kind;
  if (caps.unicode === false) return 'ascii';
  if (kind === 'line' || kind === 'dots') return 'braille';
  if (kind === 'hires') return caps.sextant ? 'sextant' : 'quad';
  return 'half';
}

export class Canvas {
  /**
   * @param {number} cols  width in terminal cells
   * @param {number} rows  height in terminal cells
   * @param {object} opts  { mode, dither (braille), threshold (braille), ramp (ascii),
   *                         mono: { ramp, ref }: paint as a luminance ramp (mono depth; see top) }
   */
  constructor(cols, rows, { mode = 'half', dither = false, threshold = 0.08, ramp = ASCII_RAMP, merge = 24, mono = null } = {}) {
    if (!MODES[mode]) throw new Error(`unknown canvas mode "${mode}" (expected ${MODE_NAMES.join('|')})`);
    this.mode = mode;
    // half mode: pixel pairs closer than this (weighted RGB distance²) paint as one
    // background-only cell — invisible on screen, roughly halves bytes on smooth fields.
    this.merge = merge;
    this.dither = dither;
    this.threshold = threshold;
    this.ramp = ramp;
    this.mono = mono && mode !== 'braille' ? { ramp: mono.ramp || MONO_RAMP, ref: mono.ref ?? NONE } : null;
    this.resize(cols, rows);
  }

  resize(cols, rows) {
    const { sx, sy } = MODES[this.mode];
    this.cols = Math.max(0, cols | 0);
    this.rows = Math.max(0, rows | 0);
    this.sx = sx;
    this.sy = sy;
    this.width = this.cols * sx;
    this.height = this.rows * sy;
    this.aspect = (2 * sx) / sy;
    this.px = new Int32Array(this.width * this.height).fill(NONE);
    return this;
  }

  clear(color = NONE) {
    this.px.fill(color);
    return this;
  }

  set(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.px[y * this.width + x] = c;
  }

  get(x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return NONE;
    return this.px[y * this.width + x];
  }

  /** Saturating additive plot — overlapping glows brighten instead of overwrite. */
  add(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || c === NONE) return;
    const i = y * this.width + x, o = this.px[i];
    if (o === NONE) { this.px[i] = c; return; }
    const r = Math.min(255, ((o >> 16) & 255) + ((c >> 16) & 255));
    const g = Math.min(255, ((o >> 8) & 255) + ((c >> 8) & 255));
    const b = Math.min(255, (o & 255) + (c & 255));
    this.px[i] = (r << 16) | (g << 8) | b;
  }

  /** Alpha-blend `c` over the existing pixel (a in 0..1). Over transparent, writes c scaled by a. */
  blend(x, y, c, a) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || c === NONE || a <= 0) return;
    const i = y * this.width + x, o = this.px[i] === NONE ? 0 : this.px[i];
    if (a >= 1) { this.px[i] = c; return; }
    const r = ((o >> 16) & 255) + ((((c >> 16) & 255) - ((o >> 16) & 255)) * a);
    const g = ((o >> 8) & 255) + ((((c >> 8) & 255) - ((o >> 8) & 255)) * a);
    const b = (o & 255) + (((c & 255) - (o & 255)) * a);
    this.px[i] = (r << 16) | (g << 8) | (b | 0);
  }

  /** Fill every pixel from fn(x, y) → color. */
  shade(fn) {
    const { width: W, height: H, px } = this;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) px[i] = fn(x, y);
    return this;
  }

  /** Multiply every pixel's brightness by k (trails / motion blur). Pixels below `floor` become transparent. */
  fade(k, floor = 6) {
    const px = this.px;
    for (let i = 0; i < px.length; i++) {
      const c = px[i];
      if (c === NONE) continue;
      const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
      px[i] = r < floor && g < floor && b < floor ? NONE : (r << 16) | (g << 8) | (b | 0);
    }
    return this;
  }

  // ── primitives ───────────────────────────────────────────────────────────

  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const stx = x0 < x1 ? 1 : -1, sty = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    // Guard against absurd coordinates (e.g. a projected vertex behind the camera).
    for (let n = 0; n < 1e5; n++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += stx; }
      if (e2 <= dx) { err += dx; y0 += sty; }
    }
    return this;
  }

  /** Polyline through [[x,y], …]. */
  path(points, c, closed = false) {
    for (let i = 1; i < points.length; i++) this.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], c);
    if (closed && points.length > 2) this.line(points.at(-1)[0], points.at(-1)[1], points[0][0], points[0][1], c);
    return this;
  }

  rect(x, y, w, h, c, fill = false) {
    if (fill) {
      for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(this.height, Math.floor(y + h)); yy++)
        for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(this.width, Math.floor(x + w)); xx++) this.px[yy * this.width + xx] = c;
      return this;
    }
    return this.path([[x, y], [x + w - 1, y], [x + w - 1, y + h - 1], [x, y + h - 1]], c, true);
  }

  /** Ellipse with radii rx, ry (pass ry = rx / aspect for a visually round circle). */
  ellipse(cx, cy, rx, ry, c, fill = false) {
    if (fill) {
      for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
        const t = (y - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - t * t));
        for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) this.set(x, y, c);
      }
      return this;
    }
    const steps = Math.max(16, Math.ceil(2 * Math.PI * Math.max(rx, ry)));
    let px = cx + rx, py = cy;
    for (let i = 1; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const nx = cx + Math.cos(a) * rx, ny = cy + Math.sin(a) * ry;
      this.line(px, py, nx, ny, c);
      px = nx; py = ny;
    }
    return this;
  }

  /** Aspect-corrected circle: radius r in horizontal pixels. */
  circle(cx, cy, r, c, fill = false) {
    return this.ellipse(cx, cy, r, r / this.aspect, c, fill);
  }

  /** Scanline-filled polygon ([[x,y], …], even-odd rule). */
  polygon(points, c) {
    if (points.length < 3) return this;
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const y0 = Math.max(0, Math.ceil(minY)), y1 = Math.min(this.height - 1, Math.floor(maxY));
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      xs.length = 0;
      const sy = y + 0.5;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > sy) !== (yj > sy)) xs.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.width - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) this.px[y * this.width + x] = c;
      }
    }
    return this;
  }

  triangle(a, b, c, color) {
    return this.polygon([a, b, c], color);
  }

  /** Quadratic/cubic Bézier through control points [[x,y]×3|4]. */
  bezier(pts, c, steps = 0) {
    const n = steps || Math.max(8, Math.ceil(Math.hypot(pts.at(-1)[0] - pts[0][0], pts.at(-1)[1] - pts[0][1])));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      if (pts.length === 3) out.push([u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0], u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1]]);
      else out.push([
        u * u * u * pts[0][0] + 3 * u * u * t * pts[1][0] + 3 * u * t * t * pts[2][0] + t * t * t * pts[3][0],
        u * u * u * pts[0][1] + 3 * u * u * t * pts[1][1] + 3 * u * t * t * pts[2][1] + t * t * t * pts[3][1],
      ]);
    }
    return this.path(out, c);
  }

  /** Composite another canvas (same mode or not) at pixel offset; NONE pixels are skipped. */
  draw(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const c = src.px[y * src.width + x];
        if (c !== NONE) this.set(x + dx, y + dy, c);
      }
    return this;
  }

  // ── encoding ─────────────────────────────────────────────────────────────

  /**
   * Encode pixels into glyphs on `target` (any Surface) with the top-left cell
   * at (ox, oy). Transparent cells are left untouched.
   */
  paint(target, ox = 0, oy = 0) {
    const mono = this.mono || (this.mode !== 'braille' ? monoHint(target) : null);
    if (mono) return this._paintMono(target, ox, oy, mono);
    switch (this.mode) {
      case 'half': return this._paintHalf(target, ox, oy);
      case 'braille': return this._paintBraille(target, ox, oy);
      case 'ascii': return this._paintAscii(target, ox, oy);
      default: return this._paintBlocks(target, ox, oy, this.mode === 'quad' ? QUAD_CHARS : SEXTANT_CHARS);
    }
  }

  _paintHalf(target, ox, oy) {
    const { cols, rows, width: W, px, merge } = this;
    for (let cy = 0; cy < rows; cy++) {
      const r0 = 2 * cy * W, r1 = r0 + W;
      for (let cx = 0; cx < cols; cx++) {
        const top = px[r0 + cx], bot = px[r1 + cx];
        if (top === NONE && bot === NONE) continue;
        if (top === bot || (top !== NONE && bot !== NONE && merge > 0 && distance2(top, bot) <= merge)) target.set(cx + ox, cy + oy, ' ', undefined, top);
        else if (top === NONE) target.set(cx + ox, cy + oy, '▄', bot);
        else if (bot === NONE) target.set(cx + ox, cy + oy, '▀', top);
        else target.set(cx + ox, cy + oy, '▀', top, bot);
      }
    }
    return target;
  }

  _paintBraille(target, ox, oy) {
    const { cols, rows, width: W, px, dither, threshold } = this;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        let mask = 0, r = 0, g = 0, b = 0, n = 0;
        for (let dy = 0; dy < 4; dy++) {
          const row = (cy * 4 + dy) * W + cx * 2;
          for (let dx = 0; dx < 2; dx++) {
            const c = px[row + dx];
            if (c === NONE) continue;
            if (dither) {
              const x = cx * 2 + dx, y = cy * 4 + dy;
              if (luminance(c) <= BAYER4[(y & 3) * 4 + (x & 3)]) continue;
            } else if (threshold > 0 && luminance(c) < threshold) continue;
            mask |= BRAILLE_BITS[dy][dx];
            r += (c >> 16) & 255; g += (c >> 8) & 255; b += c & 255; n++;
          }
        }
        if (!mask) continue;
        let fr = r / n, fg = g / n, fb = b / n;
        if (dither) {
          // Dithering already encodes brightness as dot density — push the hue to full value.
          const m = Math.max(fr, fg, fb, 1), k = 255 / m;
          fr *= k; fg *= k; fb *= k;
        }
        target.set(cx + ox, cy + oy, String.fromCharCode(0x2800 + mask), (fr << 16) | (fg << 8) | (fb | 0));
      }
    }
    return target;
  }

  _paintAscii(target, ox, oy) {
    const { cols, rows, width: W, px, ramp } = this;
    const last = ramp.length - 1;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const c = px[cy * W + cx];
        if (c === NONE) continue;
        const ch = ramp[Math.min(last, Math.max(1, Math.round(luminance(c) * last)))];
        target.set(cx + ox, cy + oy, ch, c);
      }
    }
    return target;
  }

  // Mono: each pixel's ink (|luminance − background luminance|) is normalized to
  // the canvas's brightest pixel (at least MONO_FLOOR, so faint art stays faint);
  // a fully opaque canvas (a color field) is also stretched up from its darkest
  // pixel so mid-luminance pictures use the whole ramp. Then per cell:
  //   • all pixels "no ink" or "full ink" → the shape glyph (▀ ▄ █ / quadrant /
  //     sextant mask), so banners, bars and outlines stay crisp;
  //   • an edge cell (some pixels transparent) whose visible pixels are bright →
  //     the shape of the visible pixels (letters keep their half-block edges);
  //   • anything else → the ramp glyph of the cell's average (shading).
  // fg is the terminal default; bg is left as is.
  _paintMono(target, ox, oy, mono) {
    const { cols, rows, width: W, px, sx, sy, mode } = this;
    const { ramp, ref } = mono;
    const refL = ref === NONE || ref === undefined ? 0 : luminance(ref);
    const n = sx * sy, last = ramp.length - 1;
    const shapes = mode === 'half' ? HALF_SHAPES : mode === 'quad' ? QUAD_CHARS : mode === 'sextant' ? SEXTANT_CHARS : null;
    const N = px.length;
    const ink = this._monoInk?.length === N ? this._monoInk : (this._monoInk = new Float32Array(N));
    let lo = Infinity, hi = 0;
    for (let i = 0; i < N; i++) {
      const c = px[i];
      if (c === NONE) { ink[i] = -1; continue; }
      const v = Math.abs(luminance(c) - refL);
      ink[i] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi === 0 && lo === Infinity) return target; // fully transparent
    let transparent = false;
    for (let i = 0; i < N; i++) if (ink[i] < 0) { transparent = true; break; }
    const top = Math.max(hi, MONO_FLOOR);
    const bot = transparent ? 0 : Math.min(Math.max(0, lo), top - MONO_FLOOR);
    const k = 1 / (top - bot);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        let sum = 0, opaque = 0, full = 0, seen = 0, seenSum = 0, binary = true;
        for (let dy = 0, j = 0; dy < sy; dy++) {
          const row = (cy * sy + dy) * W + cx * sx;
          for (let dx = 0; dx < sx; dx++, j++) {
            const v = ink[row + dx];
            if (v < 0) continue;
            opaque++;
            const q = Math.min(1, Math.max(0, (v - bot) * k));
            sum += q;
            const lv = Math.round(q * last);
            if (lv === last) full |= 1 << j;
            else if (lv !== 0) binary = false;
            if (lv > 0) { seen |= 1 << j; seenSum += q; }
          }
        }
        if (!opaque) continue;
        let ch;
        if (shapes && binary) ch = shapes[full];
        else if (shapes && opaque < n && seen && seenSum / popcount(seen) >= 0.5) ch = shapes[seen];
        else ch = ramp[Math.min(last, Math.round((sum / n) * last))];
        target.set(cx + ox, cy + oy, ch, NONE);
      }
    }
    return target;
  }

  // Two-color block encoding (quad 2×2 / sextant 2×3): split the cell's pixels
  // into two clusters seeded by its most distant pair, then pick the glyph whose
  // fg mask matches cluster A. Transparent pixels are always "background".
  _paintBlocks(target, ox, oy, chars) {
    const { cols, rows, width: W, px, sx, sy } = this;
    const n = sx * sy;
    const cell = new Int32Array(n);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        let opaque = 0;
        for (let dy = 0, k = 0; dy < sy; dy++)
          for (let dx = 0; dx < sx; dx++, k++) {
            const c = px[(cy * sy + dy) * W + cx * sx + dx];
            cell[k] = c;
            if (c !== NONE) opaque++;
          }
        if (!opaque) continue;

        if (opaque < n) {
          let mask = 0, r = 0, g = 0, b = 0;
          for (let k = 0; k < n; k++) {
            const c = cell[k];
            if (c === NONE) continue;
            mask |= 1 << k;
            r += (c >> 16) & 255; g += (c >> 8) & 255; b += c & 255;
          }
          target.set(cx + ox, cy + oy, chars[mask], ((r / opaque) << 16) | ((g / opaque) << 8) | ((b / opaque) | 0));
          continue;
        }

        let ia = 0, ib = 0, best = -1;
        for (let i = 0; i < n; i++)
          for (let j = i + 1; j < n; j++) {
            const d = distance2(cell[i], cell[j]);
            if (d > best) { best = d; ia = i; ib = j; }
          }
        if (best < 64) {
          // Visually uniform cell: a plain background is cheapest and gap-free.
          let r = 0, g = 0, b = 0;
          for (let k = 0; k < n; k++) { r += (cell[k] >> 16) & 255; g += (cell[k] >> 8) & 255; b += cell[k] & 255; }
          target.set(cx + ox, cy + oy, ' ', undefined, ((r / n) << 16) | ((g / n) << 8) | ((b / n) | 0));
          continue;
        }
        const ca = cell[ia], cb = cell[ib];
        let mask = 0, ar = 0, ag = 0, ab = 0, an = 0, br = 0, bg = 0, bb = 0, bn = 0;
        for (let k = 0; k < n; k++) {
          const c = cell[k];
          if (distance2(c, ca) <= distance2(c, cb)) {
            mask |= 1 << k; ar += (c >> 16) & 255; ag += (c >> 8) & 255; ab += c & 255; an++;
          } else {
            br += (c >> 16) & 255; bg += (c >> 8) & 255; bb += c & 255; bn++;
          }
        }
        const fgc = ((ar / an) << 16) | ((ag / an) << 8) | ((ab / an) | 0);
        const bgc = ((br / bn) << 16) | ((bg / bn) << 8) | ((bb / bn) | 0);
        target.set(cx + ox, cy + oy, chars[mask], fgc, bgc);
      }
    }
    return target;
  }
}
