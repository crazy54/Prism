// Shared helpers for widgets: theme-aware color resolution, gradients from
// "anything", compact number formatting, and the sub-cell block glyph tables.

import { getTheme, palette as makePalette, PALETTES } from '../palettes.js';
import { parse, gradient, NONE, luminance, mix } from '../color.js';
import { stringWidth, truncate } from '../width.js';

/** Left-anchored partial blocks, index = eighths filled (0..8). */
export const LEFT_EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
/** Bottom-anchored partial blocks, index = eighths filled (0..8). */
export const LOWER_EIGHTHS = ['', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

const ALIASES = {
  ok: 'pos', good: 'pos', success: 'pos', healthy: 'pos',
  error: 'neg', bad: 'neg', danger: 'neg', fail: 'neg',
  warning: 'warn', critical: 'crit', text: 'ink', fg: 'ink', border: 'line',
};

export const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);

/** Resolve opts.theme (id, resolved object, or undefined → default). */
export const themeOf = (opts) => getTheme(opts && opts.theme);

/**
 * Resolve a color spec against a theme: packed int, theme token name
 * ('accent', 'neg', 'muted', …, plus aliases like 'ok'/'error'), any color
 * string color.parse() accepts, or undefined/null → `fallback`.
 */
export function col(v, theme, fallback = NONE) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'number') return v;
  const s = String(v);
  const key = ALIASES[s] || s;
  if (theme && typeof theme[key] === 'number') return theme[key];
  try { return parse(s); } catch { return fallback; }
}

/**
 * Resolve a gradient spec to a function t∈[0,1] → color: a function (used
 * as-is), a stop list, a palette name, or a single color (constant).
 */
export function grad(g, theme, fallback) {
  if (typeof g === 'function') return g;
  if (Array.isArray(g)) {
    return gradient(g.map((c) => (Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' ? [c[0], col(c[1], theme, 0)] : col(c, theme, 0))));
  }
  if (typeof g === 'string' && (g in PALETTES || g === 'theme' || g === 'theme-heat')) return makePalette(g, theme);
  const c = col(g, theme, fallback);
  return () => c;
}

/** Readable text color (near-black or white) for a given background. */
export const contrast = (bg) => (bg !== NONE && luminance(bg) > 0.55 ? 0x111418 : 0xffffff);

/** Soft tint of `c` over the theme background (for "soft" badges, fills). */
export const tint = (c, theme, k = 0.22) => mix(theme.bg, c, k);

/** Compact number: 1234 → 1.2k, 0.0312 → 0.031, 12 → 12. */
export function fmt(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (typeof v !== 'number') return String(v);
  const a = Math.abs(v);
  const trim = (s) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
  if (a >= 1e12) return trim((v / 1e12).toFixed(digits)) + 'T';
  if (a >= 1e9) return trim((v / 1e9).toFixed(digits)) + 'B';
  if (a >= 1e6) return trim((v / 1e6).toFixed(digits)) + 'M';
  if (a >= 1e4) return trim((v / 1e3).toFixed(digits)) + 'k';
  if (Number.isInteger(v)) return String(v);
  if (a >= 100) return trim(v.toFixed(0));
  if (a >= 10) return trim(v.toFixed(1));
  if (a >= 1) return trim(v.toFixed(2));
  return trim(v.toPrecision(2));
}

/** Human duration from seconds: 0.4s, 12.3s, 4m05s, 2h10m. */
export function fmtDuration(s) {
  if (!Number.isFinite(s) || s < 0) return '–';
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

/**
 * Fit text into `width` columns with alignment. Returns { text, offset } where
 * offset is the column (relative to the slot) the text starts at.
 */
export function align(text, width, how = 'left') {
  const s = truncate(String(text), Math.max(0, width));
  const w = stringWidth(s);
  const offset = how === 'right' ? width - w : how === 'center' ? Math.floor((width - w) / 2) : 0;
  return { text: s, offset: Math.max(0, offset), width: w };
}

/** Color for a fraction f given [[threshold, color], …] zones over a base color. */
export function zoneColor(f, thresholds, theme, base) {
  let c = base;
  for (const [th, zc] of thresholds) if (f >= th) c = col(zc, theme, c);
  return c;
}

export const DEFAULT_ZONES = [[0.7, 'warn'], [0.9, 'neg']];

/** Series color cycle used when a chart's series don't specify colors. */
export const seriesColors = (theme) => [theme.accent, theme.pos, theme.warn, theme.crit, theme.neg, theme.info, theme.ink];

/** Min/max over finite numbers, with a fallback range. */
export function extent(values, min, max) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (min !== undefined && min !== null) lo = min;
  if (max !== undefined && max !== null) hi = max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  return [lo, hi];
}

// 4×4 ordered-dither thresholds (0,1).
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];
