// Animated GIF (GIF89a) for Elgato icon packs — every animated icon ships as a GIF
// plus a PNG twin (formats.md §4: 144 × 144, 10–20 fps, ≤ 5 s, ≤ 1 MB).
//
//   encodeGIF(frames, { delay: 1000 / 15, loop: 0 })   frames: [{ data, w, h, delay? }]
//
// One global palette across all frames (no color flicker), exact when the animation
// uses ≤ 256 colors, otherwise median cut (+ optional Floyd–Steinberg dithering).
// Opaque animations are delta-coded: each frame is cropped to the rectangle that
// changed, unchanged pixels inside it become transparent, disposal 1 (keep);
// identical frames merge their delays. Animations with transparency write full
// frames with disposal 2 (restore to background). Delays are rounded to GIF's
// centiseconds with carry, so a 15 fps loop keeps its exact total length.

import { buildPalette, paletteMapper, indexImage } from './quantize.js';

function lzw(indices, minCode, out) {
  const clear = 1 << minCode, eoi = clear + 1;
  let codeSize = minCode + 1, next = eoi + 1, dict = new Map();
  let acc = 0, bits = 0;
  const block = [];
  const emit = (code) => {
    acc |= code << bits; bits += codeSize;
    while (bits >= 8) { block.push(acc & 255); acc >>>= 8; bits -= 8; if (block.length === 255) { out.push(255, ...block); block.length = 0; } }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i], key = (prefix << 8) | k;
    const code = dict.get(key);
    if (code !== undefined) { prefix = code; continue; }
    emit(prefix);
    if (next === 4096) { emit(clear); next = eoi + 1; codeSize = minCode + 1; dict = new Map(); }
    else {
      if (next >= 1 << codeSize) codeSize++;
      dict.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  // the decoder adds one more entry after reading the last code (and may widen) before it reads EOI
  if (next >= 1 << codeSize && codeSize < 12) codeSize++;
  emit(eoi);
  if (bits > 0) { block.push(acc & 255); if (block.length === 255) { out.push(255, ...block); block.length = 0; } }
  if (block.length) out.push(block.length, ...block);
  out.push(0);
}

/** Milliseconds → centiseconds per frame, carrying the rounding error (min 2 cs: browsers slow down anything shorter). */
function centis(delays) {
  let t = 0, prev = 0;
  return delays.map((d) => { t += d / 10; let c = Math.round(t) - prev; if (c < 2) c = 2; prev += c; return Math.min(c, 65535); });
}

/**
 * frames: [{ data: RGBA, w, h, delay? (ms) }] (same size). → GIF bytes (Uint8Array)
 * opts: { delay: 100 (ms, frames without their own), loop: 0 (0 = forever, n = repeat count, false = play once),
 *         colors: 256, dither: false, optimize: true (delta frames), alphaThreshold: 128 }
 */
export function encodeGIF(frames, opts = {}) {
  const list = Array.isArray(frames) ? frames : [frames];
  if (!list.length) throw new Error('encodeGIF: no frames');
  const { w, h } = list[0];
  if (list.some((f) => f.w !== w || f.h !== h)) throw new Error('encodeGIF: all frames must have the same size');
  if (!(w > 0 && h > 0 && w < 65536 && h < 65536)) throw new Error('encodeGIF: bad size');
  const alphaThreshold = opts.alphaThreshold ?? 128;
  const hasAlpha = list.some((f) => { for (let i = 3; i < f.data.length; i += 4) if (f.data[i] < alphaThreshold) return true; return false; });
  const optimize = opts.optimize !== false && !hasAlpha && list.length > 1;
  const needT = hasAlpha || optimize;
  const maxColors = Math.max(2, Math.min(256, opts.colors ?? 256)) - (needT ? 1 : 0);
  const pal = buildPalette(list.map((f) => f.data), maxColors, { alphaThreshold });
  const map = paletteMapper(pal);
  let n = pal.length / 3;
  const T = needT ? n++ : -1;
  let bitsPer = 1;
  while (1 << bitsPer < n) bitsPer++;
  const tableSize = 1 << bitsPer;

  // index every frame, then delta-code
  const delays = list.map((f) => f.delay ?? opts.delay ?? 100);
  const idx = list.map((f) => indexImage(f, pal, map, { dither: !!opts.dither, transparent: T, alphaThreshold }));
  const out = [];
  const u16 = (v) => out.push(v & 255, (v >> 8) & 255);
  out.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
  u16(w); u16(h);
  out.push(0x80 | 0x70 | (bitsPer - 1), 0, 0);
  for (let i = 0; i < tableSize; i++) out.push(i < pal.length / 3 ? pal[i * 3] : 0, i < pal.length / 3 ? pal[i * 3 + 1] : 0, i < pal.length / 3 ? pal[i * 3 + 2] : 0);
  if (opts.loop !== false && list.length > 1) { out.push(0x21, 0xff, 0x0b, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1); u16(Math.max(0, opts.loop ?? 0)); out.push(0); }

  const items = [];
  for (let f = 0; f < list.length; f++) {
    let x0 = 0, y0 = 0, x1 = w, y1 = h, px = idx[f];
    if (optimize && f > 0) {
      const prev = items[items.length - 1].screen, cur = idx[f];
      x0 = w; y0 = h; x1 = 0; y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cur[y * w + x] !== prev[y * w + x]) { if (x < x0) x0 = x; if (x >= x1) x1 = x + 1; if (y < y0) y0 = y; if (y >= y1) y1 = y + 1; }
      if (x1 <= x0) { items[items.length - 1].delay += delays[f]; continue; }
      px = new Uint8Array((x1 - x0) * (y1 - y0));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px[(y - y0) * (x1 - x0) + x - x0] = cur[y * w + x] === prev[y * w + x] ? T : cur[y * w + x];
    }
    items.push({ x0, y0, x1, y1, px, delay: delays[f], screen: idx[f] });
  }
  const cs = centis(items.map((it) => it.delay));
  items.forEach((it, i) => {
    out.push(0x21, 0xf9, 4, ((hasAlpha ? 2 : 1) << 2) | (needT ? 1 : 0));
    u16(list.length > 1 ? cs[i] : 0);
    out.push(needT ? T : 0, 0);
    out.push(0x2c); u16(it.x0); u16(it.y0); u16(it.x1 - it.x0); u16(it.y1 - it.y0); out.push(0);
    const minCode = Math.max(2, bitsPer);
    out.push(minCode);
    lzw(it.px, minCode, out);
  });
  out.push(0x3b);
  return Uint8Array.from(out);
}

/** GIF bytes → { frames: [{ data: RGBA (composited canvas), w, h, delay (ms) }], loop, w, h }. */
export function decodeGIF(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sig = String.fromCharCode(...b.subarray(0, 6));
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('decodeGIF: not a GIF');
  const u16 = (o) => b[o] | (b[o + 1] << 8);
  const w = u16(6), h = u16(8), packed = b[10];
  let o = 13, gct = null;
  if (packed & 0x80) { const n = 2 << (packed & 7); gct = b.subarray(o, o + n * 3); o += n * 3; }
  const canvas = new Uint8ClampedArray(w * h * 4);
  const frames = [];
  let gce = null, loop = null;
  while (o < b.length) {
    const t = b[o++];
    if (t === 0x3b) break;
    if (t === 0x21) {
      const label = b[o++];
      const subs = [];
      while (b[o]) { subs.push(b.subarray(o + 1, o + 1 + b[o])); o += 1 + b[o]; }
      o++;
      if (label === 0xf9) { const d = subs[0]; gce = { disposal: (d[0] >> 2) & 7, transparent: d[0] & 1 ? d[3] : -1, delay: (d[1] | (d[2] << 8)) * 10 }; }
      else if (label === 0xff && String.fromCharCode(...subs[0]) === 'NETSCAPE2.0') loop = subs[1][1] | (subs[1][2] << 8);
      continue;
    }
    if (t !== 0x2c) throw new Error(`decodeGIF: unexpected block 0x${t.toString(16)}`);
    const fx = u16(o), fy = u16(o + 2), fw = u16(o + 4), fh = u16(o + 6), fp = b[o + 8];
    o += 9;
    let ct = gct;
    if (fp & 0x80) { const n = 2 << (fp & 7); ct = b.subarray(o, o + n * 3); o += n * 3; }
    if (fp & 0x40) throw new Error('decodeGIF: interlaced frames unsupported');
    const minCode = b[o++];
    const data = [];
    while (b[o]) { for (let i = 1; i <= b[o]; i++) data.push(b[o + i]); o += 1 + b[o]; }
    o++;
    // LZW decode
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1, prev = -1;
    let dict = [];
    const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = null; size = minCode + 1; next = eoi + 1; prev = -1; };
    reset();
    const px = [];
    let bitPos = 0;
    while (bitPos + size <= data.length * 8) {
      let code = 0;
      for (let i = 0; i < size; i++, bitPos++) code |= ((data[bitPos >> 3] >> (bitPos & 7)) & 1) << i;
      if (code === clear) { reset(); continue; }
      if (code === eoi) break;
      let entry;
      if (code < next && dict[code]) entry = dict[code];
      else if (code === next && prev >= 0) entry = [...dict[prev], dict[prev][0]];
      else throw new Error('decodeGIF: bad LZW code');
      px.push(...entry);
      if (prev >= 0 && next < 4096) { dict[next++] = [...dict[prev], entry[0]]; if (next >= 1 << size && size < 12) size++; }
      prev = code;
    }
    const before = gce?.disposal === 3 ? canvas.slice() : null;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const k = px[y * fw + x];
      if (k === undefined || k === gce?.transparent) continue;
      const d = ((fy + y) * w + fx + x) * 4;
      canvas[d] = ct[k * 3]; canvas[d + 1] = ct[k * 3 + 1]; canvas[d + 2] = ct[k * 3 + 2]; canvas[d + 3] = 255;
    }
    frames.push({ data: canvas.slice(), w, h, delay: gce?.delay ?? 0 });
    if (gce?.disposal === 2) for (let y = 0; y < fh; y++) canvas.fill(0, ((fy + y) * w + fx) * 4, ((fy + y) * w + fx + fw) * 4);
    else if (before) canvas.set(before);
    gce = null;
  }
  return { frames, loop, w, h };
}
