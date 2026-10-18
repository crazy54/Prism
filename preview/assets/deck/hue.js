// Spectrum hue tiers for the deck pages, from an OKLCH hue in degrees (prism-deck's galleries
// carry positions as hues). Night ink ≈ L .83 C .105 (text-safe on ink), vivid ≈ L .77 C .13;
// Day ink ≈ L .50 C .14 (text-safe on paper), vivid ≈ L .60 C .16 — the tiers of design/tokens.json.
function oklchToRgb(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055));
}
function oklch(L, C, h) {
  let c = C, rgb = oklchToRgb(L, c, h);
  while (rgb.some((v) => v < -0.0005 || v > 1.0005) && c > 0) { c -= 0.004; rgb = oklchToRgb(L, c, h); }
  const n = rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
  return { hex: '#' + n.map((v) => v.toString(16).padStart(2, '0')).join(''), rgb: n.join(',') };
}
const hueCache = new Map();
/** Hue tiers for a key in Night or Day (ink = text-safe, vivid = marks/glows, wash = tints). */
export function hueColors(h, mode = 'night') {
  const k = `${h}|${mode}`;
  if (!hueCache.has(k)) {
    const day = mode === 'day';
    const ink = day ? oklch(0.5, 0.14, h) : oklch(0.83, 0.105, h);
    const vivid = day ? oklch(0.6, 0.16, h) : oklch(0.77, 0.13, h);
    hueCache.set(k, { h, ink: ink.hex, vivid: vivid.hex, rgb: vivid.rgb });
  }
  return hueCache.get(k);
}

/** Approximate dominant wavelength label for a hue, interpolated between Refraction's gallery positions. */
// gallery positions + spectrum stops from design/tokens.json (h°, λ nm), hue descending
const POS = [[296, 436], [279.1, 467], [269.8, 472], [262.1, 474], [245.2, 479], [243.6, 479], [228.2, 483], [217.5, 485], [211.3, 487], [194.4, 492], [191.3, 492], [177.4, 499], [165.1, 510], [160.5, 519], [143.5, 550], [138.9, 554], [126.6, 563], [112.7, 569], [109.6, 570], [92.7, 576], [86.5, 578], [75.8, 581], [60.4, 585], [58.8, 586], [41.9, 593], [34.2, 597], [24.9, 605]];
export function lambdaFor(h) {
  if (h > 296 || h < 16) return 'λ 494c';
  for (let i = 0; i < POS.length - 1; i++) {
    const [h0, l0] = POS[i], [h1, l1] = POS[i + 1];
    if (h <= h0 && h >= h1) return `λ ${Math.round(l0 + ((h0 - h) / (h0 - h1)) * (l1 - l0))}`;
  }
  return 'λ 605';
}
