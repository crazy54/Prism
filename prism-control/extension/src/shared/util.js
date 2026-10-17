// Small helpers with no browser dependencies (unit-testable in Node).

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** A trimmed string capped to `max` UTF-16 units without splitting a surrogate pair, or null. */
export function capStr(s, max) {
  if (typeof s !== 'string') return null;
  if (s.length <= max) return s;
  let end = max;
  const c = s.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end -= 1;
  return s.slice(0, end);
}

export const isInt = (x) => Number.isInteger(x);
export const isFiniteNum = (x) => typeof x === 'number' && Number.isFinite(x);
export const finiteOrNull = (x) => (isFiniteNum(x) ? x : null);
export const intOrNull = (x) => (isFiniteNum(x) ? Math.round(x) : null);

/** Structural equality for JSON-like values. */
export function same(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !same(a[k], b[k])) return false;
  return true;
}

/** UTF-8 byte length of a string (what the native-messaging frame carries). */
export function utf8Length(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

export function bytesToBase64(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** SHA-1 of the bytes, truncated to 16 lowercase hex characters (the image id hash). */
export async function hash16(bytes, subtle = globalThis.crypto.subtle) {
  const d = new Uint8Array(await subtle.digest('SHA-1', bytes));
  let hex = '';
  for (let i = 0; i < 8; i++) hex += d[i].toString(16).padStart(2, '0');
  return hex;
}

/** Sniffs PNG / JPEG / GIF / WebP magic bytes. Returns a mime type or null. */
export function sniffImage(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

/** Random lowercase hex id. */
export function randomHex(bytes = 16, rng = globalThis.crypto) {
  const b = new Uint8Array(bytes);
  rng.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Promise that settles with `value` after `ms` (using the injected clock). */
export function delay(clock, ms, value) {
  return new Promise((resolve) => clock.setTimeout(() => resolve(value), ms));
}
