// Prism theme token maps (JFH-9 — Component Variant Matrix support).
//
// Prism's theming is 100% CSS-token based: a theme is a `:root{ --token:… }`
// override applied over identical component HTML/CSS. A "variant" is therefore
// the same component under a different token set — never a separate payload.
// This module is the MCP-side single source of truth for those token maps,
// mirroring window.PrismShell.themeMatrix() in Prism.html.
//
// JFH-13: Cloudscape is Prism's only design system, shipping in exactly two
// color modes — Cloudscape Dark (the default) and Cloudscape Light. Dark is the
// BASE every gallery starts from; light is expressed as overrides vs that base.
// The old Prism/OLED/Cyberpunk themes and the custom-palette compiler are gone.
// Values are transcribed from the `:root{…}` block of each theme in the app's
// THEMES object. The bespoke shell-chrome CSS each theme ships alongside its
// tokens is not part of the token map and is intentionally omitted here (this
// mirror models `:root` tokens only).

// The base every theme layers over: Cloudscape Dark's :root tokens. Dark is the
// default, so its override set is empty (it IS the base) — matching the app,
// where themeMatrix() uses THEMES['cloudscape-dark'] as the base.
export const BASE_TOKENS = {
  '--bg': '#0f1621', '--panel': '#192534', '--panel2': '#232f3e', '--card': '#1a2633', '--line': '#354150',
  '--ink': '#e9ebed', '--muted': '#a4b0c0', '--dim': '#6b7887',
  '--accent': '#539fe5', '--accent-rgb': '83,159,229', '--accent2': '#539fe5',
  '--info': '#539fe5', '--info-rgb': '83,159,229',
  '--pos': '#37c26b', '--pos-rgb': '55,194,107',
  '--warn': '#f5b74e', '--warn-rgb': '245,183,78',
  '--neg': '#eb6f6f', '--neg-rgb': '235,111,111',
  '--crit': '#c471ff', '--crit-rgb': '196,113,255',
  '--cardgrad': 'linear-gradient(157deg,rgba(255,255,255,.05),rgba(255,255,255,0) 55%)',
};

// Cloudscape Light — the AWS-console light palette, as overrides vs the dark base.
const CLOUDSCAPE_LIGHT_OVERRIDES = {
  '--bg': '#f2f3f3', '--panel': '#ffffff', '--panel2': '#fafafa', '--card': '#ffffff', '--line': '#d5dbdb',
  '--ink': '#16191f', '--muted': '#5f6b7a', '--dim': '#8d99a8',
  '--accent': '#0972d3', '--accent-rgb': '9,114,211', '--accent2': '#0972d3',
  '--info': '#0972d3', '--info-rgb': '9,114,211',
  '--pos': '#037f0c', '--pos-rgb': '3,127,12',
  '--warn': '#e07400', '--warn-rgb': '224,116,0',
  '--neg': '#d91515', '--neg-rgb': '217,21,21',
  '--crit': '#8b5cf6', '--crit-rgb': '139,92,246',
  '--cardgrad': 'linear-gradient(157deg,rgba(0,0,0,.02),rgba(0,0,0,0) 55%)',
};

function merge(over) { return { ...BASE_TOKENS, ...over }; }
function diff(tokens) { const d = {}; for (const k in tokens) if (tokens[k] !== BASE_TOKENS[k]) d[k] = tokens[k]; return d; }

// The canonical theme list. Each: {id,name,mode,builtin,tokens,overrides}.
export const THEMES = [
  { id: 'cloudscape-dark', name: 'Cloudscape Dark', mode: 'dark', builtin: true, isDefault: true, tokens: merge({}) },
  { id: 'cloudscape-light', name: 'Cloudscape Light', mode: 'light', builtin: true, tokens: merge(CLOUDSCAPE_LIGHT_OVERRIDES) },
].map((t) => ({ ...t, overrides: diff(t.tokens) }));

// The out-of-the-box theme for a fresh visitor (mirrors DEFAULT_THEME in Prism.html).
export const DEFAULT_THEME_ID = 'cloudscape-dark';

export const THEME_IDS = THEMES.map((t) => t.id);
const THEME_BY_ID = new Map(THEMES.map((t) => [t.id, t]));
export function getTheme(id) { return THEME_BY_ID.get(id) || null; }

export const TOKEN_META = [
  { k: '--bg', label: 'Background', desc: 'Page base' },
  { k: '--panel', label: 'Panel', desc: 'Cards & surfaces' },
  { k: '--ink', label: 'Text', desc: 'Primary text' },
  { k: '--muted', label: 'Muted', desc: 'Secondary text' },
  { k: '--accent', label: 'Accent', desc: 'Brand / primary' },
  { k: '--info', label: 'Info', desc: 'Links / secondary' },
  { k: '--pos', label: 'Positive', desc: 'Success' },
  { k: '--warn', label: 'Warning', desc: 'Caution' },
  { k: '--neg', label: 'Negative', desc: 'Danger' },
  { k: '--crit', label: 'Critical', desc: 'Special / peak' },
];

const TOKEN_KEYS = Object.keys(BASE_TOKENS);

/** Which theme tokens an effect consumes directly via var(--x). */
export function usesTokens(effect) {
  const surface = `${effect.html || ''}\n${effect.css || ''}`;
  const found = new Set();
  const re = /var\(\s*(--[a-z0-9-]+)/gi;
  let m;
  while ((m = re.exec(surface)) !== null) found.add(m[1]);
  return TOKEN_KEYS.filter((k) => found.has(k));
}

/** Render an effect's :root override block for one theme (full CSS string). */
export function themeRootCss(themeId) {
  const t = getTheme(themeId);
  if (!t) return '';
  let s = `:root{ /* ${t.name} */\n`;
  for (const k of Object.keys(t.tokens)) s += `  ${k}: ${t.tokens[k]};\n`;
  return s + '}';
}

/** Is an effect theme-sensitive (renders differently per theme)? */
export function isThemeSensitive(effect) {
  return usesTokens(effect).length > 0 || /class\s*=/.test(effect.html || '');
}
