// Build the Stream Deck catalog — the data behind the #prism-deck-catalog JSON island.
//
//   node scripts/build-catalog.mjs            → prism-deck/catalog/deck-catalog.json
//   node scripts/build-catalog.mjs --check    exit 1 if the committed file is stale or inconsistent
//
// DERIVED from src/** (never hand-edited), like the terminal island. Schema 2: module
// code lives once, in the top-level `sources` map — and unlike the terminal island it
// carries the WHOLE package (engine, devices, scene, fonts, themes, glyphs, facets,
// web runtime), so Prism.html can render deck facets fully offline straight from the
// island (src/web/island.js rewires the imports to blob: URLs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allFacets, catalogTree } from '../src/facets/index.js';
import { render, stillTime } from '../src/render.js';
import { DATA as DEVICE_DATA, keySize } from '../src/devices.js';
import { renderTargets } from '../src/facets/schema.js';
import { allThemes } from '../src/themes/_registry.js';
import { allGlyphs } from '../src/glyphs/_registry.js';
import { TOKENS } from '../src/scene/tokens.js';
import { catalogProblems, MODULE_PREFIX } from './embed-island.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'catalog', 'deck-catalog.json');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
export const SITE = 'https://prism.jeremyfhall.com';
export const PLUGIN_UUID = 'com.jeremyfhall.prism';

const IMPORT_RE = /^\s*(?:import|export)\s(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;
export const importsOf = (source) => [...source.matchAll(IMPORT_RE)].map((m) => m[1]);

/** Every .js module under src/, src-relative, sorted. */
function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), r));
    else if (e.name.endsWith('.js')) out.push(r);
  }
  return out;
}
/**
 * The island carries the BROWSER-SAFE part of the package: a module is left out when it
 * imports node:* or anything outside src/, or imports (transitively) a module that does —
 * the plugin runtime, HID, audio capture and export tooling stay in the npm package only.
 * → { sources, nodeOnly: [src-relative paths] }
 */
export function collectSources() {
  const files = walk(SRC).sort();
  const code = new Map(files.map((rel) => [rel, fs.readFileSync(path.join(SRC, ...rel.split('/')), 'utf8').replace(/\r\n/g, '\n')]));
  const deps = new Map(), unsafe = new Set();
  for (const [rel, src] of code) {
    // dynamic import() with a literal specifier (not `x.import(...)` method calls)
    const specs = [...importsOf(src), ...[...src.matchAll(/(?<![\w.$])import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])];
    const local = [];
    for (const s of specs) {
      if (s.startsWith('node:') || !s.startsWith('.')) { unsafe.add(rel); continue; }
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), s));
      if (dep.startsWith('../')) unsafe.add(rel); else local.push(dep);
    }
    deps.set(rel, local);
  }
  for (let changed = true; changed;) {
    changed = false;
    for (const [rel, ds] of deps) if (!unsafe.has(rel) && ds.some((d) => unsafe.has(d))) { unsafe.add(rel); changed = true; }
  }
  const sources = Object.fromEntries(files.filter((f) => !unsafe.has(f)).map((rel) => [MODULE_PREFIX + rel, code.get(rel)]));
  return { sources, nodeOnly: files.filter((f) => unsafe.has(f)) };
}

/** A static frame for search results, agents and no-JS pages (keys at 72 px; others at their first target). */
function preview(f) {
  const t = stillTime(f);
  const tg = f.surface === 'key' ? { size: 72 } : renderTargets(f)[0];
  const r = render(f, { ...tg, t, since: t, idPrefix: `pv-${f.id}` });
  return { ...tg, w: r.w, h: r.h, t, svg: r.svg };
}

export function buildCatalog() {
  const facets = allFacets({ strict: true });
  const tree = catalogTree();
  const { sources, nodeOnly } = collectSources();
  const unsafeFacets = facets.filter((f) => nodeOnly.includes(`facets/${f.file}`)).map((f) => f.id);
  if (unsafeFacets.length) throw new Error(`facets must be browser-safe (no node:* imports, nothing outside src/): ${unsafeFacets.join(', ')}`);
  const records = facets.map((f) => {
    const module = `${MODULE_PREFIX}facets/${f.file}`;
    const web = f.surface === 'key' ? `keys: ['${f.id}']` : f.surface === 'strip' ? (f.segments === 1 ? `dials: ['${f.id}']` : `strip: '${f.id}'`) : f.surface === 'screen' ? `screen: '${f.id}'` : `facet: '${f.id}'`;
    const model = f.surface === 'strip' ? 'plus' : f.surface === 'screen' ? (f.screens[0] === 'infobar' ? 'neo' : 'galleon') : 'mk2';
    return {
      id: f.id, title: f.title, gallery: f.gallery, galleryTitle: tree.find((g) => g.id === f.gallery).title, category: f.category,
      description: f.description, tags: f.tags, surface: f.surface,
      span: f.span || null, segments: f.segments ?? null, screens: f.screens || null, devices: f.devices || null,
      glyph: f.glyph || null, theme: f.theme || null,
      animated: f.animated, fps: f.fps, loop: f.loop, still: stillTime(f), states: f.states, tones: f.tones || null, press: f.press,
      params: f.params, data: f.data || [], dataShape: f.dataShape || null, targets: renderTargets(f), since: f.since, credits: f.credits || null,
      game: f.game ? { tickHz: f.game.tickHz || 0, animate: f.game.animate ?? 0.6, reset: 'long-press (not on the Galleon)' } : null,
      module, imports: importsOf(sources[module]),
      usage: {
        plugin: `Stream Deck app → Prism Deck → "Prism Display" → ${f.title}${f.surface === 'strip' ? ' (on a dial)' : f.surface === 'screen' ? ' (Galleon dial widget / Neo info bar)' : ''}`,
        code: `import { render, findFacet } from 'prism-deck';\nconst frame = render(findFacet('${f.id}'), { device: '${model}', theme: '${f.theme || 'prism'}', t: 1.5 }); // { svg, keys?, segments?, … }`,
        web: `import { mountDevice } from 'prism-deck/web';\nmountDevice(el, { model: '${model}', ${web}, resolve: findFacet });`,
        page: `${SITE}/deck/#${f.id}`,
      },
      preview: preview(f),
    };
  });
  const catalog = {
    _ai: {
      schema: 2,
      what: 'Prism Deck catalog: Stream Deck (and Corsair Galleon) artwork rendered as deterministic SVG — glyphs × themes on keys, spans of keys (including the physical gaps), touch strips, screens and whole devices — by the zero-dependency prism-deck engine.',
      howToUse: 'Pick a facet by gallery/category/surface/tags. In the Stream Deck app use the Prism Deck plugin (`usage.plugin`). In code, render(facet, { device, theme, t, state, params }) returns { svg, keys?, segments?, widgets?, screen? } — whole-canvas SVG plus the per-key / per-dial slices the hardware takes. Offline: every module of the package is in top-level `sources` (keys "prism-deck/src/…"); import `sources["prism-deck/src/web/island.js"]` as a blob: module and call loadIsland(catalog) to run facets with no network. Output is deterministic for (t, state, params, seed, theme).',
      fields: {
        id: 'stable unique id (gallery-prefixed)', gallery: 'gallery id (see galleries[])', category: 'category within the gallery',
        surface: 'key (native key px) | span (block of keys incl. gaps) | strip (Stream Deck + touch strip or one 200×100 dial segment) | screen (Galleon 720×384, Neo info bar 232×50) | deck (whole panel)',
        span: 'span: default block { cols, rows } (numbers or "all")', segments: "strip: 1 (one dial) or 'all'", screens: 'screen: supported targets',
        glyph: 'icons gallery: the glyph shown', theme: 'themes gallery: the theme previewed (other facets follow the deck theme)',
        animated: 'false = still', still: 'the thumbnail instant in seconds (facet.still, else min(loop × 0.4, 6))', fps: 'frame-rate hint (runtimes cap ~10/s per key)', loop: 'seconds per seamless cycle',
        states: 'named states; press advances per `press`', tones: 'state → tone', params: 'tunable parameters {key:{type,default,min,max,step,options,label}}',
        data: 'live inputs a runtime may feed (ctx.data) — facets simulate fallbacks', dataShape: 'optional: the shape of each ctx.data key the facet reads', targets: 'the sizes / devices / screens it renders at (conformance matrix)',
        module: "the facet's ES module; also its key in `sources`", imports: 'import specifiers in the module (all resolvable inside `sources`)',
        game: 'stateful facets (API 1.5): { tickHz, animate, reset } — play them through scene/game.js createGameHost (the web player and the hid runner do it for you); null for stateless facets',
        preview: 'static frame { w, h, t, svg }',
      },
      sources: 'top-level `sources`: { "prism-deck/src/<path>": "<ES module source>" } for every browser-safe module of the package (engine, scene, fonts, devices, themes, glyphs, facets, raster, web), closed under relative imports. Node-only parts (plugin runtime, HID, audio capture, exporters) ship in the npm package only.',
      count: records.length,
      island: '<script type="application/json" id="prism-deck-catalog">',
    },
    engine: {
      package: pkg.name, version: pkg.version, api: '1.0',
      repo: 'https://github.com/crazy54/Prism/tree/main/prism-deck', web: `${SITE}/deck/`,
      plugin: { uuid: PLUGIN_UUID, action: `${PLUGIN_UUID}.facet` },
      entry: { render: `${MODULE_PREFIX}render.js`, registry: `${MODULE_PREFIX}facets/index.js`, web: `${MODULE_PREFIX}web/index.js`, island: `${MODULE_PREFIX}web/island.js` },
      tokens: TOKENS.source,
    },
    devices: DEVICE_DATA.filter((d) => !d.hidden).map((d) => ({ id: d.id, name: d.name, vendor: d.vendor, type: d.type, model: d.model, family: d.family, cols: d.cols, rows: d.rows, display: d.display, key: d.display === 'none' ? null : keySize(d), dials: d.dials.count, touch: d.dials.touch, strip: d.strip ? { w: d.strip.w, h: d.strip.h, segments: d.strip.segments } : null, screen: d.screen ? { kind: d.screen.kind, w: d.screen.w, h: d.screen.h } : null, generic: d.generic })),
    themes: allThemes().map((t) => ({ id: t.id, title: t.title, description: t.description, modes: t.modes, tags: t.tags, module: `${MODULE_PREFIX}themes/${t.id}.js` })),
    glyphs: allGlyphs().map((g) => ({ id: g.id, title: g.title, category: g.category, tags: g.tags, states: g.states, loop: g.loop, module: `${MODULE_PREFIX}glyphs/${g.file}` })),
    galleries: tree.map((g) => ({ id: g.id, title: g.title, icon: g.icon, hue: g.hue, surfaces: g.surfaces, blurb: g.blurb, count: g.count, categories: g.categories.map((c) => ({ name: c.name, count: c.facets.length })) })),
    facets: records,
    sources,
  };
  const problems = catalogProblems(catalog);
  if (problems.length) throw new Error(`deck catalog is inconsistent:\n  ${problems.join('\n  ')}`);
  return catalog;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const json = JSON.stringify(buildCatalog(), null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur) { const problems = catalogProblems(JSON.parse(cur)); if (problems.length) { console.error(`catalog/deck-catalog.json is inconsistent:\n  ${problems.join('\n  ')}`); process.exit(1); } }
    if (cur !== json) { console.error('catalog/deck-catalog.json is stale — run `npm run catalog`'); process.exit(1); }
    console.log('deck catalog up to date');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, json);
    const c = JSON.parse(json);
    console.log(`wrote catalog/deck-catalog.json (${(json.length / 1024).toFixed(0)} KB: ${c.facets.length} facets, ${c.themes.length} themes, ${c.glyphs.length} glyphs, ${c.devices.length} devices, ${Object.keys(c.sources).length} sources)`);
  }
}
