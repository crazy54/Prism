// Catalog loader + in-memory store with hot reload.
//
// Prism ships two catalog sources and they can disagree:
//   - The JSON island embedded in Prism.html (<script id="prism-catalog">) is the
//     authoritative, freshest catalog (extra fields: componentType/interaction/spectrum).
//   - catalog/manifest.json on disk can be STALE (it is only rebuilt by the extractor).
// This store reads whichever the caller points at. When pointed at an .html file it
// extracts the island; when pointed at a .json file it parses it directly. Either way
// it normalizes into the same shape and builds lookup indexes.

import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const ISLAND_OPEN = '<script type="application/json" id="prism-catalog">';

/** Extract + parse the JSON island from Prism.html source. */
export function parseIsland(html) {
  const open = html.indexOf(ISLAND_OPEN);
  if (open === -1) throw new Error('prism-catalog island not found in HTML');
  const start = open + ISLAND_OPEN.length;
  const end = html.indexOf('</script>', start);
  if (end === -1) throw new Error('prism-catalog island is not terminated');
  // The embedder neutralizes "</script" as "<\/script" so the island can't close early.
  const raw = html.slice(start, end).split('<\\/script').join('</script');
  try {
    return JSON.parse(raw);
  } catch (err) {
    // A malformed island must not crash the process — surface a clear, catchable error.
    throw new Error(`Failed to parse prism-catalog JSON island: ${err.message}`);
  }
}

/** Load + parse a catalog file (auto-detecting .html island vs .json manifest). */
export async function loadCatalogFile(filePath) {
  const text = await readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html' || ext === '.htm') return parseIsland(text);
  // JSON manifest (or anything else we optimistically try as JSON)
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse catalog JSON from ${filePath}: ${err.message}`);
  }
}

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

/** Normalize a raw catalog object into a stable internal shape. */
export function normalizeCatalog(raw) {
  const effects = toArray(raw.effects).map(normalizeEffect);
  const galleries = toArray(raw.galleries);
  return {
    name: raw.name || 'prism-effects',
    version: raw.version || '0.0.0',
    generated: raw.generated || null,
    description: raw.description || '',
    source: raw.source || null,
    galleries,
    categories: toArray(raw.categories),
    tokens: raw.tokens || null,
    usage: raw.usage || null,
    count: typeof raw.count === 'number' ? raw.count : effects.length,
    effects,
  };
}

function normalizeEffect(e) {
  return {
    id: String(e.id),
    name: e.name || e.id,
    gallery: e.gallery || null,
    galleryTitle: e.galleryTitle || null,
    category: e.category || null,
    ref: e.ref || null,
    description: e.description || '',
    classes: toArray(e.classes),
    keyframes: toArray(e.keyframes),
    params: e.params || null,
    componentType: e.componentType || null,
    interaction: e.interaction || null,
    spectrum: e.spectrum || null,
    tags: toArray(e.tags),
    usableAsBackground: !!e.usableAsBackground,
    needsJs: e.needsJs || null,
    selfContained: e.selfContained !== false, // default true when absent
    isNew: !!e.isNew,
    isFixed: !!e.isFixed,
    html: e.html || '',
    css: e.css || '',
    dataSnip: e.dataSnip || null,
  };
}

/** A "light" projection of an effect: metadata without the heavy html/css payload. */
export function lightEffect(e) {
  return {
    id: e.id,
    name: e.name,
    gallery: e.gallery,
    galleryTitle: e.galleryTitle,
    category: e.category,
    ref: e.ref,
    description: e.description,
    tags: e.tags,
    componentType: e.componentType,
    interaction: e.interaction,
    usableAsBackground: e.usableAsBackground,
    needsJs: e.needsJs,
    isNew: e.isNew,
    isFixed: e.isFixed,
    hasHtml: !!e.html,
    hasCss: !!e.css,
  };
}

/**
 * In-memory catalog store with lookup indexes and optional hot reload.
 * Emits 'reload' (with stats) and 'error'.
 */
export class CatalogStore extends EventEmitter {
  constructor(filePath, { watch = false, logger = null } = {}) {
    super();
    this.filePath = path.resolve(filePath);
    this.watch = watch;
    this.logger = logger;
    this.catalog = null;
    this._byId = new Map();
    this._byGallery = new Map();
    this._watcher = null;
    this._reloadTimer = null;
    // In-memory facets created at runtime (create_facet) that are not yet embedded.
    this.runtimeFacets = new Map();
  }

  async load() {
    const raw = await loadCatalogFile(this.filePath);
    this.catalog = normalizeCatalog(raw);
    this._reindex();
    if (this.watch && !this._watcher) this._startWatch();
    this.log('info', `Loaded catalog: ${this.catalog.effects.length} effects, ${this.catalog.galleries.length} galleries from ${this.filePath}`);
    return this.catalog;
  }

  _reindex() {
    this._byId.clear();
    this._byGallery.clear();
    // Guard against a failed/incomplete load: a null catalog (or one missing its
    // effects array) must not crash indexing. Runtime facets are still layered on below.
    if (!this.catalog || !Array.isArray(this.catalog.effects)) {
      this.log('warn', '_reindex called with no valid catalog; index left empty');
      this.catalog = this.catalog || { effects: [], galleries: [] };
      if (!Array.isArray(this.catalog.effects)) this.catalog.effects = [];
    }
    for (const e of this.catalog.effects) this._byId.set(e.id, e);
    // Layer runtime facets on top so they are discoverable immediately. Setting an
    // existing id replaces its value but keeps its Map position, so a runtime
    // UPDATE of a base-catalog effect stays in place and a brand-new facet is appended.
    for (const e of this.runtimeFacets.values()) this._byId.set(e.id, e);
    // Build the gallery index from the DEDUPED id map. Pushing from catalog.effects
    // and runtimeFacets separately would list an updated base effect twice (once as
    // its original, once as the runtime copy) and inflate list_galleries /
    // export_collection(gallery). One entry per id, in _byId (insertion) order.
    for (const e of this._byId.values()) {
      if (!this._byGallery.has(e.gallery)) this._byGallery.set(e.gallery, []);
      this._byGallery.get(e.gallery).push(e);
    }
  }

  _startWatch() {
    try {
      const dir = path.dirname(this.filePath);
      const base = path.basename(this.filePath);
      this._watcher = fs.watch(dir, (evtType, fname) => {
        if (fname && path.basename(fname) !== base) return;
        // Debounce: editors emit multiple events per save.
        clearTimeout(this._reloadTimer);
        this._reloadTimer = setTimeout(() => this._hotReload(), 200);
      });
      this.log('info', `Hot reload watching ${this.filePath}`);
    } catch (err) {
      this.log('warn', `Could not start file watch: ${err.message}`);
    }
  }

  async _hotReload() {
    try {
      const raw = await loadCatalogFile(this.filePath);
      this.catalog = normalizeCatalog(raw);
      this._reindex();
      const stats = { effects: this.catalog.effects.length, galleries: this.catalog.galleries.length };
      this.log('info', `Hot-reloaded catalog: ${stats.effects} effects`);
      this.emit('reload', stats);
    } catch (err) {
      // A partial write mid-save can fail to parse; keep serving the last good copy.
      this.log('warn', `Hot reload failed (keeping previous catalog): ${err.message}`);
      this.emit('error', err);
    }
  }

  /** Register a runtime facet (from create_facet) so it is instantly discoverable. */
  addRuntimeFacet(effect) {
    const norm = normalizeEffect(effect);
    this.runtimeFacets.set(norm.id, norm);
    this._reindex();
    return norm;
  }

  updateRuntimeFacet(id, patch) {
    const existing = this._byId.get(id);
    if (!existing) return null;
    const merged = normalizeEffect({ ...existing, ...patch, id });
    this.runtimeFacets.set(id, merged);
    this._reindex();
    return merged;
  }

  close() {
    if (this._watcher) { this._watcher.close(); this._watcher = null; }
    clearTimeout(this._reloadTimer);
  }

  // --- queries ---
  get(id) { return this._byId.get(id) || null; }
  has(id) { return this._byId.has(id); }
  all() { return Array.from(this._byId.values()); }
  gallery(id) { return this._byGallery.get(id) || []; }
  galleries() { return this.catalog ? this.catalog.galleries : []; }
  tokens() { return this.catalog ? this.catalog.tokens : null; }
  meta() {
    const c = this.catalog || {};
    return {
      name: c.name, version: c.version, generated: c.generated,
      description: c.description, source: c.source,
      galleryCount: (c.galleries || []).length,
      effectCount: this._byId.size,
      runtimeFacetCount: this.runtimeFacets.size,
      filePath: this.filePath,
      hotReload: !!this._watcher,
    };
  }

  log(level, msg) { if (this.logger) this.logger[level] ? this.logger[level](msg) : this.logger.info(msg); }
}
