// The 20 Prism MCP tools. Each entry: { name, description, inputSchema, handler }.
// Handlers receive (args, ctx) where ctx = { store, logger } and return a plain
// JS object (serialized to JSON text by the server). Handlers throw ToolError for
// structured, actionable failures.

import { lightEffect } from '../utils/catalog.js';
import { compose, composeWithTemplate, availableTemplates } from '../utils/compose.js';
import { validateFacet, validateComposition } from '../utils/validate.js';
import { THEMES, THEME_IDS, TOKEN_META, BASE_TOKENS, getTheme, usesTokens, themeRootCss, isThemeSensitive } from '../utils/themes.js';

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

// --- faceted search engine (shared by search_effects + saved searches) ---
//
// Facets are grounded in REAL catalog fields. Two caveats the raw data forces:
//   1. The `interaction` field is noisy: words are truncated ("tatic"→static,
//      "focu"→focus, "croll"→scroll), carry stray whitespace, and combine several
//      interactions in one string ("hover click"). We normalize into a canonical
//      token set so the facet is usable.
//   2. There is NO performance/themeCompat field in the catalog, so those spec
//      facets are intentionally absent rather than faked.
const INTERACTION_FIX = { tatic: 'static', focu: 'focus', croll: 'scroll' };

/**
 * Normalize a raw `interaction` value into canonical tokens (may be several).
 * The source is inconsistent: sometimes a string ("hover click"), sometimes an
 * array (["focu"," click"]), with truncated words and stray whitespace/commas.
 * We flatten, split on whitespace AND commas, de-truncate, and de-dupe.
 */
export function normalizeInteractions(raw) {
  if (raw == null) return [];
  const parts = Array.isArray(raw) ? raw : [raw];
  const seen = new Set();
  for (const part of parts) {
    for (const tok of String(part).toLowerCase().split(/[\s,]+/)) {
      const t = tok.trim();
      if (!t) continue;
      seen.add(INTERACTION_FIX[t] || t);
    }
  }
  return Array.from(seen);
}

// Multi-value facet dimensions: value(s) extracted per effect. `multi` means an
// effect can carry several values for the dimension (tags, interactions).
const FACET_DIMS = {
  gallery: { get: (e) => (e.gallery ? [e.gallery] : []), label: 'Gallery' },
  componentType: { get: (e) => (e.componentType ? [e.componentType] : []), label: 'Component type' },
  spectrum: { get: (e) => (e.spectrum ? [e.spectrum] : []), label: 'Aesthetic (spectrum)' },
  category: { get: (e) => (e.category ? [e.category] : []), label: 'Category' },
  tag: { get: (e) => e.tags || [], label: 'Tag', multi: true },
  interaction: { get: (e) => normalizeInteractions(e.interaction), label: 'Interaction', multi: true, normalized: true },
};

// Boolean flag dimensions.
const BOOL_DIMS = {
  isNew: { get: (e) => !!e.isNew, label: 'New' },
  usableAsBackground: { get: (e) => !!e.usableAsBackground, label: 'Usable as background' },
  needsJs: { get: (e) => !!e.needsJs, label: 'Needs JS initializer' },
  isFixed: { get: (e) => !!e.isFixed, label: 'Fixed / pinned' },
  selfContained: { get: (e) => !!e.selfContained, label: 'Self-contained' },
};

// Maps the plural filter keys accepted by search_effects to a facet dimension.
const FILTER_KEY_TO_DIM = {
  galleries: 'gallery',
  componentTypes: 'componentType',
  spectrums: 'spectrum',
  categories: 'category',
  tags: 'tag',
  interactions: 'interaction',
};

function asStrArray(v) {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x)).filter(Boolean);
}

/**
 * Apply facet filters to a list of effects.
 *   - Multi-value OR within a single facet (any selected gallery matches).
 *   - AND across different facets.
 *   - tags are AND (an effect must carry every selected tag) — narrowing.
 *   - boolean flags: only enforced when explicitly true.
 */
function applyFilters(list, filters = {}) {
  if (!filters || typeof filters !== 'object') return list;
  let out = list;
  for (const [key, dim] of Object.entries(FILTER_KEY_TO_DIM)) {
    const wanted = asStrArray(filters[key]);
    if (!wanted.length) continue;
    const wantSet = new Set(wanted);
    const def = FACET_DIMS[dim];
    if (key === 'tags') {
      // AND semantics: must carry all selected tags.
      out = out.filter((e) => {
        const have = new Set(def.get(e));
        return wanted.every((t) => have.has(t));
      });
    } else {
      out = out.filter((e) => def.get(e).some((v) => wantSet.has(v)));
    }
  }
  for (const key of Object.keys(BOOL_DIMS)) {
    if (filters[key] === true) out = out.filter((e) => BOOL_DIMS[key].get(e));
    else if (filters[key] === false) out = out.filter((e) => !BOOL_DIMS[key].get(e));
  }
  // Theme-compat facet (JFH-9): themeSensitive selects components whose rendering
  // changes under a theme (they consume theme tokens directly or via themed
  // classes). It is a derived signal, not a stored field, so it lives here.
  if (filters.themeSensitive === true) out = out.filter((e) => isThemeSensitive(e));
  else if (filters.themeSensitive === false) out = out.filter((e) => !isThemeSensitive(e));
  return out;
}

/** Sort effects by a named strategy. `scoreMap` (id->score) drives relevance. */
function sortEffects(list, sort, scoreMap) {
  const byName = (a, b) => (a.name || a.id).localeCompare(b.name || b.id);
  switch (sort) {
    case 'name':
      return [...list].sort(byName);
    case 'newest':
      return [...list].sort((a, b) => (Number(!!b.isNew) - Number(!!a.isNew)) || byName(a, b));
    case 'gallery':
      return [...list].sort((a, b) => String(a.gallery).localeCompare(String(b.gallery)) || byName(a, b));
    case 'relevance':
    default:
      if (scoreMap) {
        return [...list].sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0) || byName(a, b));
      }
      return [...list].sort(byName);
  }
}

const SORTS = ['relevance', 'name', 'newest', 'gallery'];

/** Count how many effects carry each value of a facet dimension. */
function facetValueCounts(list, dimKey) {
  const def = FACET_DIMS[dimKey];
  if (!def) return [];
  const counts = new Map();
  for (const e of list) {
    for (const v of def.get(e)) counts.set(v, (counts.get(v) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
}

/** Count effects matching each boolean flag dimension. */
function boolFlagCounts(list) {
  const out = {};
  for (const [key, def] of Object.entries(BOOL_DIMS)) {
    out[key] = { label: def.label, count: list.filter((e) => def.get(e)).length };
  }
  return out;
}

/** Session-scoped saved-search store, lazily attached to the CatalogStore. */
function savedSearchStore(store) {
  if (!store._savedSearches) store._savedSearches = new Map();
  return store._savedSearches;
}

function slugifyName(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'search';
}

/**
 * Core faceted search shared by search_effects and execute_saved_search.
 * query is optional; when absent, results are all effects matching the filters,
 * ordered by `sort` (defaults to name when there is no query to rank by).
 */
function runSearch(store, { query, gallery, filters, sort, limit, offset } = {}) {
  let list = store.all();
  // `gallery` shorthand (back-compat) folds into the galleries filter.
  const mergedFilters = { ...(filters || {}) };
  if (gallery) mergedFilters.galleries = [...asStrArray(mergedFilters.galleries), gallery];
  list = applyFilters(list, mergedFilters);

  const q = (query || '').trim();
  let scoreMap = null;
  if (q) {
    scoreMap = new Map();
    list = list.filter((e) => {
      const s = matchScore(e, q);
      if (s > 0) scoreMap.set(e.id, s);
      return s > 0;
    });
  }
  const effSort = sort || (q ? 'relevance' : 'name');
  const ordered = sortEffects(list, effSort, scoreMap);
  const shaped = ordered.map((e) => {
    const li = lightEffect(e);
    if (scoreMap) li.score = scoreMap.get(e.id) || 0;
    li.interactions = normalizeInteractions(e.interaction);
    li.spectrum = e.spectrum || null;
    return li;
  });
  const page = paginate(shaped, limit ?? 20, offset ?? 0);
  return { query: q || null, sort: effSort, filters: mergedFilters, ...page };
}

export function buildTools() {
  return [
    // ============================== DISCOVERY (11) ==============================
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
      description: 'Faceted relevance search over the catalog. Full-text ranks across id/name/description/tags/category; the optional `filters` object narrows by gallery, componentType, spectrum (aesthetic), category, tag (AND), and interaction, plus boolean flags (isNew, usableAsBackground, needsJs, isFixed, selfContained). `sort` controls ordering (relevance/name/newest/gallery) and offset/limit paginate. query is optional when filters are given. Use get_available_filters to discover valid facet values.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text, e.g. "pulsing kpi card" or "wind backdrop". Optional if filters are supplied.' },
          gallery: { type: 'string', description: 'Shorthand to restrict to one gallery (folds into filters.galleries).' },
          filters: {
            type: 'object',
            description: 'Facet filters. Array facets are OR within a facet (except tags = AND) and AND across facets. Interaction values are normalized (e.g. static/focus/scroll).',
            properties: {
              galleries: { ...strArr, description: 'Match any of these gallery ids' },
              componentTypes: { ...strArr, description: 'Match any of these componentType values' },
              spectrums: { ...strArr, description: 'Match any of these spectrum (aesthetic) values' },
              categories: { ...strArr, description: 'Match any of these category values' },
              tags: { ...strArr, description: 'Must carry ALL of these tags (AND)' },
              interactions: { ...strArr, description: 'Match any of these normalized interaction tokens (static, hover, click, focus, scroll, auto-play, drag, toggle, on-load, …)' },
              isNew: { type: 'boolean' },
              usableAsBackground: { type: 'boolean' },
              needsJs: { type: 'boolean' },
              isFixed: { type: 'boolean' },
              selfContained: { type: 'boolean' },
              themeSensitive: { type: 'boolean', description: 'Theme-compat filter: true = only components whose look changes across themes (consume theme tokens); false = theme-neutral components.' },
            },
            additionalProperties: false,
          },
          sort: { type: 'string', enum: SORTS, description: 'Ordering. Defaults to relevance when a query is given, else name.' },
          limit: { type: 'integer', minimum: 1, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        const hasQuery = a.query && a.query.trim();
        const hasFilters = (a.filters && Object.values(a.filters).some((v) => (Array.isArray(v) ? v.length : v != null))) || a.gallery;
        if (!hasQuery && !hasFilters) {
          throw new ToolError('Provide a query and/or at least one filter', { code: 'invalid_argument' });
        }
        return runSearch(store, {
          query: a.query,
          gallery: a.gallery,
          filters: a.filters,
          sort: a.sort,
          limit: a.limit ?? 20,
          offset: a.offset ?? 0,
        });
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
      name: 'get_theme_palette',
      description: 'Return the token palette for one theme (or all themes). Prism themes are pure :root token overrides applied over identical component HTML/CSS, so a palette fully defines how every component looks in that theme. Each theme returns its complete token map, the overrides vs the Prism base, mode (light/dark), and a ready-to-paste :root{…} CSS block. Themes: prism-dark, oled-dark, cyberpunk-dark, light, dark.',
      inputSchema: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: THEME_IDS, description: 'A theme id. Omit to return all themes.' },
        },
        additionalProperties: false,
      },
      handler: (a) => {
        const shape = (t) => ({
          id: t.id, name: t.name, mode: t.mode, builtin: t.builtin,
          tokens: t.tokens, overrides: t.overrides,
          overrideCount: Object.keys(t.overrides).length,
          css: themeRootCss(t.id),
        });
        if (a.theme) {
          const t = getTheme(a.theme);
          if (!t) throw new ToolError(`No theme "${a.theme}"`, { code: 'not_found', data: { themes: THEME_IDS } });
          return shape(t);
        }
        return { base: BASE_TOKENS, tokenMeta: TOKEN_META, themeCount: THEMES.length, themes: THEMES.map(shape) };
      },
    },
    {
      name: 'get_component_variants',
      description: 'Return every theme variant of one component. Because a variant is the same html/css under a different :root token set, this returns the component payload ONCE plus, for each theme, the token overrides to apply (and optionally the full recolored css). Also reports which theme tokens the component consumes and whether it is theme-sensitive. Ideal for building a variant matrix or previewing a component across themes.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The effect id (e.g. "charts-big-metric-count-up")' },
          includeCss: { type: 'boolean', default: false, description: 'Include the component css payload once (shared across all variants).' },
          themes: { ...strArr, description: 'Restrict to these theme ids (default: all). Valid: ' + THEME_IDS.join(', ') },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        const e = store.get(a.id);
        if (!e) {
          const suggestions = store.all().map((x) => ({ id: x.id, score: matchScore(x, a.id) }))
            .filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 5).map((x) => x.id);
          throw new ToolError(`No effect with id "${a.id}"`, { code: 'not_found', data: { suggestions } });
        }
        let themes = THEMES;
        if (a.themes && a.themes.length) {
          const bad = a.themes.filter((id) => !getTheme(id));
          if (bad.length) throw new ToolError(`Unknown theme(s): ${bad.join(', ')}`, { code: 'invalid_argument', data: { themes: THEME_IDS } });
          themes = a.themes.map(getTheme);
        }
        const consumed = usesTokens(e);
        return {
          id: e.id,
          name: e.name,
          gallery: e.gallery,
          componentType: e.componentType || '',
          themeSensitive: isThemeSensitive(e),
          usesTokens: consumed,
          note: 'One payload, many variants: render = html + css + the chosen theme\'s token overrides on :root.',
          html: e.html,
          ...(a.includeCss ? { css: e.css } : {}),
          variantCount: themes.length,
          variants: themes.map((t) => ({
            theme: t.id,
            name: t.name,
            mode: t.mode,
            // the full override set, plus only the overrides this component actually
            // reacts to (a consumed token the theme does NOT override is not "relevant").
            overrides: t.overrides,
            relevantOverrides: consumed.reduce((o, k) => { if (t.overrides[k] !== undefined) o[k] = t.overrides[k]; return o; }, {}),
            rootCss: themeRootCss(t.id),
          })),
        };
      },
    },
    {
      name: 'get_variants_for_theme',
      description: 'List components as they appear under a single theme, with each component\'s relevant token values for that theme. Supports the same facets as search_effects (gallery, componentType, spectrum, tag, flags) plus a themeSensitiveOnly filter, and paginates. Use this to render a whole gallery in one theme.',
      inputSchema: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: THEME_IDS, description: 'The theme id to render under.' },
          gallery: { type: 'string', description: 'Restrict to one gallery.' },
          componentType: { type: 'string', description: 'Restrict to one componentType.' },
          spectrum: { type: 'string', description: 'Restrict to one spectrum (aesthetic).' },
          tag: { type: 'string', description: 'Restrict to components carrying this tag.' },
          themeSensitiveOnly: { type: 'boolean', default: false, description: 'Only components whose rendering changes by theme.' },
          limit: { type: 'integer', minimum: 1, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
        required: ['theme'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        const t = getTheme(a.theme);
        if (!t) throw new ToolError(`No theme "${a.theme}"`, { code: 'not_found', data: { themes: THEME_IDS } });
        let list = store.all();
        if (a.gallery) list = list.filter((e) => e.gallery === a.gallery);
        if (a.componentType) list = list.filter((e) => e.componentType === a.componentType);
        if (a.spectrum) list = list.filter((e) => e.spectrum === a.spectrum);
        if (a.tag) list = list.filter((e) => (e.tags || []).includes(a.tag));
        if (a.themeSensitiveOnly) list = list.filter((e) => isThemeSensitive(e));
        const mapped = list.map((e) => {
          const consumed = usesTokens(e);
          return {
            id: e.id,
            name: e.name,
            gallery: e.gallery,
            componentType: e.componentType || '',
            themeSensitive: isThemeSensitive(e),
            usesTokens: consumed,
            tokenValues: consumed.reduce((o, k) => { o[k] = t.tokens[k]; return o; }, {}),
          };
        });
        const page = paginate(mapped, a.limit ?? 50, a.offset ?? 0);
        return { theme: { id: t.id, name: t.name, mode: t.mode }, overrides: t.overrides, ...page };
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

    {
      name: 'get_available_filters',
      description: 'Describe every facet available for search_effects: each array facet (gallery, componentType, spectrum, category, tag, interaction) with its top values and counts, plus the boolean flags and their counts, and the valid sort options. Use this to build a faceted UI or to learn valid filter values before searching.',
      inputSchema: {
        type: 'object',
        properties: {
          topValues: { type: 'integer', minimum: 1, default: 25, description: 'Max values to return per array facet (by frequency). Use list_filter_values for the full list of one facet.' },
        },
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        const all = store.all();
        const top = a.topValues ?? 25;
        const facets = {};
        for (const [key, def] of Object.entries(FACET_DIMS)) {
          const values = facetValueCounts(all, key);
          facets[key] = {
            label: def.label,
            multi: !!def.multi,
            normalized: !!def.normalized,
            filterKey: Object.keys(FILTER_KEY_TO_DIM).find((k) => FILTER_KEY_TO_DIM[k] === key),
            totalValues: values.length,
            values: values.slice(0, top),
          };
        }
        return {
          totalEffects: all.length,
          facets,
          booleanFlags: boolFlagCounts(all),
          sorts: SORTS,
          notes: [
            'tags filter uses AND (an effect must have every selected tag); all other array facets use OR.',
            'interaction values are normalized from noisy source data (e.g. "tatic"→static, "focu"→focus, "croll"→scroll).',
            'No performance or theme-compatibility facet exists in the catalog; those are intentionally omitted.',
          ],
        };
      },
    },
    {
      name: 'list_filter_values',
      description: 'List the full set of values for a single facet dimension (gallery, componentType, spectrum, category, tag, or interaction) with per-value effect counts. Complements get_available_filters when you need every value of one facet (e.g. all 175 categories).',
      inputSchema: {
        type: 'object',
        properties: {
          facet: { type: 'string', enum: Object.keys(FACET_DIMS), description: 'Which facet dimension to enumerate' },
          prefix: { type: 'string', description: 'Optional case-insensitive prefix/substring filter on the value' },
          limit: { type: 'integer', minimum: 1, default: 200 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
        required: ['facet'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        if (!FACET_DIMS[a.facet]) {
          throw new ToolError(`Unknown facet "${a.facet}"`, { code: 'invalid_argument', data: { validFacets: Object.keys(FACET_DIMS) } });
        }
        let values = facetValueCounts(store.all(), a.facet);
        if (a.prefix) {
          const p = a.prefix.toLowerCase();
          values = values.filter((v) => String(v.value).toLowerCase().includes(p));
        }
        const page = paginate(values, a.limit ?? 200, a.offset ?? 0);
        return { facet: a.facet, label: FACET_DIMS[a.facet].label, ...page };
      },
    },
    {
      name: 'create_saved_search',
      description: 'Save a named search (query + filters + sort) for reuse this session. Returns an id you can pass to execute_saved_search. Saved searches live in server memory for the current process (they are not persisted to disk).',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Human label for the saved search' },
          query: { type: 'string' },
          filters: { type: 'object', additionalProperties: true, description: 'Same shape as search_effects.filters' },
          sort: { type: 'string', enum: SORTS },
          description: { type: 'string', description: 'Optional note about what this search is for' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        const name = String(a.name || '').trim();
        if (!name) throw new ToolError('name is required', { code: 'invalid_argument' });
        const hasQuery = a.query && a.query.trim();
        const hasFilters = a.filters && Object.values(a.filters).some((v) => (Array.isArray(v) ? v.length : v != null));
        if (!hasQuery && !hasFilters) throw new ToolError('A saved search needs a query and/or at least one filter', { code: 'invalid_argument' });
        if (a.sort && !SORTS.includes(a.sort)) throw new ToolError(`Invalid sort "${a.sort}"`, { code: 'invalid_argument', data: { validSorts: SORTS } });
        const saved = savedSearchStore(store);
        // Stable, collision-resistant id: slug + short numeric suffix.
        let base = slugifyName(name);
        let id = base;
        let n = 2;
        while (saved.has(id)) id = `${base}-${n++}`;
        const record = {
          id,
          name,
          description: a.description || '',
          query: hasQuery ? a.query.trim() : null,
          filters: a.filters || {},
          sort: a.sort || null,
          createdAt: new Date().toISOString(),
        };
        saved.set(id, record);
        return { created: id, savedSearch: record, total: saved.size };
      },
    },
    {
      name: 'get_saved_searches',
      description: 'List all saved searches for this session (id, name, query, filters, sort). Empty until create_saved_search is called.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: (a, { store }) => {
        const saved = savedSearchStore(store);
        return { total: saved.size, items: Array.from(saved.values()) };
      },
    },
    {
      name: 'execute_saved_search',
      description: 'Run a previously saved search by id and return ranked results (same shape as search_effects). Optionally override sort/limit/offset without changing the saved definition.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Saved-search id from create_saved_search/get_saved_searches' },
          sort: { type: 'string', enum: SORTS, description: 'Override the saved sort for this run' },
          limit: { type: 'integer', minimum: 1, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a, { store }) => {
        const saved = savedSearchStore(store);
        const record = saved.get(a.id);
        if (!record) {
          throw new ToolError(`No saved search with id "${a.id}"`, { code: 'not_found', data: { available: Array.from(saved.keys()) } });
        }
        const res = runSearch(store, {
          query: record.query,
          filters: record.filters,
          sort: a.sort || record.sort,
          limit: a.limit ?? 20,
          offset: a.offset ?? 0,
        });
        return { savedSearch: { id: record.id, name: record.name }, ...res };
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
