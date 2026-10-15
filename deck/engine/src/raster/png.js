// PNG encoder / decoder (8-bit RGB / RGBA, adaptive per-row filters).
//
// Compression uses node:zlib, found through process.getBuiltinModule (Node ≥ 20.16
// — the Stream Deck app ships 20.20) so this module never has a static node:
// import and still loads in browsers / older runtimes, where it writes stored
// (uncompressed) deflate blocks — a valid, just larger, PNG.

const zlib = (() => { try { return globalThis.process?.getBuiltinModule?.('node:zlib') ?? null; } catch { return null; } })();

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
}

function adler32(b) {
  let a = 1, s = 0;
  for (let i = 0; i < b.length; i++) { a = (a + b[i]) % 65521; s = (s + a) % 65521; }
  return ((s << 16) | a) >>> 0;
}

/** zlib stream of stored blocks (no compression) — the fallback when node:zlib is unavailable. */
export function zlibStored(data) {
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  out[0] = 0x78; out[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const s = b * 65535, n = Math.min(65535, data.length - s);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = n & 255; out[o++] = n >> 8; out[o++] = ~n & 255; out[o++] = (~n >> 8) & 255;
    out.set(data.subarray(s, s + n), o); o += n;
  }
  const ad = adler32(data);
  out[o++] = ad >>> 24; out[o++] = (ad >>> 16) & 255; out[o++] = (ad >>> 8) & 255; out[o++] = ad & 255;
  return out;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/**
 * img: { data: RGBA (Uint8Array | Uint8ClampedArray), w, h } → PNG bytes (Uint8Array).
 * opts: { alpha: 'auto' | true | false (auto drops the channel for opaque images), level: 0–9 (default 9) }
 */
export function encodePNG(img, opts = {}) {
  const { data, w, h } = img;
  if (!(w > 0 && h > 0) || data.length < w * h * 4) throw new Error('encodePNG: expected { data: RGBA, w, h }');
  let alpha = opts.alpha ?? 'auto';
  if (alpha === 'auto') { alpha = false; for (let i = 3; i < w * h * 4; i += 4) if (data[i] !== 255) { alpha = true; break; } }
  const bpp = alpha ? 4 : 3, stride = w * bpp;
  const raw = new Uint8Array((stride + 1) * h);
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride), cand = new Uint8Array(stride), best = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    for (let x = 0, s = y * w * 4, o = 0; x < w; x++, s += 4) { cur[o++] = data[s]; cur[o++] = data[s + 1]; cur[o++] = data[s + 2]; if (alpha) cur[o++] = data[s + 3]; }
    let bestF = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const v = (cur[i] - (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c))) & 255;
        cand[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; bestF = f; best.set(cand); }
    }
    raw[y * (stride + 1)] = bestF;
    raw.set(best, y * (stride + 1) + 1);
    prev.set(cur);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const z = zlib ? new Uint8Array(zlib.deflateSync(raw, { level: opts.level ?? 9 })) : zlibStored(raw);
  return concat([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))]);
}

/** PNG bytes → { data: Uint8ClampedArray RGBA, w, h } (8-bit gray / gray+alpha / RGB / RGBA / palette, non-interlaced). Needs node:zlib. */
export function decodePNG(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((x, i) => b[i] === x)) throw new Error('decodePNG: not a PNG');
  if (!zlib) throw new Error('decodePNG: node:zlib unavailable');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, plte = null, trns = null;
  const idat = [];
  while (o < b.length) {
    const n = v.getUint32(o), t = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    const d = b.subarray(o + 8, o + 8 + n);
    if (crc32(b.subarray(o + 4, o + 8 + n)) !== v.getUint32(o + 8 + n)) throw new Error(`decodePNG: bad CRC in ${t}`);
    if (t === 'IHDR') { w = v.getUint32(o + 8); h = v.getUint32(o + 12); depth = d[8]; type = d[9]; interlace = d[12]; }
    else if (t === 'PLTE') plte = d;
    else if (t === 'tRNS') trns = d;
    else if (t === 'IDAT') idat.push(d);
    else if (t === 'IEND') break;
    o += 12 + n;
  }
  if (depth !== 8 || interlace) throw new Error(`decodePNG: only 8-bit non-interlaced PNGs (got depth ${depth}, interlace ${interlace})`);
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!bpp) throw new Error(`decodePNG: color type ${type}`);
  const raw = new Uint8Array(zlib.inflateSync(concat(idat)));
  const stride = w * bpp, px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[dst + i - bpp] : 0, bb = y ? px[dst - stride + i] : 0, c = i >= bpp && y ? px[dst - stride + i - bpp] : 0;
      const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? bb : f === 3 ? (a + bb) >> 1 : paeth(a, bb, c);
      px[dst + i] = (raw[src + i] + p) & 255;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, s = 0; i < w * h; i++, s += bpp) {
    const q = i * 4;
    if (type === 6) { out[q] = px[s]; out[q + 1] = px[s + 1]; out[q + 2] = px[s + 2]; out[q + 3] = px[s + 3]; }
    else if (type === 2) { out[q] = px[s]; out[q + 1] = px[s + 1]; out[q + 2] = px[s + 2]; out[q + 3] = 255; }
    else if (type === 0) { out[q] = out[q + 1] = out[q + 2] = px[s]; out[q + 3] = 255; }
    else if (type === 4) { out[q] = out[q + 1] = out[q + 2] = px[s]; out[q + 3] = px[s + 1]; }
    else { const k = px[s]; out[q] = plte[k * 3]; out[q + 1] = plte[k * 3 + 1]; out[q + 2] = plte[k * 3 + 2]; out[q + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { data: out, w, h };
}
