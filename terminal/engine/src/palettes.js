// Themes and gradient palettes.
//
// Themes are Prism's design-system token sets (synced from the Prism theme
// registry — see scripts/sync-themes.mjs), resolved to packed colors so scenes
// and widgets can say `theme.accent` / `theme.neg` and reskin with --theme.
//
// Palettes are named gradients for fields and particles. Two are derived from
// the active theme ('theme' and 'theme-heat') so effects can match a design
// system instead of using the stock looks.

import { THEME_DATA, DEFAULT_THEME_ID } from './themes.js';
import { parse, gradient } from './color.js';

const THEME_KEYS = ['bg', 'panel', 'panel2', 'card', 'line', 'ink', 'muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit'];
const BY_ID = new Map(THEME_DATA.map((t) => [t.id, t]));

export const THEME_IDS = THEME_DATA.map((t) => t.id);
export { DEFAULT_THEME_ID };

/**
 * Resolve a theme by id (or a design-system name like 'primer', which picks its
 * dark variant). Unknown ids fall back to the default. Returns packed colors
 * plus { id, name, mode }.
 */
export function getTheme(id = DEFAULT_THEME_ID) {
  if (id && typeof id === 'object') return id; // already resolved
  let t = BY_ID.get(id) || BY_ID.get(`${id}-dark`) || BY_ID.get(DEFAULT_THEME_ID);
  const out = { id: t.id, name: t.name, ds: t.ds, mode: t.mode };
  for (const k of THEME_KEYS) out[k] = parse(t[k]);
  return out;
}

export function listThemes() {
  return THEME_DATA.map((t) => ({ id: t.id, name: t.name, mode: t.mode, accent: t.accent }));
}

export const PALETTES = {
  prism: { stops: ['#ff3b6b', '#ff9f1c', '#ffe14d', '#3ddc84', '#2ec5ff', '#7a5cff', '#ff3bd4'], cyclic: true },
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
 * Build a gradient function t → color.
 * @param {string|Array} name  palette name, or an explicit stop list
 * @param {object} theme       resolved theme (for 'theme' palettes)
 */
export function palette(name = 'prism', theme = getTheme(), opts = {}) {
  if (Array.isArray(name)) return gradient(name, opts);
  if (name === 'theme') return gradient([theme.bg, theme.accent, theme.info, theme.pos, theme.warn, theme.crit], opts);
  if (name === 'theme-heat') return gradient([theme.bg, theme.info, theme.pos, theme.warn, theme.neg, theme.ink], opts);
  const p = PALETTES[name] || PALETTES.prism;
  return gradient(p.stops, { cyclic: !!p.cyclic, ...opts });
}
