// Prism Deck catalog loader + in-memory store with hot reload.
//
// Prism's third catalog: Stream Deck (and Corsair Galleon) facets rendered by the
// zero-dependency prism-deck engine — keys, spans of keys, touch strips, screens and
// whole decks, glyphs × themes. Like the terminal catalog it is described by a JSON
// island in Prism.html:
//
//   <script type="application/json" id="prism-deck-catalog"> … </script>
//
// DERIVED from prism-deck/src/** by prism-deck/scripts/build-catalog.mjs, which writes
// prism-deck/catalog/deck-catalog.json (schema 2: devices, themes, glyphs, galleries,
// facets and a top-level `sources` map of every browser-safe module). Resolution
// order on every (re)load: Prism.html island → deck-catalog.json → none. A malformed
// island falls through to the JSON file; a failed hot reload keeps the last good copy.
// The catalog is optional: without it the deck tools report `unavailable`.

import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const DECK_ISLAND_ID = 'prism-deck-catalog';
export const DECK_ISLAND_OPEN = `<script type="application/json" id="${DECK_ISLAND_ID}">`;
export const DECK_SURFACES = ['key', 'span', 'strip', 'screen', 'deck'];

/** Extract + parse the deck island from Prism.html source. null when absent; throws when malformed. */
export function parseDeckIsland(html) {
  const open = html.indexOf(DECK_ISLAND_OPEN);
  if (open === -1) return null;
  const start = open + DECK_ISLAND_OPEN.length;
  const end = html.indexOf('</script>', start);
  if (end === -1) throw new Error('prism-deck-catalog island is not terminated');
  // The embedder writes "</script" as "<\/script" and "<!--" as "<!--": both valid JSON.
  const raw = html.slice(start, end);
  if (!raw.trim()) return null;
  try { return JSON.parse(raw); } catch (err) { throw new Error(`Failed to parse prism-deck-catalog JSON island: ${err.message}`); }
}

const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

function normalizeFacet(f) {
  return {
    id: String(f.id),
    title: f.title || String(f.id),
    gallery: f.gallery || null,
    galleryTitle: f.galleryTitle || null,
    category: f.category || null,
    description: f.description || '',
    tags: toArray(f.tags).map(String),
    surface: DECK_SURFACES.includes(f.surface) ? f.surface : 'key',
    span: obj(f.span),
    segments: f.segments ?? null,
    screens: Array.isArray(f.screens) ? f.screens : null,
    devices: Array.isArray(f.devices) ? f.devices : null,
    glyph: f.glyph || null,
    theme: f.theme || null,
    animated: f.animated !== false,
    fps: typeof f.fps === 'number' ? f.fps : null,
    loop: typeof f.loop === 'number' ? f.loop : null,
    states: toArray(f.states).map(String),
    tones: obj(f.tones),
    press: f.press || 'none',
    params: obj(f.params) || {},
    data: toArray(f.data).map(String),
    targets: toArray(f.targets),
    since: f.since || null,
    credits: f.credits || null,
    module: f.module || null,
    imports: toArray(f.imports).map(String),
    usage: obj(f.usage) || {},
    preview: obj(f.preview),
  };
}

/** Normalize a raw deck catalog into a stable internal shape. */
export function normalizeDeckCatalog(raw) {
  const r = raw || {};
  const sources = obj(r.sources) || {};
  const ai = obj(r._ai);
  return {
    ai,
    schema: Number(ai && ai.schema) || 1,
    engine: obj(r.engine),
    devices: toArray(r.devices).filter((d) => d && d.id),
    themes: toArray(r.themes).filter((t) => t && t.id).map((t) => ({ id: t.id, title: t.title || t.id, description: t.description || '', modes: toArray(t.modes), tags: toArray(t.tags), module: t.module || null })),
    glyphs: toArray(r.glyphs).filter((g) => g && g.id).map((g) => ({ id: g.id, title: g.title || g.id, category: g.category || null, tags: toArray(g.tags), states: obj(g.states) || {}, loop: typeof g.loop === 'number' ? g.loop : 0, module: g.module || null })),
    galleries: toArray(r.galleries).filter((g) => g && g.id).map((g) => ({
      id: g.id, title: g.title || g.id, icon: g.icon || null, hue: g.hue ?? null, surfaces: toArray(g.surfaces), blurb: g.blurb || '', count: typeof g.count === 'number' ? g.count : null,
      categories: toArray(g.categories).map((c) => (typeof c === 'string' ? { name: c, count: null } : { name: c.name, count: c.count ?? null })),
    })),
    facets: toArray(r.facets).filter((f) => f && f.id != null).map(normalizeFacet),
    sources, // the raw map itself, never copied
  };
}

/** Where the facet can go: a compact footprint. */
export function footprint(f) {
  if (f.surface === 'span') return { span: f.span || { cols: 'all', rows: 1 } };
  if (f.surface === 'strip') return { segments: f.segments ?? 'all' };
  if (f.surface === 'screen') return { screens: f.screens || [] };
  return null;
}

/** Light projection for lists/search (no preview, params as names only). */
export function lightDeckFacet(f) {
  return {
    id: f.id,
    title: f.title,
    gallery: f.gallery,
    category: f.category,
    surface: f.surface,
    ...(footprint(f) ? { footprint: footprint(f) } : {}),
    description: f.description,
    tags: f.tags,
    animated: f.animated,
    states: f.states,
    press: f.press,
    params: Object.keys(f.params),
    ...(f.data.length ? { data: f.data } : {}),
    ...(f.devices ? { devices: f.devices } : {}),
  };
}

/**
 * Can facet `f` be placed on catalog device `d` (catalog device record)? A catalog-only
 * heuristic (the engine's facetMode() is exact): keys/spans need keys, strips need dials,
 * screens need the matching screen, deck facets need an LCD panel.
 */
export function facetFitsDevice(f, d) {
  if (!d) return false;
  if (f.devices && !f.devices.includes(d.id)) return false;
  const hasKeys = (d.cols || 0) * (d.rows || 0) > 0 && d.display !== 'none';
  const kind = d.screen && d.screen.kind;
  switch (f.surface) {
    case 'key': case 'span': return hasKeys;
    case 'strip': return (d.dials || 0) > 0;
    case 'screen': return (f.screens || []).some((s) => (s === 'galleon' || s === 'galleon-widget' ? kind === 'galleon' : s === 'infobar' ? kind === 'infobar' : s === 'monitor' ? kind === 'monitor' : false));
    case 'deck': return d.display === 'lcd' && !d.generic && hasKeys;
    default: return false;
  }
}

/** Weighted relevance over title/id/tags/category/gallery/description. */
export function deckScore(f, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return 0;
  const hay = {
    title: f.title.toLowerCase(),
    id: f.id.toLowerCase(),
    tags: f.tags.map((t) => t.toLowerCase()),
    cat: `${f.category || ''} ${f.gallery || ''} ${f.galleryTitle || ''} ${f.surface}`.toLowerCase(),
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

/**
 * Where to look for the deck catalog, given the main catalog path.
 *   catalogPath = <repo>/Prism.html            → island in it; JSON at <repo>/prism-deck/catalog/
 *   catalogPath = <repo>/catalog/manifest.json → island in <repo>/Prism.html; same JSON
 * `explicit` (.html or .json) overrides both. When the derived JSON does not exist the
 * prism-deck package next to this server (../../prism-deck) is tried as well.
 */
export function resolveDeckPaths(catalogPath, explicit) {
  if (explicit) {
    const p = path.resolve(explicit);
    const isHtml = /\.html?$/i.test(p);
    return { htmlPath: isHtml ? p : null, jsonPath: isHtml ? null : p };
  }
  const abs = path.resolve(String(catalogPath || '.'));
  const isHtml = /\.html?$/i.test(abs);
  const dir = path.dirname(abs);
  const root = isHtml ? dir : path.basename(dir) === 'catalog' ? path.dirname(dir) : dir;
  let jsonPath = path.join(root, 'prism-deck', 'catalog', 'deck-catalog.json');
  const sibling = path.resolve(HERE, '..', '..', 'prism-deck', 'catalog', 'deck-catalog.json');
  if (!fs.existsSync(jsonPath) && fs.existsSync(sibling)) jsonPath = sibling;
  return { htmlPath: isHtml ? abs : path.join(root, 'Prism.html'), jsonPath };
}

/**
 * In-memory deck catalog with indexes and optional hot reload. load() never throws:
 * an absent catalog leaves the store empty with `available: false`.
 */
export class DeckCatalogStore extends EventEmitter {
  constructor({ htmlPath = null, jsonPath = null, watch = false, logger = null, raw = null } = {}) {
    super();
    this.htmlPath = htmlPath ? path.resolve(htmlPath) : null;
    this.jsonPath = jsonPath ? path.resolve(jsonPath) : null;
    this.watch = watch;
    this.logger = logger;
    this.catalog = normalizeDeckCatalog({});
    this.source = 'none';
    this.loadedFrom = null;
    this.loaded = false;
    this.problems = [];
    this._byId = new Map();
    this._watchers = [];
    this._reloadTimer = null;
    if (raw) { this._apply({ raw, source: 'memory', filePath: null, problems: [] }); this.loaded = true; }
  }

  async _read() {
    const problems = [];
    if (this.htmlPath) {
      try {
        const raw = parseDeckIsland(await readFile(this.htmlPath, 'utf8'));
        if (raw) { await this._withPreviews(raw); return { raw, source: 'island', filePath: this.htmlPath, problems }; }
        problems.push(`${this.htmlPath}: no ${DECK_ISLAND_ID} island`);
      } catch (err) {
        problems.push(err.code === 'ENOENT' ? `${this.htmlPath}: not found` : `${this.htmlPath}: ${err.message}`);
      }
    }
    if (this.jsonPath) {
      try {
        return { raw: JSON.parse(await readFile(this.jsonPath, 'utf8')), source: 'json', filePath: this.jsonPath, problems };
      } catch (err) {
        problems.push(err.code === 'ENOENT' ? `${this.jsonPath}: not found` : `${this.jsonPath}: ${err.message}`);
      }
    }
    return { raw: null, source: 'none', filePath: null, problems };
  }

  /**
   * Prism.html's island leaves out the facets' static `preview` SVGs (the page renders live; they
   * were 2.6 MB of its 5 MB). Fill them in, by id, from deck-catalog.json when it is there, so
   * deck_get_facet { includePreview } keeps working; without the JSON, previewAvailable is false.
   */
  async _withPreviews(raw) {
    const facets = Array.isArray(raw && raw.facets) ? raw.facets : [];
    if (!this.jsonPath || !facets.length || facets.some((f) => f && f.preview)) return;
    try {
      const json = JSON.parse(await readFile(this.jsonPath, 'utf8'));
      const byId = new Map((json.facets || []).filter((f) => f && f.preview).map((f) => [f.id, f.preview]));
      for (const f of facets) if (f && byId.has(f.id)) f.preview = byId.get(f.id);
    } catch { /* no JSON next to it: the island alone (no previews) */ }
  }

  _apply({ raw, source, filePath, problems }) {
    this.catalog = normalizeDeckCatalog(raw || {});
    this.source = source;
    this.loadedFrom = filePath;
    this.problems = problems;
    this._byId = new Map(this.catalog.facets.map((f) => [f.id, f]));
  }

  async load() {
    if (this.source === 'memory') return this.catalog;
    const res = await this._read();
    this._apply(res);
    this.loaded = true;
    if (res.source === 'none') this.log('warn', `Deck catalog not available (${res.problems.join('; ')})`);
    else this.log('info', `Loaded deck catalog: ${this.catalog.facets.length} facets, ${this.catalog.themes.length} themes, ${this.catalog.glyphs.length} glyphs from ${res.filePath} (${res.source})`);
    if (this.watch && !this._watchers.length) this._startWatch();
    return this.catalog;
  }

  async ensureLoaded() { if (!this.loaded) await this.load(); return this; }

  _startWatch() {
    const dirs = new Map();
    for (const p of [this.htmlPath, this.jsonPath].filter(Boolean)) {
      const d = path.dirname(p);
      if (!dirs.has(d)) dirs.set(d, new Set());
      dirs.get(d).add(path.basename(p));
    }
    for (const [dir, names] of dirs) {
      try {
        this._watchers.push(fs.watch(dir, (evt, fname) => {
          if (fname && !names.has(path.basename(fname))) return;
          clearTimeout(this._reloadTimer);
          this._reloadTimer = setTimeout(() => this._hotReload(), 200);
        }));
      } catch (err) { this.log('debug', `Deck catalog: cannot watch ${dir}: ${err.message}`); }
    }
  }

  async _hotReload() {
    try {
      const res = await this._read();
      if (res.source === 'none' && this.source !== 'none') {
        this.log('warn', `Deck catalog reload found no source (${res.problems.join('; ')}); keeping previous catalog`);
        this.emit('error', new Error('deck catalog source unavailable'));
        return;
      }
      this._apply(res);
      const stats = { facets: this.catalog.facets.length, source: this.source };
      this.log('info', `Hot-reloaded deck catalog: ${stats.facets} facets (${stats.source})`);
      this.emit('reload', stats);
    } catch (err) {
      this.log('warn', `Deck catalog hot reload failed (keeping previous catalog): ${err.message}`);
      this.emit('error', err);
    }
  }

  close() {
    for (const w of this._watchers) w.close();
    this._watchers = [];
    clearTimeout(this._reloadTimer);
  }

  // --- queries ---
  get available() { return this.source !== 'none' && this.catalog.facets.length > 0; }
  get(id) { return this._byId.get(id) || null; }
  all() { return this.catalog.facets; }
  galleries() { return this.catalog.galleries; }
  themes() { return this.catalog.themes; }
  glyphs() { return this.catalog.glyphs; }
  devices() { return this.catalog.devices; }
  engine() { return this.catalog.engine; }
  sourceOf(f) { return f && f.module && typeof this.catalog.sources[f.module] === 'string' ? this.catalog.sources[f.module] : null; }
  meta() {
    return {
      available: this.available,
      source: this.source,
      filePath: this.loadedFrom,
      searched: [this.htmlPath, this.jsonPath].filter(Boolean),
      problems: this.problems,
      schema: this.catalog.schema,
      facetCount: this.catalog.facets.length,
      themeCount: this.catalog.themes.length,
      glyphCount: this.catalog.glyphs.length,
      deviceCount: this.catalog.devices.length,
      galleryCount: this.catalog.galleries.length,
      sourceModules: Object.keys(this.catalog.sources).length,
      engine: this.catalog.engine,
      hotReload: this._watchers.length > 0,
    };
  }

  log(level, msg) { if (this.logger) (this.logger[level] || this.logger.info).call(this.logger, msg); }
}
