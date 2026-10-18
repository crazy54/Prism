// Pixel helpers the hidraw runner needs on top of src/raster (which owns
// rasterize, the device transforms and the JPEG / BMP encoders): software
// dimming (the brightness fallback when the feature helper is unavailable),
// pads / fills on { data: RGBA, w, h } images, and frame hashing.

/** A solid image. */
export function solid(w, h, [r, g, b] = [0, 0, 0], a = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a; }
  return { data, w, h };
}

/** Flatten over black and scale RGB by k (0–1) → a new opaque image. Software brightness. */
export function dim(img, k = 1) {
  const f = Math.max(0, Math.min(1, k));
  const { data: s, w, h } = img;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    const m = (s[i + 3] / 255) * f;
    data[i] = Math.round(s[i] * m); data[i + 1] = Math.round(s[i + 1] * m); data[i + 2] = Math.round(s[i + 2] * m); data[i + 3] = 255;
  }
  return { data, w, h };
}

/** Paste `src` into a new `w × h` image filled with `bg` at (x, y), clipped. */
export function pad(src, w, h, x, y, bg = [0, 0, 0]) {
  const out = solid(w, h, bg);
  for (let r = 0; r < src.h; r++) {
    const dy = y + r;
    if (dy < 0 || dy >= h) continue;
    const x0 = Math.max(0, x), x1 = Math.min(w, x + src.w);
    if (x1 > x0) out.data.set(src.data.subarray((r * src.w + (x0 - x)) * 4, (r * src.w + (x1 - x)) * 4), (dy * w + x0) * 4);
  }
  return out;
}

/** Blend a filled rectangle into `img` (mutates; clipped; integer-rounded edges). */
export function fillRect(img, x, y, rw, rh, [r, g, b], alpha = 1) {
  const { data, w, h } = img;
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(w, Math.round(x + rw)), y1 = Math.min(h, Math.round(y + rh));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * w + xx) * 4;
      data[i] += (r - data[i]) * alpha; data[i + 1] += (g - data[i + 1]) * alpha; data[i + 2] += (b - data[i + 2]) * alpha; data[i + 3] = 255;
    }
  }
  return img;
}

/** FNV-1a 32 over bytes — frame dedupe (identical pixels → nothing to send). */
export function hashBytes(bytes, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
