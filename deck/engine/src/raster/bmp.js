// BMP (24-bit BGR) for the gen-1 hidraw devices, exactly as linux.md §2.6 describes:
// 54-byte BITMAPINFOHEADER, positive height, rows written in the order the device
// transform produces (top-down — the devices ignore BMP's bottom-up convention),
// BGR, rows padded to 4 bytes (72 and 80 px rows need no padding).
//
//   encodeBMP(img, 'mirrorX', { ppm: 3780 })    2017 original Stream Deck
//   encodeBMP(img, 'ccw90')                     Mini family / 6-Key Module (ppm 2835)
//   encodeBMP(img, 'original' | 'mini')         the same, by model preset
//   encodeBMP(img, 'none', { rowOrder: 'bottom-up' })   a standard BMP any viewer shows upright

import { transformImage, flattenImage, TRANSFORMS } from './image.js';

export const BMP_PRESETS = {
  original: { xf: 'mirrorX', ppm: 3780 },
  mini: { xf: 'ccw90', ppm: 2835 },
};

/**
 * img → BMP bytes. variant: a transform (none | rot180 | mirrorX | ccw90 | mirrorY | cw90) or a preset (original | mini).
 * opts: { ppm (pixels per meter, default 2835), rowOrder: 'device' (top-down rows, positive height — what the hardware takes)
 *         | 'bottom-up' (standard BMP), background: '#rrggbb' for transparent pixels (default black) }
 */
export function encodeBMP(img, variant = 'none', opts = {}) {
  const preset = BMP_PRESETS[variant];
  const xf = preset ? preset.xf : variant;
  if (!TRANSFORMS.includes(xf)) throw new Error(`encodeBMP: unknown variant "${variant}" (${[...TRANSFORMS, ...Object.keys(BMP_PRESETS)].join(', ')})`);
  const ppm = opts.ppm ?? preset?.ppm ?? 2835;
  const src = transformImage(flattenImage(img, opts.background || '#000000'), xf);
  const { data, w, h } = src;
  const stride = (w * 3 + 3) & ~3, px = stride * h;
  const buf = new Uint8Array(54 + px), v = new DataView(buf.buffer);
  buf[0] = 0x42; buf[1] = 0x4d; v.setUint32(2, 54 + px, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, w, true); v.setInt32(22, h, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, px, true);
  v.setInt32(38, ppm, true); v.setInt32(42, ppm, true);
  const bottomUp = opts.rowOrder === 'bottom-up';
  for (let y = 0; y < h; y++) {
    let o = 54 + (bottomUp ? h - 1 - y : y) * stride;
    for (let x = 0, s = y * w * 4; x < w; x++, s += 4) { buf[o++] = data[s + 2]; buf[o++] = data[s + 1]; buf[o++] = data[s]; }
  }
  return buf;
}

/** BMP bytes (24/32-bit uncompressed) → { data: RGBA, w, h }. rowOrder as in encodeBMP ('device' reads rows top-down). */
export function decodeBMP(bytes, { rowOrder = 'bottom-up' } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] !== 0x42 || b[1] !== 0x4d) throw new Error('decodeBMP: not a BMP');
  const off = v.getUint32(10, true), w = v.getInt32(18, true), hh = v.getInt32(22, true), bpp = v.getUint16(28, true);
  if (v.getUint32(30, true) !== 0 || (bpp !== 24 && bpp !== 32)) throw new Error(`decodeBMP: only uncompressed 24/32-bit (got ${bpp}-bit)`);
  const h = Math.abs(hh), stride = (w * (bpp / 8) + 3) & ~3;
  const topDown = hh < 0 || rowOrder === 'device';
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    let s = off + (topDown ? y : h - 1 - y) * stride;
    for (let x = 0; x < w; x++, s += bpp / 8) { const d = (y * w + x) * 4; out[d] = b[s + 2]; out[d + 1] = b[s + 1]; out[d + 2] = b[s]; out[d + 3] = 255; }
  }
  return { data: out, w, h };
}
