// Output-report builders — pure functions from (key / rect, encoded image bytes)
// to the exact reports to write(). Each returned Uint8Array is ONE hidraw write():
// never coalesce them (the Mini drops off USB when reports are joined) and never
// interleave two images' reports. All multi-byte fields little-endian; reports
// are zero-padded to their full length. Layouts: research linux.md §2.3, verified
// there byte for byte against python-elgato-streamdeck.
//
//   family   report  header  payload  layout
//   orig     8191    16      2 halves [02 01 page(1-based) 00 last hidKey+1 …]
//   mini     1024    16      1008     [02 01 page(0-based) 00 last key+1 …]
//   gen2Key  1024    8       1016     [02 07 key last len16 page16]
//   gen2Full 1024    8       1016     [02 08 00 last len16 page16]          (experimental — Elgato docs only)
//   window   1024    8       1016     [02 0B 00 last len16 page16]          Neo info bar, whole window
//   region   1024    16      1008     [02 0C x16 y16 w16 h16 last page16 len16 00]   logical coords

import { OUTPUT_COMMANDS } from './models.js';

export const REPORT = Object.freeze({
  orig: { total: 8191, header: 16 },
  mini: { total: 1024, header: 16, payload: 1008 },
  gen2Key: { total: 1024, header: 8, payload: 1016 },
  gen2Full: { total: 1024, header: 8, payload: 1016 },
  window: { total: 1024, header: 8, payload: 1016 },
  region: { total: 1024, header: 16, payload: 1008 },
});

/** Number of reports an image of `len` bytes needs in a family (≥ 1: an empty image still sends one "last" report). */
export function reportCount(len, family) {
  if (family === 'orig') return 2;
  const r = REPORT[family];
  if (!r) throw new Error(`hid: unknown report family "${family}"`);
  return Math.max(1, Math.ceil(len / r.payload));
}

/** Split `data` into fixed-size reports; header(pkt, view, page, last, n) writes each header. */
export function chunk(data, { total, header: hdr, payload = total - hdr }, header) {
  const out = [];
  const pages = Math.max(1, Math.ceil(data.length / payload));
  for (let page = 0; page < pages; page++) {
    const off = page * payload, n = Math.min(payload, data.length - off), last = page === pages - 1;
    const pkt = new Uint8Array(total);
    header(pkt, new DataView(pkt.buffer), page, last, n);
    if (n > 0) pkt.set(data.subarray(off, off + n), hdr);
    out.push(pkt);
  }
  return out;
}

const u8 = (data) => (data instanceof Uint8Array ? data : new Uint8Array(data));
const byte = (v, what) => { if (!Number.isInteger(v) || v < 0 || v > 255) throw new RangeError(`hid: ${what} must be 0–255, got ${v}`); return v; };
const word = (v, what) => { if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new RangeError(`hid: ${what} must be 0–65535, got ${v}`); return v; };

export const packets = {
  /** 2017 original: the BMP split into exactly two halves, 8191-byte reports, 1-based page, wire key + 1. */
  orig(wireKey, bmp) {
    bmp = u8(bmp); byte(wireKey + 1, 'key');
    const half = Math.ceil(bmp.length / 2);
    if (half > REPORT.orig.total - REPORT.orig.header) throw new RangeError(`hid: original BMP too large (${bmp.length} bytes)`);
    return [0, 1].map((i) => {
      const p = new Uint8Array(REPORT.orig.total);
      p.set([0x02, 0x01, i + 1, 0x00, i, wireKey + 1], 0);
      p.set(bmp.subarray(i * half, Math.min(bmp.length, (i + 1) * half)), REPORT.orig.header);
      return p;
    });
  },
  /** Mini family: 0-based page, key + 1, "show image" flag on the last chunk. */
  mini(key, bmp) {
    byte(key + 1, 'key');
    return chunk(u8(bmp), REPORT.mini, (p, v, page, last) => { p.set([0x02, 0x01, byte(page, 'page'), 0x00, last ? 1 : 0, key + 1], 0); });
  },
  /** gen2 key image (cmd 0x07). */
  gen2Key(key, jpeg) {
    byte(key, 'key');
    return chunk(u8(jpeg), REPORT.gen2Key, (p, v, page, last, n) => { p.set([0x02, 0x07, key, last ? 1 : 0], 0); v.setUint16(4, n, true); v.setUint16(6, word(page, 'page'), true); });
  },
  /** gen2 full-LCD image (cmd 0x08) — Elgato docs only, not used by either open-source library: experimental. */
  gen2Full(jpeg) {
    return chunk(u8(jpeg), REPORT.gen2Full, (p, v, page, last, n) => { p.set([0x02, 0x08, 0x00, last ? 1 : 0], 0); v.setUint16(4, n, true); v.setUint16(6, word(page, 'page'), true); });
  },
  /** Neo info bar (cmd 0x0B), whole window only. */
  window(jpeg) {
    return chunk(u8(jpeg), REPORT.window, (p, v, page, last, n) => { p.set([0x02, 0x0b, 0x00, last ? 1 : 0], 0); v.setUint16(4, n, true); v.setUint16(6, word(page, 'page'), true); });
  },
  /** LCD region (cmd 0x0C): + / + XL strip, Galleon screen. x/y/w/h are LOGICAL (unrotated) coordinates. */
  region(x, y, w, h, jpeg) {
    word(x, 'x'); word(y, 'y'); word(w, 'w'); word(h, 'h');
    return chunk(u8(jpeg), REPORT.region, (p, v, page, last, n) => {
      p[0] = 0x02; p[1] = 0x0c; v.setUint16(2, x, true); v.setUint16(4, y, true); v.setUint16(6, w, true); v.setUint16(8, h, true);
      p[10] = last ? 1 : 0; v.setUint16(11, word(page, 'page'), true); v.setUint16(13, n, true);
    });
  },
  /** Studio encoder ring: 24 RGB triplets (output report, no ioctl). */
  studioRing(enc, rgb) {
    const p = new Uint8Array(1024);
    p.set([0x02, 0x0f, byte(enc, 'encoder')], 0);
    p.set(u8(rgb).subarray(0, 72), 3);
    return [p];
  },
  /** Studio knob LED. */
  studioKnob(enc, r, g, b) {
    const p = new Uint8Array(1024);
    p.set([0x02, 0x10, byte(enc, 'encoder'), byte(r, 'r'), byte(g, 'g'), byte(b, 'b')], 0);
    return [p];
  },
  /** "Reset key stream": one zero-filled report with only the report id — aborts a half-sent image left by a crashed process. */
  resetStream(len = 1024) { const p = new Uint8Array(len); p[0] = 0x02; return [p]; },
};

/**
 * Guard: is `pkt` an output report this driver is allowed to send? → null when OK, else the reason.
 * Only the documented image / LED / reset reports above; never anything else (no firmware, no unknown commands).
 */
export function checkOutputReport(pkt, model) {
  if (!(pkt instanceof Uint8Array)) return 'not a Uint8Array';
  const want = model?.outLen || 1024;
  if (pkt.length !== want) return `length ${pkt.length} ≠ ${want}`;
  if (pkt[0] !== 0x02) return `report id 0x${pkt[0].toString(16)} (only 0x02 output reports)`;
  const cmd = pkt[1];
  if (!(cmd in OUTPUT_COMMANDS)) return `command 0x${cmd.toString(16)} is not a documented image/LED report`;
  if (cmd === 0x00 && pkt.some((b, i) => i > 0 && b !== 0)) return 'reset report must be zero-filled';
  const proto = model?.proto;
  if (cmd === 0x01 && proto && proto === 'gen2') return 'gen1 image report sent to a gen2 device';
  if (cmd !== 0x00 && cmd !== 0x01 && proto && proto !== 'gen2') return `gen2 command 0x${cmd.toString(16)} sent to a ${proto} device`;
  if ((cmd === 0x0f || cmd === 0x10) && model && model.ring?.kind !== 'studio') return 'Studio LED report sent to a non-Studio device';
  if (cmd === 0x08 && model && !model.fullLcd) return 'full-LCD report sent to a device without a documented full-LCD command';
  if (cmd === 0x0b && model && model.lcd?.cmd !== 0x0b) return 'info-bar report sent to a device without an info bar';
  if (cmd === 0x0c && model && model.lcd?.cmd !== 0x0c) return 'region report sent to a device without a strip/screen';
  return null;
}
