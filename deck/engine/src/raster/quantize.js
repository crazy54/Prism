// Palette quantization for GIF: exact when the frames use ≤ N colors, otherwise
// variance-split median cut over a 6-bit-per-channel histogram (palette entries
// are the population-weighted means, so dark gradients keep full 8-bit precision),
// nearest-color mapping with a cache, optional Floyd–Steinberg (serpentine) dithering.

/** Build a palette (flat [r, g, b, …]) of at most maxColors from RGBA images (pixels with alpha < alphaThreshold are skipped). */
export function buildPalette(images, maxColors = 256, { alphaThreshold = 128 } = {}) {
  const exact = new Map();
  for (const data of images) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < alphaThreshold) continue;
      const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      exact.set(k, (exact.get(k) || 0) + 1);
      if (exact.size > maxColors) break;
    }
    if (exact.size > maxColors) break;
  }
  if (exact.size <= maxColors) {
    const out = [];
    for (const k of [...exact.keys()].sort((a, b) => a - b)) out.push(k >> 16, (k >> 8) & 255, k & 255);
    return out.length ? out : [0, 0, 0];
  }
  // histogram: 6 bits per channel, with exact sums per bin
  const N = 1 << 18, cnt = new Uint32Array(N), sr = new Float64Array(N), sg = new Float64Array(N), sb = new Float64Array(N);
  for (const data of images) for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaThreshold) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2], k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    cnt[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
  }
  const bins = [];
  for (let k = 0; k < N; k++) if (cnt[k]) bins.push({ n: cnt[k], r: sr[k] / cnt[k], g: sg[k] / cnt[k], b: sb[k] / cnt[k] });
  const stats = (list) => {
    let n = 0, r = 0, g = 0, b = 0;
    for (const x of list) { n += x.n; r += x.r * x.n; g += x.g * x.n; b += x.b * x.n; }
    r /= n; g /= n; b /= n;
    let vr = 0, vg = 0, vb = 0;
    for (const x of list) { vr += x.n * (x.r - r) ** 2; vg += x.n * (x.g - g) ** 2; vb += x.n * (x.b - b) ** 2; }
    return { list, n, r, g, b, vr, vg, vb, err: vr + vg + vb };
  };
  const boxes = [stats(bins)];
  while (boxes.length < maxColors) {
    let bi = -1, best = 0;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].list.length > 1 && boxes[i].err > best) { best = boxes[i].err; bi = i; }
    if (bi < 0) break;
    const bx = boxes[bi];
    const ax = bx.vr >= bx.vg && bx.vr >= bx.vb ? 'r' : bx.vg >= bx.vb ? 'g' : 'b';
    const list = bx.list.slice().sort((p, q) => p[ax] - q[ax]);
    let half = bx.n / 2, acc = 0, cut = 1;
    for (let i = 0; i < list.length - 1; i++) { acc += list[i].n; if (acc >= half) { cut = i + 1; break; } }
    boxes.splice(bi, 1, stats(list.slice(0, cut)), stats(list.slice(cut)));
  }
  const out = [];
  for (const b of boxes) out.push(Math.round(b.r), Math.round(b.g), Math.round(b.b));
  return out;
}

/** Nearest-palette-index mapper with a color cache. */
export function paletteMapper(pal) {
  const n = pal.length / 3, cache = new Map();
  return (r, g, b) => {
    const k = (r << 16) | (g << 8) | b;
    let idx = cache.get(k);
    if (idx !== undefined) return idx;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const dr = r - pal[i * 3], dg = g - pal[i * 3 + 1], db = b - pal[i * 3 + 2];
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (d < best) { best = d; idx = i; if (!d) break; }
    }
    cache.set(k, idx);
    return idx;
  };
}

/**
 * RGBA → palette indices (Uint8Array). Pixels with alpha < alphaThreshold get `transparent` (when ≥ 0).
 * dither: false | true ('floyd-steinberg', serpentine).
 */
export function indexImage(img, pal, map, { dither = false, transparent = -1, alphaThreshold = 128 } = {}) {
  const { data, w, h } = img;
  const out = new Uint8Array(w * h);
  if (!dither) {
    for (let i = 0, o = 0; i < w * h; i++, o += 4) out[i] = data[o + 3] < alphaThreshold && transparent >= 0 ? transparent : map(data[o], data[o + 1], data[o + 2]);
    return out;
  }
  let cur = new Float32Array((w + 2) * 3), next = new Float32Array((w + 2) * 3);
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let y = 0; y < h; y++) {
    const ltr = y % 2 === 0;
    for (let s = 0; s < w; s++) {
      const x = ltr ? s : w - 1 - s, o = (y * w + x) * 4, e = (x + 1) * 3;
      if (data[o + 3] < alphaThreshold && transparent >= 0) { out[y * w + x] = transparent; continue; }
      const r = clamp(data[o] + cur[e]), g = clamp(data[o + 1] + cur[e + 1]), b = clamp(data[o + 2] + cur[e + 2]);
      const idx = map(r, g, b);
      out[y * w + x] = idx;
      const er = r - pal[idx * 3], eg = g - pal[idx * 3 + 1], eb = b - pal[idx * 3 + 2];
      const f = ltr ? 3 : -3;
      for (let c = 0; c < 3; c++) {
        const ev = c === 0 ? er : c === 1 ? eg : eb;
        cur[e + f + c] += (ev * 7) / 16;
        next[e - f + c] += (ev * 3) / 16;
        next[e + c] += (ev * 5) / 16;
        next[e + f + c] += ev / 16;
      }
    }
    [cur, next] = [next, cur];
    next.fill(0);
  }
  return out;
}
