// Terminal catalog tools (prism-term facets). Built by terminalTools(helpers) and
// spread into buildTools() so they share ToolError + pagination with the rest.
// Handlers receive ctx.terminal (a TerminalCatalogStore) and load it lazily.

import { GLYPH_LEVELS, COLOR_LEVELS, lightTerminalFacet } from '../utils/terminal-catalog.js';

const KINDS = ['scene', 'widget', 'spinner', 'progress', 'text', 'chart', 'tui', 'diagram', 'art'];

const HOW_TO_USE = 'To use a facet: run its `usage.cli` command (`prism-term play <id>`, needs the prism-term package) or `usage.npx` (no install; Node ≥ 18), or in code `import { play, findFacet } from \'prism-term\'; await play(findFacet(id))`. `usage.curl` prints a still frame in any terminal.';

// Filters shared by list_terminal_facets and search_terminal_facets.
const FILTER_PROPS = {
  gallery: { type: 'string', description: 'Gallery id (see list_terminal_galleries), e.g. "loaders", "progress", "ops", "fx"' },
  category: { type: 'string', description: 'Category name within a gallery, e.g. "Progress Bars"' },
  kind: { type: 'string', enum: KINDS, description: 'Facet kind' },
  tag: { type: 'string', description: 'Only facets carrying this tag' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Only facets carrying ALL of these tags' },
  glyphs: { type: 'string', enum: GLYPH_LEVELS, description: 'Exact minimum glyph set the facet needs' },
  maxGlyphs: { type: 'string', enum: GLYPH_LEVELS, description: 'What the target terminal can draw: returns facets needing at most this (ascii < unicode < braille < sextant). Use "ascii" for serial consoles / the Linux VT.' },
  color: { type: 'string', enum: COLOR_LEVELS, description: 'Exact minimum colour depth the facet needs' },
  maxColor: { type: 'string', enum: COLOR_LEVELS, description: 'Colour depth the target terminal supports: returns facets needing at most this (mono < 16 < 256 < truecolor).' },
  animated: { type: 'boolean', description: 'true = animated facets only, false = stills only' },
  maxWidth: { type: 'integer', minimum: 1, description: 'Only facets whose minimum width fits in this many columns' },
  maxHeight: { type: 'integer', minimum: 1, description: 'Only facets whose minimum height fits in this many rows' },
};

function applyFilters(list, a) {
  const tags = [...(a.tags || []), ...(a.tag ? [a.tag] : [])].map((t) => String(t).toLowerCase());
  const gMax = a.maxGlyphs ? GLYPH_LEVELS.indexOf(a.maxGlyphs) : null;
  const cMax = a.maxColor ? COLOR_LEVELS.indexOf(a.maxColor) : null;
  return list.filter((f) => {
    if (a.gallery && f.gallery !== a.gallery) return false;
    if (a.category && (f.category || '').toLowerCase() !== String(a.category).toLowerCase()) return false;
    if (a.kind && f.kind !== a.kind) return false;
    if (tags.length && !tags.every((t) => f.tags.some((x) => x.toLowerCase() === t))) return false;
    if (a.glyphs && f.glyphs !== a.glyphs) return false;
    if (gMax != null && GLYPH_LEVELS.indexOf(f.glyphs) > gMax) return false;
    if (a.color && f.color !== a.color) return false;
    if (cMax != null && COLOR_LEVELS.indexOf(f.color) > cMax) return false;
    if (typeof a.animated === 'boolean' && f.animated !== a.animated) return false;
    if (a.maxWidth && f.minSize.w > a.maxWidth) return false;
    if (a.maxHeight && f.minSize.h > a.maxHeight) return false;
    return true;
  });
}

const hasFilter = (a) => Object.keys(FILTER_PROPS).some((k) => (Array.isArray(a[k]) ? a[k].length : a[k] != null && a[k] !== ''));

/** Weighted relevance over title/id/tags/category/gallery/description. */
export function terminalScore(f, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return 0;
  const hay = {
    title: f.title.toLowerCase(),
    id: f.id.toLowerCase(),
    tags: f.tags.map((t) => t.toLowerCase()),
    cat: `${f.category || ''} ${f.gallery || ''} ${f.galleryTitle || ''}`.toLowerCase(),
    desc: f.description.toLowerCase(),
  };
  let score = 0;
  for (const t of q.split(/\s+/).filter(Boolean)) {
    if (hay.title.includes(t)) score += 5;
    if (hay.id.includes(t)) score += 4;
    if (hay.tags.includes(t)) score += 5;
    else if (hay.tags.some((x) => x.includes(t))) score += 3;
    if (hay.cat.includes(t)) score += 2;
    if (hay.desc.includes(t)) score += 1;
  }
  if (hay.title === q || hay.id === q) score += 10;
  else if (hay.title.includes(q)) score += 3;
  return score;
}

export function terminalTools({ ToolError, paginate }) {
  async function ready(terminal) {
    if (!terminal) throw new ToolError('The terminal catalog is not available in this server context', { code: 'unavailable' });
    await terminal.ensureLoaded();
    if (!terminal.available) {
      const m = terminal.meta();
      throw new ToolError('No terminal catalog found. Build it with `cd prism-term && npm run catalog` (writes prism-term/catalog/terminal-catalog.json), or embed the #prism-terminal-catalog island into Prism.html.', {
        code: 'unavailable', data: { searched: m.searched, problems: m.problems },
      });
    }
    return terminal;
  }

  return [
    {
      name: 'list_terminal_galleries',
      description: 'List the terminal-catalog galleries (Prism\'s prism-term facets — spinners, progress bars & counters, charts, TUI controls, ops views, scenes, text art …) with their categories and facet counts. Start here to browse terminal facets.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async (a, { terminal }) => {
        const t = await ready(terminal);
        const facets = t.all();
        const items = t.galleries().map((g) => {
          const mine = facets.filter((f) => f.gallery === g.id);
          return {
            id: g.id,
            title: g.title,
            icon: g.icon,
            blurb: g.blurb,
            declaredCount: g.count,
            liveCount: mine.length,
            categories: g.categories.map((c) => ({ name: c.name, count: mine.filter((f) => f.category === c.name).length })),
          };
        });
        return { total: items.length, source: t.source, items };
      },
    },
    {
      name: 'list_terminal_facets',
      description: `List terminal facets with filters (gallery, category, kind, tags, glyph/colour requirements vs. what the target terminal supports, animated, size) and pagination. Returns light metadata plus each facet's run commands. ${HOW_TO_USE}`,
      inputSchema: {
        type: 'object',
        properties: {
          ...FILTER_PROPS,
          limit: { type: 'integer', minimum: 1, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
        additionalProperties: false,
      },
      handler: async (a, { terminal }) => {
        const t = await ready(terminal);
        const list = applyFilters(t.all(), a);
        return paginate(list.map(lightTerminalFacet), a.limit ?? 50, a.offset ?? 0);
      },
    },
    {
      name: 'search_terminal_facets',
      description: `Ranked text search over terminal facets (title, id, tags, category/gallery, description), e.g. "braille spinner", "download progress eta", "htop cpu bars", "matrix rain". Accepts the same filters as list_terminal_facets; query is optional when a filter is given. Each item carries its relevance score. ${HOW_TO_USE}`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text. Optional if filters are supplied.' },
          ...FILTER_PROPS,
          limit: { type: 'integer', minimum: 1, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
        additionalProperties: false,
      },
      handler: async (a, { terminal }) => {
        const q = a.query && String(a.query).trim();
        if (!q && !hasFilter(a)) throw new ToolError('Provide a query and/or at least one filter', { code: 'invalid_argument' });
        const t = await ready(terminal);
        let list = applyFilters(t.all(), a).map((f) => ({ f, score: q ? terminalScore(f, q) : 0 }));
        if (q) list = list.filter((x) => x.score > 0);
        list.sort((x, y) => y.score - x.score || x.f.title.localeCompare(y.f.title));
        const page = paginate(list.map((x) => ({ ...lightTerminalFacet(x.f), score: x.score })), a.limit ?? 20, a.offset ?? 0);
        return { query: q || null, ...page };
      },
    },
    {
      name: 'get_terminal_facet',
      description: `Full record for one terminal facet: metadata, tunable params (pass as --set key=value), run commands (usage.cli / usage.npx / usage.snapshot / usage.curl / usage.code), the facet's ES-module \`source\` with its \`imports\` (relative to \`module\`), the "_" gallery helper modules it needs as \`helpers\` [{ path, source }], and a plain-text preview frame. Engine modules (prism-term/src/*.js) are not included: they come with the prism-term package. ${HOW_TO_USE}`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Terminal facet id, e.g. "plasma" or "progress-odometer"' },
          includeSource: { type: 'boolean', default: true, description: 'Include the module source and its helpers (can be several KB)' },
          includeHelpers: { type: 'boolean', default: true, description: 'Include the "_" gallery helper modules (`helpers`) alongside the source' },
          includePreview: { type: 'boolean', default: true, description: 'Include the plain-text preview frame' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: async (a, { terminal }) => {
        const t = await ready(terminal);
        const f = t.get(a.id);
        if (!f) {
          const suggestions = t.all()
            .map((x) => ({ id: x.id, score: terminalScore(x, String(a.id).replace(/[-_]+/g, ' ')) }))
            .filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 5).map((x) => x.id);
          throw new ToolError(`No terminal facet with id "${a.id}"`, { code: 'not_found', data: { suggestions } });
        }
        const out = { ...f };
        if (a.includeSource === false) delete out.source;
        else if (a.includeHelpers !== false) out.helpers = t.helpersOf(f);
        if (a.includePreview === false) delete out.preview;
        const engine = t.engine();
        if (engine) out.engine = { package: engine.package, version: engine.version, npx: engine.npx, repo: engine.repo };
        return out;
      },
    },
    {
      name: 'get_terminal_catalog_stats',
      description: 'Aggregate statistics for the terminal catalog: facet totals per gallery, kind, glyph and colour requirement, animated vs still, top tags, the engine package, and where the catalog was loaded from (Prism.html island or prism-term/catalog/terminal-catalog.json).',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      handler: async (a, { terminal }) => {
        const t = await ready(terminal);
        const all = t.all();
        const tally = (key) => all.reduce((m, f) => ((m[f[key]] = (m[f[key]] || 0) + 1), m), {});
        const tags = {};
        for (const f of all) for (const tag of f.tags) tags[tag] = (tags[tag] || 0) + 1;
        const meta = t.meta();
        return {
          totalFacets: all.length,
          galleryCount: t.galleries().length,
          byGallery: tally('gallery'),
          byKind: tally('kind'),
          byGlyphs: tally('glyphs'),
          byColor: tally('color'),
          animated: all.filter((f) => f.animated).length,
          still: all.filter((f) => !f.animated).length,
          uniqueTags: Object.keys(tags).length,
          topTags: Object.entries(tags).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([tag, count]) => ({ tag, count })),
          engine: meta.engine,
          schema: meta.schema,
          sourceModules: meta.sourceModules,
          source: meta.source,
          filePath: meta.filePath,
        };
      },
    },
  ];
}
