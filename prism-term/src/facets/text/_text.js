// Shared helpers for the Text Effects gallery.
import { measureBanner, layoutText } from '../../text/banner.js';
import { Canvas } from '../../canvas.js';

/** Banner mode: the user's forced mode, else `preferred` if the terminal can show it. */
export function bannerMode(ctx, preferred = 'half') {
  if (ctx.mode) return ctx.mode;
  const caps = ctx.caps || {};
  if (caps.unicode === false) return 'ascii';
  if (preferred === 'sextant' && caps.sextant === false) return 'quad';
  if (preferred === 'braille' && caps.braille === false) return 'half';
  return preferred;
}

/** Largest integer scale (≥ 1) at which `text` fits in maxW × maxH cells. */
export function fitScale(text, cfg, maxW, maxH, max = 8) {
  let best = 1;
  for (let s = 1; s <= max; s++) {
    const m = measureBanner(text, { ...cfg, scale: s });
    if (m.width <= maxW && m.height <= maxH) best = s;
    else break;
  }
  return best;
}

/** First font in `fonts` that fits at scale 1, with its best scale. */
export function fitFont(text, fonts, cfg, maxW, maxH) {
  for (const font of fonts) {
    const m = measureBanner(text, { ...cfg, font, scale: 1 });
    if (m.width <= maxW && m.height <= maxH) return { font, scale: fitScale(text, { ...cfg, font }, maxW, maxH) };
  }
  return { font: fonts[fonts.length - 1], scale: 1 };
}

/** Deterministic hash of up to three ints → [0, 1). */
export function hash(a, b = 0, c = 0) {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** Text rasterized to a 0/1 font-pixel mask: { w, h, at(x, y), lay }. */
export function textMask(text, font) {
  const lay = layoutText(text, { font });
  const w = lay.width, h = lay.height, px = new Uint8Array(Math.max(1, w * h));
  for (const l of lay.lines) for (const { gl, x } of l.glyphs) {
    for (let gy = 0; gy < gl.h; gy++) for (let gx = 0; gx < gl.w; gx++) if (gl.bits[gy * gl.w + gx]) px[(l.y + gy) * w + l.x + x + gx] = 1;
  }
  return { w, h, lay, at: (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? px[y * w + x] : 0) };
}

/** Copy `src` canvas pixels into `dst` with a per-row horizontal offset fn(y) → dx. */
export function shiftRows(src, dst, dxOf, ox = 0, oy = 0) {
  for (let y = 0; y < src.height; y++) {
    const dx = Math.round(dxOf(y));
    for (let x = 0; x < src.width; x++) {
      const c = src.px[y * src.width + x];
      if (c !== -1) dst.set(x + dx + ox, y + oy, c);
    }
  }
}


/** An empty canvas in the same mode/encoding as `src` (optionally a different size in cells). */
export function canvasLike(src, cols = src.cols, rows = src.rows) {
  return new Canvas(cols, rows, { mode: src.mode, ramp: src.ramp, threshold: src.threshold, dither: src.dither });
}

// Banner MODE_SCALE (src/text/banner.js): an explicit [x, y] scale replaces it, so re-apply it.
const BASE_SCALE = { quad: [2, 1], ascii: [2, 1] };
const STRETCH = [[4, 4], [3, 4], [3, 3], [2, 3], [2, 2], [1, 2], [1, 1]];

/** Biggest [x, y] banner scale (uniform or up to one step taller — condensed type) that fits. */
export function stretchFit(text, cfg, maxW, maxH) {
  const [bx, by] = BASE_SCALE[cfg.mode] || [1, 1];
  for (const [sx, sy] of STRETCH) {
    const scale = [bx * sx, by * sy];
    const m = measureBanner(text, { ...cfg, scale });
    if (m.width <= maxW && m.height <= maxH) return scale;
  }
  // Nothing fits at the mode's proportions: one cell per font pixel beats clipping.
  return [1, 1];
}

/** stretchFit across fonts: the first face (heaviest first) that fits without clipping. */
export function fitType(text, cfg, maxW, maxH, fonts = ['bold', 'standard', 'tiny']) {
  for (const font of fonts) {
    const scale = stretchFit(text, { ...cfg, font }, maxW, maxH);
    const m = measureBanner(text, { ...cfg, font, scale });
    if (m.width <= maxW && m.height <= maxH) return { font, scale };
  }
  return { font: fonts[fonts.length - 1], scale: [1, 1] };
}
