/* ============================================================================
   Prism Component Variant Matrix — variants.json generator (JFH-9)
   ----------------------------------------------------------------------------
   Prism's theming is 100% CSS-token based: every theme is a `:root{ --token:… }`
   override block applied over identical component HTML/CSS (see THEMES + the
   applyTheme() engine in Prism.html, and compilePalette() for custom themes).
   A "variant" is therefore the SAME component under a different token set — NOT
   a separate HTML/CSS payload. Storing N full copies per effect would multiply
   the 7.7MB single-file gallery for zero rendering benefit, so this catalog
   stores each theme's token map ONCE plus a per-effect theme-sensitivity signal.
   The UI + MCP render variants live by swapping tokens.

   Reads:  Prism.html  (the #prism-catalog island + the THEMES object + base :root)
   Writes: catalog/variants.json
   Run:    node catalog/build-variants.mjs
   No headless Chrome, no deps — pure text + JSON parsing.
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRISM = resolve(HERE, '../Prism.html');
const OUT = resolve(HERE, 'variants.json');

const html = readFileSync(PRISM, 'utf8');

/* ---- 1) the effect catalog (authoritative island) ---------------------- */
const island = html.match(/<script type="application\/json" id="prism-catalog">([\s\S]*?)<\/script>/);
if (!island) { console.error('FATAL: #prism-catalog island not found'); process.exit(1); }
let catalog;
try { catalog = JSON.parse(island[1].split('<\\/script').join('</script')); }
catch (e) { console.error('FATAL: island JSON parse failed:', e.message); process.exit(1); }
const effects = catalog.effects || [];

/* ---- 2) token maps -------------------------------------------------------
   The base tokens are the default :root that lives in each page (we read it
   from the charts page). Built-in themes (oled/cyberpunk) are :root override
   strings in the THEMES object; `prism` is empty (== base). We also synthesize
   a Light and a neutral Dark theme from the same palette shape compilePalette()
   uses, so the matrix ships the ticket's "+ light/dark defaults".            */

// Parse `--key:value;` pairs out of the FIRST :root{...} block in a CSS string.
function parseRoot(css) {
  const out = {};
  if (!css) return out;
  const m = css.match(/:root\s*\{([^}]*)\}/);
  if (!m) return out;
  m[1].split(';').forEach(decl => {
    const i = decl.indexOf(':');
    if (i === -1) return;
    const k = decl.slice(0, i).trim();
    const v = decl.slice(i + 1).trim();
    if (k.slice(0, 2) === '--' && v) out[k] = v;
  });
  return out;
}

// base :root (prism defaults) — read from the charts page template.
const chartsStart = html.indexOf('<script type="text/html" id="pg-charts">');
const chartsChunk = html.slice(chartsStart, chartsStart + 60000);
const BASE = parseRoot(chartsChunk);
if (!BASE['--accent']) { console.error('FATAL: base :root tokens not found'); process.exit(1); }

// THEMES object — each built-in value is a run of '+'-concatenated JS string
// literals spanning many lines, so the :root{…} block is NOT in a single
// literal. Isolate the value region between a theme key and the next boundary,
// concatenate its quoted string pieces back into one CSS string, then parse.
const themesStart = html.indexOf('var THEMES={');
const themesEnd = html.indexOf('\n  };', themesStart);
if (themesStart === -1 || themesEnd === -1) { console.error('FATAL: THEMES object not found'); process.exit(1); }
const themesSrc = html.slice(themesStart, themesEnd);
function themeCss(name, nextName) {
  const startKey = themesSrc.indexOf('\n    ' + name + ':');
  if (startKey === -1) return '';
  const endKey = nextName ? themesSrc.indexOf('\n    ' + nextName + ':', startKey) : themesSrc.length;
  const region = themesSrc.slice(startKey, endKey === -1 ? themesSrc.length : endKey);
  // join the contents of every single-quoted literal (theme CSS has no apostrophes)
  let css = '', m; const re = /'([^']*)'/g;
  while ((m = re.exec(region)) !== null) css += m[1];
  return css;
}
const oledOverrides = parseRoot(themeCss('oled', 'cyberpunk'));
const cyberOverrides = parseRoot(themeCss('cyberpunk', null));
if (!oledOverrides['--accent'] || !cyberOverrides['--accent']) {
  console.error('FATAL: could not parse THEMES oled/cyberpunk token blocks'); process.exit(1);
}

/* --- tiny colour math (mirrors compilePalette in Prism.html) --- */
function hx(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/(.)/g, '$1$1'); const n = parseInt(h, 16) || 0; return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function rgbStr(h) { const c = hx(h); return c.r + ',' + c.g + ',' + c.b; }
function toHex(n) { n = Math.max(0, Math.min(255, Math.round(n))); return n.toString(16).padStart(2, '0'); }
function mix(a, b, t) { const x = hx(a), y = hx(b); return '#' + toHex(x.r + (y.r - x.r) * t) + toHex(x.g + (y.g - x.g) * t) + toHex(x.b + (y.b - x.b) * t); }

// Compile a 10-token palette into the same full token set the app uses.
function compile(p) {
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

// Merge base + overrides into a complete token map for a theme.
function full(overrides) { return { ...BASE, ...overrides }; }
// Overrides-vs-base diff (what the theme actually changes) — documents each variant.
function diff(tokens) {
  const d = {};
  for (const k in tokens) if (tokens[k] !== BASE[k]) d[k] = tokens[k];
  return d;
}

const lightTokens = compile(LIGHT_PALETTE), darkTokens = compile(DARK_PALETTE);
const THEMES = [
  { id: 'prism-dark', name: 'Prism', mode: 'dark', builtin: true, base: true, tokens: full({}) },
  { id: 'oled-dark', name: 'OLED', mode: 'dark', builtin: true, tokens: full(oledOverrides) },
  { id: 'cyberpunk-dark', name: 'Cyberpunk', mode: 'dark', builtin: true, tokens: full(cyberOverrides) },
  { id: 'light', name: 'Light', mode: 'light', builtin: false, tokens: { ...BASE, ...lightTokens } },
  { id: 'dark', name: 'Dark', mode: 'dark', builtin: false, tokens: { ...BASE, ...darkTokens } },
].map(t => ({ ...t, overrides: diff(t.tokens) }));

/* ---- 3) per-effect theme-sensitivity ------------------------------------
   Which theme tokens does an effect actually consume? Scan its html + css for
   direct var(--token) refs, and whether it relies on gallery classes (which
   themselves reference tokens). themeSensitive => rendering differs by theme. */
const TOKEN_KEYS = Object.keys(BASE);
const varRe = /var\(\s*(--[a-z0-9-]+)/gi;
function scanTokens(text) {
  const set = new Set(); let m;
  while ((m = varRe.exec(text)) !== null) set.add(m[1]);
  return set;
}
const outEffects = effects.map(e => {
  const surface = (e.html || '') + '\n' + (e.css || '');
  const direct = scanTokens(surface);
  const usesTokens = TOKEN_KEYS.filter(k => direct.has(k));
  const usesClasses = /class\s*=/.test(e.html || '');
  // sensitive if it paints with any theme token directly, or leans on themed
  // gallery classes (both re-skin under a token swap).
  const themeSensitive = usesTokens.length > 0 || usesClasses;
  return {
    id: e.id,
    gallery: e.gallery,
    name: e.name,
    componentType: e.componentType || '',
    spectrum: e.spectrum || '',
    themeSensitive,
    usesTokens,             // direct var(--x) references
    usesThemedClasses: usesClasses && usesTokens.length === 0,
    variantCount: THEMES.length,
  };
});

/* ---- 4) stats + write ---------------------------------------------------- */
const sensitive = outEffects.filter(e => e.themeSensitive).length;
const directOnly = outEffects.filter(e => e.usesTokens.length > 0).length;
const tokenFreq = {};
outEffects.forEach(e => e.usesTokens.forEach(t => { tokenFreq[t] = (tokenFreq[t] || 0) + 1; }));

const doc = {
  schemaVersion: 1,
  generated: null,               // stamped by the caller / commit; Date.* is intentionally not used here
  source: 'Prism.html #prism-catalog + THEMES',
  note: 'Variants are token-swaps over identical component HTML/CSS. Render = base html+css + chosen theme tokens.',
  themeCount: THEMES.length,
  effectCount: outEffects.length,
  tokenMeta: [
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
  ],
  base: BASE,
  themes: THEMES,
  stats: {
    themeSensitive: sensitive,
    directTokenRefs: directOnly,
    classDriven: outEffects.filter(e => e.usesThemedClasses).length,
    topTokens: Object.entries(tokenFreq).sort((a, b) => b[1] - a[1]).slice(0, 10),
  },
  effects: outEffects,
};

writeFileSync(OUT, JSON.stringify(doc, null, 0));
console.log('variants.json written:', OUT);
console.log('  themes      :', THEMES.map(t => t.id).join(', '));
console.log('  effects     :', outEffects.length);
console.log('  sensitive   :', sensitive, '(' + Math.round(sensitive / outEffects.length * 100) + '%)');
console.log('  direct var  :', directOnly);
console.log('  base tokens :', TOKEN_KEYS.length);
console.log('  top tokens  :', doc.stats.topTokens.map(t => t[0] + '×' + t[1]).join(', '));
