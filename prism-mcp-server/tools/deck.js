// Prism Deck design-time tools (Stream Deck / Corsair Galleon): browse the deck
// catalog, render facets and whole layouts, edit layout documents, export icon packs
// and .streamDeckProfile files. Built by deckTools(helpers) and spread into
// buildTools() like ./terminal.js. Handlers receive ctx.deck (DeckCatalogStore),
// ctx.deckEngine (DeckEngine) and ctx.deckLayouts (DeckLayoutStore).
// Live tools (the plugin's control channel) are in ./deck-live.js.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { lightDeckFacet, facetFitsDevice, deckScore, footprint, DECK_SURFACES } from '../utils/deck-catalog.js';
import { DeckEngineError, DESIGN_MODEL_ALIASES } from '../utils/deck-engine.js';
import { LayoutError, LAYOUT_SCHEMA, OPS, GROUPS, BEHAVIOR_KINDS, PRISM_APP_NAMES, createLayout, applyOps, validateLayoutDoc, normalizeLayout, profilePages } from '../utils/deck-layouts.js';
import { RenderError, renderFacet, renderLayout, svgToPng } from '../utils/deck-render.js';

/** Extra MCP content blocks (images) riding on a tool result; index.js appends them after the JSON text. */
export const MCP_CONTENT = Symbol.for('prism-mcp-server.content');
export function withContent(summary, blocks) { Object.defineProperty(summary, MCP_CONTENT, { value: blocks, enumerable: false }); return summary; }

const PLUGIN_ID = 'com.jeremyfhall.prism';
const PALETTE_KEYS = ['bg', 'surface', 'surface2', 'line', 'ink', 'muted', 'dim', 'accent', 'accent2', 'pos', 'info', 'warn', 'neg', 'crit'];

// ---------------------------------------------------------------- shared schema fragments
const DEVICE_DESC = 'Device: a prism-deck id from deck_list_devices ("galleon", "plus", "plusxl", "mk2", "xl-2022", "mini-2022", "neo", "mcp" …) or a DESIGN model name ("galleon-100-sd", "streamdeck-plus", "streamdeck-plus-xl", "streamdeck-mk2" …).';
const THEME_DESC = 'Deck theme: an id from deck_list_themes, optionally ":light" / ":dark" (e.g. "prism", "prism:light", "paper"); "prism-night" / "prism-day" also work. Default: prism (Night).';
const LOOK = {
  type: 'object',
  description: 'What a key shows. Give a facet (any key/span/deck facet id) OR a glyph (icon id, e.g. "mic"); params tune the facet (see deck_get_facet); state picks a named state by index; title sets the label (facets with a label param) or makes a text-only key; theme overrides the layout theme. fg/bg are ignored (deck themes own the material). accent (#rrggbb) tints facets with a hue param. image: a data:image/(svg+xml|png|jpeg|webp) URL ≤ 256 KB (live only).',
  properties: {
    facet: { type: 'string' }, glyph: { type: 'string' }, params: { type: 'object' }, state: { type: 'integer', minimum: 0, maximum: 7 },
    title: { type: 'string', maxLength: 24 }, theme: { type: 'string' }, accent: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    fg: { type: 'string' }, bg: { type: 'string' }, image: { type: 'string' },
  },
  additionalProperties: false,
};
const FEEDBACK = {
  type: 'object',
  description: 'What a dial shows (Stream Deck + / + XL strip segment, Galleon 100 SD screen widget): a dial/strip/screen facet + params, or a title + value (0–100) drawn in Prism style; layout "$A0|$A1|$B1|$B2|$C1|$X1" or { items:[{type:text|bar|gbar|pixmap, rect:[x,y,w,h] in 200×100, zOrder, value}] } (live only).',
  properties: { facet: { type: 'string' }, params: { type: 'object' }, theme: { type: 'string' }, title: { type: 'string', maxLength: 24 }, value: { type: 'number', minimum: 0, maximum: 100 }, layout: {} },
  additionalProperties: false,
};
export const BEHAVIOR = {
  type: 'object',
  description: 'What a press does. Safe kinds go live: none · prism.toggle (flip state 0/1) · prism.page {page} (switch to another page of this layout) · prism.app {app} (show a Prism live app). kind "native" {uuid, settings} = a Stream Deck / other-plugin action (hotkeys, apps, URLs …): export-only, never live, always listed for the user to review. streamdeck:// links are refused everywhere.',
  properties: { kind: { type: 'string', enum: BEHAVIOR_KINDS }, page: { type: 'string' }, app: { type: 'string', enum: PRISM_APP_NAMES }, uuid: { type: 'string' }, settings: { type: 'object' }, params: { type: 'object' } },
  required: ['kind'],
  additionalProperties: false,
};
const LAYOUT_DOC = {
  type: 'object',
  description: `A "${LAYOUT_SCHEMA}" document: { device, name?, theme?, pages:[{ id, name?, keys:[{col,row,look,behavior?,group?}], dials:[{dial,layer?,feedback,behavior?,group?}], infobar?:{facet} }] }. col,row are 0-based; Galleon dials take layer 0–1.`,
};
const OP = {
  type: 'object',
  description: [
    'One edit. op =',
    'set_key {page?, col, row, look?, behavior?, group?, replace?} (merges into the existing key unless replace) ·',
    'clear_key {page?, col, row} · move_key {page?, from:{col,row}, to:{col,row}, swap?} ·',
    'set_dial {page?, dial, layer?, feedback?, press? (= behavior: what a push / strip tap does), rotate?: {step (value per tick, 0–1 scale), value (0–1)}, group?, replace?} ·',
    'clear_dial {page?, dial, layer?} ·',
    'place_span {page?, facet (span or deck facet), at?:{col,row}, cols?, rows?, params?, theme?, state?, group?} (one block across keys, gaps included) ·',
    'place_screen {page?, facet, params?, theme?, group?} (Galleon screen facet on all 4 dial widgets, a strip panorama on every + dial, or a Neo info-bar facet) ·',
    'add_page {id, name?, after?} · remove_page {id} · rename_page {id, name} · set_theme {theme} · set_name {name} · retarget {device} (reflows; reports dropped slots).',
    'page defaults to the first page.',
  ].join(' '),
  properties: { op: { type: 'string', enum: OPS } },
  required: ['op'],
};

const FILTER_PROPS = {
  gallery: { type: 'string', description: 'Gallery id (deck_list_galleries): themes, icons, motion, spans, dials, screens, apps' },
  category: { type: 'string', description: 'Category within a gallery, e.g. "Press Feedback", "Galleon Dashboards"' },
  surface: { type: 'string', enum: DECK_SURFACES, description: 'key (one key) · span (block of keys incl. the gaps) · strip (dial segment / touch-strip panorama) · screen (Galleon 720×384, Neo info bar) · deck (whole panel)' },
  tag: { type: 'string', description: 'Only facets carrying this tag' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Only facets carrying ALL of these tags' },
  device: { type: 'string', description: `Only facets that can be placed on this device. ${DEVICE_DESC}` },
  animated: { type: 'boolean', description: 'true = animated only, false = stills only' },
  data: { type: 'string', description: 'Only facets that take this live input (audio, spectrum, cpu, mem, gpu, net, temp, clock, media, weather, calendar …)' },
  press: { type: 'string', enum: ['cycle', 'toggle', 'momentary', 'none'], description: 'What a press does to the facet state' },
};
const hasFilter = (a) => Object.keys(FILTER_PROPS).some((k) => (Array.isArray(a[k]) ? a[k].length : a[k] != null && a[k] !== ''));

export function deckTools({ ToolError, paginate }) {
  // ---------------------------------------------------------------- plumbing
  async function catalog(deck) {
    if (!deck) throw new ToolError('The deck catalog is not available in this server context', { code: 'unavailable' });
    await deck.ensureLoaded();
    if (!deck.available) {
      const m = deck.meta();
      throw new ToolError('No Prism Deck catalog found. Build it with `cd prism-deck && npm run catalog` (writes prism-deck/catalog/deck-catalog.json) or embed the #prism-deck-catalog island into Prism.html.', { code: 'unavailable', data: { searched: m.searched, problems: m.problems } });
    }
    return deck;
  }
  async function engineOf(deckEngine, ...mods) {
    if (!deckEngine) throw new ToolError('The prism-deck engine is not available in this server context', { code: 'unavailable' });
    try { await deckEngine.need(...mods); } catch (e) { throw convert(e); }
    return deckEngine;
  }
  function layoutsOf(deckLayouts) {
    if (!deckLayouts) throw new ToolError('Deck layouts are not available in this server context', { code: 'unavailable' });
    return deckLayouts;
  }
  function convert(e) {
    if (e instanceof ToolError) return e;
    if (e instanceof LayoutError || e instanceof RenderError || e instanceof DeckEngineError) return new ToolError(e.message, { code: e.code, data: e.data });
    return e;
  }
  const guard = (fn) => async (a, ctx) => { try { return await fn(a || {}, ctx); } catch (e) { throw convert(e); } };
  const suggest = (list, q) => list.map((x) => ({ id: x.id, score: deckScore(x, String(q).replace(/[-_]+/g, ' ')) })).filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 5).map((x) => x.id);

  /** Catalog device for filters (no engine): id or DESIGN name. */
  function catalogDevice(deck, q) {
    const id = DESIGN_MODEL_ALIASES[String(q).toLowerCase()] || String(q).toLowerCase();
    return deck.devices().find((d) => d.id === id) || null;
  }
  function filterFacets(deck, a) {
    const tags = [...(a.tags || []), ...(a.tag ? [a.tag] : [])].map((t) => String(t).toLowerCase());
    let dev = null;
    if (a.device) {
      dev = catalogDevice(deck, a.device);
      if (!dev) throw new ToolError(`unknown device "${a.device}"`, { code: 'unknown_device', data: { devices: deck.devices().map((d) => d.id) } });
    }
    return deck.all().filter((f) => {
      if (a.gallery && f.gallery !== a.gallery) return false;
      if (a.category && (f.category || '').toLowerCase() !== String(a.category).toLowerCase()) return false;
      if (a.surface && f.surface !== a.surface) return false;
      if (tags.length && !tags.every((t) => f.tags.some((x) => x.toLowerCase() === t))) return false;
      if (typeof a.animated === 'boolean' && f.animated !== a.animated) return false;
      if (a.data && !f.data.includes(String(a.data))) return false;
      if (a.press && f.press !== a.press) return false;
      if (dev && !facetFitsDevice(f, dev)) return false;
      return true;
    });
  }
  /** Inline layout or stored layoutId → normalized document. */
  async function layoutArg(a, ctx, engine) {
    if (a.layout && a.layoutId) throw new ToolError('Pass layoutId or layout, not both', { code: 'invalid_argument' });
    if (a.layoutId) return { layout: layoutsOf(ctx.deckLayouts).get(a.layoutId).layout, layoutId: a.layoutId };
    if (a.layout) return { layout: normalizeLayout(a.layout, engine), layoutId: null };
    throw new ToolError('Pass layoutId (from deck_layout_create / deck_layout_list) or an inline layout', { code: 'invalid_argument' });
  }
  /** Where an export may be written: an absolute path the caller chose, never inside the Stream Deck app or a plugin folder. */
  function outFile(outPath, ext, baseName, overwrite) {
    if (typeof outPath !== 'string' || !outPath.trim()) throw new ToolError('outPath is required: an absolute directory or file path to write to', { code: 'invalid_argument' });
    if (!path.isAbsolute(outPath)) throw new ToolError('outPath must be absolute (the server will not guess a directory)', { code: 'invalid_argument', data: { outPath } });
    let file = path.resolve(outPath);
    let isDir = false;
    try { isDir = fs.statSync(file).isDirectory(); } catch { /* new file */ }
    if (isDir) file = path.join(file, `${String(baseName).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'prism'}${ext}`);
    else if (!file.toLowerCase().endsWith(ext.toLowerCase())) throw new ToolError(`outPath must be a directory or a *${ext} file`, { code: 'invalid_argument', data: { outPath } });
    const norm = file.replace(/\\/g, '/');
    if (/\/Elgato\/StreamDeck(\/|$)/i.test(norm) || /com\.elgato\.StreamDeck/i.test(norm) || /\.sdPlugin(\/|$)/i.test(norm)) throw new ToolError('Refusing to write into the Stream Deck app\'s own folders or a plugin folder: export somewhere else and let the user double-click the file', { code: 'forbidden_path', data: { path: file } });
    if (!fs.existsSync(path.dirname(file))) throw new ToolError(`directory ${path.dirname(file)} does not exist`, { code: 'invalid_argument' });
    if (fs.existsSync(file) && !overwrite) throw new ToolError(`${file} exists; pass overwrite:true to replace it`, { code: 'exists', data: { path: file } });
    return file;
  }
  function writeAtomic(file, buf) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
    return { path: file, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  }
  function deviceRecord(d, aliasesByTarget) {
    return {
      id: d.id, name: d.name, vendor: d.vendor, type: d.type, model: d.model, family: d.family, status: d.status,
      aliases: [...new Set([...(d.aliases || []), ...(aliasesByTarget.get(d.id) || [])])],
      grid: { cols: d.cols, rows: d.rows }, keyPx: d.keyPx || null, display: d.display, sdk: d.sdk, generic: d.generic,
      dials: d.dials?.count ? { count: d.dials.count, press: !!d.dials.press, touch: !!d.dials.touch, rotate: !!d.dials.rotate, layers: d.dials.layers || 1 } : null,
      strip: d.strip ? { w: d.strip.w, h: d.strip.h, segments: d.strip.segments } : null,
      screen: d.screen ? { kind: d.screen.kind, w: d.screen.w, h: d.screen.h, ...(d.screen.widgets ? { widgets: d.screen.widgets } : {}) } : null,
      ...(d.hidden ? { hidden: true } : {}),
    };
  }

  return [
    // ============================== catalog (7) ==============================
    {
      name: 'deck_list_galleries',
      description: 'Prism Deck (Stream Deck + Corsair Galleon) catalog overview: galleries with categories and facet counts, plus how many themes, glyphs and devices exist and where the catalog was loaded from. Start here for deck work: facets are keys, spans of keys, dial segments / touch-strip panoramas, screens and whole-deck looks, rendered in any of the deck themes.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, { deck, deckEngine }) => {
        const d = await catalog(deck);
        const facets = d.all();
        const m = d.meta();
        return {
          galleries: d.galleries().map((g) => {
            const mine = facets.filter((f) => f.gallery === g.id);
            return { id: g.id, title: g.title, blurb: g.blurb, surfaces: g.surfaces, hue: g.hue, declaredCount: g.count, liveCount: mine.length, categories: g.categories.map((c) => ({ name: c.name, count: mine.filter((f) => f.category === c.name).length })) };
          }),
          totals: { facets: facets.length, themes: m.themeCount, glyphs: m.glyphCount, devices: m.deviceCount, bySurface: facets.reduce((o, f) => ((o[f.surface] = (o[f.surface] || 0) + 1), o), {}) },
          catalog: { source: m.source, filePath: m.filePath, schema: m.schema, engine: m.engine },
          engine: deckEngine ? (deckEngine.loaded ? { available: deckEngine.available, api: deckEngine.meta().api, dir: deckEngine.dir } : { loaded: false, note: 'loads on first render/layout/export call' }) : null,
          plugin: PLUGIN_ID,
        };
      }),
    },
    {
      name: 'deck_list_facets',
      description: 'List Prism Deck facets with filters (gallery, category, surface, tags, device fit, animated, live data input, press behavior) and pagination. Light records: id, title, surface + footprint, states, press, param names. Use deck_get_facet for params, deck_render to see one.',
      inputSchema: { type: 'object', properties: { ...FILTER_PROPS, limit: { type: 'integer', minimum: 1, default: 50 }, offset: { type: 'integer', minimum: 0, default: 0 } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, { deck }) => {
        const d = await catalog(deck);
        return paginate(filterFacets(d, a).map(lightDeckFacet), a.limit ?? 50, a.offset ?? 0);
      }),
    },
    {
      name: 'deck_search_facets',
      description: 'Ranked text search over Prism Deck facets (title, id, tags, category/gallery/surface, description), e.g. "volume dial", "waveform", "galleon dashboard", "press ripple", "clock". Takes the same filters as deck_list_facets (query optional when a filter is given). Items carry a relevance score.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' }, ...FILTER_PROPS, limit: { type: 'integer', minimum: 1, default: 20 }, offset: { type: 'integer', minimum: 0, default: 0 } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, { deck }) => {
        const q = a.query && String(a.query).trim();
        if (!q && !hasFilter(a)) throw new ToolError('Provide a query and/or at least one filter', { code: 'invalid_argument' });
        const d = await catalog(deck);
        let list = filterFacets(d, a).map((f) => ({ f, score: q ? deckScore(f, q) : 0 }));
        if (q) list = list.filter((x) => x.score > 0);
        list.sort((x, y) => y.score - x.score || x.f.title.localeCompare(y.f.title));
        return { query: q || null, ...paginate(list.map((x) => ({ ...lightDeckFacet(x.f), score: x.score })), a.limit ?? 20, a.offset ?? 0) };
      }),
    },
    {
      name: 'deck_get_facet',
      description: 'Full record for one Prism Deck facet: metadata, surface + footprint, tunable params (type, default, min/max/step, options — the knobs you pass as look.params / feedback.params or to deck_render), named states with their tones, press rule (cycle / toggle / momentary / none), live data inputs, render targets, which devices it fits, and usage (plugin / code / web). includePreview adds the catalog\'s static preview SVG; includeSource adds the ES module source.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' }, includePreview: { type: 'boolean', default: false }, includeSource: { type: 'boolean', default: false } }, required: ['id'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, { deck }) => {
        const d = await catalog(deck);
        const f = d.get(a.id);
        if (!f) throw new ToolError(`No deck facet with id "${a.id}"`, { code: 'not_found', data: { suggestions: suggest(d.all(), a.id) } });
        const { preview, ...rest } = f;
        const fits = d.devices().filter((dev) => facetFitsDevice(f, dev)).map((dev) => dev.id);
        const where = f.surface === 'key' || f.surface === 'span' ? 'keys' : f.surface === 'strip' ? 'dials (one 200×100 segment each)' : f.surface === 'screen' ? `screens (${(f.screens || []).join(', ')}) via the dials` : 'the whole panel (keys + strip/screen)';
        return {
          ...rest,
          ...(footprint(f) ? { footprint: footprint(f) } : {}),
          stateTones: f.states.map((s, i) => ({ index: i, name: s, tone: f.tones?.[s] || null })),
          placement: { on: where, devices: fits, howTo: f.surface === 'strip' || f.surface === 'screen' ? 'deck_layout_update set_dial {feedback:{facet}} or place_screen' : f.surface === 'span' || f.surface === 'deck' ? 'deck_layout_update place_span' : 'deck_layout_update set_key {look:{facet}}' },
          ...(a.includePreview && preview ? { preview } : { previewAvailable: !!preview }),
          ...(a.includeSource ? { source: d.sourceOf(f) } : {}),
        };
      }),
    },
    {
      name: 'deck_list_themes',
      description: 'List the Prism Deck themes (materials for keys, strips and screens: Prism, Mono, Phosphor, Neon, Ember, Aurora, Chrome, Paper, Porcelain, Pixel, Blueprint …) with their Night/Day modes and tags. includePalette adds each mode\'s palette (bg, surface, ink, muted, accent, pos/info/warn/neg/crit …) from the engine. Use a theme id (":light" for Day) in look.theme, the layout theme or deck_render.',
      inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['dark', 'light'] }, includePalette: { type: 'boolean', default: false } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, { deck, deckEngine }) => {
        const d = await catalog(deck);
        let list = d.themes();
        if (a.mode) list = list.filter((t) => t.modes.includes(a.mode));
        let palette = null;
        if (a.includePalette) { const e = await engineOf(deckEngine); palette = (id, m) => { const c = e.mods.core.useTheme(id, m).colors; return Object.fromEntries(PALETTE_KEYS.filter((k) => typeof c[k] === 'string').map((k) => [k, c[k]])); }; }
        return {
          total: list.length,
          default: 'prism',
          items: list.map((t) => ({ id: t.id, title: t.title, description: t.description, modes: t.modes, tags: t.tags, previewFacet: `theme-${t.id}`, ...(palette ? { palette: Object.fromEntries(t.modes.filter((m) => !a.mode || m === a.mode).map((m) => [m, palette(t.id, m)])) } : {}) })),
        };
      }),
    },
    {
      name: 'deck_list_glyphs',
      description: 'List / search the Prism Deck glyphs (48-unit icons drawn by every theme: media, audio, streaming, system, status, time, navigation, productivity, dev & ops, home & light). Each has named states (e.g. on/off) and an icon facet "icon-<id>". Put one on a key with look {glyph:"<id>"} or look {facet:"icon-<id>"}.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' }, category: { type: 'string' }, limit: { type: 'integer', minimum: 1, default: 100 }, offset: { type: 'integer', minimum: 0, default: 0 } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, { deck }) => {
        const d = await catalog(deck);
        const q = a.query ? String(a.query).toLowerCase().trim() : '';
        let list = d.glyphs();
        if (a.category) list = list.filter((g) => (g.category || '').toLowerCase() === String(a.category).toLowerCase());
        const score = (g) => { let s = 0; for (const t of q.split(/\s+/).filter(Boolean)) { if (g.id.includes(t)) s += 4; if (g.title.toLowerCase().includes(t)) s += 4; if (g.tags.some((x) => x.toLowerCase() === t)) s += 3; else if (g.tags.some((x) => x.toLowerCase().includes(t))) s += 1; if ((g.category || '').includes(t)) s += 1; } return s; };
        let items = list.map((g) => ({ id: g.id, title: g.title, category: g.category, tags: g.tags, states: Object.keys(g.states), animated: g.loop > 0, facet: `icon-${g.id}`, ...(q ? { score: score(g) } : {}) }));
        if (q) items = items.filter((x) => x.score > 0).sort((x, y) => y.score - x.score);
        return { categories: [...new Set(d.glyphs().map((g) => g.category))], ...paginate(items, a.limit ?? 100, a.offset ?? 0) };
      }),
    },
    {
      name: 'deck_list_devices',
      description: 'Every device model Prism Deck renders for (Elgato Stream Deck MK.2 / Mini / XL / Neo / + / + XL / Studio / Pedal / Modules, Mobile, Virtual and MCP Deck; Corsair Galleon 100 SD, G-Keys, Xeneon Edge …): id, SDK DeviceType, profile model, key grid + native key px, dials (count, press, touch, rotate, Galleon layers), touch strip and screen geometry, and aliases (incl. DESIGN names such as "galleon-100-sd"). Filters: hasDials, hasStrip, hasScreen, display, includeVirtual; includeHidden adds the non-renderable April-Fools "+ Lever".',
      inputSchema: { type: 'object', properties: { hasDials: { type: 'boolean' }, hasStrip: { type: 'boolean' }, hasScreen: { type: 'boolean' }, display: { type: 'string', enum: ['lcd', 'software', 'none'] }, includeVirtual: { type: 'boolean', default: true }, includeHidden: { type: 'boolean', default: false } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, { deck, deckEngine }) => {
        let list, source;
        const aliasesByTarget = new Map();
        for (const [k, v] of Object.entries(DESIGN_MODEL_ALIASES)) aliasesByTarget.set(v, [...(aliasesByTarget.get(v) || []), k]);
        if (deckEngine) { await deckEngine.load(); }
        if (deckEngine && deckEngine.available) {
          list = deckEngine.mods.core.DATA.map((d) => deviceRecord(d, aliasesByTarget));
          source = 'engine';
        } else {
          const d = await catalog(deck);
          list = d.devices().map((x) => ({ id: x.id, name: x.name, vendor: x.vendor, type: x.type, model: x.model, family: x.family, aliases: aliasesByTarget.get(x.id) || [], grid: { cols: x.cols, rows: x.rows }, keyPx: x.key || null, display: x.display, generic: x.generic, dials: x.dials ? { count: x.dials, touch: !!x.touch } : null, strip: x.strip, screen: x.screen }));
          source = 'catalog';
        }
        const all = list.length;
        if (!a.includeHidden) list = list.filter((d) => !d.hidden);
        if (a.includeVirtual === false) list = list.filter((d) => d.family !== 'virtual' && d.display !== 'software');
        if (typeof a.hasDials === 'boolean') list = list.filter((d) => !!d.dials === a.hasDials);
        if (typeof a.hasStrip === 'boolean') list = list.filter((d) => !!d.strip === a.hasStrip);
        if (typeof a.hasScreen === 'boolean') list = list.filter((d) => !!d.screen === a.hasScreen);
        if (a.display) list = list.filter((d) => d.display === a.display);
        return { total: list.length, models: all, source, items: list };
      }),
    },

    // ============================== render (1) ==============================
    {
      name: 'deck_render',
      description: 'Render Prism Deck art with the prism-deck engine and return it as an image (PNG, default) and/or SVG. Either ONE FACET — { facet, device?, theme?, mode?, state? (index or name), params?, t? (seconds; default = the thumbnail instant), pressed?, value? (0–1 dial value), span?:{cols,rows}, segments? (strip: 1 | "all"), screen? ("galleon" | "galleon-widget" | "infobar") } — sliced for the device (per-key / per-segment / per-widget SVGs with slices:true); or a THEME preview — { theme, device? } alone renders that theme\'s "theme-<id>" facet (the whole device in that material); or a LAYOUT PAGE — { layoutId | layout, page?, target?: {kind:"device"} (whole panel: keys, spans, strip segments, Galleon screen widgets, Neo info bar) | {kind:"key",col,row} | {kind:"dial",dial,layer} }. Look before you push anything live.',
      inputSchema: {
        type: 'object',
        properties: {
          facet: { type: 'string', description: 'Deck facet id (deck_search_facets)' },
          layoutId: { type: 'string' }, layout: LAYOUT_DOC, page: { type: 'string' },
          target: { type: 'object', properties: { kind: { type: 'string', enum: ['device', 'key', 'dial'] }, col: { type: 'integer' }, row: { type: 'integer' }, dial: { type: 'integer' }, layer: { type: 'integer' } }, required: ['kind'] },
          device: { type: 'string', description: DEVICE_DESC }, theme: { type: 'string', description: THEME_DESC }, mode: { type: 'string', enum: ['dark', 'light'] },
          state: { description: 'State index or name (deck_get_facet stateTones)' }, params: { type: 'object' },
          t: { type: 'number', minimum: 0 }, pressed: { type: 'boolean' }, value: { type: 'number', minimum: 0, maximum: 1 },
          span: { type: 'object', properties: { col: { type: 'integer' }, row: { type: 'integer' }, cols: {}, rows: {} } }, segments: {}, screen: { type: 'string', enum: ['galleon', 'galleon-widget', 'infobar', 'monitor'] },
          format: { type: 'string', enum: ['png', 'svg', 'both'], default: 'png' }, scale: { type: 'number', minimum: 0.25, maximum: 4, default: 1, description: 'PNG pixel multiplier' },
          slices: { type: 'boolean', default: false, description: 'facet renders: include the per-key / per-segment / per-widget SVG slices the hardware receives' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        const fmt = a.format || 'png';
        const e = await engineOf(ctx.deckEngine, ...(fmt === 'svg' ? [] : ['raster']));
        // { theme } alone previews the theme: its "theme-<id>" facet (the whole device in that material)
        if (!a.facet && !a.layoutId && !a.layout && a.theme) { const th = e.theme(a.theme); if (th && e.facet(`theme-${th.theme}`)) a = { ...a, facet: `theme-${th.theme}` }; }
        if (!a.facet && !a.layoutId && !a.layout) throw new ToolError('Pass facet, theme, or layoutId / layout', { code: 'invalid_argument' });
        let r, summary;
        if (a.facet) {
          if (ctx.deck) { await ctx.deck.ensureLoaded(); if (!e.facet(a.facet)) throw new ToolError(`No deck facet "${a.facet}"`, { code: 'not_found', data: { suggestions: ctx.deck.available ? suggest(ctx.deck.all(), a.facet) : [] } }); }
          r = renderFacet(e, a);
          summary = { facet: r.facet, surface: r.surface, device: r.device, theme: r.theme, mode: r.mode, t: r.t, state: r.state, stateName: r.stateName, w: r.w, h: r.h, svgBytes: r.svg.length, slices: r.slices.length, warnings: r.warnings };
          if (fmt !== 'png') { summary.svg = r.svg; if (a.slices) summary.sliceSvgs = r.slices; }
        } else {
          const { layout, layoutId } = await layoutArg(a, ctx, e);
          r = renderLayout(e, layout, { page: a.page, target: a.target || { kind: 'device' }, t: a.t });
          summary = { layoutId, device: r.device, page: r.page, target: (a.target || { kind: 'device' }).kind, w: r.w, h: r.h, slots: r.slots, svgBytes: r.svg.length, warnings: r.warnings, ...(r.note ? { note: r.note } : {}) };
          if (fmt !== 'png') summary.svg = r.svg;
        }
        if (fmt === 'svg') return summary;
        const png = svgToPng(e, r.svg, r.w, r.h, a.scale ?? 1);
        summary.png = { width: Math.round(r.w * (a.scale ?? 1)), height: Math.round(r.h * (a.scale ?? 1)), bytes: png.length };
        return withContent(summary, [{ type: 'image', mimeType: 'image/png', data: png.toString('base64') }]);
      }),
    },

    // ============================== layouts (6) ==============================
    {
      name: 'deck_layout_create',
      description: `Create a stored Prism Deck layout document ("${LAYOUT_SCHEMA}") for one device: which facet (theme, params, state) and which Prism behavior sits on each key, span, dial and screen. template "blank" (one empty page) or "sample" (Prism's ready-made layout for Galleon 100 SD, Stream Deck +, MK.2, XL, Mini, Neo), or import a whole document via layout. Returns layoutId, revision 1, the document and its validation. Then edit with deck_layout_update, preview with deck_render, ship with deck_export_profile or push live with deck_live_apply_layout.`,
      inputSchema: { type: 'object', properties: { device: { type: 'string', description: DEVICE_DESC }, name: { type: 'string', maxLength: 60 }, theme: { type: 'string', description: THEME_DESC }, template: { type: 'string', enum: ['blank', 'sample'], default: 'blank' }, layout: LAYOUT_DOC }, additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        if (!a.device && !a.layout) throw new ToolError('Pass device (and optionally template), or a whole layout', { code: 'invalid_argument' });
        const e = await engineOf(ctx.deckEngine, 'live', 'settings');
        const layout = createLayout(e, a);
        const validation = validateLayoutDoc(e, layout);
        if (!validation.ok) throw new ToolError('The layout is not valid; nothing was saved', { code: 'invalid_layout', data: { errors: validation.errors, warnings: validation.warnings } });
        const r = layoutsOf(ctx.deckLayouts).create(layout);
        return { layoutId: r.layoutId, revision: r.revision, layout: r.layout, validation };
      }),
    },
    {
      name: 'deck_layout_get',
      description: 'Read a stored Prism Deck layout (document, revision, timestamps). page limits the document to one page.',
      inputSchema: { type: 'object', properties: { layoutId: { type: 'string' }, page: { type: 'string' } }, required: ['layoutId'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        const r = layoutsOf(ctx.deckLayouts).get(a.layoutId);
        if (a.page) {
          const p = r.layout.pages.find((x) => x.id === a.page);
          if (!p) throw new ToolError(`no page "${a.page}"`, { code: 'unknown_page', data: { pages: r.layout.pages.map((x) => x.id) } });
          r.layout = { ...r.layout, pages: [p] };
        }
        return r;
      }),
    },
    {
      name: 'deck_layout_list',
      description: 'List stored Prism Deck layouts (most recently updated first): id, name, device, theme, pages, key/dial counts, revision.',
      inputSchema: { type: 'object', properties: { device: { type: 'string' }, limit: { type: 'integer', minimum: 1, default: 50 }, offset: { type: 'integer', minimum: 0, default: 0 } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        let device = a.device;
        if (device && ctx.deckEngine) { await ctx.deckEngine.load(); if (ctx.deckEngine.available) device = ctx.deckEngine.device(device)?.id || device; }
        return paginate(layoutsOf(ctx.deckLayouts).list({ device }), a.limit ?? 50, a.offset ?? 0);
      }),
    },
    {
      name: 'deck_layout_update',
      description: `Edit a stored Prism Deck layout with a batch of ops (1–200, applied in order, all or nothing). Keys: set_key / clear_key / move_key; multi-key art: place_span; dials (knobs): set_dial with feedback (what it shows), press (behavior on push / strip tap) and rotate {step, value}; screens and strip panoramas: place_screen; pages: add_page / remove_page / rename_page; set_theme, set_name, retarget {device}. Pass baseRevision (from the last read) to refuse stale edits (code revision_conflict). The result is re-validated against the device geometry; an invalid result is not saved unless allowInvalid. Returns the new revision, warnings, dropped slots and validation. Behaviors: ${BEHAVIOR_KINDS.join(' · ')}; groups ${GROUPS.join('')}.`,
      inputSchema: { type: 'object', properties: { layoutId: { type: 'string' }, baseRevision: { type: 'integer', minimum: 1 }, ops: { type: 'array', minItems: 1, maxItems: 200, items: OP }, allowInvalid: { type: 'boolean', default: false } }, required: ['layoutId', 'ops'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        const e = await engineOf(ctx.deckEngine, 'live', 'settings');
        const store = layoutsOf(ctx.deckLayouts);
        const cur = store.get(a.layoutId);
        if (a.baseRevision != null && a.baseRevision !== cur.revision) throw new ToolError(`revision conflict: the layout is at revision ${cur.revision}, not ${a.baseRevision}; re-read it with deck_layout_get`, { code: 'revision_conflict', data: { revision: cur.revision } });
        const res = applyOps(e, cur.layout, a.ops);
        const validation = validateLayoutDoc(e, res.layout);
        if (!validation.ok && !a.allowInvalid) throw new ToolError('The edit would make the layout invalid; nothing was saved', { code: 'invalid_layout', data: { errors: validation.errors, warnings: [...res.warnings, ...validation.warnings] } });
        const r = store.update(a.layoutId, res.layout, cur.revision);
        return { layoutId: r.layoutId, revision: r.revision, applied: res.applied, warnings: res.warnings, dropped: res.dropped, validation, layout: r.layout };
      }),
    },
    {
      name: 'deck_layout_validate',
      description: 'Validate a Prism Deck layout (stored layoutId or inline layout) offline, with the same checks the Prism Deck plugin applies live: device geometry (grid, dial count, Galleon layers 0–1, MCP Deck has no dials), facets/glyphs/themes exist and fit their slot, params known, titles ≤ 24 chars, image size/format, 200×100 dial layout bounds and same-zOrder overlaps, behavior safety (streamdeck:// links forbidden), spans and screens complete. live:true also rejects export-only (native) behaviors. Returns ok, errors, warnings, review (what needs the user\'s attention or stays live-only on export) and stats.',
      inputSchema: { type: 'object', properties: { layoutId: { type: 'string' }, layout: LAYOUT_DOC, live: { type: 'boolean', default: false } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        const e = await engineOf(ctx.deckEngine, 'live', 'settings');
        if (a.layout && a.layoutId) throw new ToolError('Pass layoutId or layout, not both', { code: 'invalid_argument' });
        const doc = a.layoutId ? layoutsOf(ctx.deckLayouts).get(a.layoutId).layout : a.layout;
        if (!doc) throw new ToolError('Pass layoutId or layout', { code: 'invalid_argument' });
        return validateLayoutDoc(e, doc, { live: a.live === true });
      }),
    },
    {
      name: 'deck_layout_delete',
      description: 'Delete a stored Prism Deck layout.',
      inputSchema: { type: 'object', properties: { layoutId: { type: 'string' } }, required: ['layoutId'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => layoutsOf(ctx.deckLayouts).delete(a.layoutId)),
    },

    // ============================== export (2) ==============================
    {
      name: 'deck_export_profile',
      description: 'Export a Prism Deck layout as a .streamDeckProfile (Stream Deck "FormatVersion 1" ZIP, built by prism-deck/src/export/profile.js) for its device, written ONLY to outPath (an absolute directory or *.streamDeckProfile file you were given; never into the Stream Deck app or a plugin folder). Every key/dial with a facet becomes a Prism Facet action (com.jeremyfhall.prism) with its facet, theme, params, state, value and span group. Title-only/image looks, prism.page/prism.toggle behaviors and native actions are not written: they are listed in `skipped` / `review` — show those to the user. The server never installs or imports anything: tell the user to double-click the file (the Prism Deck plugin must be installed).',
      inputSchema: { type: 'object', properties: { layoutId: { type: 'string' }, layout: LAYOUT_DOC, outPath: { type: 'string', description: 'Absolute directory or *.streamDeckProfile path' }, name: { type: 'string', maxLength: 60, description: 'Profile name shown in the Stream Deck app (default: the layout name)' }, pages: { type: 'array', items: { type: 'string' }, description: 'Only these page ids' }, overwrite: { type: 'boolean', default: false } }, required: ['outPath'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        const e = await engineOf(ctx.deckEngine, 'live', 'settings', 'profile');
        const { layout, layoutId } = await layoutArg(a, ctx, e);
        const model = e.device(layout.device);
        if (!model.model) throw new ToolError(`${model.name} has no Stream Deck profile model; profiles can't target it`, { code: 'unsupported_device' });
        const validation = validateLayoutDoc(e, layout);
        if (!validation.ok) throw new ToolError('The layout is not valid; fix it before exporting', { code: 'invalid_layout', data: { errors: validation.errors } });
        const { pages, skipped } = profilePages(e, layout, { pages: a.pages });
        if (!pages.length) throw new ToolError('No pages to export', { code: 'invalid_argument', data: { pages: layout.pages.map((p) => p.id) } });
        const name = String(a.name || layout.name).slice(0, 60);
        let built;
        try { built = e.mods.profile.buildProfile({ device: model.id, name, pages, seed: `mcp:${layoutId || name}:${model.id}` }); } catch (err) { throw new ToolError(`profile export failed: ${err.message}`, { code: 'export_failed' }); }
        const problems = e.mods.profile.checkProfile(built.zip);
        if (problems.length) throw new ToolError('The exported profile failed its structural check; nothing was written', { code: 'export_failed', data: { problems } });
        const file = outFile(a.outPath, '.streamDeckProfile', name, a.overwrite === true);
        const w = writeAtomic(file, built.zip);
        return {
          format: 'streamDeckProfile', ...w, layoutId, device: model.id, deviceModel: built.package.DeviceModel, profileName: name, pages: pages.map((p) => p.name),
          actions: pages.reduce((s, p) => s + p.keys.length + p.dials.length + (p.infobar ? 1 : 0), 0),
          requiredPlugins: built.package.RequiredPlugins, dropped: built.dropped, skipped, review: validation.review, problems,
          install: 'Ask the user to double-click the file (or Stream Deck → Preferences → Profiles → Import). It needs the Prism Deck plugin (com.jeremyfhall.prism); the app offers to install it when missing.',
        };
      }),
    },
    {
      name: 'deck_export_iconpack',
      description: 'Build an Elgato .streamDeckIconPack for one deck theme (prism-deck/src/export/iconpack.js): every glyph × its states × Night/Day at 144×144 — animated glyphs as GIF idle loops (+ PNG twins) via the raster backend, still ones as SVG — plus pack icon, preview sheets, license, manifest. Written ONLY to outPath (absolute directory or *.streamDeckIconPack file); glyphs limits it to a subset (faster); svgOnly skips rasterizing (static pack). A full pack takes several seconds. The user installs it by double-clicking.',
      inputSchema: { type: 'object', properties: { theme: { type: 'string', description: 'Deck theme id (deck_list_themes)' }, outPath: { type: 'string' }, glyphs: { type: 'array', items: { type: 'string' }, description: 'Glyph ids (deck_list_glyphs); default all' }, version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$', default: '0.3.0' }, svgOnly: { type: 'boolean', default: false }, overwrite: { type: 'boolean', default: false } }, required: ['theme', 'outPath'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      handler: guard(async (a, ctx) => {
        const e = await engineOf(ctx.deckEngine, 'iconpack');
        const th = e.theme(a.theme);
        if (!th || th.theme !== String(a.theme).split(':')[0].toLowerCase()) throw new ToolError(`unknown deck theme "${a.theme}"`, { code: 'unknown_theme', data: { themes: e.mods.core.allThemes().map((t) => t.id) } });
        if (a.glyphs) {
          const bad = a.glyphs.filter((g) => !e.mods.core.getGlyph(g));
          if (bad.length) throw new ToolError(`unknown glyph(s): ${bad.join(', ')}`, { code: 'unknown_glyph' });
        }
        if (a.version && !/^\d+\.\d+\.\d+$/.test(a.version)) throw new ToolError('version must be x.y.z', { code: 'invalid_argument' });
        let pack;
        try { pack = await e.mods.iconpack.buildIconPack({ theme: th.theme, glyphs: a.glyphs, version: a.version || '0.3.0', ...(a.svgOnly ? { raster: null } : {}) }); } catch (err) { throw new ToolError(`icon pack export failed: ${err.message}`, { code: 'export_failed' }); }
        const problems = e.mods.iconpack.checkIconPack(pack.zip);
        if (problems.length) throw new ToolError('The icon pack failed its structural check; nothing was written', { code: 'export_failed', data: { problems: problems.slice(0, 20) } });
        const file = outFile(a.outPath, '.streamDeckIconPack', pack.id, a.overwrite === true);
        const w = writeAtomic(file, Buffer.from(pack.zip));
        return { format: 'streamDeckIconPack', ...w, id: pack.id, name: pack.manifest.Name, theme: th.theme, icons: pack.icons.length, stats: { svg: pack.stats.svg, gif: pack.stats.gif, png: pack.stats.png, invalid: pack.stats.invalid.length }, problems, install: 'Ask the user to double-click the file; the icons appear under Icon Library in a key\'s icon menu.' };
      }),
    },
  ];
}
