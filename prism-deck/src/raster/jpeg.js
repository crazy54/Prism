// Baseline JPEG (JFIF, sequential DCT, standard Huffman tables) — what every gen-2
// hidraw Stream Deck and the Galleon 100 SD take for key / strip / screen images.
//
// Defaults follow the research (linux.md §2.6): 4:4:4 chroma (4:2:0 smears saturated
// colors at key sizes; node-elgato-stream-deck switched to 4:4:4 for that reason) and
// quality 90. Quantization / scale tables are built once per quality and cached, so a
// 10 fps stream pays only for the DCT + entropy coding.
//
//   encodeJPEG(img, 90)                               → Uint8Array
//   encodeJPEG(img, 75, { subsampling: '420' })       smaller strips / screens
//   decodeJPEG(bytes)                                  baseline decoder (round-trip tests)

import { flattenImage } from './image.js';

const ZIGZAG = new Uint8Array([0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63]);

const Q_LUM = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const Q_CHR = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  ...new Array(32).fill(99)];

const hx = (s) => s.split(',').map((v) => parseInt(v, 16));
// Annex K.3 standard Huffman tables: [code counts for lengths 1–16, symbols]
export const HUFF = {
  dcLum: [[0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  dcChr: [[0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  acLum: [[0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], hx('01,02,03,00,04,11,05,12,21,31,41,06,13,51,61,07,22,71,14,32,81,91,a1,08,23,42,b1,c1,15,52,d1,f0,'
    + '24,33,62,72,82,09,0a,16,17,18,19,1a,25,26,27,28,29,2a,34,35,36,37,38,39,3a,43,44,45,46,47,48,49,4a,53,54,55,56,57,58,59,5a,63,64,65,66,67,68,69,6a,'
    + '73,74,75,76,77,78,79,7a,83,84,85,86,87,88,89,8a,92,93,94,95,96,97,98,99,9a,a2,a3,a4,a5,a6,a7,a8,a9,aa,b2,b3,b4,b5,b6,b7,b8,b9,ba,c2,c3,c4,c5,c6,c7,'
    + 'c8,c9,ca,d2,d3,d4,d5,d6,d7,d8,d9,da,e1,e2,e3,e4,e5,e6,e7,e8,e9,ea,f1,f2,f3,f4,f5,f6,f7,f8,f9,fa')],
  acChr: [[0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], hx('00,01,02,03,11,04,05,21,31,06,12,41,51,07,61,71,13,22,32,81,08,14,42,91,a1,b1,c1,09,23,33,52,f0,'
    + '15,62,72,d1,0a,16,24,34,e1,25,f1,17,18,19,1a,26,27,28,29,2a,35,36,37,38,39,3a,43,44,45,46,47,48,49,4a,53,54,55,56,57,58,59,5a,63,64,65,66,67,68,69,6a,'
    + '73,74,75,76,77,78,79,7a,82,83,84,85,86,87,88,89,8a,92,93,94,95,96,97,98,99,9a,a2,a3,a4,a5,a6,a7,a8,a9,aa,b2,b3,b4,b5,b6,b7,b8,b9,ba,c2,c3,c4,c5,c6,c7,'
    + 'c8,c9,ca,d2,d3,d4,d5,d6,d7,d8,d9,da,e2,e3,e4,e5,e6,e7,e8,e9,ea,f2,f3,f4,f5,f6,f7,f8,f9,fa')],
};

/** Canonical codes: symbol → [code, length]. */
function huffCodes([counts, syms]) {
  const code = new Uint16Array(256), size = new Uint8Array(256);
  let c = 0, k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < counts[len - 1]; i++) { code[syms[k]] = c++; size[syms[k]] = len; k++; }
    c <<= 1;
  }
  return { code, size };
}
const CODES = { dcLum: huffCodes(HUFF.dcLum), dcChr: huffCodes(HUFF.dcChr), acLum: huffCodes(HUFF.acLum), acChr: huffCodes(HUFF.acChr) };

const AASF = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379];

function qtable(base, quality) {
  const q = Math.max(1, Math.min(100, Math.round(quality)));
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  return base.map((v) => Math.max(1, Math.min(255, Math.floor((v * scale + 50) / 100))));
}

const tableCache = new Map();
function tables(quality) {
  let t = tableCache.get(quality);
  if (t) return t;
  const ql = qtable(Q_LUM, quality), qc = qtable(Q_CHR, quality);
  const fd = (q) => { const f = new Float64Array(64); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) f[r * 8 + c] = 1 / (q[r * 8 + c] * AASF[r] * AASF[c] * 8); return f; };
  t = { ql, qc, fl: fd(ql), fc: fd(qc) };
  tableCache.set(quality, t);
  if (tableCache.size > 16) tableCache.delete(tableCache.keys().next().value);
  return t;
}

/** In-place AAN forward DCT (IJG jfdctflt) on 64 level-shifted samples. */
function fdct(d) {
  for (let p = 0; p < 64; p += 8) dct8(d, p, 1);
  for (let p = 0; p < 8; p++) dct8(d, p, 8);
}
function dct8(d, p, s) {
  const d0 = d[p], d1 = d[p + s], d2 = d[p + 2 * s], d3 = d[p + 3 * s], d4 = d[p + 4 * s], d5 = d[p + 5 * s], d6 = d[p + 6 * s], d7 = d[p + 7 * s];
  const t0 = d0 + d7, t7 = d0 - d7, t1 = d1 + d6, t6 = d1 - d6, t2 = d2 + d5, t5 = d2 - d5, t3 = d3 + d4, t4 = d3 - d4;
  let t10 = t0 + t3, t13 = t0 - t3, t11 = t1 + t2, t12 = t1 - t2;
  d[p] = t10 + t11; d[p + 4 * s] = t10 - t11;
  const z1 = (t12 + t13) * 0.707106781;
  d[p + 2 * s] = t13 + z1; d[p + 6 * s] = t13 - z1;
  t10 = t4 + t5; t11 = t5 + t6; t12 = t6 + t7;
  const z5 = (t10 - t12) * 0.382683433, z2 = 0.5411961 * t10 + z5, z4 = 1.306562965 * t12 + z5, z3 = t11 * 0.707106781;
  const z11 = t7 + z3, z13 = t7 - z3;
  d[p + 5 * s] = z13 + z2; d[p + 3 * s] = z13 - z2; d[p + s] = z11 + z4; d[p + 7 * s] = z11 - z4;
}

class BitWriter {
  constructor(n) { this.buf = new Uint8Array(n); this.o = 0; this.acc = 0; this.bits = 0; }
  ensure(n) { if (this.o + n > this.buf.length) { const b = new Uint8Array(Math.max(this.buf.length * 2, this.o + n)); b.set(this.buf.subarray(0, this.o)); this.buf = b; } }
  bytes(arr) { this.ensure(arr.length); this.buf.set(arr, this.o); this.o += arr.length; }
  put(code, len) {
    this.acc = (this.acc << len) | code; this.bits += len;
    while (this.bits >= 8) {
      const b = (this.acc >>> (this.bits - 8)) & 255;
      this.ensure(2);
      this.buf[this.o++] = b;
      if (b === 255) this.buf[this.o++] = 0;
      this.bits -= 8;
    }
    this.acc &= (1 << this.bits) - 1;
  }
  flush() { if (this.bits > 0) this.put((1 << (8 - this.bits)) - 1, 8 - this.bits); }
}

const segment = (marker, body) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];

/**
 * img: { data: RGBA, w, h } → baseline JPEG bytes.
 * quality 1–100 (default 90). opts: { subsampling: '444' (default) | '420', background: '#rrggbb' under transparency (default black) }
 */
export function encodeJPEG(img, quality = 90, opts = {}) {
  const { w, h } = img;
  if (!(w > 0 && h > 0 && w < 65536 && h < 65536)) throw new Error('encodeJPEG: bad size');
  let data = img.data;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { data = flattenImage(img, opts.background || '#000000').data; break; }
  const sub = opts.subsampling === '420' ? 2 : 1;
  if (opts.subsampling && !['444', '420'].includes(opts.subsampling)) throw new Error(`encodeJPEG: subsampling "${opts.subsampling}" (444 | 420)`);
  const T = tables(quality);
  const out = new BitWriter(Math.max(1024, w * h));
  const zz = (q) => Array.from(ZIGZAG, (n) => q[n]);
  const dht = (cls, id, [counts, syms]) => [(cls << 4) | id, ...counts, ...syms];
  out.bytes([0xff, 0xd8]);
  out.bytes(segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]));
  out.bytes(segment(0xdb, [0, ...zz(T.ql), 1, ...zz(T.qc)]));
  out.bytes(segment(0xc0, [8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, sub === 2 ? 0x22 : 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]));
  out.bytes(segment(0xc4, [...dht(0, 0, HUFF.dcLum), ...dht(1, 0, HUFF.acLum), ...dht(0, 1, HUFF.dcChr), ...dht(1, 1, HUFF.acChr)]));
  out.bytes(segment(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]));

  // planes (full resolution, level-shifted)
  const n = w * h, Y = new Float32Array(n), Cb = new Float32Array(n), Cr = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const r = data[o], g = data[o + 1], b = data[o + 2];
    Y[i] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
    Cb[i] = -0.168736 * r - 0.331264 * g + 0.5 * b;
    Cr[i] = 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  const blk = new Float64Array(64), q = new Int32Array(64);
  const pred = [0, 0, 0];
  const encodeBlock = (plane, pw, ph, bx, by, fd, ci, scale) => {
    // gather (edge pixels replicated; scale 2 = average 2×2 for 4:2:0 chroma)
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      let v;
      if (scale === 1) { const sx = Math.min(bx + x, pw - 1), sy = Math.min(by + y, ph - 1); v = plane[sy * pw + sx]; }
      else {
        const x0 = Math.min(bx + 2 * x, pw - 1), x1 = Math.min(bx + 2 * x + 1, pw - 1), y0 = Math.min(by + 2 * y, ph - 1), y1 = Math.min(by + 2 * y + 1, ph - 1);
        v = (plane[y0 * pw + x0] + plane[y0 * pw + x1] + plane[y1 * pw + x0] + plane[y1 * pw + x1]) / 4;
      }
      blk[y * 8 + x] = v;
    }
    fdct(blk);
    for (let k = 0; k < 64; k++) { const nat = ZIGZAG[k], v = Math.round(blk[nat] * fd[nat]), lim = k ? 1023 : 2047; q[k] = v > lim ? lim : v < -lim ? -lim : v; }
    const dcT = ci ? CODES.dcChr : CODES.dcLum, acT = ci ? CODES.acChr : CODES.acLum;
    let diff = q[0] - pred[ci];
    if (diff > 2047) { diff = 2047; q[0] = pred[ci] + 2047; } else if (diff < -2047) { diff = -2047; q[0] = pred[ci] - 2047; }
    pred[ci] = q[0];
    putValue(out, dcT, 0, diff);
    let run = 0;
    for (let k = 1; k < 64; k++) {
      const v = q[k];
      if (!v) { run++; continue; }
      while (run > 15) { out.put(acT.code[0xf0], acT.size[0xf0]); run -= 16; }
      putValue(out, acT, run << 4, v);
      run = 0;
    }
    if (run) out.put(acT.code[0], acT.size[0]);
  };
  const mcu = 8 * sub;
  for (let my = 0; my < h; my += mcu) for (let mx = 0; mx < w; mx += mcu) {
    for (let yy = 0; yy < sub; yy++) for (let xx = 0; xx < sub; xx++) encodeBlock(Y, w, h, mx + xx * 8, my + yy * 8, T.fl, 0, 1);
    encodeBlock(Cb, w, h, mx, my, T.fc, 1, sub);
    encodeBlock(Cr, w, h, mx, my, T.fc, 2, sub);
  }
  out.flush();
  out.bytes([0xff, 0xd9]);
  return out.buf.slice(0, out.o);
}

function putValue(out, t, runBits, v) {
  const a = v < 0 ? -v : v;
  let cat = 0;
  while ((1 << cat) <= a) cat++;
  const sym = runBits | cat;
  out.put(t.code[sym], t.size[sym]);
  if (cat) out.put(v < 0 ? (v - 1) & ((1 << cat) - 1) : v, cat);
}

// ── decoder (baseline, Huffman, no restart intervals) ─────────────────────────

const COS = (() => { const c = new Float64Array(64); for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) c[x * 8 + u] = (u ? 1 : Math.SQRT1_2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) / 2; return c; })();

function idct(F, out) {
  const tmp = new Float64Array(64);
  for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let v = 0; v < 8; v++) s += COS[y * 8 + v] * F[v * 8 + u]; tmp[y * 8 + u] = s; }
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { let s = 0; for (let u = 0; u < 8; u++) s += COS[x * 8 + u] * tmp[y * 8 + u]; out[y * 8 + x] = s; }
}

/** Baseline JPEG bytes → { data: RGBA, w, h }. */
export function decodeJPEG(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('decodeJPEG: not a JPEG');
  const qt = [], dc = [], ac = [];
  let frame = null, o = 2;
  const huffDec = (counts, syms) => { const map = new Map(); let c = 0, k = 0; for (let len = 1; len <= 16; len++) { for (let i = 0; i < counts[len - 1]; i++) map.set((len << 16) | c++, syms[k++]); c <<= 1; } return map; };
  while (o < b.length) {
    if (b[o] !== 0xff) throw new Error(`decodeJPEG: expected a marker at ${o}`);
    const m = b[o + 1];
    o += 2;
    if (m === 0xd9) break;
    const L = (b[o] << 8) | b[o + 1], seg = b.subarray(o + 2, o + L);
    if (m === 0xdb) for (let p = 0; p < seg.length; p += 65) { if (seg[p] >> 4) throw new Error('decodeJPEG: 16-bit tables'); const t = new Uint16Array(64); for (let k = 0; k < 64; k++) t[ZIGZAG[k]] = seg[p + 1 + k]; qt[seg[p] & 15] = t; }
    else if (m === 0xc4) for (let p = 0; p < seg.length;) { const tc = seg[p] >> 4, th = seg[p] & 15, counts = [...seg.subarray(p + 1, p + 17)], nsy = counts.reduce((a, x) => a + x, 0); (tc ? ac : dc)[th] = huffDec(counts, seg.subarray(p + 17, p + 17 + nsy)); p += 17 + nsy; }
    else if (m === 0xc0) {
      const comps = [];
      for (let k = 0; k < seg[5]; k++) comps.push({ id: seg[6 + k * 3], h: seg[7 + k * 3] >> 4, v: seg[7 + k * 3] & 15, tq: seg[8 + k * 3] });
      frame = { h: (seg[1] << 8) | seg[2], w: (seg[3] << 8) | seg[4], comps };
    } else if (m >= 0xc1 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) throw new Error(`decodeJPEG: only baseline (SOF0), got 0xff${m.toString(16)}`);
    else if (m === 0xdd) throw new Error('decodeJPEG: restart intervals unsupported');
    else if (m === 0xda) {
      const ns = seg[0], sc = [];
      for (let k = 0; k < ns; k++) { const c = frame.comps.find((x) => x.id === seg[1 + k * 2]); c.td = seg[2 + k * 2] >> 4; c.ta = seg[2 + k * 2] & 15; sc.push(c); }
      o += L;
      let pos = o, acc = 0, nb = 0;
      const bit = () => {
        if (!nb) { let x = b[pos++]; if (x === 0xff) { if (b[pos] === 0) pos++; else x = 0; } acc = x; nb = 8; }
        nb--; return (acc >> nb) & 1;
      };
      const decodeSym = (map) => { let c = 0; for (let len = 1; len <= 16; len++) { c = (c << 1) | bit(); const v = map.get((len << 16) | c); if (v !== undefined) return v; } throw new Error('decodeJPEG: bad Huffman code'); };
      const receive = (s) => { let v = 0; for (let i = 0; i < s; i++) v = (v << 1) | bit(); return v < 1 << (s - 1) ? v - (1 << s) + 1 : v; };
      const hmax = Math.max(...frame.comps.map((c) => c.h)), vmax = Math.max(...frame.comps.map((c) => c.v));
      const mcuW = 8 * hmax, mcuH = 8 * vmax, mx = Math.ceil(frame.w / mcuW), my = Math.ceil(frame.h / mcuH);
      for (const c of sc) { c.bw = mx * c.h * 8; c.bh = my * c.v * 8; c.px = new Float32Array(c.bw * c.bh); c.pred = 0; }
      const F = new Float64Array(64), S = new Float64Array(64);
      for (let y = 0; y < my; y++) for (let x = 0; x < mx; x++) for (const c of sc) for (let v = 0; v < c.v; v++) for (let hh = 0; hh < c.h; hh++) {
        F.fill(0);
        const t = decodeSym(dc[c.td]);
        c.pred += t ? receive(t) : 0;
        const q = qt[c.tq];
        F[0] = c.pred * q[0];
        for (let k = 1; k < 64;) {
          const rs = decodeSym(ac[c.ta]), r = rs >> 4, s = rs & 15;
          if (!s) { if (r === 15) { k += 16; continue; } break; }
          k += r;
          F[ZIGZAG[k]] = receive(s) * q[ZIGZAG[k]];
          k++;
        }
        idct(F, S);
        const ox = (x * c.h + hh) * 8, oy = (y * c.v + v) * 8;
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) c.px[(oy + j) * c.bw + ox + i] = S[j * 8 + i] + 128;
      }
      const { w, h } = frame, out = new Uint8ClampedArray(w * h * 4);
      const at = (c, x, y) => c.px[Math.floor((y * c.v) / vmax) * c.bw + Math.floor((x * c.h) / hmax)];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, Yv = at(sc[0], x, y);
        if (sc.length === 1) { out[d] = out[d + 1] = out[d + 2] = Yv; }
        else { const cb = at(sc[1], x, y) - 128, cr = at(sc[2], x, y) - 128; out[d] = Yv + 1.402 * cr; out[d + 1] = Yv - 0.344136 * cb - 0.714136 * cr; out[d + 2] = Yv + 1.772 * cb; }
        out[d + 3] = 255;
      }
      return { data: out, w, h };
    }
    o += L;
  }
  throw new Error('decodeJPEG: no scan');
}
