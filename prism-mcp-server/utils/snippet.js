// Paste-ready snippets — the MCP twin of Prism's Copy builder
// (aaa-prism-ds/fix-copy/prism-snippet.js, PrismSnippet.fromRecord).
//
// Catalog records carry the facet's own authored CSS only: no theme tokens and no
// box-sizing reset. A snippet adds, exactly like the builder:
//   1. a `:root{}` block with exactly the custom properties the snippet references
//      (CSS, inline styles, the wrapper), resolved for one theme (default Prism Night);
//      `--font` gets the system stack appended when it has no generic family;
//   2. the `.prism-snippet` wrapper (font, ink color, size, flex stage layout) and the
//      `box-sizing: border-box` reset every gallery page applies.
// Anything still undefined (a var() with no fallback that no theme or rule defines) is
// reported in `tokens.unresolved` rather than silently shipped.

import { getTheme, refractionTokens, BASE_TOKENS, DEFAULT_THEME_ID } from './themes.js';
import { splitRules } from './css.js';

export const SNIPPET_CLASS = 'prism-snippet';
export const SYSTEM_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
/** The builder's record wrapper (fromRecord), byte for byte. */
export const SNIPPET_WRAPPER_CSS = `.${SNIPPET_CLASS}{font-family:var(--font);color:var(--ink);font-size:14px;line-height:1.5;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;min-height:160px;padding:16px;position:relative}\n`
  + `:where(.${SNIPPET_CLASS}) *,:where(.${SNIPPET_CLASS}) ::before,:where(.${SNIPPET_CLASS}) ::after{box-sizing:border-box}`;

/** `--font` with the system stack appended unless it already ends in a generic family. */
export function fontStack(v) {
  if (!v) return SYSTEM_FONT;
  return /\b(sans-serif|serif|monospace|system-ui|cursive|fantasy)\s*$/.test(v) ? v : `${v}, ${SYSTEM_FONT}`;
}

/** var() usage: name → { bare } (bare = used at least once without a fallback). */
export function varUsage(text) {
  const out = new Map();
  const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,)?/g;
  let m;
  while ((m = re.exec(text || '')) !== null) {
    const u = out.get(m[1]) || { bare: false };
    if (!m[2]) u.bare = true;
    out.set(m[1], u);
  }
  return out;
}

/** Custom properties declared anywhere (CSS rules or inline style attributes). */
export function declaredVars(text) {
  const set = new Set();
  const re = /(?:^|[{;\s"'])(--[A-Za-z0-9_-]+)\s*:/g;
  let m;
  while ((m = re.exec(text || '')) !== null) set.add(m[1]);
  return set;
}

/**
 * One token's value: the theme's :root map (the contract — the active theme always wins),
 * then the facets' gallery-level :root (`extra`, e.g. --glm-*), then the theme's --rf-*
 * layer, else the Prism base of the theme's mode.
 */
export function themeToken(theme, name, extra = null) {
  const t = typeof theme === 'string' ? getTheme(theme) : theme;
  if (!t) return undefined;
  if (t.tokens[name] != null) return t.tokens[name];
  if (extra && extra[name] != null) return extra[name];
  const night = getTheme(DEFAULT_THEME_ID);
  const day = getTheme('prism-light');
  const base = t.mode === 'light' && day ? day : night;
  return refractionTokens(t.id)[name] ?? base?.tokens[name] ?? refractionTokens(base?.id)[name] ?? BASE_TOKENS[name];
}

/**
 * The :root block for `names` in `themeId` (+ gallery tokens `extra`), closed over tokens
 * whose values reference other tokens. → { css, resolved: [names], missing: [names] }
 */
export function themeRootBlock(names, themeId = DEFAULT_THEME_ID, extra = null) {
  const t = getTheme(themeId);
  if (!t) throw new Error(`unknown theme "${themeId}"`);
  const decls = new Map(), missing = new Set();
  const queue = [...names];
  while (queue.length) {
    const n = queue.shift();
    if (decls.has(n) || missing.has(n)) continue;
    let v = themeToken(t, n, extra);
    if (n === '--font') v = fontStack(v);
    if (v == null || v === '') { missing.add(n); continue; }
    decls.set(n, v);
    for (const [ref] of varUsage(v)) queue.push(ref);
  }
  const sorted = [...decls.keys()].sort();
  return { css: sorted.length ? `:root{${sorted.map((k) => `${k}:${decls.get(k)}`).join(';')}}` : '', resolved: sorted, missing: [...missing].sort() };
}

/** tokens.css helper rules (e.g. .c-pos{--c:…}) that the markup actually uses; its :root block is dropped (the theme block replaces it). */
export function helperRules(tokensCss, html) {
  if (!tokensCss) return '';
  const classes = new Set();
  for (const m of String(html || '').matchAll(/class\s*=\s*["']([^"']*)["']/g)) for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  return splitRules(tokensCss).map((r) => r.text.trim()).filter((text) => {
    if (/^:root\b/.test(text)) return false;
    const sel = text.slice(0, text.indexOf('{'));
    const used = [...sel.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    return used.length > 0 && used.every((c) => classes.has(c));
  }).join('\n');
}

/**
 * Make composed markup + CSS paste-ready.
 * opts: { theme (default prism-dark), includeTokens (default true: the :root block), wrapper (default true),
 *         galleryTokens (the facets' gallery-level :root custom properties) }
 * → { html, css, snippet, tokens: { theme, block, resolved, unresolved, fallbackOnly } }
 */
export function snippetize({ html = '', css = '', name = 'Prism', theme = DEFAULT_THEME_ID, includeTokens = true, wrapper = true, galleryTokens = null } = {}) {
  const t = getTheme(theme);
  if (!t) throw new Error(`unknown theme "${theme}"`);
  const wrapCss = wrapper ? SNIPPET_WRAPPER_CSS : '';
  const usage = varUsage(`${wrapCss}\n${css}\n${html}`);
  const root = includeTokens ? themeRootBlock([...usage.keys()], t.id, galleryTokens) : { css: '', resolved: [], missing: [] };
  const defined = new Set([...root.resolved, ...declaredVars(`${css}\n${html}`)]);
  const unresolved = [...usage].filter(([n, u]) => u.bare && !defined.has(n)).map(([n]) => n).sort();
  const fallbackOnly = [...usage].filter(([n, u]) => !u.bare && !defined.has(n)).map(([n]) => n).sort();
  const outCss = [root.css, wrapCss, css].filter(Boolean).join('\n');
  const outHtml = wrapper ? `<div class="${SNIPPET_CLASS}">\n${String(html).trim()}\n</div>` : html;
  const header = `<!-- Prism · ${String(name).replace(/--/g, '-')} -->`;
  return {
    html: outHtml,
    css: outCss,
    // a stray "</style>" in authored CSS must not close the snippet's style element early
    snippet: `${header}\n<style>\n${outCss.replace(/<\/(style|script)/gi, '<\\/$1')}\n</style>\n${outHtml}`,
    tokens: { theme: t.id, block: root.css, resolved: root.resolved, unresolved, fallbackOnly },
  };
}
