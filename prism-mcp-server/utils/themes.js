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
  // JFH-33 chrome identity: shell font + 4-step corner-radius scale. A theme pack
  // overrides these so the whole shell (scrollbars, buttons, type) reskins per
  // design system, not just the facet tiles. Mode-invariant (Cloudscape Light does
  // not override them), so they live in the shared base for both modes.
  '--font': '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  '--r-sm': '4px', '--r-md': '8px', '--r-lg': '12px', '--r-xl': '16px',
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

// The complete Cloudscape token map for a given color mode. Theme-pack authoring
// (catalog/_scaffold_ds.mjs, F6) uses this as the base a sparse profile layers its
// brand overrides on, so even a profile that only sets --accent yields a full,
// coherent :root for that mode. 'light' → the AWS-console light palette; anything
// else → the dark base.
export function baseTokensFor(mode) {
  return mode === 'light' ? merge(CLOUDSCAPE_LIGHT_OVERRIDES) : { ...BASE_TOKENS };
}

// Full token map for a scaffolded pack's mode: the Cloudscape base for that mode
// with the pack's (sparse) brand overrides layered on. A pack entry only needs to
// declare the handful of tokens that differ (e.g. --accent), and this fills in a
// complete, coherent :root. Used by scaffolded THEMES entries below (F6).
export function packTokens(mode, over) { return { ...baseTokensFor(mode), ...(over || {}) }; }

// The canonical theme list. Each: {id,ds,dsName,name,mode,builtin,tokens,overrides}.
// ds = design-system family (mirrors THEME_REGISTRY[].ds in Prism.html); dsName =
// its display label. Theme packs are appended here by catalog/_scaffold_ds.mjs
// (F6) — the tool metadata below (id list, note, descriptions) derives from this
// array, so a scaffolded pack surfaces through the MCP with no further edits.
export const THEMES = [
  { id: 'cloudscape-dark', ds: 'cloudscape', dsName: 'Cloudscape', name: 'Cloudscape Dark', mode: 'dark', builtin: true, isDefault: true, tokens: merge({}) },
  { id: 'cloudscape-light', ds: 'cloudscape', dsName: 'Cloudscape', name: 'Cloudscape Light', mode: 'light', builtin: true, tokens: merge(CLOUDSCAPE_LIGHT_OVERRIDES) },
  { id: 'duolingo-dark', ds: 'duolingo', dsName: 'Duolingo', name: 'Duolingo Dark', mode: 'dark', builtin: false, tokens: packTokens('dark', {"--bg":"#131f24","--panel":"#202f36","--panel2":"#1b2a30","--card":"#202f36","--line":"#37464f","--ink":"#f1f7fb","--muted":"#a5b4bd","--dim":"#6b7c85","--accent":"#58cc02","--accent-rgb":"88,204,2","--accent2":"#58cc02","--info":"#1cb0f6","--info-rgb":"28,176,246","--pos":"#89e219","--pos-rgb":"137,226,25","--warn":"#ff9600","--warn-rgb":"255,150,0","--neg":"#ff4b4b","--neg-rgb":"255,75,75","--crit":"#ce82ff","--crit-rgb":"206,130,255","--cardgrad":"linear-gradient(157deg,rgba(88,204,2,.08),rgba(88,204,2,0) 55%)","--font":"ui-rounded, \"SF Pro Rounded\", \"Segoe UI\", system-ui, -apple-system, sans-serif","--r-sm":"8px","--r-md":"16px","--r-lg":"24px","--r-xl":"32px"}) },
  { id: 'duolingo-light', ds: 'duolingo', dsName: 'Duolingo', name: 'Duolingo Light', mode: 'light', builtin: false, tokens: packTokens('light', {"--bg":"#f7f7f7","--panel":"#ffffff","--panel2":"#fbfbfb","--card":"#ffffff","--line":"#e5e5e5","--ink":"#3c3c3c","--muted":"#777777","--dim":"#afafaf","--accent":"#58cc02","--accent-rgb":"88,204,2","--accent2":"#58cc02","--info":"#1cb0f6","--info-rgb":"28,176,246","--pos":"#89e219","--pos-rgb":"137,226,25","--warn":"#ff9600","--warn-rgb":"255,150,0","--neg":"#ff4b4b","--neg-rgb":"255,75,75","--crit":"#ce82ff","--crit-rgb":"206,130,255","--cardgrad":"linear-gradient(157deg,rgba(88,204,2,.06),rgba(88,204,2,0) 55%)","--font":"ui-rounded, \"SF Pro Rounded\", \"Segoe UI\", system-ui, -apple-system, sans-serif","--r-sm":"8px","--r-md":"16px","--r-lg":"24px","--r-xl":"32px"}) },
  { id: 'mailchimp-dark', ds: 'mailchimp', dsName: 'Mailchimp', name: 'Mailchimp Dark', mode: 'dark', builtin: false, tokens: packTokens('dark', {"--bg":"#241c15","--panel":"#302720","--panel2":"#2a221b","--card":"#302720","--line":"#463b30","--ink":"#f7f3ea","--muted":"#c2b6a4","--dim":"#8a7d6c","--accent":"#ffe01b","--accent-rgb":"255,224,27","--accent2":"#ffe01b","--info":"#3fb6c3","--info-rgb":"63,182,195","--pos":"#5cc95c","--pos-rgb":"92,201,92","--warn":"#ffab3f","--warn-rgb":"255,171,63","--neg":"#f0685a","--neg-rgb":"240,104,90","--crit":"#e069a0","--crit-rgb":"224,105,160","--cardgrad":"linear-gradient(157deg,rgba(255,224,27,.12),rgba(255,224,27,0) 55%)","--font":"Cooper, \"Cooper Black\", Rockwell, Georgia, \"Times New Roman\", serif","--r-sm":"3px","--r-md":"6px","--r-lg":"9px","--r-xl":"12px"}) },
  { id: 'mailchimp-light', ds: 'mailchimp', dsName: 'Mailchimp', name: 'Mailchimp Light', mode: 'light', builtin: false, tokens: packTokens('light', {"--bg":"#fbf9f4","--panel":"#ffffff","--panel2":"#f6f2e9","--card":"#ffffff","--line":"#e6e0d3","--ink":"#241c15","--muted":"#6b6357","--dim":"#a89f90","--accent":"#ffe01b","--accent-rgb":"255,224,27","--accent2":"#ffe01b","--info":"#007c89","--info-rgb":"0,124,137","--pos":"#3caa3c","--pos-rgb":"60,170,60","--warn":"#ff9d1c","--warn-rgb":"255,157,28","--neg":"#e0503f","--neg-rgb":"224,80,63","--crit":"#c8467c","--crit-rgb":"200,70,124","--cardgrad":"linear-gradient(157deg,rgba(255,224,27,.10),rgba(255,224,27,0) 55%)","--font":"Cooper, \"Cooper Black\", Rockwell, Georgia, \"Times New Roman\", serif","--r-sm":"3px","--r-md":"6px","--r-lg":"9px","--r-xl":"12px"}) },
  { id: 'stackoverflow-dark', ds: 'stackoverflow', dsName: 'Stack Overflow', name: 'Stack Overflow Dark', mode: 'dark', builtin: false, tokens: packTokens('dark', {"--bg":"#1e1e1e","--panel":"#2d2d2d","--panel2":"#262626","--card":"#2d2d2d","--line":"#3d3d3d","--ink":"#e7e8eb","--muted":"#9fa6ad","--dim":"#6e767d","--accent":"#f48024","--accent-rgb":"244,128,36","--accent2":"#f48024","--info":"#4aa3ff","--info-rgb":"74,163,255","--pos":"#5eba7d","--pos-rgb":"94,186,125","--warn":"#e3b341","--warn-rgb":"227,179,65","--neg":"#f4676c","--neg-rgb":"244,103,108","--crit":"#c264d6","--crit-rgb":"194,100,214","--cardgrad":"linear-gradient(157deg,rgba(244,128,36,.08),rgba(244,128,36,0) 55%)","--font":"-apple-system, \"Segoe UI\", system-ui, Roboto, Helvetica, Arial, sans-serif","--r-sm":"2px","--r-md":"4px","--r-lg":"6px","--r-xl":"8px"}) },
  { id: 'stackoverflow-light', ds: 'stackoverflow', dsName: 'Stack Overflow', name: 'Stack Overflow Light', mode: 'light', builtin: false, tokens: packTokens('light', {"--bg":"#f8f9f9","--panel":"#ffffff","--panel2":"#f1f2f3","--card":"#ffffff","--line":"#d6d9dc","--ink":"#232629","--muted":"#6a737c","--dim":"#9fa6ad","--accent":"#f48024","--accent-rgb":"244,128,36","--accent2":"#f48024","--info":"#0074cc","--info-rgb":"0,116,204","--pos":"#2f6f44","--pos-rgb":"47,111,68","--warn":"#b8860b","--warn-rgb":"184,134,11","--neg":"#d1383d","--neg-rgb":"209,56,61","--crit":"#9c2bad","--crit-rgb":"156,43,173","--cardgrad":"linear-gradient(157deg,rgba(244,128,36,.06),rgba(244,128,36,0) 55%)","--font":"-apple-system, \"Segoe UI\", system-ui, Roboto, Helvetica, Arial, sans-serif","--r-sm":"2px","--r-md":"4px","--r-lg":"6px","--r-xl":"8px"}) },
  { id: 'monzo-dark', ds: 'monzo', dsName: 'Monzo', name: 'Monzo Dark', mode: 'dark', builtin: false, tokens: packTokens('dark', {"--bg":"#06060a","--panel":"#14161c","--panel2":"#1c1f27","--card":"#14161c","--line":"#2a2e38","--ink":"#f4f5f7","--muted":"#a2a7b3","--dim":"#6b7280","--accent":"#ff4f40","--accent-rgb":"255,79,64","--accent2":"#ff4f40","--info":"#1fc7d6","--info-rgb":"31,199,214","--pos":"#6cc551","--pos-rgb":"108,197,81","--warn":"#ffc266","--warn-rgb":"255,194,102","--neg":"#f2555a","--neg-rgb":"242,85,90","--crit":"#b46ce6","--crit-rgb":"180,108,230","--cardgrad":"linear-gradient(157deg,rgba(255,79,64,.08),rgba(255,79,64,0) 55%)","--font":"\"Segoe UI\", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif","--r-sm":"6px","--r-md":"12px","--r-lg":"18px","--r-xl":"24px"}) },
  { id: 'monzo-light', ds: 'monzo', dsName: 'Monzo', name: 'Monzo Light', mode: 'light', builtin: false, tokens: packTokens('light', {"--bg":"#fafbfc","--panel":"#ffffff","--panel2":"#f2f4f8","--card":"#ffffff","--line":"#e6e9ef","--ink":"#14233c","--muted":"#6b7385","--dim":"#9aa2b1","--accent":"#ff4f40","--accent-rgb":"255,79,64","--accent2":"#ff4f40","--info":"#00a4b3","--info-rgb":"0,164,179","--pos":"#52b03a","--pos-rgb":"82,176,58","--warn":"#ffb74a","--warn-rgb":"255,183,74","--neg":"#e5484d","--neg-rgb":"229,72,77","--crit":"#9d4edd","--crit-rgb":"157,78,221","--cardgrad":"linear-gradient(157deg,rgba(255,79,64,.06),rgba(255,79,64,0) 55%)","--font":"\"Segoe UI\", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif","--r-sm":"6px","--r-md":"12px","--r-lg":"18px","--r-xl":"24px"}) },
  { id: 'heroku-dark', ds: 'heroku', dsName: 'Heroku', name: 'Heroku Dark', mode: 'dark', builtin: false, tokens: packTokens('dark', {"--bg":"#1a1523","--panel":"#2a2338","--panel2":"#201a2b","--card":"#2a2338","--line":"#3a3350","--ink":"#f2eef8","--muted":"#b0a6c2","--dim":"#7a7090","--accent":"#79589f","--accent-rgb":"121,88,159","--accent2":"#79589f","--info":"#8b96e2","--info-rgb":"139,150,226","--pos":"#56c483","--pos-rgb":"86,196,131","--warn":"#edb455","--warn-rgb":"237,180,85","--neg":"#e26075","--neg-rgb":"226,96,117","--crit":"#cc63b3","--crit-rgb":"204,99,179","--cardgrad":"linear-gradient(157deg,rgba(121,88,159,.08),rgba(121,88,159,0) 55%)","--font":"\"Segoe UI\", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif","--r-sm":"4px","--r-md":"8px","--r-lg":"12px","--r-xl":"16px"}) },
  { id: 'heroku-light', ds: 'heroku', dsName: 'Heroku', name: 'Heroku Light', mode: 'light', builtin: false, tokens: packTokens('light', {"--bg":"#faf9fc","--panel":"#ffffff","--panel2":"#f4f1f9","--card":"#ffffff","--line":"#e4e0ec","--ink":"#2a2734","--muted":"#6f6a7d","--dim":"#a49db3","--accent":"#79589f","--accent-rgb":"121,88,159","--accent2":"#79589f","--info":"#6f7bd6","--info-rgb":"111,123,214","--pos":"#3fae6b","--pos-rgb":"63,174,107","--warn":"#e0a13a","--warn-rgb":"224,161,58","--neg":"#d0455f","--neg-rgb":"208,69,95","--crit":"#b5479f","--crit-rgb":"181,71,159","--cardgrad":"linear-gradient(157deg,rgba(121,88,159,.06),rgba(121,88,159,0) 55%)","--font":"\"Segoe UI\", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif","--r-sm":"4px","--r-md":"8px","--r-lg":"12px","--r-xl":"16px"}) },
  { id: 'polaris-dark', ds: 'polaris', dsName: 'Shopify Polaris', name: 'Shopify Polaris Dark', mode: 'dark', builtin: false, tokens: packTokens('dark', {"--bg":"#0b0c0d","--panel":"#202223","--panel2":"#1a1c1d","--card":"#202223","--line":"#3f4246","--ink":"#e3e5e7","--muted":"#999fa4","--dim":"#71767a","--accent":"#008060","--accent-rgb":"0,128,96","--accent2":"#008060","--info":"#4b9bff","--info-rgb":"75,155,255","--pos":"#4ade80","--pos-rgb":"74,222,128","--warn":"#e6b800","--warn-rgb":"230,184,0","--neg":"#ff6b52","--neg-rgb":"255,107,82","--crit":"#ff5470","--crit-rgb":"255,84,112","--cardgrad":"linear-gradient(157deg,rgba(0,128,96,.08),rgba(0,128,96,0) 55%)","--font":"-apple-system, \"Segoe UI\", system-ui, Roboto, Helvetica, Arial, sans-serif","--r-sm":"4px","--r-md":"8px","--r-lg":"12px","--r-xl":"16px"}) },
  { id: 'polaris-light', ds: 'polaris', dsName: 'Shopify Polaris', name: 'Shopify Polaris Light', mode: 'light', builtin: false, tokens: packTokens('light', {"--bg":"#f6f6f7","--panel":"#ffffff","--panel2":"#fafbfb","--card":"#ffffff","--line":"#e1e3e5","--ink":"#202223","--muted":"#6d7175","--dim":"#8c9196","--accent":"#008060","--accent-rgb":"0,128,96","--accent2":"#008060","--info":"#2c6ecb","--info-rgb":"44,110,203","--pos":"#007f5f","--pos-rgb":"0,127,95","--warn":"#b98900","--warn-rgb":"185,137,0","--neg":"#d72c0d","--neg-rgb":"215,44,13","--crit":"#bf0711","--crit-rgb":"191,7,17","--cardgrad":"linear-gradient(157deg,rgba(0,128,96,.06),rgba(0,128,96,0) 55%)","--font":"-apple-system, \"Segoe UI\", system-ui, Roboto, Helvetica, Arial, sans-serif","--r-sm":"4px","--r-md":"8px","--r-lg":"12px","--r-xl":"16px"}) },
  // ▼ scaffolded theme packs (F6) — do not hand-edit; see catalog/_scaffold_ds.mjs
].map((t) => ({ ...t, overrides: diff(t.tokens) }));

// The out-of-the-box theme for a fresh visitor (mirrors DEFAULT_THEME in Prism.html).
export const DEFAULT_THEME_ID = 'cloudscape-dark';

export const THEME_IDS = THEMES.map((t) => t.id);

/** Comma-joined theme-id list, marking the default — for tool descriptions.
 *  e.g. "cloudscape-dark (default), cloudscape-light". */
export function themeIdList() {
  return THEMES.map((t) => t.id + (t.isDefault ? ' (default)' : '')).join(', ');
}

/** One-line human summary of the shipped design systems + their color modes,
 *  grouped by ds. Derived from THEMES so it self-updates as packs are scaffolded.
 *  e.g. "Prism ships 1 design system as pure :root token overrides: Cloudscape
 *  (cloudscape-dark [default], cloudscape-light)." */
export function themesSummary() {
  const bySystem = new Map();
  for (const t of THEMES) {
    if (!bySystem.has(t.ds)) bySystem.set(t.ds, { name: t.dsName || t.ds, modes: [] });
    bySystem.get(t.ds).modes.push(t.id + (t.isDefault ? ' [default]' : ''));
  }
  const parts = [...bySystem.values()].map((s) => `${s.name} (${s.modes.join(', ')})`);
  const n = bySystem.size;
  return `Prism ships ${n} design system${n === 1 ? '' : 's'} as pure :root token overrides over identical component HTML/CSS: ${parts.join('; ')}.`;
}
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
