// Prism theme token maps (JFH-9 — Component Variant Matrix support).
//
// Prism's theming is 100% CSS-token based: a theme is a `:root{ --token:… }`
// override applied over identical component HTML/CSS. A "variant" is therefore
// the same component under a different token set — never a separate payload.
// This module is the MCP-side single source of truth for those token maps,
// mirroring window.PrismShell.themeMatrix() in Prism.html. Built-in override
// values are transcribed from the THEMES object; light/dark are compiled from a
// palette with the SAME compiler the app's custom themes use (compilePalette).

// The Prism default :root — the base every theme layers over (prism == empty).
export const BASE_TOKENS = {
  '--bg': '#0b0e17', '--panel': '#121623', '--panel2': '#171d2e', '--card': '#141b2b', '--line': '#243049',
  '--ink': '#eaf1f9', '--muted': '#8593a8', '--dim': '#5b6678', '--accent': '#ff9900', '--accent2': '#4493f8',
  '--pos': '#3fb950', '--pos-rgb': '63,185,80', '--neg': '#f85149', '--neg-rgb': '248,81,73',
  '--warn': '#e0a52b', '--warn-rgb': '224,165,43', '--info': '#4493f8', '--info-rgb': '68,147,248',
  '--crit': '#c879ff', '--crit-rgb': '200,121,255', '--accent-rgb': '255,153,0',
  '--cardgrad': 'linear-gradient(157deg,rgba(255,255,255,.05),rgba(255,255,255,0) 55%)',
};

// Built-in theme overrides (only the tokens each theme changes), from THEMES.
const OLED_OVERRIDES = {
  '--bg': '#000000', '--panel': '#070707', '--panel2': '#0d0d0f', '--card': '#0a0a0c', '--line': '#1c1c22',
  '--ink': '#ffffff', '--muted': '#9aa0ad', '--dim': '#5e636e',
  '--accent': '#ffb300', '--accent-rgb': '255,179,0',
  '--crit': '#d96bff', '--crit-rgb': '217,107,255',
  '--neg': '#ff4d4d', '--neg-rgb': '255,77,77',
  '--warn': '#ffc400', '--warn-rgb': '255,196,0',
  '--pos': '#00e676', '--pos-rgb': '0,230,118',
  '--info': '#00e5ff', '--info-rgb': '0,229,255',
  '--cardgrad': 'linear-gradient(157deg,rgba(255,255,255,.07),rgba(255,255,255,0) 55%)',
};
const CYBERPUNK_OVERRIDES = {
  '--bg': '#0d0221', '--panel': '#170a33', '--panel2': '#1f0e44', '--card': '#190b3a', '--line': '#3a2170',
  '--ink': '#f7f0ff', '--muted': '#b39ddb', '--dim': '#7a5fb0',
  '--accent': '#fee600', '--accent-rgb': '254,230,0',
  '--crit': '#ff00a0', '--crit-rgb': '255,0,160',
  '--neg': '#ff2d6f', '--neg-rgb': '255,45,111',
  '--warn': '#ffae00', '--warn-rgb': '255,174,0',
  '--pos': '#00ffc6', '--pos-rgb': '0,255,198',
  '--info': '#00f0ff', '--info-rgb': '0,240,255',
  '--cardgrad': 'linear-gradient(157deg,rgba(255,0,160,.10),rgba(0,240,255,.04) 55%)',
};

// --- colour math (mirrors compilePalette() in Prism.html) ---
function hx(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/(.)/g, '$1$1'); const n = parseInt(h, 16) || 0; return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(h) { const c = hx(h); return `${c.r},${c.g},${c.b}`; }
function toHex(n) { n = Math.max(0, Math.min(255, Math.round(n))); return n.toString(16).padStart(2, '0'); }
function mix(a, b, t) { const x = hx(a), y = hx(b); return '#' + toHex(x.r + (y.r - x.r) * t) + toHex(x.g + (y.g - x.g) * t) + toHex(x.b + (y.b - x.b) * t); }

// Compile a 10-token palette into the full token override set (== compilePalette).
export function compilePalette(p) {
  const panel2 = mix(p.panel, '#ffffff', 0.06), card = mix(p.panel, '#000000', 0.10),
    line = mix(p.panel, '#ffffff', 0.16), dim = mix(p.muted, p.bg, 0.45);
  return {
    '--bg': p.bg, '--panel': p.panel, '--panel2': panel2, '--card': card, '--line': line,
    '--ink': p.ink, '--muted': p.muted, '--dim': dim,
    '--accent': p.accent, '--accent-rgb': rgbStr(p.accent), '--accent2': p.info,
    '--crit': p.crit, '--crit-rgb': rgbStr(p.crit),
    '--neg': p.neg, '--neg-rgb': rgbStr(p.neg),
    '--warn': p.warn, '--warn-rgb': rgbStr(p.warn),
    '--pos': p.pos, '--pos-rgb': rgbStr(p.pos),
    '--info': p.info, '--info-rgb': rgbStr(p.info),
    '--cardgrad': 'linear-gradient(157deg,rgba(255,255,255,.05),rgba(255,255,255,0) 55%)',
  };
}

const LIGHT_PALETTE = { bg: '#f4f6fb', panel: '#ffffff', ink: '#161b26', muted: '#5a6474', accent: '#ff9900', info: '#1a73e8', pos: '#1e8e3e', warn: '#b06a00', neg: '#d93025', crit: '#8a3ffc' };
const DARK_PALETTE = { bg: '#0a0a0c', panel: '#141418', ink: '#f2f4f8', muted: '#8a909c', accent: '#7aa2ff', info: '#4493f8', pos: '#3fb950', warn: '#e0a52b', neg: '#f85149', crit: '#c879ff' };

function merge(over) { return { ...BASE_TOKENS, ...over }; }
function diff(tokens) { const d = {}; for (const k in tokens) if (tokens[k] !== BASE_TOKENS[k]) d[k] = tokens[k]; return d; }

// The canonical theme list. Each: {id,name,mode,builtin,tokens,overrides}.
export const THEMES = [
  { id: 'prism-dark', name: 'Prism', mode: 'dark', builtin: true, tokens: merge({}) },
  { id: 'oled-dark', name: 'OLED', mode: 'dark', builtin: true, tokens: merge(OLED_OVERRIDES) },
  { id: 'cyberpunk-dark', name: 'Cyberpunk', mode: 'dark', builtin: true, tokens: merge(CYBERPUNK_OVERRIDES) },
  { id: 'light', name: 'Light', mode: 'light', builtin: false, tokens: merge(compilePalette(LIGHT_PALETTE)) },
  { id: 'dark', name: 'Dark', mode: 'dark', builtin: false, tokens: merge(compilePalette(DARK_PALETTE)) },
].map((t) => ({ ...t, overrides: diff(t.tokens) }));

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
