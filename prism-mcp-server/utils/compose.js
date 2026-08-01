// Composition engine: turn a set of effect ids into one production-ready bundle
// (merged HTML + deduped/token-merged CSS + validation + a trace of what happened).

import { dedupeCss, mergeRootTokens, validateCss } from './css.js';
import { validateComposition } from './validate.js';

/**
 * Compose effects into a single bundle.
 * @param {string[]} ids       effect ids, in the order they should appear
 * @param {CatalogStore} store
 * @param {object} opts
 *   - includeTokens: prepend the global tokens.css (default true)
 *   - wrap: optional {tag, className, style} wrapper around the combined HTML
 *   - separator: HTML joined with this (default '\n')
 * @returns {object} composition result with html, css, trace, validation, metrics
 */
export function compose(ids, store, opts = {}) {
  const { includeTokens = true, wrap = null, separator = '\n' } = opts;
  const trace = [];
  const t0 = Date.now();

  const check = validateComposition(ids, store);
  if (!check.valid) {
    return {
      ok: false,
      errors: check.errors,
      warnings: check.warnings,
      missing: check.missing,
    };
  }

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

  // --- CSS: gather, optionally prepend tokens, dedupe, merge :root ---
  const cssSources = [];
  if (includeTokens && store.tokens() && store.tokens().css) {
    cssSources.push(store.tokens().css);
    trace.push('Included global tokens.css');
  }
  for (const e of effects) if (e.css) cssSources.push(e.css);

  const naiveLength = cssSources.join('\n').length;
  const deduped = dedupeCss(cssSources);
  const merged = mergeRootTokens(deduped.css);
  const finalCss = merged.css;
  trace.push(`Deduped CSS: ${deduped.rulesIn} → ${deduped.rulesOut} rules (${deduped.duplicatesRemoved} duplicates removed)`);
  if (merged.rootBlocksCollapsed > 1) trace.push(`Merged ${merged.rootBlocksCollapsed} :root blocks → ${merged.tokensMerged} tokens`);

  // --- initializers needed ---
  const initializers = Array.from(new Set(effects.map((e) => e.needsJs).filter(Boolean)));
  if (initializers.length) trace.push(`Requires JS initializers: ${initializers.join(', ')}`);

  const validation = validateCss(finalCss);

  const reduction = naiveLength > 0 ? (naiveLength - finalCss.length) / naiveLength : 0;

  return {
    ok: true,
    html,
    css: finalCss,
    effects: effects.map((e) => e.id),
    initializers,
    warnings: check.warnings,
    validation,
    trace,
    _perEffectHtml: perEffectHtml,
    metrics: {
      effectCount: effects.length,
      rulesIn: deduped.rulesIn,
      rulesOut: deduped.rulesOut,
      duplicatesRemoved: deduped.duplicatesRemoved,
      naiveCssLength: naiveLength,
      finalCssLength: finalCss.length,
      reductionPct: Math.round(reduction * 1000) / 10, // one decimal place
      composeMs: Date.now() - t0,
    },
  };
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
  const base = compose(ids, store, { ...opts, wrap: null });
  if (!base.ok) return base;

  const wrapper = template.build(ids, store);
  const css = [base.css, wrapper.css].filter(Boolean).join('\n');
  base.trace.push(`Applied template "${templateName}"`);
  return {
    ...base,
    html: wrapper.html(base),
    css,
    template: templateName,
  };
}

const TEMPLATES = {
  stack: {
    build: () => ({
      css: '.prism-compose-stack{display:flex;flex-direction:column;gap:16px}',
      html: (b) => `<div class="prism-compose-stack">\n${b.html}\n</div>`,
    }),
  },
  row: {
    build: () => ({
      css: '.prism-compose-row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}',
      html: (b) => `<div class="prism-compose-row">\n${b.html}\n</div>`,
    }),
  },
  grid: {
    build: () => ({
      css: '.prism-compose-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}',
      html: (b) => `<div class="prism-compose-grid">\n${b.html}\n</div>`,
    }),
  },
  card: {
    build: () => ({
      css: '.prism-compose-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}'
        + '.prism-compose-card{background:var(--panel,#121623);border:1px solid var(--line,#243049);border-radius:12px;padding:16px}',
      // For 'card' we re-wrap each effect individually.
      html: (b) => {
        const wrapped = b._perEffectHtml
          ? b._perEffectHtml.map((h) => `<div class="prism-compose-card">${h}</div>`).join('\n')
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
