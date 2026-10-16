// Refraction color math (design/tools) — OKLCH <-> sRGB, gamut mapping, WCAG 2.x contrast,
// alpha compositing and CIE 1931 dominant wavelength (for the λ labels).
// Zero dependencies. Owner: Lead Designer.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a };
}
export function rgbToHex({ r, g, b }) {
  const t = (v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0');
  return '#' + t(r) + t(g) + t(b);
}
export const rgbTriplet = (hex) => { const { r, g, b } = hexToRgb(hex); return [r, g, b].map((v) => Math.round(v * 255)).join(','); };

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab({ r, g, b }) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}
export function oklabToLinear({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}
export function oklchToLab(L, C, h) { const hr = (h * Math.PI) / 180; return { L, a: C * Math.cos(hr), b: C * Math.sin(hr) }; }
export function hexToOklch(hex) {
  const { L, a, b } = rgbToOklab(hexToRgb(hex));
  let h = (Math.atan2(b, a) * 180) / Math.PI; if (h < 0) h += 360;
  return { L, C: Math.hypot(a, b), h };
}
const EPS = 1e-6;
export function inGamut(L, C, h) {
  const lin = oklabToLinear(oklchToLab(L, C, h));
  return [lin.r, lin.g, lin.b].every((v) => v >= -EPS && v <= 1 + EPS);
}
export function maxChroma(L, h) {
  let lo = 0, hi = 0.5;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; inGamut(L, mid, h) ? (lo = mid) : (hi = mid); }
  return lo;
}
/** OKLCH -> hex, reducing chroma (never L or h) until in sRGB gamut. */
export function oklch(L, C, h) {
  const c = Math.min(C, maxChroma(L, h));
  const lin = oklabToLinear(oklchToLab(L, c, h));
  return rgbToHex({ r: toGam(clamp(lin.r)), g: toGam(clamp(lin.g)), b: toGam(clamp(lin.b)) });
}
export function deltaE(hexA, hexB) {
  const A = rgbToOklab(hexToRgb(hexA)), B = rgbToOklab(hexToRgb(hexB));
  return Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b);
}

// ── WCAG 2.x ───────────────────────────────────────────────────────────────
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}
export function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** Composite an rgba() / #rrggbbaa / hex color over an opaque hex background. */
export function over(color, bgHex) {
  let r, g, b, a;
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (m) { const p = m[1].split(',').map((s) => parseFloat(s)); [r, g, b] = p.map((v) => v / 255); a = p[3] ?? 1; }
  else ({ r, g, b, a } = hexToRgb(color));
  const B = hexToRgb(bgHex);
  return rgbToHex({ r: r * a + B.r * (1 - a), g: g * a + B.g * (1 - a), b: b * a + B.b * (1 - a) });
}
/** Lightest/darkest L (at fixed C,h) that still reaches `target` contrast on bg. */
export function solveL(C, h, bgHex, target, dir /* 'darker' | 'lighter' */) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2; const ok = contrast(oklch(mid, C, h), bgHex) >= target;
    if (dir === 'darker') ok ? (lo = mid) : (hi = mid); else ok ? (hi = mid) : (lo = mid);
  }
  return dir === 'darker' ? lo : hi;
}

// ── CIE 1931 2° spectral locus (x, y) — 5 nm steps 380–700 ─────────────────
const LOCUS = [
  [380, 0.1741, 0.005], [385, 0.174, 0.005], [390, 0.1738, 0.0049], [395, 0.1736, 0.0049], [400, 0.1733, 0.0048],
  [405, 0.173, 0.0048], [410, 0.1726, 0.0048], [415, 0.1721, 0.0048], [420, 0.1714, 0.0051], [425, 0.1703, 0.0058],
  [430, 0.1689, 0.0069], [435, 0.1669, 0.0086], [440, 0.1644, 0.0109], [445, 0.1611, 0.0138], [450, 0.1566, 0.0177],
  [455, 0.151, 0.0227], [460, 0.144, 0.0297], [465, 0.1355, 0.0399], [470, 0.1241, 0.0578], [475, 0.1096, 0.0868],
  [480, 0.0913, 0.1327], [485, 0.0687, 0.2007], [490, 0.0454, 0.295], [495, 0.0235, 0.4127], [500, 0.0082, 0.5384],
  [505, 0.0039, 0.6548], [510, 0.0139, 0.7502], [515, 0.0389, 0.812], [520, 0.0743, 0.8338], [525, 0.1142, 0.8262],
  [530, 0.1547, 0.8059], [535, 0.1929, 0.7816], [540, 0.2296, 0.7543], [545, 0.2658, 0.7243], [550, 0.3016, 0.6923],
  [555, 0.3373, 0.6589], [560, 0.3731, 0.6245], [565, 0.4087, 0.5896], [570, 0.4441, 0.5547], [575, 0.4788, 0.5202],
  [580, 0.5125, 0.4866], [585, 0.5448, 0.4544], [590, 0.5752, 0.4242], [595, 0.6029, 0.3965], [600, 0.627, 0.3725],
  [605, 0.6482, 0.3514], [610, 0.6658, 0.334], [615, 0.6801, 0.3197], [620, 0.6915, 0.3083], [625, 0.7006, 0.2993],
  [630, 0.7079, 0.292], [635, 0.714, 0.2859], [640, 0.719, 0.2809], [645, 0.723, 0.277], [650, 0.726, 0.274],
  [660, 0.73, 0.27], [670, 0.7334, 0.2666], [680, 0.7347, 0.2653], [700, 0.7347, 0.2653],
];
export function xy(hex) {
  const { r, g, b } = hexToRgb(hex); const R = toLin(r), G = toLin(g), B = toLin(b);
  const X = 0.4124 * R + 0.3576 * G + 0.1805 * B, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = 0.0193 * R + 0.1192 * G + 0.9505 * B;
  const s = X + Y + Z || 1; return [X / s, Y / s];
}
const WP = [0.3127, 0.329];
function rayHit(dx, dy) {
  // intersect ray WP + t*(dx,dy), t>0, with locus polyline; return [nm, t]
  let best = null;
  for (let i = 0; i < LOCUS.length - 1; i++) {
    const [n1, x1, y1] = LOCUS[i], [n2, x2, y2] = LOCUS[i + 1];
    const ex = x2 - x1, ey = y2 - y1; const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) continue;
    const t = ((x1 - WP[0]) * ey - (y1 - WP[1]) * ex) / den; const u = ((x1 - WP[0]) * dy - (y1 - WP[1]) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && (!best || t < best[1])) best = [n1 + u * (n2 - n1), t];
  }
  return best;
}
/** Dominant wavelength in nm; purples return the complementary wavelength with suffix 'c'. */
export function dominantWavelength(hex) {
  const [x, y] = xy(hex); const dx = x - WP[0], dy = y - WP[1];
  const hit = rayHit(dx, dy);
  if (hit) return { nm: Math.round(hit[0]), purple: false, label: `λ ${Math.round(hit[0])}` };
  const c = rayHit(-dx, -dy); return { nm: Math.round(c[0]), purple: true, label: `λ ${Math.round(c[0])}c` };
}

// ── xterm-256 ──────────────────────────────────────────────────────────────
/** The xterm-256 palette as hex: 0–15 xterm defaults, 16–231 the 6×6×6 cube, 232–255 the gray ramp. */
export function xterm256() {
  const out = ['#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0', '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];
  const lv = [0, 95, 135, 175, 215, 255], h2 = (v) => v.toString(16).padStart(2, '0');
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) out.push('#' + h2(lv[r]) + h2(lv[g]) + h2(lv[b]));
  for (let i = 0; i < 24; i++) out.push('#' + h2(8 + i * 10).repeat(3));
  return out;
}
const X256 = xterm256();
// Hue-faithful distance: OKLCH with chroma (ΔC) weighted 2× and hue (ΔH, in OKLab units) 1.5×, so a
// teal that must darken stays a teal instead of jumping to whichever green or gray is closest.
function hueDistance(a, b) {
  const p = hexToOklch(a), q = hexToOklch(b);
  const dh = ((p.h - q.h + 540) % 360) - 180;
  const dH = 2 * Math.sqrt(p.C * q.C) * Math.sin((dh * Math.PI) / 360);
  return Math.hypot(p.L - q.L, 2 * (p.C - q.C), 1.5 * dH);
}
/** Nearest xterm-256 index (16–255, never the user-remapped 0–15) by OKLab distance. */
export function nearest256(hex) {
  let best = 16, bd = Infinity;
  for (let i = 16; i < 256; i++) { const d = deltaE(hex, X256[i]); if (d < bd) { bd = d; best = i; } }
  return { index: best, hex: X256[best], dE: +bd.toFixed(3) };
}
/**
 * Designed xterm-256 index for a text (need 4.5) or mark (need 3) color: the plain nearest if it
 * clears `need` on every surface, else the hue-faithful nearest index that does. `contrast` is the
 * worst ratio over the surfaces. Surfaces are hex (the 256-color backgrounds the color sits on).
 */
export function pick256(hex, surfaces, need = 4.5) {
  const worst = (h) => Math.min(...surfaces.map((s) => contrast(h, s)));
  let p = nearest256(hex);
  if (worst(p.hex) < need - 1e-9) {
    let best = -1, bd = Infinity;
    for (let i = 16; i < 256; i++) { if (worst(X256[i]) < need - 1e-9) continue; const d = hueDistance(hex, X256[i]); if (d < bd) { bd = d; best = i; } }
    p = { index: best, hex: X256[best], dE: +deltaE(hex, X256[best]).toFixed(3) };
  }
  return { ...p, contrast: +worst(p.hex).toFixed(2) };
}
