// RGBA image helpers: device orientation transforms, alpha flattening, comparison.
// An image is { data: RGBA bytes (Uint8Array | Uint8ClampedArray), w, h }.

/**
 * Orientation transforms from the hidraw research (linux.md §2.6, matching node-elgato-stream-deck's
 * transformImageBuffer): target pixel (x, y) takes source pixel (sx, sy).
 *   none     sx = x,         sy = y           + / Studio / Galleon keys, + strip
 *   rot180   sx = W-1-x,     sy = H-1-y       15-key gen2 (MK.2 …), XL, Neo keys + info bar
 *   mirrorX  sx = W-1-x,     sy = y           2017 original (BMP)
 *   ccw90    out H×W, sx = W-1-y, sy = x      + XL keys and strip, Mini family (BMP)
 * plus mirrorY and cw90 for completeness.
 */
export const TRANSFORMS = ['none', 'rot180', 'mirrorX', 'ccw90', 'mirrorY', 'cw90'];

export function transformImage(img, xf = 'none') {
  const { data, w, h } = img;
  if (!TRANSFORMS.includes(xf)) throw new Error(`transformImage: unknown transform "${xf}" (${TRANSFORMS.join(', ')})`);
  if (xf === 'none') return { data: new Uint8ClampedArray(data), w, h };
  const rot = xf === 'ccw90' || xf === 'cw90';
  const tw = rot ? h : w, th = rot ? w : h;
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    let sx = x, sy = y;
    if (xf === 'rot180') { sx = w - 1 - x; sy = h - 1 - y; }
    else if (xf === 'mirrorX') sx = w - 1 - x;
    else if (xf === 'mirrorY') sy = h - 1 - y;
    else if (xf === 'ccw90') { sx = w - 1 - y; sy = x; }
    else { sx = y; sy = h - 1 - x; }
    const s = (sy * w + sx) * 4, d = (y * tw + x) * 4;
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
  }
  return { data: out, w: tw, h: th };
}

const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c));
  if (!m) throw new Error(`expected a #rrggbb color, got "${c}"`);
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

/** Composite onto an opaque background color (default black) → opaque RGBA image. */
export function flattenImage(img, background = '#000000') {
  const [br, bg, bb] = hex(background);
  const { data, w, h } = img;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h * 4; i += 4) {
    const a = data[i + 3] / 255, k = 1 - a;
    out[i] = data[i] * a + br * k; out[i + 1] = data[i + 1] * a + bg * k; out[i + 2] = data[i + 2] * a + bb * k; out[i + 3] = 255;
  }
  return { data: out, w, h };
}

/**
 * Compare two images (premultiplied, so invisible color under alpha 0 doesn't count).
 * → { mean (mean abs channel error, 0–255), max, p99 (99th percentile of per-pixel max error), over16 / over48 (fractions of pixels) }
 */
export function diffImages(a, b) {
  if (a.w !== b.w || a.h !== b.h) throw new Error(`diffImages: size ${a.w}×${a.h} vs ${b.w}×${b.h}`);
  const n = a.w * a.h, hist = new Uint32Array(256);
  let sum = 0, max = 0, o16 = 0, o48 = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4, aa = a.data[o + 3] / 255, ba = b.data[o + 3] / 255;
    let pm = Math.abs(a.data[o + 3] - b.data[o + 3]);
    sum += pm;
    for (let c = 0; c < 3; c++) {
      const e = Math.abs(a.data[o + c] * aa - b.data[o + c] * ba);
      sum += e;
      if (e > pm) pm = e;
    }
    const p = Math.round(pm);
    hist[p]++;
    if (p > max) max = p;
    if (p > 16) o16++;
    if (p > 48) o48++;
  }
  let acc = 0, p99 = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.99) { p99 = v; break; } }
  return { mean: sum / (n * 4), max, p99, over16: o16 / n, over48: o48 / n };
}

/** Per-pixel difference visualization (×scale), for looking at failures. */
export function diffImage(a, b, scale = 4) {
  const out = new Uint8ClampedArray(a.w * a.h * 4);
  for (let i = 0; i < out.length; i += 4) {
    for (let c = 0; c < 3; c++) out[i + c] = Math.abs(a.data[i + c] - b.data[i + c]) * scale;
    out[i + 3] = 255;
  }
  return { data: out, w: a.w, h: a.h };
}
