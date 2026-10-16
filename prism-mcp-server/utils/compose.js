// Composition engine: turn a set of effect ids into one production-ready, paste-ready
// bundle (merged HTML + deduped CSS + the theme tokens it references + the snippet
// wrapper/reset + validation + a trace of what happened).
//
// Paste-ready = what Prism's Copy builder emits (utils/snippet.js): a `:root{}` block with
// exactly the tokens the composed CSS references, resolved for the requested theme
// (default Prism Night), and the `.prism-snippet` wrapper with its border-box reset.

import { dedupeCss, mergeRootTokens, validateCss } from './css.js';
import { validateComposition } from './validate.js';
import { snippetize, helperRules } from './snippet.js';
import { DEFAULT_THEME_ID } from './themes.js';

/** Resolve, merge and dedupe — the theme-agnostic part of a composition. */
function buildParts(ids, store, { wrap = null, separator = '\n' } = {}) {
  const trace = [];
  const t0 = Date.now();
  const check = validateComposition(ids, store);
  if (!check.valid) return { ok: false, errors: check.errors, warnings: check.warnings, missing: check.missing };
  const effects = check.resolved;
  trace.push(`Resolved ${effects.length} effect(s): ${effects.map((e) => e.id).join(', ')}`);

  // --- HTML ---
  const perEffectHtml = effects.map((e) => e.html || '');
  let html = perEffectHtml.join(separator);
  if (wrap && wrap.tag) {
    const cls = wrap.className ? ` class="${escapeAttr(wrap.className)}"` : '';
    const sty = wrap.style ? ` style="${escapeAttr(wrap.style)}"` : '';
    html = `<${wrap.tag}${cls}${sty}>\n${html}\n</${wrap.tag}>`;
    trace.push(`Wrapped markup in <${wrap.tag}>`);
  }

  // --- CSS: the effects' own rules, deduped; any authored :root blocks merged ---
  const cssSources = effects.map((e) => e.css).filter(Boolean);
  const naiveLength = cssSources.join('\n').length;
  const deduped = dedupeCss(cssSources);
  const merged = mergeRootTokens(deduped.css);
  trace.push(`Deduped CSS: ${deduped.rulesIn} → ${deduped.rulesOut} rules (${deduped.duplicatesRemoved} duplicates removed)`);
  if (merged.rootBlocksCollapsed > 1) trace.push(`Merged ${merged.rootBlocksCollapsed} :root blocks → ${merged.tokensMerged} tokens`);

  const initializers = Array.from(new Set(effects.map((e) => e.needsJs).filter(Boolean)));
  if (initializers.length) trace.push(`Requires JS initializers: ${initializers.join(', ')}`);

  return { ok: true, effects, html, css: merged.css, perEffectHtml, initializers, warnings: check.warnings, trace, deduped, naiveLength, t0 };
}

/** Theme tokens + wrapper/reset → the result shape every compose tool returns. */
function finish(parts, store, { includeTokens = true, theme = DEFAULT_THEME_ID, wrapper = true, extraCss = '', html = parts.html, name } = {}) {
  const helpers = includeTokens && store.tokens() ? helperRules(store.tokens().css, html) : '';
  if (helpers) parts.trace.push('Included the tokens.css helper classes the markup uses');
  const facetCss = [helpers, parts.css, extraCss].filter(Boolean).join('\n');
  // the effects' gallery-level :root custom properties (first gallery wins on a clash)
  const galleryTokens = {};
  if (typeof store.galleryTokens === 'function') {
    for (const g of [...new Set(parts.effects.map((e) => e.gallery).filter(Boolean))].reverse()) Object.assign(galleryTokens, store.galleryTokens(g));
  }
  const snip = snippetize({ html, css: facetCss, theme: theme || DEFAULT_THEME_ID, includeTokens: includeTokens !== false, wrapper: wrapper !== false, galleryTokens, name: name || parts.effects.map((e) => e.name || e.id).join(' + ') });
  if (includeTokens !== false) parts.trace.push(`Resolved ${snip.tokens.resolved.length} token(s) for theme ${snip.tokens.theme} into one :root block`);
  if (wrapper !== false) parts.trace.push('Wrapped markup in .prism-snippet (font, ink, stage layout, border-box reset)');
  if (snip.tokens.unresolved.length) parts.trace.push(`Undefined var() references: ${snip.tokens.unresolved.join(', ')}`);
  const finalCss = snip.css;
  const reduction = parts.naiveLength > 0 ? (parts.naiveLength - parts.css.length) / parts.naiveLength : 0;
  return {
    ok: true,
    html: snip.html,
    css: finalCss,
    snippet: snip.snippet,
    theme: snip.tokens.theme,
    tokens: snip.tokens,
    effects: parts.effects.map((e) => e.id),
    initializers: parts.initializers,
    warnings: parts.warnings,
    validation: validateCss(finalCss),
    trace: parts.trace,
    _perEffectHtml: parts.perEffectHtml,
    metrics: {
      effectCount: parts.effects.length,
      rulesIn: parts.deduped.rulesIn,
      rulesOut: parts.deduped.rulesOut,
      duplicatesRemoved: parts.deduped.duplicatesRemoved,
      naiveCssLength: parts.naiveLength,
      finalCssLength: parts.css.length,   // the effects' own CSS after dedupe
      snippetCssLength: finalCss.length,  // + :root tokens, wrapper, reset, helper classes
      reductionPct: Math.round(reduction * 1000) / 10,
      composeMs: Date.now() - parts.t0,
    },
  };
}

/**
 * Compose effects into a single paste-ready bundle.
 * @param {string[]} ids       effect ids, in the order they should appear
 * @param {CatalogStore} store
 * @param {object} opts
 *   - theme: theme id whose token values fill the :root block (default prism-dark)
 *   - includeTokens: emit the :root block (+ tokens.css helper classes the markup uses) (default true)
 *   - wrapper: wrap in .prism-snippet with the border-box reset (default true)
 *   - wrap: optional {tag, className, style} element around the combined HTML (inside the wrapper)
 *   - separator: HTML joined with this (default '\n')
 * @returns {object} { ok, html, css, snippet, theme, tokens, effects, initializers, validation, trace, metrics }
 */
export function compose(ids, store, opts = {}) {
  const parts = buildParts(ids, store, opts);
  if (!parts.ok) return parts;
  return finish(parts, store, opts);
}

/**
 * Compose using a named layout template. Templates position slots of effects.
 * Currently supported templates: 'stack' (vertical), 'row' (flex row), 'grid' (auto-fit grid),
 * 'card' (wrap each effect in a padded panel then arrange in a grid).
 */
export function composeWithTemplate(ids, store, templateName = 'stack', opts = {}) {
  const template = TEMPLATES[templateName];
  if (!template) {
    return { ok: false, errors: [`Unknown template "${templateName}". Available: ${Object.keys(TEMPLATES).join(', ')}`] };
  }
  const parts = buildParts(ids, store, { ...opts, wrap: null });
  if (!parts.ok) return parts;
  const wrapper = template.build(ids, store);
  parts.trace.push(`Applied template "${templateName}"`);
  const out = finish(parts, store, { ...opts, extraCss: wrapper.css, html: wrapper.html(parts) });
  return { ...out, template: templateName };
}

// Template containers fill the .prism-snippet stage (a centered flex box) edge to edge.
const TEMPLATES = {
  stack: {
    build: () => ({
      css: '.prism-compose-stack{display:flex;flex-direction:column;gap:16px;width:100%}',
      html: (b) => `<div class="prism-compose-stack">\n${b.html}\n</div>`,
    }),
  },
  row: {
    build: () => ({
      css: '.prism-compose-row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;width:100%}',
      html: (b) => `<div class="prism-compose-row">\n${b.html}\n</div>`,
    }),
  },
  grid: {
    build: () => ({
      css: '.prism-compose-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;width:100%}',
      html: (b) => `<div class="prism-compose-grid">\n${b.html}\n</div>`,
    }),
  },
  card: {
    build: () => ({
      css: '.prism-compose-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;width:100%}'
        + '.prism-compose-card{background:var(--panel,#121623);border:1px solid var(--line,#243049);border-radius:12px;padding:16px}',
      // For 'card' we re-wrap each effect individually.
      html: (b) => {
        const wrapped = b.perEffectHtml
          ? b.perEffectHtml.map((h) => `<div class="prism-compose-card">${h}</div>`).join('\n')
          : `<div class="prism-compose-card">${b.html}</div>`;
        return `<div class="prism-compose-grid">\n${wrapped}\n</div>`;
      },
    }),
  },
};

export function availableTemplates() {
  return Object.keys(TEMPLATES);
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
