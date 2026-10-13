// Color model for prism-term.
//
// Every color is a packed 24-bit integer (0xRRGGBB) so buffers can hold them in
// Int32Arrays and the renderer can diff them with a single `!==`. NONE (-1) is
// the "terminal default" color — and, on canvases, the transparent pixel.
//
// Gradients are evaluated through a 256-entry LUT built once (in Oklab by
// default, so ramps stay perceptually even instead of going muddy through gray),
// which keeps per-pixel palette lookups in hot scene loops to one array read.

export const NONE = -1;

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const rgb = (r, g, b) => (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
export const red = (c) => (c >> 16) & 255;
export const green = (c) => (c >> 8) & 255;
export const blue = (c) => c & 255;
export const toRgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

export function toHex(c) {
  if (c === NONE) return 'none';
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

export function hex(str) {
  let s = String(str).trim().replace(/^#/, '');
  if (s.length === 3 || s.length === 4) s = s.slice(0, 3).split('').map((ch) => ch + ch).join('');
  if (!/^[0-9a-f]{6}/i.test(s)) throw new Error(`invalid hex color: ${str}`);
  return parseInt(s.slice(0, 6), 16);
}

/** HSL → packed. h in degrees, s/l in 0..1. */
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgb(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}

/** HSV → packed. h in degrees, s/v in 0..1. */
export function hsv(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  const i = Math.floor(h), f = h - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return rgb(r * 255, g * 255, b * 255);
}

const NAMED = {
  black: 0x000000, white: 0xffffff, red: 0xff0000, green: 0x00ff00, blue: 0x0000ff,
  yellow: 0xffff00, cyan: 0x00ffff, magenta: 0xff00ff, orange: 0xffa500, purple: 0x800080,
  pink: 0xffc0cb, gray: 0x808080, grey: 0x808080, transparent: NONE, none: NONE, default: NONE,
};

/** Accepts a packed int, '#hex', 'rgb(r,g,b)', 'r,g,b', a CSS basic name, or null/'none'. */
export function parse(v) {
  if (v == null) return NONE;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return rgb(v[0], v[1], v[2]);
  const s = String(v).trim().toLowerCase();
  if (s in NAMED) return NAMED[s];
  if (s.startsWith('#') || /^[0-9a-f]{6}$/.test(s)) return hex(s);
  const m = s.match(/^(?:rgba?\()?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return rgb(+m[1], +m[2], +m[3]);
  throw new Error(`unrecognized color: ${v}`);
}

/** Linear sRGB-space mix; NONE on either side returns the other. */
export function mix(a, b, t) {
  if (a === NONE) return b;
  if (b === NONE) return a;
  return rgb(
    ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t),
    ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t),
    (a & 255) + (((b & 255) - (a & 255)) * t),
  );
}

/** Multiply brightness (k=0 black, 1 unchanged, >1 brighter, clamped). */
export function scale(c, k) {
  if (c === NONE) return NONE;
  return rgb(((c >> 16) & 255) * k, ((c >> 8) & 255) * k, (c & 255) * k);
}

/** Saturating additive blend — the "glow" operator. */
export function add(a, b) {
  if (a === NONE) return b;
  if (b === NONE) return a;
  return rgb(((a >> 16) & 255) + ((b >> 16) & 255), ((a >> 8) & 255) + ((b >> 8) & 255), (a & 255) + (b & 255));
}

/** Perceived luminance 0..1 (Rec. 709 weights on gamma-encoded values — cheap and good enough). */
export function luminance(c) {
  if (c === NONE) return 0;
  return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
}

/** Squared RGB distance (weighted toward green like the eye). */
export function distance2(a, b) {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
  const db = (a & 255) - (b & 255);
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

// ── Oklab ────────────────────────────────────────────────────────────────────
const toLin = (u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
const toGam = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055);

export function toOklab(c) {
  const r = toLin(((c >> 16) & 255) / 255), g = toLin(((c >> 8) & 255) / 255), b = toLin((c & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function fromOklab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return rgb(
    toGam(clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)) * 255,
    toGam(clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)) * 255,
    toGam(clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)) * 255,
  );
}

export function mixOklab(a, b, t) {
  if (a === NONE) return b;
  if (b === NONE) return a;
  const x = toOklab(a), y = toOklab(b);
  return fromOklab([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/**
 * Build a gradient function t∈[0,1] → color.
 * @param {Array} stops  colors, or [position, color] pairs (positions 0..1)
 * @param {object} opts  { cyclic: wrap t instead of clamping; space: 'oklab'|'rgb'; size: LUT entries }
 * The returned function carries `.lut` (Int32Array) and `.at(i)` for direct index access.
 */
export function gradient(stops, { cyclic = false, space = 'oklab', size = 256 } = {}) {
  let pts = stops.map((s, i) =>
    Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && s[0] <= 1
      ? [s[0], parse(s[1])]
      : [stops.length === 1 ? 0 : i / (stops.length - 1), parse(s)]);
  if (cyclic) pts = [...pts.map(([p, c]) => [p * (pts.length - 1) / pts.length, c]), [1, pts[0][1]]];
  const lerp = space === 'rgb' ? mix : mixOklab;
  const lut = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let k = 0;
    while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
    const [p0, c0] = pts[k], [p1, c1] = pts[Math.min(k + 1, pts.length - 1)];
    lut[i] = p1 === p0 ? c0 : lerp(c0, c1, clamp01((t - p0) / (p1 - p0)));
  }
  const last = size - 1;
  const fn = cyclic
    ? (t) => lut[((Math.floor(t * size) % size) + size) % size]
    : (t) => lut[t <= 0 ? 0 : t >= 1 ? last : (t * last) | 0];
  fn.lut = lut;
  fn.at = (i) => lut[i < 0 ? 0 : i > last ? last : i | 0];
  return fn;
}

// ── Terminal quantization ───────────────────────────────────────────────────
// xterm's 16 base colors (the values most terminals ship by default).
export const ANSI16 = [
  0x000000, 0xcd0000, 0x00cd00, 0xcdcd00, 0x0000ee, 0xcd00cd, 0x00cdcd, 0xe5e5e5,
  0x7f7f7f, 0xff0000, 0x00ff00, 0xffff00, 0x5c5cff, 0xff00ff, 0x00ffff, 0xffffff,
];
const CUBE = [0, 95, 135, 175, 215, 255];

function nearestCube(v) {
  if (v < 48) return 0;
  if (v < 115) return 1;
  return Math.min(5, Math.floor((v - 35) / 40));
}

function compute256(c) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const ri = nearestCube(r), gi = nearestCube(g), bi = nearestCube(b);
  const cube = (CUBE[ri] << 16) | (CUBE[gi] << 8) | CUBE[bi];
  const avg = (r + g + b) / 3;
  const gi2 = avg > 238 ? 23 : Math.max(0, Math.round((avg - 8) / 10));
  const gv = 8 + gi2 * 10;
  const gray = (gv << 16) | (gv << 8) | gv;
  return distance2(c, cube) <= distance2(c, gray) ? 16 + 36 * ri + 6 * gi + bi : 232 + gi2;
}

function compute16(c) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < 16; i++) {
    const d = distance2(c, ANSI16[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// 18-bit LUTs (6 bits/channel) built lazily: quantizing a full-screen plasma per
// frame then costs one shift+lookup per cell, and stays within 2 levels of exact.
let LUT256 = null, LUT16 = null;
const key18 = (c) => (((c >> 18) & 63) << 12) | (((c >> 10) & 63) << 6) | ((c >> 2) & 63);
function buildLut(fn) {
  const lut = new Uint8Array(1 << 18);
  for (let k = 0; k < lut.length; k++) {
    const r = ((k >> 12) & 63) * 4 + 2, g = ((k >> 6) & 63) * 4 + 2, b = (k & 63) * 4 + 2;
    lut[k] = fn((r << 16) | (g << 8) | b);
  }
  return lut;
}
export function to256(c) { return (LUT256 ||= buildLut(compute256))[key18(c)]; }
export function to16(c) { return (LUT16 ||= buildLut(compute16))[key18(c)]; }

/** Canonical depth names: 'truecolor' | '256' | '16' | 'mono'. */
export function normalizeDepth(d) {
  if (d === 24 || d === '24' || d === 'truecolor' || d === '24bit' || d === 3 || d === '3') return 'truecolor';
  if (d === 8 || d === '8' || d === '256' || d === 256 || d === 2 || d === '2') return '256';
  if (d === 4 || d === '4' || d === '16' || d === 16 || d === 1 || d === '1') return '16';
  return 'mono';
}

/** SGR parameter fragment (no ESC[ / m) for a foreground color at a given depth. */
export function fgParam(c, depth) {
  if (c === NONE || depth === 'mono') return '39';
  if (depth === 'truecolor') return `38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
  if (depth === '256') return `38;5;${to256(c)}`;
  const n = to16(c);
  return String(n < 8 ? 30 + n : 82 + n);
}

/** SGR parameter fragment for a background color at a given depth. */
export function bgParam(c, depth) {
  if (c === NONE || depth === 'mono') return '49';
  if (depth === 'truecolor') return `48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
  if (depth === '256') return `48;5;${to256(c)}`;
  const n = to16(c);
  return String(n < 8 ? 40 + n : 92 + n);
}
