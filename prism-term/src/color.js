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

// 16 colors are a palette of *roles*, not fixed values: every scheme repaints them.
// So a color is classified in OKLCH, the way a person names it — near-grays by
// lightness onto black / bright black / white / bright white, everything else by
// hue onto the six chromatic families (boundaries follow Refraction's
// hueToAnsi16: violet & rose → magenta, periwinkle & azure → blue, cerulean & cyan
// → cyan, mint & jade → green, lime, citrine & amber → yellow — so xterm's own yellow
// (OKLCH h ≈ 110) stays yellow — coral → red), normal or
// bright by whichever of xterm's pair it is closer to in lightness. A pastel
// lavender stays magenta instead of collapsing to the gray an RGB distance picks.
const FAMILY16 = [[18, 5], [50, 1], [116, 3], [178, 2], [232, 6], [283, 4], [360, 5]];
let BRIGHT_AT = null; // per family: the Oklab L halfway between xterm's normal and bright slot
function classify16(L, a, b) {
  const C = Math.sqrt(a * a + b * b);
  if (L < 0.3 && C < 0.11) return 0;
  if (C < 0.045) return L < 0.3 ? 0 : L < 0.76 ? 8 : L < 0.96 ? 7 : 15;
  let h = Math.atan2(b, a) * 57.29577951308232;
  if (h < 0) h += 360;
  let fam = 5;
  for (const [end, slot] of FAMILY16) if (h < end) { fam = slot; break; }
  BRIGHT_AT ||= ANSI16.slice(0, 8).map((c, i) => (toOklab(c)[0] + toOklab(ANSI16[i + 8])[0]) / 2);
  return L > BRIGHT_AT[fam] ? fam + 8 : fam;
}
function compute16(c) {
  const [L, a, b] = toOklab(c);
  return classify16(L, a, b);
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

// 256 colors: the nearest of the 240 fixed xterm colors (16–231 cube, 232–255 gray
// ramp) by Oklab distance — perceptual, so a lavender stays lavender instead of
// collapsing to the gray an RGB metric prefers. Indexes 0–15 are never used: users
// remap them, so brand hues would land wherever their scheme puts them. The LUT
// search covers the bracketing cube levels (±1) and ±3 gray steps (identical to an
// exhaustive search except at near-ties) and builds in ~25 ms on first use. Colors
// registered with exact256() — every theme token, via palettes.js — get their LUT
// cell resolved by an exhaustive search on their exact value. Colors with a
// *designed* index (pin256: Prism's text tokens, spectrum and gallery inks, from
// design/tokens.json) take that index instead: the nearest one that still clears
// 4.5:1 on every 256-color surface (e.g. Day's teal ink → 23, not the too-light
// nearest 30). Both cost nothing per frame.
const labInto = (R, G, B, out, o) => {
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
};
const lin255 = (v) => toLin(v / 255);
let PAL256 = null; // Oklab of xterm 16..255, flat [L, a, b] × 240
function pal256() {
  if (PAL256) return PAL256;
  PAL256 = new Float64Array(240 * 3);
  for (let k = 0; k < 240; k++) {
    const r = k < 216 ? CUBE[(k / 36) | 0] : 8 + (k - 216) * 10;
    const g = k < 216 ? CUBE[((k / 6) | 0) % 6] : r;
    const b = k < 216 ? CUBE[k % 6] : r;
    labInto(lin255(r), lin255(g), lin255(b), PAL256, k * 3);
  }
  return PAL256;
}
/** Exact nearest xterm-256 index (16–255) for a packed color by Oklab distance (exhaustive). */
export function nearest256(c) {
  const pal = pal256(), p = new Float64Array(3);
  labInto(lin255((c >> 16) & 255), lin255((c >> 8) & 255), lin255(c & 255), p, 0);
  let best = 0, bd = Infinity;
  for (let k = 0, o = 0; k < 240; k++, o += 3) {
    const dl = p[0] - pal[o], da = p[1] - pal[o + 1], db = p[2] - pal[o + 2];
    const d = dl * dl + da * da + db * db;
    if (d < bd) { bd = d; best = k; }
  }
  return 16 + best;
}
function buildLut256() {
  const pal = pal256();
  const L6 = new Float64Array(64), LV = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    const v = Math.round(i * 255 / 63); // cell sample with exact endpoints: black → 16, white → 231
    L6[i] = lin255(v);
    let j = 0;
    while (j < 5 && CUBE[j + 1] <= v) j++;
    LV[i] = j;
  }
  const lut = new Uint8Array(1 << 18), p = new Float64Array(3);
  for (let key = 0; key < lut.length; key++) {
    const ri = key >> 12, gi = (key >> 6) & 63, bi = key & 63;
    labInto(L6[ri], L6[gi], L6[bi], p, 0);
    const P0 = p[0], P1 = p[1], P2 = p[2];
    let best = 0, bd = Infinity;
    const r1 = LV[ri] < 5 ? LV[ri] + 1 : 5, g1 = LV[gi] < 5 ? LV[gi] + 1 : 5, b1 = LV[bi] < 5 ? LV[bi] + 1 : 5;
    for (let x = LV[ri] > 0 ? LV[ri] - 1 : 0; x <= r1; x++) {
      for (let y = LV[gi] > 0 ? LV[gi] - 1 : 0; y <= g1; y++) {
        for (let z = LV[bi] > 0 ? LV[bi] - 1 : 0; z <= b1; z++) {
          const k = 36 * x + 6 * y + z, o = k * 3;
          const dl = P0 - pal[o], da = P1 - pal[o + 1], db = P2 - pal[o + 2];
          const d = dl * dl + da * da + db * db;
          if (d < bd) { bd = d; best = k; }
        }
      }
    }
    const gc = Math.max(0, Math.min(23, Math.round(((ri + gi + bi) * 255 / 189 - 8) / 10)));
    for (let j = gc > 3 ? gc - 3 : 0, je = gc < 20 ? gc + 3 : 23; j <= je; j++) {
      const o = (216 + j) * 3;
      const dl = P0 - pal[o], da = P1 - pal[o + 1], db = P2 - pal[o + 2];
      const d = dl * dl + da * da + db * db;
      if (d < bd) { bd = d; best = 216 + j; }
    }
    lut[key] = 16 + best;
  }
  for (const c of EXACT256) lut[key18(c)] = nearest256(c);
  for (const [k, i] of PIN256) lut[k] = i;
  return lut;
}
const EXACT256 = new Set();
/** Register colors (theme tokens) whose 256-color index must be exact, not LUT-approximate. */
export function exact256(...colors) {
  for (const c of colors) {
    if (c === NONE) continue;
    EXACT256.add(c & 0xffffff);
    if (LUT256 && !PIN256.has(key18(c))) LUT256[key18(c)] = nearest256(c & 0xffffff);
  }
}
const PIN256 = new Map(); // LUT cell → designed index
/**
 * Pin an exact color to its designed xterm-256 index (16–255), overriding the
 * nearest. A later pin wins a LUT cell two pinned colors share. Registered by
 * palettes.js from src/themes.js (tokens256, ansi256, spectrum and gallery 256).
 */
export function pin256(c, index) {
  if (c === NONE || !Number.isInteger(index) || index < 16 || index > 255) return;
  const k = key18(c & 0xffffff);
  PIN256.set(k, index);
  if (LUT256) LUT256[k] = index;
}
/** The designed (pinned) xterm-256 index for c's LUT cell, or undefined. */
export function pinned256(c) { return PIN256.get(key18(c & 0xffffff)); }
export function to256(c) { return (LUT256 ||= buildLut256())[key18(c)]; }
function buildLut16() {
  const L6 = new Float64Array(64);
  for (let i = 0; i < 64; i++) L6[i] = lin255(Math.round(i * 255 / 63));
  const lut = new Uint8Array(1 << 18), p = new Float64Array(3);
  for (let key = 0; key < lut.length; key++) {
    labInto(L6[key >> 12], L6[(key >> 6) & 63], L6[key & 63], p, 0);
    lut[key] = classify16(p[0], p[1], p[2]);
  }
  return lut;
}
export function to16(c) { return (LUT16 ||= buildLut16())[key18(c)]; }

// 16 colors: theme tokens carry a designed ANSI slot ("role") — e.g. Prism's accent
// is always magenta (5), its background/ink the terminal's own default colors —
// separately for text and for fills, so 16-color output reads as the theme intends
// on any scheme instead of as whatever xterm default happens to be nearest.
// Everything else falls back to the nearest xterm color (to16). Slot -1 = the
// terminal default (SGR 39 / 49). Registered by palettes.js from src/themes.js.
const ROLE16 = new Map();
/** Pin an exact color to an ANSI-16 slot (0–15, or -1 = terminal default) for text and fills. */
export function setAnsi16Role(c, fg, bg = fg) { ROLE16.set(c & 0xffffff, [fg, bg]); }
/** ANSI-16 slot used for `c` as a text color: 0–15, or -1 for the terminal default foreground. */
export function ansi16Fg(c) { const r = ROLE16.get(c); return r ? r[0] : to16(c); }
/** ANSI-16 slot used for `c` as a fill: 0–15, or -1 for the terminal default background. */
export function ansi16Bg(c) { const r = ROLE16.get(c); return r ? r[1] : to16(c); }

/** Canonical depth names: 'truecolor' | '256' | '16' | 'mono'. */
export function normalizeDepth(d) {
  if (d === 24 || d === '24' || d === 'truecolor' || d === '24bit' || d === 3 || d === '3') return 'truecolor';
  if (d === 8 || d === '8' || d === '256' || d === 256 || d === 2 || d === '2') return '256';
  if (d === 4 || d === '4' || d === '16' || d === 16 || d === 1 || d === '1') return '16';
  return 'mono';
}

/**
 * The 16-color text slot for `c` drawn over `onBg` (a cell's background; undefined /
 * NONE = the terminal default). On a light terminal (`light`: a Day theme, whose 7 / 15
 * are light and every other slot dark):
 *   • white / bright white (7 / 15) text stays on dark fills only; on the default or a
 *     light background it would vanish, so it becomes bright black (8);
 *   • dark neutral text (default fg, 0, 8) on a dark fill becomes bright white (15),
 *     as status bars draw it (white on green, not near-black on green).
 * Colored text on colored fills (ANSI art) is left as designed.
 */
export function ansi16Text(c, onBg, light = false) {
  const n = c === NONE ? -1 : ansi16Fg(c);
  if (!light) return n;
  const b = onBg === undefined || onBg === NONE ? -1 : ansi16Bg(onBg);
  const lightFill = b < 0 || b === 7 || b === 15;
  if (n === 7 || n === 15) return lightFill ? 8 : n;
  if (n === -1 || n === 0 || n === 8) return lightFill ? n : 15;
  return n;
}

/**
 * SGR parameter fragment (no ESC[ / m) for a foreground color at a given depth.
 * `onBg` / `light` only matter at 16 colors (see ansi16Text).
 */
export function fgParam(c, depth, onBg, light = false) {
  if (depth === 'mono' || (c === NONE && !(light && depth === '16'))) return '39';
  if (depth === 'truecolor') return `38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
  if (depth === '256') return `38;5;${to256(c)}`;
  const n = ansi16Text(c, onBg, light);
  return n < 0 ? '39' : String(n < 8 ? 30 + n : 82 + n);
}

/** SGR parameter fragment for a background color at a given depth. */
export function bgParam(c, depth) {
  if (c === NONE || depth === 'mono') return '49';
  if (depth === 'truecolor') return `48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
  if (depth === '256') return `48;5;${to256(c)}`;
  const n = ansi16Bg(c);
  return n < 0 ? '49' : String(n < 8 ? 40 + n : 92 + n);
}
