// Color math for deck facets — hex in, hex out, perceptual (OKLab/OKLCH) in between.
//
// Everything a key emits is a 6-digit "#rrggbb" plus a separate opacity: the
// Stream Deck app rasterizes SVG with Qt SVG, which reads 8-digit hex as
// #AARRGGBB (not CSS #RRGGBBAA) and does not reliably parse rgba()/hsl(). The
// SVG linter (lint.js) rejects both, so stick to these helpers.

import { TOKENS } from './tokens.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const HEX6 = /^#?([0-9a-f]{6})$/i;
const HEX3 = /^#?([0-9a-f]{3})$/i;

/** '#b8a2f2' | 'b8a2f2' | '#abc' → [r, g, b] (0–255). */
export function parseHex(hex) {
  const s = String(hex).trim();
  let m = s.match(HEX6);
  if (m) { const v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  m = s.match(HEX3);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  throw new Error(`not a hex color: ${hex}`);
}

/** [r, g, b] (0–255, clamped) → '#rrggbb'. */
export function toHex([r, g, b]) {
  const h = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLinear = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** '#hex' → [L, a, b] in OKLab (memoized: live keys convert the same few theme colors every frame). */
const oklabMemo = new Map();
export function hexToOklab(hex) {
  let v = oklabMemo.get(hex);
  if (!v) {
    if (oklabMemo.size > 1024) oklabMemo.clear();
    v = hexToOklabRaw(hex);
    oklabMemo.set(hex, v);
  }
  return [v[0], v[1], v[2]];   // a copy: callers may keep or change it
}
function hexToOklabRaw(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear sRGB (may be out of gamut). */
function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function oklabToHex(L, a, b) {
  return toHex(oklabToLinear(L, a, b).map((c) => fromLinear(clamp01(c))));
}

/** '#hex' → [L (0–1), C (0–~0.37), H (degrees)]. */
export function hexToOklch(hex) {
  const [L, a, b] = hexToOklab(hex);
  const C = Math.hypot(a, b);
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return [L, C, C < 1e-4 ? 0 : H];
}

const inGamut = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/**
 * OKLCH → '#hex'. Out-of-gamut colors keep their lightness and hue and lose
 * chroma (binary search) — the perceptual way to clip, so a spectrum ramp
 * stays even instead of banding at the gamut edge.
 */
export function oklch(L, C, H) {
  const h = (((H % 360) + 360) % 360) * Math.PI / 180;
  const at = (c) => oklabToLinear(L, c * Math.cos(h), c * Math.sin(h));
  let rgb = at(C);
  if (!inGamut(rgb)) {
    let lo = 0, hi = C;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (inGamut(at(mid))) lo = mid; else hi = mid; }
    rgb = at(lo);
  }
  return toHex(rgb.map((c) => fromLinear(clamp01(c))));
}

/** Perceptual mix of two hex colors (t = 0 → a, 1 → b). */
export function mix(a, b, t) {
  const A = hexToOklab(a), B = hexToOklab(b);
  const k = clamp01(t);
  return oklabToHex(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k);
}

/** Shift OKLCH lightness by dl (−1…1), optionally scale chroma. */
export function shade(hex, dl, chroma = 1) {
  const [L, C, H] = hexToOklch(hex);
  return oklch(clamp01(L + dl), C * chroma, H);
}

/** Same hue and lightness, chroma scaled (0 = gray). */
export function saturate(hex, k) {
  const [L, C, H] = hexToOklch(hex);
  return oklch(L, C * k, H);
}

/** WCAG relative luminance and contrast ratio. */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Pick whichever of the candidates contrasts best with `bg`. */
export function bestInk(bg, candidates = ['#ffffff', '#000000']) {
  return candidates.reduce((best, c) => (contrast(bg, c) > contrast(bg, best) ? c : best), candidates[0]);
}

// ── The Spectrum ──────────────────────────────────────────────────────────────
// One perceptually even ramp: constant OKLCH lightness and chroma, hue walks.
// Gallery hues live in galleries.js. The λ label comes from the design tokens: each
// of the 12 Spectrum stops carries the dominant wavelength (CIE 1931, D65) of its Night
// vivid color, purples the complementary one with a "c" suffix ("494c").

const STOPS = (TOKENS.modes?.night?.stops || []).filter((s) => s.lambda).map((s) => ({ h: s.h, label: s.lambda, nm: parseFloat(s.lambda), comp: /c$/.test(s.lambda) })).sort((a, b) => a.h - b.h);
const FALLBACK = [[0, 640], [25, 625], [50, 605], [75, 588], [100, 574], [130, 556], [150, 532], [180, 506], [205, 490], [235, 474], [260, 460], [285, 440], [305, 422], [330, 404], [360, 640]];

/**
 * OKLCH hue (deg) → the λ instrument label: a number of nm (e.g. 436), or a string like
 * "494c" for complementary purples. Exact at the tokens' stops; between stops the nm is
 * interpolated (a complementary neighbor → the nearer stop's label).
 */
export function lambdaOf(hue) {
  const h = ((hue % 360) + 360) % 360;
  if (STOPS.length) {
    const exact = STOPS.find((s) => Math.abs(s.h - h) < 0.05 || Math.abs(s.h - h) > 359.95);
    if (exact) return exact.comp ? exact.label : exact.nm;
    const i = STOPS.findIndex((s) => s.h > h);
    const hi = i < 0 ? STOPS[0] : STOPS[i], lo = i <= 0 ? STOPS[STOPS.length - 1] : STOPS[i - 1];
    const span = ((hi.h - lo.h) + 360) % 360 || 360, f = (((h - lo.h) + 360) % 360) / span;
    if (lo.comp || hi.comp) { const near = f < 0.5 ? lo : hi; return near.comp ? near.label : near.nm; }
    return Math.round(lo.nm + (hi.nm - lo.nm) * f);
  }
  for (let k = 1; k < FALLBACK.length; k++) {
    const [h1, l1] = FALLBACK[k], [h0, l0] = FALLBACK[k - 1];
    if (h <= h1) return Math.round(l0 + ((h - h0) / (h1 - h0)) * (l1 - l0));
  }
  return 640;
}

/** n evenly spaced hues from h0 to h1 (inclusive), going the short or the given way. */
export function hueRamp(h0, h1, n) {
  if (n <= 1) return [h0];
  return Array.from({ length: n }, (_, i) => h0 + ((h1 - h0) * i) / (n - 1));
}
