// PCM stream decoder — raw bytes from a capture CLI → mono Float32 samples (−1…1).
// Browser-safe (works on Uint8Array; Node Buffers are Uint8Arrays).
//
//   const dec = createPcmDecoder({ format: 's16le', channels: 1, sniff: true });
//   child.stdout.on('data', (chunk) => { const f = dec.push(chunk); if (f.length) analyzer.push(f); });
//
// - Pipe reads split samples anywhere: partial frames are carried to the next chunk.
// - `sniff` strips a container header if the tool wrote one anyway: AU (`.snd`, what
//   pw-record ≥ 1.3.81 emits without --raw; big-endian PCM) or WAV (`RIFF`, arecord
//   without -t raw). Anything else is treated as raw from byte 0.
// - Multi-channel input is averaged to mono.
// Nothing is buffered beyond one partial frame (or a ≤ 4 KiB header): no audio is kept.

export const PCM_FORMATS = {
  s16le: { bytes: 2, read: (dv, o) => dv.getInt16(o, true) / 32768 },
  s16be: { bytes: 2, read: (dv, o) => dv.getInt16(o, false) / 32768 },
  f32le: { bytes: 4, read: (dv, o) => dv.getFloat32(o, true) },
  f32be: { bytes: 4, read: (dv, o) => dv.getFloat32(o, false) },
};

const HEADER_MAX = 4096;
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

/**
 * Parse a container header at the start of `b`.
 * → { kind: 'raw' } | { kind: 'au' | 'wav', skip, format, channels, sampleRate } | { kind: 'need' } (more bytes needed)
 */
export function sniffHeader(b) {
  if (b.length < 4) return { kind: 'need' };
  const magic = ascii(b, 0, 4);
  if (magic === '.snd') {
    if (b.length < 24) return { kind: 'need' };
    const dv = new DataView(b.buffer, b.byteOffset, b.length);
    const skip = dv.getUint32(4, false), enc = dv.getUint32(12, false);
    const sampleRate = dv.getUint32(16, false), channels = dv.getUint32(20, false);
    // AU encodings: 3 = 16-bit linear PCM, 6 = 32-bit IEEE float (both big-endian)
    const format = enc === 3 ? 's16be' : enc === 6 ? 'f32be' : null;
    return { kind: 'au', skip, format, channels, sampleRate };
  }
  if (magic === 'RIFF') {
    if (b.length < 12) return { kind: 'need' };
    const dv = new DataView(b.buffer, b.byteOffset, b.length);
    let o = 12, fmt = null;
    while (o + 8 <= b.length) {
      const id = ascii(b, o, 4), size = dv.getUint32(o + 4, true);
      if (id === 'fmt ' && o + 8 + 16 <= b.length) {
        const tag = dv.getUint16(o + 8, true), channels = dv.getUint16(o + 10, true);
        const sampleRate = dv.getUint32(o + 12, true), bits = dv.getUint16(o + 22, true);
        fmt = { channels, sampleRate, format: tag === 3 && bits === 32 ? 'f32le' : bits === 16 ? 's16le' : null };
      }
      if (id === 'data') return { kind: 'wav', skip: o + 8, ...(fmt || { format: 's16le', channels: 1, sampleRate: 0 }) };
      o += 8 + size + (size & 1);
    }
    return b.length >= HEADER_MAX ? { kind: 'raw' } : { kind: 'need' };
  }
  return { kind: 'raw' };
}

/**
 * opts: { format: 's16le' | 's16be' | 'f32le' | 'f32be', channels: 1, sniff: false, onHeader(h) }
 * → { push(chunk) → Float32Array (may be empty), reset(), header, format, channels }
 */
export function createPcmDecoder({ format = 's16le', channels = 1, sniff = false, onHeader } = {}) {
  let fmt = PCM_FORMATS[format] ? format : 's16le';
  let ch = Math.max(1, channels | 0);
  let carry = new Uint8Array(0);
  let head = sniff ? new Uint8Array(0) : null;   // non-null while sniffing
  let skip = 0;
  let header = null;

  function decode(b) {
    const spec = PCM_FORMATS[fmt];
    const frame = spec.bytes * ch;
    const usable = b.length - (b.length % frame);
    const frames = usable / frame;
    const out = new Float32Array(frames);
    if (!frames) { carry = b.slice(0); return out; }
    const dv = new DataView(b.buffer, b.byteOffset, usable);
    for (let f = 0, o = 0; f < frames; f++) {
      let s = 0;
      for (let c = 0; c < ch; c++, o += spec.bytes) s += spec.read(dv, o);
      out[f] = ch === 1 ? s : s / ch;
    }
    carry = usable < b.length ? b.slice(usable) : new Uint8Array(0);
    return out;
  }

  function push(chunk) {
    let b = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    if (head) {
      const all = new Uint8Array(head.length + b.length);
      all.set(head); all.set(b, head.length);
      const h = sniffHeader(all);
      if (h.kind === 'need' && all.length < HEADER_MAX) { head = all; return new Float32Array(0); }
      head = null;
      if (h.kind === 'au' || h.kind === 'wav') {
        header = h;
        if (PCM_FORMATS[h.format]) fmt = h.format;
        if (h.channels > 0) ch = h.channels;
        skip = h.skip;
        onHeader?.(h);
      }
      b = all;
    }
    if (skip) {
      const n = Math.min(skip, b.length);
      skip -= n;
      b = b.subarray(n);
      if (!b.length) return new Float32Array(0);
    }
    if (carry.length) {
      const all = new Uint8Array(carry.length + b.length);
      all.set(carry); all.set(b, carry.length);
      b = all;
    }
    return decode(b);
  }

  return {
    push,
    reset() { carry = new Uint8Array(0); head = sniff ? new Uint8Array(0) : null; skip = 0; header = null; },
    get header() { return header; },
    get format() { return fmt; },
    get channels() { return ch; },
  };
}
