// Theme registry. Themes live in src/themes/<id>.js (one per file; "_" files are
// helpers). The module list is a generated static manifest (src/themes/_manifest.js —
// `npm run facets:manifest` writes it with the facet manifest), so the registry works
// in Node, the plugin and the browser without filesystem scanning.

import { THEME_MODULES } from './_manifest.js';

export const DEFAULT_THEME = 'prism';
let cache = null;

/** { themes: Map(id → theme), problems: [] } */
export function themeRegistry() {
  if (cache) return cache;
  const themes = new Map(), problems = [];
  for (const [file, mod] of THEME_MODULES) {
    const t = mod.default;
    if (!t || typeof t.resolve !== 'function') { problems.push(`${file}: default export must be defineTheme({...})`); continue; }
    if (`${t.id}.js` !== file) problems.push(`${file}: theme id "${t.id}" must match its file name`);
    if (themes.has(t.id)) problems.push(`duplicate theme id "${t.id}"`);
    themes.set(t.id, t);
  }
  cache = { themes, problems };
  return cache;
}

export const allThemes = () => [...themeRegistry().themes.values()];
export const THEME_IDS = () => [...themeRegistry().themes.keys()];

/**
 * A theme instance for rendering: the theme's painters + resolved colors for a mode.
 * id may be 'prism', 'prism:light', or a theme object; unknown ids fall back to the default.
 */
export function useTheme(id = DEFAULT_THEME, mode) {
  let t = id, m = mode;
  if (typeof id === 'string') {
    const [name, md] = id.split(':');
    m = m || md;
    t = themeRegistry().themes.get(name) || themeRegistry().themes.get(DEFAULT_THEME) || allThemes()[0];
  }
  if (!t) throw new Error('no themes registered');
  return Object.freeze({ ...t, ...t.resolve(m) });
}
