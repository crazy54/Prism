// Lazy loader for the prism-deck engine (zero-dependency ESM, Node ≥ 18).
//
// The deck catalog (deck-catalog.js) is enough to browse; rendering, layout
// validation and export need the engine itself: prism-deck/index.js (render,
// devices, themes, glyphs, facets), src/raster (SVG → PNG), src/export/{profile,
// iconpack}.js (the Plugin & Export engineer's exporters) and src/plugin/
// {live-validate,settings,system-facets}.js (the exact checks the plugin's live
// control channel applies). Nothing is imported until a tool needs it, so the rest
// of the server starts fast and works without prism-deck.
//
// Location: explicit dir › $PRISM_DECK_ENGINE › <repo of the catalog>/prism-deck ›
// the prism-deck package next to this server (../../prism-deck).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** DESIGN §8.0 device-model names → prism-deck device ids (also in live-validate.js). */
export const DESIGN_MODEL_ALIASES = Object.freeze({
  'streamdeck-mk2': 'mk2', 'streamdeck-mini': 'mini-2022', 'streamdeck-xl': 'xl-2022', 'streamdeck-plus': 'plus',
  'streamdeck-neo': 'neo', 'galleon-100-sd': 'galleon', 'streamdeck-plus-xl': 'plusxl', 'mcp-deck': 'mcp',
});

export class DeckEngineError extends Error {
  constructor(message, data = null) { super(message); this.name = 'DeckEngineError'; this.code = 'unavailable'; this.data = data; }
}

/** Candidate prism-deck directories, most specific first. */
export function deckEngineCandidates({ dir, catalogPath, env = process.env } = {}) {
  const out = [];
  if (dir) out.push(path.resolve(dir));
  if (env.PRISM_DECK_ENGINE) out.push(path.resolve(env.PRISM_DECK_ENGINE));
  if (catalogPath) {
    const abs = path.resolve(String(catalogPath));
    const d = path.dirname(abs);
    const root = /\.html?$/i.test(abs) ? d : path.basename(d) === 'catalog' ? path.dirname(d) : d;
    out.push(path.join(root, 'prism-deck'));
  }
  out.push(path.resolve(HERE, '..', '..', 'prism-deck'));
  return [...new Set(out)];
}

const MODULES = {
  core: 'index.js',
  raster: 'src/raster/index.js',
  profile: 'src/export/profile.js',
  iconpack: 'src/export/iconpack.js',
  live: 'src/plugin/live-validate.js',
  settings: 'src/plugin/settings.js',
  system: 'src/plugin/system-facets.js',
};

export class DeckEngine {
  /** @param {{ dir?, catalogPath?, env?, logger? }} opts */
  constructor(opts = {}) {
    this.candidates = deckEngineCandidates(opts);
    this.explicit = !!opts.dir;
    this.logger = opts.logger || null;
    this.dir = null;
    this.mods = {};
    this.version = null;
    this.problems = [];
    this.loaded = false;
    this._loading = null;
  }

  get available() { return !!this.mods.core; }

  async load() {
    if (this.loaded) return this;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const problems = [];
      for (const dir of this.candidates) {
        if (!fs.existsSync(path.join(dir, MODULES.core))) { problems.push(`${dir}: no prism-deck/index.js`); continue; }
        try {
          const mods = {};
          for (const [k, rel] of Object.entries(MODULES)) {
            const file = path.join(dir, rel);
            if (!fs.existsSync(file)) { if (k === 'core') throw new Error(`missing ${rel}`); problems.push(`${rel}: not found`); continue; }
            try { mods[k] = await import(pathToFileURL(file).href); } catch (err) { if (k === 'core') throw err; problems.push(`${rel}: ${err.message}`); }
          }
          this.mods = mods;
          this.dir = dir;
          try { this.version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version || null; } catch { this.version = null; }
          break;
        } catch (err) {
          problems.push(`${dir}: ${err.message}`);
        }
      }
      this.problems = problems;
      this.loaded = true;
      if (this.available) this.log('info', `prism-deck engine ${this.version || ''} (API ${this.mods.core.API_VERSION}) loaded from ${this.dir}`);
      else this.log('warn', `prism-deck engine not available (${problems.join('; ')})`);
      return this;
    })();
    try { return await this._loading; } finally { this._loading = null; }
  }

  /** Load and require the engine (and optionally specific modules); throws DeckEngineError. */
  async need(...keys) {
    await this.load();
    if (!this.available) throw new DeckEngineError('The prism-deck engine is not available. Point the server at the package with --deck-engine <dir> (or PRISM_DECK_ENGINE).', { searched: this.candidates, problems: this.problems });
    const missing = keys.filter((k) => !this.mods[k]);
    if (missing.length) throw new DeckEngineError(`prism-deck is missing ${missing.map((k) => MODULES[k]).join(', ')}`, { dir: this.dir, problems: this.problems });
    return this.mods;
  }

  meta() {
    return {
      available: this.available,
      loaded: this.loaded,
      dir: this.dir,
      version: this.version,
      api: this.mods.core ? this.mods.core.API_VERSION : null,
      modules: Object.keys(this.mods),
      searched: this.candidates,
      problems: this.problems,
    };
  }

  // ---------------------------------------------------------------- helpers (engine loaded)
  /** Exact device lookup: prism-deck id, alias, DESIGN model name or SDK DeviceType number. null when unknown. */
  device(q) {
    const { getDevice, DATA } = this.mods.core;
    if (q == null || q === '') return null;
    if (typeof q === 'number' || /^\d+$/.test(String(q))) {
      const n = Number(q);
      return DATA.some((d) => d.type === n) ? getDevice(n) : null;
    }
    const s = String(q).toLowerCase();
    const id = DESIGN_MODEL_ALIASES[s] || s;
    const d = getDevice(id);
    return d && (d.id === id || (d.aliases || []).includes(id)) ? d : null;
  }

  /** Exact facet lookup (findFacet also matches titles/prefixes; we don't). */
  facet(id) {
    if (typeof id !== 'string' || !id) return null;
    const f = this.mods.core.findFacet(id);
    return f && f.id === id ? f : null;
  }

  /** Theme spec → { theme, mode } or null. 'prism', 'prism:light', 'prism-night', 'prism-day', '<id>:<dark|light>'. */
  theme(spec, mode) {
    if (spec == null || spec === '') spec = this.mods.core.DEFAULT_THEME || 'prism';
    const r = this.mods.live && this.mods.live.resolveTheme ? this.mods.live.resolveTheme(String(spec)) : null;
    let out = r;
    if (!out) {
      const [id, m] = String(spec).toLowerCase().split(':');
      if (!this.mods.core.themeRegistry().themes.has(id)) return null;
      out = { theme: id, mode: m === 'light' || m === 'day' ? 'light' : m === 'dark' || m === 'night' ? 'dark' : '' };
    }
    if (mode === 'light' || mode === 'dark') out = { ...out, mode };
    const t = this.mods.core.themeRegistry().themes.get(out.theme);
    if (out.mode && t && t.modes && !t.modes.includes(out.mode)) out = { ...out, mode: t.modes[0] };
    return out;
  }

  log(level, msg) { if (this.logger) (this.logger[level] || this.logger.info).call(this.logger, msg); }
}
