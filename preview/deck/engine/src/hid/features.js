// Feature reports — byte builders only. Plain node:fs cannot issue ioctl(), so
// these go through linux/prism-deck-hidfeature.py (stdlib python3), which
// enforces the same allowlist. Layouts: research linux.md §2.5.
//
//   gen2 (32 bytes, zero-padded)          gen1 — 2017 original / Mini family (17 or 32 bytes)
//   03 02            show logo            0B 63                 reset / show logo
//   03 05 r g b      fill whole LCD       05 55 AA D1 01 pct    brightness
//   03 06 i r g b    fill key / sensor
//   03 08 pct        brightness 0–100
//   03 0D int32      sleep timeout (s)
//   Galleon (unpadded): 03 27 keep-alive every 500 ms · 03 24 i r g b dial ring pixel
//   GET: gen2 04/05/07 firmware, 06 serial, 08 unit info, 0A sleep; gen1 03 serial, 04 firmware; Studio 11/13

const pad = (bytes, len) => { const a = new Uint8Array(len); a.set(bytes); return a; };
const pct = (p) => Math.max(0, Math.min(100, Math.round(Number(p) || 0)));
const b8 = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));

/** First feature length to try for a model (gen1 Minis fall back between 32 and 17). */
export const featureLen = (m) => m.feature?.lens?.[0] ?? 32;

export const features = {
  brightness: (m, p, len = featureLen(m)) => (m.feature.kind === 'gen2' ? pad([0x03, 0x08, pct(p)], len) : pad([0x05, 0x55, 0xaa, 0xd1, 0x01, pct(p)], len)),
  showLogo: (m, len = featureLen(m)) => (m.feature.kind === 'gen2' ? pad([0x03, 0x02], len) : pad([0x0b, 0x63], len)),
  fillKey: (key, r, g, b) => pad([0x03, 0x06, b8(key), b8(r), b8(g), b8(b)], 32),
  fillLcd: (r, g, b) => pad([0x03, 0x05, b8(r), b8(g), b8(b)], 32),
  sleepSeconds: (s) => { const a = pad([0x03, 0x0d], 32); new DataView(a.buffer).setInt32(2, Math.max(0, Math.trunc(s) || 0), true); return a; },
  galleonPing: () => new Uint8Array([0x03, 0x27]),
  galleonRingPixel: (i, r, g, b) => new Uint8Array([0x03, 0x24, b8(i), b8(r), b8(g), b8(b)]),
};

/** Physical Galleon ring LED index for dial `encoder` (0 left, 1 right), logical LED i (0–3) — node galleonK100 encoderLed. [UNVERIFIED on hardware] */
export const galleonRingIndex = (encoder, i, offsets = [3, 1]) => (1 - encoder) * 4 + ((i + offsets[encoder]) % 4);

/** Feature GET ids per flavour (read-only). */
export const GETTERS = Object.freeze({
  gen2: { firmware: 0x05, firmwareLd: 0x04, firmwareAp1: 0x07, serial: 0x06, unitInfo: 0x08, sleep: 0x0a, encoderAp2: 0x11, encoderLd: 0x13 },
  gen1: { serial: 0x03, firmware: 0x04 },
});

/** Decode a serial / firmware GET response to ASCII. */
export function decodeGet(m, id, bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ascii = (from, to = b.length) => String.fromCharCode(...b.subarray(from, to)).replace(/\0.*$/s, '').trim();
  if (m.feature.kind === 'gen1') return ascii(5);
  if (id === 0x06) return ascii(2, 2 + b[1]);
  if ([0x04, 0x05, 0x07, 0x11, 0x13].includes(id)) return ascii(6, 14);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// The allowlist — kept identical to ALLOWED_SET in linux/prism-deck-hidfeature.py (test/hid.test.js checks both).
// [prefix bytes, number of free argument bytes after the prefix]; every byte after that must be zero padding.
export const ALLOWED_SET = Object.freeze([
  [[0x03, 0x02], 0], // show logo (gen2)
  [[0x03, 0x05], 3], // fill LCD rgb
  [[0x03, 0x06], 4], // fill key idx rgb
  [[0x03, 0x08], 1], // brightness pct
  [[0x03, 0x0d], 4], // sleep timeout int32
  [[0x03, 0x27], 0], // Galleon keep-alive
  [[0x03, 0x24], 4], // Galleon ring pixel idx rgb
  [[0x05, 0x55, 0xaa, 0xd1, 0x01], 1], // gen1 brightness pct
  [[0x0b, 0x63], 0], // gen1 reset / logo
]);
export const ALLOWED_GET = Object.freeze([0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0a, 0x11, 0x13]);

/** null when `bytes` is an allowed SET feature report, else the reason. */
export function checkFeature(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 2 || b.length > 64) return `length ${b.length} outside 2–64`;
  for (const [prefix, args] of ALLOWED_SET) {
    if (b.length < prefix.length || !prefix.every((x, i) => b[i] === x)) continue;
    const end = prefix.length + args;
    if (b.length < end) return `truncated ${prefix.map((x) => x.toString(16)).join(' ')} report`;
    for (let i = end; i < b.length; i++) if (b[i] !== 0) return `non-zero padding at byte ${i}`;
    if (prefix[1] === 0x08 && b[2] > 100) return 'brightness above 100';
    if (prefix[0] === 0x05 && b[5] > 100) return 'brightness above 100';
    return null;
  }
  return `feature ${Array.from(b.subarray(0, 2), (x) => x.toString(16).padStart(2, '0')).join(' ')} is not on the allowlist`;
}
