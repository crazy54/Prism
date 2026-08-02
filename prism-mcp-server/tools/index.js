// The 15 Prism MCP tools. Each entry: { name, description, inputSchema, handler }.
// Handlers receive (args, ctx) where ctx = { store, logger } and return a plain
// JS object (serialized to JSON text by the server). Handlers throw ToolError for
// structured, actionable failures.

import { lightEffect } from '../utils/catalog.js';
import { compose, composeWithTemplate, availableTemplates } from '../utils/compose.js';
import { validateFacet, validateComposition } from '../utils/validate.js';

export class ToolError extends Error {
  constructor(message, { code = 'tool_error', data = null } = {}) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.data = data;
  }
}

// --- shared schema fragments ---
const strArr = { type: 'array', items: { type: 'string' } };

/** Coerce to a non-negative integer. Uses Math.trunc(Number(x)), NOT `x | 0`:
 *  the bitwise-or coerces to a 32-bit signed int, so any value >= 2^31 wraps
 *  negative and then clamps to 0 — turning a large paging offset into "page 1
 *  again" (infinite re-paging) and a large limit into "return nothing". */
function nonNegInt(x, fallback = 0) {
  const n = Math.trunc(Number(x));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function paginate(items, limit, offset) {
  const off = nonNegInt(offset, 0);
  const lim = limit == null ? items.length : nonNegInt(limit, 0);
  return {
    total: items.length,
    offset: off,
    limit: lim,
    returned: Math.min(lim, Math.max(0, items.length - off)),
    items: items.slice(off, off + lim),
  };
}

function matchScore(effect, q) {
  // Simple weighted relevance over id/name/description/tags/category.
  const ql = q.toLowerCase();
  const terms = ql.split(/\s+/).filter(Boolean);
  let score = 0;
  const hay = {
    id: (effect.id || '').toLowerCase(),
    name: (effect.name || '').toLowerCase(),
    desc: (effect.description || '').toLowerCase(),
    tags: (effect.tags || []).join(' ').toLowerCase(),
    cat: (effect.category || '').toLowerCase(),
  };
  for (const t of terms) {
    if (hay.name.includes(t)) score += 5;
    if (hay.id.includes(t)) score += 4;
    if (hay.tags.includes(t)) score += 3;
    if (hay.cat.includes(t)) score += 2;
    if (hay.desc.includes(t)) score += 1;
  }
  // exact-phrase bonuses
  if (hay.name === ql) score += 10;
  if (hay.name.includes(ql)) score += 3;
  return score;
}

export function buildTools() {
  return [
    // ============================== DISCOVERY (6) ==============================
    {
      name: 'list_effects',
      description: 'List effects in the catalog with optional filters (gallery, tag, componentType, background-capable, new/fixed). Returns lightweight metadata (no html/css) with pagination.',
      inputSchema: {
        type: 'object',
        properties: {
          gallery: { type: 'string', description: 'Filter by gallery id (e.g. "charts", "fx")' },
          tag: { type: 'string', description: 'Filter to effects having this tag' },
          componentType: { type: 'string', description: 'Filter by componentType' },
          usableAsBackground: { type: 'boolean', description: 'Only background-capable effects' },
          isNew: { type: 'boolean', description: 'Only effects tagged new' },
          limit: { type: 'integer', minimum: 1, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        let list = store.all();
        if (a.gallery) list = list.filter((e) => e.gallery === a.gallery);
        if (a.tag) list = list.filter((e) => e.tags.includes(a.tag));
        if (a.componentType) list = list.filter((e) => e.componentType === a.componentType);
        if (a.usableAsBackground === true) list = list.filter((e) => e.usableAsBackground);
        if (a.isNew === true) list = list.filter((e) => e.isNew);
        const page = paginate(list.map(lightEffect), a.limit ?? 50, a.offset ?? 0);
        return page;
      },
    },
    {
      name: 'search_effects',
      description: 'Full-text relevance search across effect id, name, description, tags and category. Returns ranked lightweight results. Use get_effect to fetch full html/css for a chosen id.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text, e.g. "pulsing kpi card" or "wind backdrop"' },
          gallery: { type: 'string', description: 'Optional gallery id to restrict the search' },
          limit: { type: 'integer', minimum: 1, default: 20 },
        },
        required: ['query'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        if (!a.query || !a.query.trim()) throw new ToolError('query must be a non-empty string', { code: 'invalid_argument' });
        let list = store.all();
        if (a.gallery) list = list.filter((e) => e.gallery === a.gallery);
        const scored = list
          .map((e) => ({ e, score: matchScore(e, a.query) }))
          .filter((x) => x.score > 0)
          .sort((x, y) => y.score - x.score)
          .slice(0, a.limit ?? 20)
          .map((x) => ({ ...lightEffect(x.e), score: x.score }));
        return { query: a.query, total: scored.length, items: scored };
      },
    },
    {
      name: 'get_effect',
      description: 'Fetch the complete record for one effect by id, including production-ready html and css, classes, keyframes, params, and whether it needs a JS initializer.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The effect id (e.g. "charts-big-metric-count-up")' },
          includeCss: { type: 'boolean', default: true },
          includeHtml: { type: 'boolean', default: true },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        const e = store.get(a.id);
        if (!e) {
          const suggestions = store.all()
            .map((x) => ({ id: x.id, score: matchScore(x, a.id) }))
            .filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 5).map((x) => x.id);
          throw new ToolError(`No effect with id "${a.id}"`, { code: 'not_found', data: { suggestions } });
        }
        const out = { ...e };
        if (a.includeCss === false) delete out.css;
        if (a.includeHtml === false) delete out.html;
        return out;
      },
    },
    {
      name: 'get_theme_variants',
      description: 'Return the theme token reference and how to recolor an effect. Includes the global tokens.css and the semantic color tokens (accent, pos, neg, warn, info, crit) that themes override.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: (a, { store }) => {
        const tokens = store.tokens();
        return {
          tokensCss: tokens ? tokens.css : null,
          note: tokens ? tokens.note : null,
          semanticTokens: ['--accent', '--info', '--pos', '--neg', '--warn', '--crit'],
          surfaceTokens: ['--bg', '--panel', '--panel2', '--card', '--line', '--ink', '--muted', '--dim'],
          recolor: 'Set --c and --c-rgb (or add a c-* class like c-pos) on the effect element to recolor it.',
          builtInThemes: ['prism', 'oled', 'cyberpunk'],
          customThemes: 'Users can define custom themes in the Prism UI (Settings gear); they compile to :root overrides using these same token names.',
        };
      },
    },
    {
      name: 'list_galleries',
      description: 'List all galleries with their id, title and effect count.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: (a, { store }) => {
        const declared = store.galleries();
        // Cross-check declared counts against live index (catches stale manifests).
        const items = declared.map((g) => ({
          id: g.id,
          title: g.title,
          declaredCount: g.count,
          liveCount: store.gallery(g.id).length,
        }));
        return { total: items.length, items };
      },
    },
    {
      name: 'get_catalog_stats',
      description: 'Aggregate statistics: total effects, per-gallery counts, count of background-capable, effects needing JS, new/fixed counts, and unique tag/componentType tallies.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: (a, { store }) => {
        const all = store.all();
        const byGallery = {};
        const tagCounts = {};
        const typeCounts = {};
        let background = 0, needsJs = 0, isNew = 0, isFixed = 0;
        for (const e of all) {
          byGallery[e.gallery] = (byGallery[e.gallery] || 0) + 1;
          if (e.usableAsBackground) background++;
          if (e.needsJs) needsJs++;
          if (e.isNew) isNew++;
          if (e.isFixed) isFixed++;
          for (const t of e.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
          if (e.componentType) typeCounts[e.componentType] = (typeCounts[e.componentType] || 0) + 1;
        }
        return {
          totalEffects: all.length,
          galleryCount: store.galleries().length,
          byGallery,
          backgroundCapable: background,
          needsJs,
          isNew,
          isFixed,
          uniqueTags: Object.keys(tagCounts).length,
          uniqueComponentTypes: Object.keys(typeCounts).length,
          topTags: Object.entries(tagCounts).sort((a2, b2) => b2[1] - a2[1]).slice(0, 15).map(([tag, count]) => ({ tag, count })),
        };
      },
    },

    // ============================== COMPOSITION (3) ==============================
    {
      name: 'compose',
      description: 'Compose multiple effects (by id) into one production-ready bundle: merged HTML, deduplicated + token-merged CSS, list of required JS initializers, validation, and size metrics. Optionally wrap the markup in a container.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { ...strArr, description: 'Effect ids to compose, in display order', minItems: 1 },
          includeTokens: { type: 'boolean', default: true, description: 'Prepend the global tokens.css' },
          wrap: {
            type: 'object',
            description: 'Optional wrapper element around the combined markup',
            properties: {
              tag: { type: 'string' }, className: { type: 'string' }, style: { type: 'string' },
            },
            additionalProperties: false,
          },
          separator: { type: 'string', default: '\n' },
        },
        required: ['ids'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        if (!Array.isArray(a.ids) || a.ids.length === 0) throw new ToolError('ids must be a non-empty array', { code: 'invalid_argument' });
        const res = compose(a.ids, store, { includeTokens: a.includeTokens, wrap: a.wrap, separator: a.separator });
        if (!res.ok) throw new ToolError('Composition failed', { code: 'compose_failed', data: { errors: res.errors, missing: res.missing } });
        return res;
      },
    },
    {
      name: 'compose_with_template',
      description: `Compose effects into a named layout template. Templates arrange the effects: ${availableTemplates().join(', ')}. Returns the same bundle shape as compose plus the applied template.`,
      inputSchema: {
        type: 'object',
        properties: {
          ids: { ...strArr, description: 'Effect ids to compose', minItems: 1 },
          template: { type: 'string', enum: availableTemplates(), default: 'stack' },
          includeTokens: { type: 'boolean', default: true },
        },
        required: ['ids'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        if (!Array.isArray(a.ids) || a.ids.length === 0) throw new ToolError('ids must be a non-empty array', { code: 'invalid_argument' });
        const res = composeWithTemplate(a.ids, store, a.template || 'stack', { includeTokens: a.includeTokens });
        if (!res.ok) throw new ToolError('Composition failed', { code: 'compose_failed', data: { errors: res.errors, missing: res.missing } });
        return res;
      },
    },
    {
      name: 'validate_composition',
      description: 'Validate that a set of effect ids can be composed: checks each id exists, flags missing ones, and reports which effects need JS initializers or are not self-contained. Does not build output.',
      inputSchema: {
        type: 'object',
        properties: { ids: { ...strArr, minItems: 1 } },
        required: ['ids'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        if (!Array.isArray(a.ids) || a.ids.length === 0) throw new ToolError('ids must be a non-empty array', { code: 'invalid_argument' });
        const res = validateComposition(a.ids, store);
        return {
          valid: res.valid,
          errors: res.errors,
          warnings: res.warnings,
          missing: res.missing,
          resolved: res.resolved.map((e) => e.id),
        };
      },
    },

    // ============================== CONTENT CREATION (3) ==============================
    {
      name: 'create_facet',
      description: 'Create a new facet (effect) and register it in the live catalog immediately (in-memory; discoverable via list/search/get without restart). Validates naming, metadata, html/css, and token references before accepting. To persist to disk, embed via the catalog pipeline.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Lowercase kebab-case id, conventionally "<gallery>-<name>"' },
          name: { type: 'string' },
          gallery: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          html: { type: 'string' },
          css: { type: 'string' },
          classes: strArr,
          tags: strArr,
          params: { type: 'object', additionalProperties: true },
          needsJs: { type: ['string', 'null'] },
          usableAsBackground: { type: 'boolean', default: false },
        },
        required: ['id', 'name', 'gallery', 'html'],
        additionalProperties: false,
      },
      handler: (a, { store, logger }) => {
        const existingIds = new Set(store.all().map((e) => e.id));
        const knownGalleries = new Set(store.galleries().map((g) => g.id));
        const v = validateFacet(a, { existingIds, knownGalleries, isUpdate: false });
        if (!v.valid) throw new ToolError('Facet validation failed', { code: 'validation_failed', data: v });
        const created = store.addRuntimeFacet(a);
        logger && logger.info(`create_facet: registered "${created.id}" (runtime)`);
        return { created: created.id, effect: created, validation: v, persisted: false, note: 'Registered in live catalog (in-memory). Run the embed pipeline to persist into Prism.html.' };
      },
    },
    {
      name: 'update_facet',
      description: 'Update fields of an existing facet (must already exist). Re-validates the merged result. Applies to the live in-memory catalog.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          gallery: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          html: { type: 'string' },
          css: { type: 'string' },
          classes: strArr,
          tags: strArr,
          params: { type: 'object', additionalProperties: true },
          needsJs: { type: ['string', 'null'] },
          usableAsBackground: { type: 'boolean' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a, { store, logger }) => {
        const existing = store.get(a.id);
        if (!existing) throw new ToolError(`No facet with id "${a.id}" to update`, { code: 'not_found' });
        const merged = { ...existing, ...a };
        const existingIds = new Set(store.all().map((e) => e.id));
        const knownGalleries = new Set(store.galleries().map((g) => g.id));
        const v = validateFacet(merged, { existingIds, knownGalleries, isUpdate: true });
        if (!v.valid) throw new ToolError('Facet validation failed', { code: 'validation_failed', data: v });
        const updated = store.updateRuntimeFacet(a.id, a);
        logger && logger.info(`update_facet: updated "${a.id}" (runtime)`);
        return { updated: a.id, effect: updated, validation: v, persisted: false };
      },
    },
    {
      name: 'validate_facet',
      description: 'Validate a facet definition WITHOUT creating it: checks id/kebab-case, required metadata, html presence, CSS structural soundness, and unknown token references. Returns detailed errors, warnings and per-check results.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          gallery: { type: 'string' },
          description: { type: 'string' },
          html: { type: 'string' },
          css: { type: 'string' },
          needsJs: { type: ['string', 'null'] },
        },
        required: ['id'],
        additionalProperties: true,
      },
      handler: (a, { store }) => {
        const existingIds = new Set(store.all().map((e) => e.id));
        const knownGalleries = new Set(store.galleries().map((g) => g.id));
        return validateFacet(a, { existingIds, knownGalleries, isUpdate: false });
      },
    },

    // ============================== CATALOG MANAGEMENT (3) ==============================
    {
      name: 'get_catalog_metadata',
      description: 'Return catalog-level metadata: name, version, generation timestamp, source, gallery/effect counts, runtime facet count, source file path, and whether hot reload is active.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: (a, { store }) => store.meta(),
    },
    {
      name: 'export_collection',
      description: 'Export a named collection of effects as a self-contained bundle. Given a set of ids (or a gallery), returns merged deduped CSS + each effect\'s html, ready to drop into a page. Optionally returns a full standalone HTML document.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { ...strArr, description: 'Effect ids to include (omit if using gallery)' },
          gallery: { type: 'string', description: 'Export an entire gallery instead of explicit ids' },
          title: { type: 'string', default: 'Prism Collection' },
          asDocument: { type: 'boolean', default: false, description: 'Return a complete <html> document' },
          includeTokens: { type: 'boolean', default: true },
        },
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        let ids = a.ids;
        if ((!ids || !ids.length) && a.gallery) ids = store.gallery(a.gallery).map((e) => e.id);
        if (!ids || !ids.length) throw new ToolError('Provide ids[] or a gallery to export', { code: 'invalid_argument' });
        const res = compose(ids, store, { includeTokens: a.includeTokens });
        if (!res.ok) throw new ToolError('Export failed', { code: 'export_failed', data: { errors: res.errors, missing: res.missing } });
        const bundle = { title: a.title || 'Prism Collection', effects: res.effects, css: res.css, html: res.html, initializers: res.initializers, metrics: res.metrics };
        if (a.asDocument) {
          // Defense-in-depth: even though the catalog is trusted by design, when we
          // inline CSS into a <style> block a stray "</style>" (or "</script>") would
          // close the tag early and let following bytes be parsed as markup/script.
          // Neutralize those sequences so composed content can't break out of context.
          const safeCss = neutralizeClosers(res.css);
          const safeBodyHtml = neutralizeClosers(res.html, /* htmlBody */ true);
          bundle.document = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>${escapeHtml(bundle.title)}</title>\n<style>\n${safeCss}\n</style>\n</head>\n<body>\n${safeBodyHtml}\n</body>\n</html>\n`;
          if (safeCss !== res.css || safeBodyHtml !== res.html) {
            bundle.sanitized = true;
            bundle.warnings = (bundle.warnings || []).concat('Neutralized </style> or </script> sequences in composed content for the generated document.');
          }
        }
        return bundle;
      },
    },
    {
      name: 'get_token_reference',
      description: 'Return the canonical CSS token reference for building/theming facets: the global tokens.css, the list of themeable tokens with descriptions, and recolor guidance.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: (a, { store }) => {
        const tokens = store.tokens();
        return {
          tokensCss: tokens ? tokens.css : null,
          note: tokens ? tokens.note : null,
          tokens: [
            { token: '--bg', purpose: 'Page background base' },
            { token: '--panel', purpose: 'Card / panel surface' },
            { token: '--panel2', purpose: 'Secondary surface' },
            { token: '--card', purpose: 'Card fill' },
            { token: '--line', purpose: 'Borders / separators' },
            { token: '--ink', purpose: 'Primary text' },
            { token: '--muted', purpose: 'Secondary text' },
            { token: '--dim', purpose: 'Tertiary / disabled text' },
            { token: '--accent', purpose: 'Brand / primary accent (also --accent-rgb)' },
            { token: '--info', purpose: 'Informational / links (also --info-rgb)' },
            { token: '--pos', purpose: 'Positive / success (also --pos-rgb)' },
            { token: '--warn', purpose: 'Warning / caution (also --warn-rgb)' },
            { token: '--neg', purpose: 'Negative / danger (also --neg-rgb)' },
            { token: '--crit', purpose: 'Critical / special (also --crit-rgb)' },
            { token: '--c / --c-rgb', purpose: 'Per-element active color; set to recolor an effect' },
            { token: '--cardgrad', purpose: 'Standard card gradient overlay' },
          ],
          recolorClasses: ['c-accent', 'c-info', 'c-pos', 'c-warn', 'c-neg', 'c-crit'],
        };
      },
    },
  ];
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Defense-in-depth for inlining composed content into a generated HTML document.
 * - In the <style> context (htmlBody=false), the only escape hatch is a literal
 *   "</style>"; a stray "</script>" is also neutralized for good measure. We break the
 *   sequence with a CSS-legal backslash escape so the HTML tokenizer won't match it.
 * - In the <body> context (htmlBody=true), the content is rendered as markup, so we
 *   neutralize inline <script> openers/closers (facets are self-contained CSS/SVG/DOM
 *   markup and never carry inline scripts) to prevent script execution.
 */
function neutralizeClosers(text, htmlBody = false) {
  let out = String(text);
  if (htmlBody) {
    // Body content is parsed as markup: neutralize any <script>/</script> opener/closer.
    out = out.replace(/<\s*(\/?)\s*script/gi, '&lt;$1script');
  } else {
    // A <style> element's content is raw text that ends only at "</style>"; that closer
    // is the sole breakout. We also break any style/script token (opening or closing) with
    // a CSS-legal backslash so no "<script>"/"</style>" substring survives verbatim.
    out = out.replace(/<\s*(\/?)\s*(style|script)/gi, '<\\$1$2');
  }
  return out;
}
