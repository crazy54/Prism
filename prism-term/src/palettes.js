// Themes and gradient palettes.
//
// Themes are Prism's design-system token sets (synced from the Prism theme
// registry — see scripts/sync-themes.mjs), resolved to packed colors so scenes
// and widgets can say `theme.accent` / `theme.neg` and reskin with --theme.
// The default is Refraction's Prism Night, or Prism Day on a light terminal
// (src/theme-detect.js: PRISM_TERM_THEME, COLORFGBG, OSC 11).
//
// Palettes are named gradients for fields and particles. Three are derived from
// the active theme ('theme', 'theme-heat', and 'spectrum' — Refraction's 12-stop
// spectrum in the tier made for the theme's mode) so effects can match a design
// system instead of using the stock looks.
//
// Loading this module also tells the color quantizer about every theme token:
// each gets its exact xterm-256 index, and the Prism themes' tokens get their
// designed ANSI-16 slots (TERMINAL_SCHEMES roles), so lower depths look intended.
// Prism's text colors — its tokens, the spectrum ink and the terminal gallery
// hues — are pinned to their designed xterm-256 indexes (design/tokens.json:
// the nearest index that keeps 4.5:1 on every 256-color surface, 3:1 for marks).

import { THEME_DATA, DEFAULT_THEME_ID, TERMINAL_SCHEMES, SPECTRUM, TERMINAL_GALLERIES } from './themes.js';
import { parse, gradient, mix, toOklab, fromOklab, exact256, pin256, setAnsi16Role, NONE } from './color.js';
import { detectedTheme } from './theme-detect.js';

const THEME_KEYS = ['bg', 'panel', 'panel2', 'card', 'line', 'ink', 'muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit'];
const BY_ID = new Map(THEME_DATA.map((t) => [t.id, t]));
const MODE_ALIASES = { day: 'light', light: 'light', night: 'dark', dark: 'dark' };

export const THEME_IDS = THEME_DATA.map((t) => t.id);
export { DEFAULT_THEME_ID, TERMINAL_SCHEMES, SPECTRUM };

/** The theme used when none is given: the detected Day/Night theme, else DEFAULT_THEME_ID. */
export function defaultThemeId() {
  const d = detectedTheme();
  return d && BY_ID.has(d.id) ? d.id : DEFAULT_THEME_ID;
}

/**
 * Resolve a theme by id, by 'auto' / nothing (the detected default), by 'day' /
 * 'night', or by a design-system name like 'primer' (its variant for the detected
 * mode, dark when unknown). Unknown ids fall back to the default. Returns packed
 * colors plus { id, name, ds, mode }.
 */
export function getTheme(id) {
  if (id && typeof id === 'object') return id; // already resolved
  const key = id == null || id === '' || id === 'auto' ? defaultThemeId() : String(id);
  const mode = MODE_ALIASES[key.toLowerCase()];
  const t = (mode && BY_ID.get(`prism-${mode}`)) || BY_ID.get(key)
    || BY_ID.get(`${key}-${detectedTheme()?.mode || 'dark'}`) || BY_ID.get(`${key}-dark`) || BY_ID.get(defaultThemeId());
  const out = { id: t.id, name: t.name, ds: t.ds, mode: t.mode };
  for (const k of THEME_KEYS) out[k] = parse(t[k]);
  return out;
}

export function listThemes() {
  return THEME_DATA.map((t) => ({ id: t.id, name: t.name, mode: t.mode, accent: t.accent, ds: t.ds }));
}

/** The terminal color scheme (hex strings) for a Prism theme id, or null. */
export function terminalScheme(id) {
  const s = TERMINAL_SCHEMES[getTheme(id).id];
  return s ? { id: getTheme(id).id, name: getTheme(id).name, mode: getTheme(id).mode, ...s, ansi: [...s.ansi] } : null;
}

// ── tell the quantizer about the tokens (see src/color.js) ───────────────────
// Spectrum and scheme colors first, then theme tokens with Prism's last, so the
// tokens win any 256-LUT cell they share (Night's brightWhite and Day's bg do).
exact256(...SPECTRUM.flatMap((st) => [st.night, st.nightVivid, st.day, st.dayVivid].map(parse)));
for (const s of Object.values(TERMINAL_SCHEMES)) exact256(...s.ansi.map(parse));
for (const t of [...THEME_DATA].sort((a, b) => (a.ds === 'prism') - (b.ds === 'prism'))) exact256(...THEME_KEYS.map((k) => parse(t[k])));
// Designed 256 indexes, lowest priority first (a later pin wins a LUT cell two
// colors share): ANSI slots, spectrum ink, gallery ink / vivid, then the tokens.
for (const s of Object.values(TERMINAL_SCHEMES)) (s.ansi256 || []).forEach((i, n) => pin256(parse(s.ansi[n]), i));
for (const st of SPECTRUM) { pin256(parse(st.night), st.night256); pin256(parse(st.day), st.day256); }
for (const g of TERMINAL_GALLERIES || []) {
  pin256(parse(g.nightVivid), g.nightVivid256); pin256(parse(g.dayVivid), g.dayVivid256);
  pin256(parse(g.night), g.night256); pin256(parse(g.day), g.day256);
}
for (const [id, s] of Object.entries(TERMINAL_SCHEMES)) {
  const t = BY_ID.get(id);
  if (t) for (const [k, i] of Object.entries(s.tokens256 || {})) pin256(parse(t[k]), i);
}
for (const [id, s] of Object.entries(TERMINAL_SCHEMES)) {
  const t = BY_ID.get(id);
  if (!t) continue;
  for (const [k, [fg, bg]] of Object.entries(s.roles)) {
    const c = parse(t[k]);
    // Pure black/white are everyday art colors in every theme: never pin those.
    if (c !== NONE && c !== 0 && c !== 0xffffff) setAnsi16Role(c, fg, bg);
  }
}

const spectrumTier = (key) => SPECTRUM.map((st) => st[key]);

export const PALETTES = {
  // Prism's own palette is Refraction's spectrum: the 12 OKLCH stops violet → rose
  // (cyclic through magenta). palette() picks the tier made for the theme's mode —
  // Night vivid on dark themes, Day vivid on light ones, so a rainbow stays legible
  // on pearl. 'prism-ink' is the text-safe ink tier; 'neon' is the classic
  // saturated rainbow prism-term shipped before Refraction.
  prism: { stops: spectrumTier('nightVivid'), light: spectrumTier('dayVivid'), cyclic: true },
  'prism-ink': { stops: spectrumTier('night'), light: spectrumTier('day'), cyclic: true },
  // 'prism-sheen' is 'prism' for full-field fills: on light themes it takes the Day sheen
  // tier (design/tokens.json › spectrum.stops[].day.sheen), since the vivid tier is tuned
  // for marks on pearl and turns olive where it fills every cell. In Night it equals 'prism'.
  'prism-sheen': { stops: spectrumTier('nightVivid'), light: ['#b299f3', '#8ba6fd', '#5ab3f7', '#19bfe2', '#00c8c3', '#53cea0', '#8fcf7d', '#c1c95f', '#e5ba53', '#f7a65f', '#fb947c', '#f48a9f'], cyclic: true },
  neon: { stops: ['#ff3b6b', '#ff9f1c', '#ffe14d', '#3ddc84', '#2ec5ff', '#7a5cff', '#ff3bd4'], cyclic: true },
  fire: { stops: ['#000000', '#1f0500', '#6b1300', '#c43a00', '#ff7a00', '#ffc42e', '#fff4c2', '#ffffff'] },
  ocean: { stops: ['#01040c', '#03193a', '#074b80', '#0f8ec2', '#3fd0e8', '#b8f6ff', '#ffffff'] },
  aurora: { stops: ['#02040f', '#08303a', '#0f8c6e', '#5ff5a8', '#9b7bff', '#ff7ae0'] },
  synthwave: { stops: ['#0d0221', '#2b0f54', '#7b1fa2', '#ff2a6d', '#ff9e3d', '#ffe66d'] },
  matrix: { stops: ['#000300', '#002b06', '#007a1e', '#00d43a', '#7dff9c', '#e8ffe8'] },
  ice: { stops: ['#020617', '#0c2a4a', '#2563a8', '#60a5fa', '#c7e3ff', '#ffffff'] },
  sunset: { stops: ['#14002e', '#4a0e5c', '#a3195b', '#f05a28', '#ffb03a', '#fff1a8'] },
  toxic: { stops: ['#020a02', '#123d0b', '#3f8f00', '#a6ff00', '#f4ff8a'] },
  magma: { stops: ['#000004', '#2c115f', '#721f81', '#b73779', '#f1605d', '#feb078', '#fcfdbf'] },
  viridis: { stops: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
  candy: { stops: ['#ff9ad5', '#c39bff', '#8ec5ff', '#9fffe0', '#fff59a'], cyclic: true },
  gold: { stops: ['#0b0700', '#3d2600', '#8a5a00', '#d69a00', '#ffd75e', '#fff6d6'] },
  mono: { stops: ['#000000', '#ffffff'] },
};

export const PALETTE_NAMES = [...Object.keys(PALETTES), 'theme', 'theme-heat'];

/**
 * Fade a mark toward the theme background — the trail / afterglow idiom
 * (k = 0 → the background, 1 → the full color). Light on glass reads at a whisper;
 * ink on paper doesn't, so on light themes k is eased up (1 − (1 − k)²) and a
 * 20%-faded trail still shows. Use it instead of mix(theme.bg, color, k) for strokes.
 */
const linear = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const wcagLum = (c) => 0.2126 * linear(((c >> 16) & 255) / 255) + 0.7152 * linear(((c >> 8) & 255) / 255) + 0.0722 * linear((c & 255) / 255);
/** WCAG 2 contrast ratio of two packed colors (1..21). */
export function contrastRatio(a, b) {
  const x = wcagLum(a), y = wcagLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The nearest color to `c` (same Oklab hue and chroma, lightness moved away from
 * the background) that reaches `ratio`:1 contrast on the theme background.
 * Colors that already do are returned unchanged. For pastel art palettes drawn as
 * ink on a light page, or deep ones drawn as light on glass.
 */
export function legible(theme, c, ratio = 3) {
  const bg = theme.bg;
  if (c === NONE || bg === NONE || contrastRatio(c, bg) >= ratio) return c;
  const [L, A, B] = toOklab(c);
  const darker = wcagLum(bg) > 0.18; // light page → move toward ink
  let lo = darker ? 0 : L, hi = darker ? L : 1;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2, ok = contrastRatio(fromOklab([mid, A, B]), bg) >= ratio;
    if (darker) { if (ok) lo = mid; else hi = mid; } else if (ok) hi = mid; else lo = mid;
  }
  return fromOklab([darker ? lo : hi, A, B]);
}

export function fadeMark(theme, color, k) {
  const bg = theme.bg;
  if (theme.mode === 'light') k = 1 - (1 - k) * (1 - k);
  return bg === NONE ? color : mix(bg, color, k < 0 ? 0 : k > 1 ? 1 : k);
}

/**
 * Build a gradient function t → color.
 * @param {string|Array} name  palette name, or an explicit stop list
 * @param {object} theme       resolved theme (for 'theme' palettes and the spectrum's tier)
 */
export function palette(name = 'prism', theme = getTheme(), opts = {}) {
  if (Array.isArray(name)) return gradient(name, opts);
  if (name === 'theme') return gradient([theme.bg, theme.accent, theme.info, theme.pos, theme.warn, theme.crit], opts);
  if (name === 'theme-heat') return gradient([theme.bg, theme.info, theme.pos, theme.warn, theme.neg, theme.ink], opts);
  const p = PALETTES[name] || PALETTES.prism;
  const stops = p.light && theme && theme.mode === 'light' ? p.light : p.stops;
  return gradient(stops, { cyclic: !!p.cyclic, ...opts });
}
