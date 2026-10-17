// Terminal catalog loader + in-memory store with hot reload.
//
// Prism's terminal facets (prism-term: scenes, spinners, progress meters, charts,
// TUI controls, ops views …) are described by a second JSON island in Prism.html:
//
//   <script type="application/json" id="prism-terminal-catalog"> … </script>
//
// The island is DERIVED from prism-term/src/facets/** by
// `prism-term/scripts/build-catalog.mjs`, which writes
// prism-term/catalog/terminal-catalog.json; the site pipeline then embeds it.
// Until (or unless) it is embedded, the store falls back to that JSON file. If
// neither exists the store stays empty and reports why, so the rest of the
// server keeps working: the terminal catalog is optional.
//
// Resolution order on every (re)load: Prism.html island → terminal-catalog.json
// → none. A malformed island logs a warning and falls through to the JSON file;
// a hot reload that fails to parse keeps serving the last good copy.
//
// Schema 2 keeps module code once, in a top-level `sources` map
// ({ "prism-term/src/facets/…/x.js": "<ES module source>" }) that also holds the
// "_" gallery helpers; facet records point at it via `module`. Schema 1 put a
// `source` string on every facet. Both load: a facet's `source` is
// sources[module], else its own `source`. The strings are referenced, never
// copied, so facets sharing a module share one string.

import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

export const TERMINAL_ISLAND_OPEN = '<script type="application/json" id="prism-terminal-catalog">';

// Ordered from least to most demanding, as declared by prism-term's facet schema.
export const GLYPH_LEVELS = ['ascii', 'unicode', 'braille', 'sextant'];
export const COLOR_LEVELS = ['mono', '16', '256', 'truecolor'];

/**
 * Extract + parse the terminal island from Prism.html source.
 * Returns null when the island is absent; throws on a malformed one.
 */
export function parseTerminalIsland(html) {
  const open = html.indexOf(TERMINAL_ISLAND_OPEN);
  if (open === -1) return null;
  const start = open + TERMINAL_ISLAND_OPEN.length;
  const end = html.indexOf('</script>', start);
  if (end === -1) throw new Error('prism-terminal-catalog island is not terminated');
  // Embedders neutralize "</script" as "<\/script" so the island can't close early.
  const raw = html.slice(start, end).split('<\\/script').join('</script');
  if (!raw.trim()) return null; // an empty placeholder island means "not embedded yet"
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse prism-terminal-catalog JSON island: ${err.message}`);
  }
}

const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const size = (s, fallback) => (s && Number.isFinite(s.w) && Number.isFinite(s.h) ? { w: s.w, h: s.h } : fallback);
const sourceAt = (sources, key) => (key != null && Object.hasOwn(sources, key) && typeof sources[key] === 'string' ? sources[key] : null);

// "_" gallery helpers: prism-term/src/facets/<gallery>/_name.js
const isHelperPath = (p) => /(^|\/)_[^/]*\.js$/.test(p);
// import/export … from '…' specifiers (helpers re-export each other with `export * from`).
const SPECIFIER_RE = /^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;

/** Resolve an import specifier against the importing module's repo path; null for bare specifiers. */
export function resolveImport(fromModule, spec) {
  if (!fromModule || !String(spec).startsWith('.')) return null;
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromModule), String(spec)));
}

/**
 * The "_" gallery helpers a facet's module needs, as [{ path, source }]: those in
 * its `imports` that are present in `sources`, plus helpers they re-export,
 * direct imports first. Engine modules (prism-term/src/*.js) are never included.
 * `source` references the shared string in `sources`.
 */
export function facetHelpers(f, sources) {
  if (!f || !f.module || !sources) return [];
  const seen = new Set([f.module]);
  const out = [];
  const queue = toArray(f.imports).map((spec) => [f.module, spec]);
  while (queue.length) {
    const [from, spec] = queue.shift();
    const p = resolveImport(from, spec);
    if (!p || seen.has(p) || !isHelperPath(p)) continue;
    const source = sourceAt(sources, p);
    if (source == null) continue;
    seen.add(p);
    out.push({ path: p, source });
    for (const m of source.matchAll(SPECIFIER_RE)) queue.push([p, m[1]]);
  }
  return out;
}

function normalizeFacet(f, sources) {
  return {
    id: String(f.id),
    title: f.title || String(f.id),
    gallery: f.gallery || null,
    galleryTitle: f.galleryTitle || null,
    category: f.category || null,
    description: f.description || '',
    tags: toArray(f.tags).map(String),
    kind: f.kind || 'scene',
    size: size(f.size, { w: 80, h: 24 }),
    minSize: size(f.minSize, { w: 20, h: 6 }),
    animated: f.animated !== false,
    loop: typeof f.loop === 'number' ? f.loop : null,
    glyphs: GLYPH_LEVELS.includes(f.glyphs) ? f.glyphs : 'unicode',
    color: COLOR_LEVELS.includes(f.color) ? f.color : 'truecolor',
    canvas: f.canvas || null,
    palette: f.palette || null,
    params: f.params && typeof f.params === 'object' ? f.params : {},
    since: f.since || null,
    credits: f.credits || null,
    module: f.module || null,
    imports: toArray(f.imports).map(String),
    source: sourceAt(sources, f.module) ?? (typeof f.source === 'string' ? f.source : ''),
    usage: f.usage && typeof f.usage === 'object' ? f.usage : {},
    preview: f.preview && typeof f.preview === 'object' ? f.preview : null,
  };
}

/** Normalize a raw terminal catalog into a stable internal shape. */
export function normalizeTerminalCatalog(raw) {
  const rs = raw && raw.sources;
  const sources = rs && typeof rs === 'object' && !Array.isArray(rs) ? rs : {};
  const facets = toArray(raw && raw.facets).filter((f) => f && f.id != null).map((f) => normalizeFacet(f, sources));
  const galleries = toArray(raw && raw.galleries).map((g) => ({
    id: g.id,
    title: g.title || g.id,
    icon: g.icon || null,
    blurb: g.blurb || '',
    count: typeof g.count === 'number' ? g.count : null,
    categories: toArray(g.categories).map((c) => (typeof c === 'string' ? { name: c, count: null } : { name: c.name, count: c.count ?? null })),
  }));
  const ai = (raw && raw._ai) || null;
  return {
    ai,
    schema: Number(ai && ai.schema) || (sources === rs ? 2 : 1),
    engine: (raw && raw.engine) || null,
    count: facets.length,
    galleries,
    facets,
    sources, // the raw map itself, not a copy
  };
}

/** Metadata projection without the heavy source/preview payloads. */
export function lightTerminalFacet(f) {
  return {
    id: f.id,
    title: f.title,
    gallery: f.gallery,
    category: f.category,
    kind: f.kind,
    description: f.description,
    tags: f.tags,
    size: f.size,
    animated: f.animated,
    glyphs: f.glyphs,
    color: f.color,
    usage: { cli: f.usage.cli || null, npx: f.usage.npx || null },
  };
}

/**
 * Where to look for the terminal catalog, given the main catalog path.
 *   catalogPath = <repo>/Prism.html                 → island in it; JSON at <repo>/prism-term/catalog/
 *   catalogPath = <repo>/catalog/manifest.json      → island in <repo>/Prism.html; same JSON
 * `explicit` (a .html or .json path) overrides both.
 */
export function resolveTerminalPaths(catalogPath, explicit) {
  if (explicit) {
    const p = path.resolve(explicit);
    const isHtml = /\.html?$/i.test(p);
    return { htmlPath: isHtml ? p : null, jsonPath: isHtml ? null : p };
  }
  const abs = path.resolve(String(catalogPath || '.'));
  const isHtml = /\.html?$/i.test(abs);
  const dir = path.dirname(abs);
  const root = isHtml ? dir : path.basename(dir) === 'catalog' ? path.dirname(dir) : dir;
  return {
    htmlPath: isHtml ? abs : path.join(root, 'Prism.html'),
    jsonPath: path.join(root, 'prism-term', 'catalog', 'terminal-catalog.json'),
  };
}

/**
 * In-memory terminal catalog with indexes and optional hot reload.
 * load() never throws: an absent catalog leaves the store empty with
 * `available: false`. Emits 'reload' (with stats) and 'error'.
 */
export class TerminalCatalogStore extends EventEmitter {
  constructor({ htmlPath = null, jsonPath = null, watch = false, logger = null } = {}) {
    super();
    this.htmlPath = htmlPath ? path.resolve(htmlPath) : null;
    this.jsonPath = jsonPath ? path.resolve(jsonPath) : null;
    this.watch = watch;
    this.logger = logger;
    this.catalog = normalizeTerminalCatalog({});
    this.source = 'none';      // 'island' | 'json' | 'none'
    this.loadedFrom = null;
    this.loaded = false;
    this.problems = [];        // why a source was skipped on the last load
    this._byId = new Map();
    this._watchers = [];
    this._reloadTimer = null;
  }

  /** Read the best available source. Returns { catalog, source, filePath, problems } or source 'none'. */
  async _read() {
    const problems = [];
    if (this.htmlPath) {
      try {
        const html = await readFile(this.htmlPath, 'utf8');
        const raw = parseTerminalIsland(html);
        if (raw) return { raw, source: 'island', filePath: this.htmlPath, problems };
        problems.push(`${this.htmlPath}: no prism-terminal-catalog island`);
      } catch (err) {
        problems.push(err.code === 'ENOENT' ? `${this.htmlPath}: not found` : `${this.htmlPath}: ${err.message}`);
      }
    }
    if (this.jsonPath) {
      try {
        const raw = JSON.parse(await readFile(this.jsonPath, 'utf8'));
        return { raw, source: 'json', filePath: this.jsonPath, problems };
      } catch (err) {
        problems.push(err.code === 'ENOENT' ? `${this.jsonPath}: not found` : `${this.jsonPath}: ${err.message}`);
      }
    }
    return { raw: null, source: 'none', filePath: null, problems };
  }

  _apply({ raw, source, filePath, problems }) {
    this.catalog = normalizeTerminalCatalog(raw || {});
    this.source = source;
    this.loadedFrom = filePath;
    this.problems = problems;
    this._byId = new Map(this.catalog.facets.map((f) => [f.id, f]));
  }

  async load() {
    const res = await this._read();
    this._apply(res);
    this.loaded = true;
    if (res.source === 'none') this.log('warn', `Terminal catalog not available (${res.problems.join('; ')})`);
    else {
      if (res.problems.length) this.log('warn', `Terminal catalog: ${res.problems.join('; ')} — using ${res.source}`);
      this.log('info', `Loaded terminal catalog: ${this.catalog.count} facets, ${this.catalog.galleries.length} galleries from ${res.filePath} (${res.source})`);
    }
    if (this.watch && !this._watchers.length) this._startWatch();
    return this.catalog;
  }

  /** Load once on first use (tool handlers call this). */
  async ensureLoaded() {
    if (!this.loaded) await this.load();
    return this;
  }

  _startWatch() {
    const targets = [this.htmlPath, this.jsonPath].filter(Boolean);
    const dirs = new Map();
    for (const p of targets) {
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
      } catch (err) {
        // The JSON's directory may not exist yet; that's fine, the island still works.
        this.log('debug', `Terminal catalog: cannot watch ${dir}: ${err.message}`);
      }
    }
  }

  async _hotReload() {
    try {
      const res = await this._read();
      if (res.source === 'none' && this.source !== 'none') {
        // Both sources vanished or broke mid-write: keep serving the last good copy.
        this.log('warn', `Terminal catalog reload found no source (${res.problems.join('; ')}); keeping previous catalog`);
        this.emit('error', new Error('terminal catalog source unavailable'));
        return;
      }
      this._apply(res);
      const stats = { facets: this.catalog.count, galleries: this.catalog.galleries.length, source: this.source };
      this.log('info', `Hot-reloaded terminal catalog: ${stats.facets} facets (${stats.source})`);
      this.emit('reload', stats);
    } catch (err) {
      this.log('warn', `Terminal catalog hot reload failed (keeping previous catalog): ${err.message}`);
      this.emit('error', err);
    }
  }

  close() {
    for (const w of this._watchers) w.close();
    this._watchers = [];
    clearTimeout(this._reloadTimer);
  }

  // --- queries ---
  get available() { return this.source !== 'none' && this.catalog.count > 0; }
  get(id) { return this._byId.get(id) || null; }
  all() { return this.catalog.facets; }
  galleries() { return this.catalog.galleries; }
  engine() { return this.catalog.engine; }
  /** [{ path, source }] for the "_" helpers facet `f` imports (schema 2; [] for schema 1). */
  helpersOf(f) { return facetHelpers(f, this.catalog.sources); }
  meta() {
    return {
      available: this.available,
      source: this.source,
      filePath: this.loadedFrom,
      searched: [this.htmlPath, this.jsonPath].filter(Boolean),
      problems: this.problems,
      schema: this.catalog.schema,
      facetCount: this.catalog.count,
      galleryCount: this.catalog.galleries.length,
      sourceModules: Object.keys(this.catalog.sources).length,
      engine: this.catalog.engine,
      hotReload: this._watchers.length > 0,
    };
  }

  log(level, msg) { if (this.logger) (this.logger[level] || this.logger.info).call(this.logger, msg); }
}
