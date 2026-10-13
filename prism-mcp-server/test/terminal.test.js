// Terminal catalog (prism-term facets): island parsing, source resolution
// (Prism.html island → terminal-catalog.json → none), hot reload, the 5 tools,
// schema 1 (per-facet source) vs schema 2 (shared `sources` + helpers), and the
// JSON-RPC surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TerminalCatalogStore, parseTerminalIsland, normalizeTerminalCatalog, resolveTerminalPaths, resolveImport, facetHelpers, TERMINAL_ISLAND_OPEN,
} from '../utils/terminal-catalog.js';
import { buildTools, ToolError } from '../tools/index.js';
import { PrismMCPServer } from '../index.js';
import { normalizeCatalog } from '../utils/catalog.js';
import { createLogger } from '../utils/logger.js';
import { FIXTURE } from './fixture.js';
import { TERMINAL_FIXTURE, TERMINAL_FIXTURE_V2, V2_MODULES } from './terminal-fixture.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_JSON = path.resolve(HERE, '..', '..', 'prism-term', 'catalog', 'terminal-catalog.json');
const REAL_HTML = path.resolve(HERE, '..', '..', 'Prism.html');
const P = 'prism-term/src/facets/';
const silent = createLogger('silent');

/** Embed a catalog as an island exactly the way embedders do (neutralizing </script). */
function island(obj) {
  return `${TERMINAL_ISLAND_OPEN}${JSON.stringify(obj).split('</script').join('<\\/script')}</script>`;
}
const page = (...islands) => `<!doctype html><html><head>${islands.join('\n')}</head><body></body></html>`;
const mainIsland = (obj) => `<script type="application/json" id="prism-catalog">${JSON.stringify(obj)}</script>`;

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'prism-mcp-term-')); }

function fixtureTerminal(raw = TERMINAL_FIXTURE) {
  const t = new TerminalCatalogStore({ logger: silent });
  t._apply({ raw, source: 'json', filePath: '(fixture)', problems: [] });
  t.loaded = true;
  return t;
}

function ctx(terminal = fixtureTerminal()) {
  const map = new Map(buildTools().map((x) => [x.name, x]));
  return {
    terminal,
    call: (name, args = {}) => map.get(name).handler(args, { terminal, logger: silent }),
    async fail(name, args = {}) {
      try { await map.get(name).handler(args, { terminal, logger: silent }); } catch (e) { return e; }
      throw new Error(`${name} did not fail`);
    },
  };
}

// ---------------------------------------------------------------- parsing

test('parseTerminalIsland extracts the island and un-neutralizes </script', () => {
  const withScript = { ...TERMINAL_FIXTURE, facets: [{ ...TERMINAL_FIXTURE.facets[0], source: 'const s = "</script>";' }] };
  const raw = parseTerminalIsland(page(mainIsland(FIXTURE), island(withScript)));
  assert.equal(raw.facets[0].source, 'const s = "</script>";');
  assert.equal(raw.galleries.length, 3);
});

test('parseTerminalIsland returns null when absent or empty, throws when malformed', () => {
  assert.equal(parseTerminalIsland(page(mainIsland(FIXTURE))), null);
  assert.equal(parseTerminalIsland(`${TERMINAL_ISLAND_OPEN}  </script>`), null, 'empty placeholder = not embedded yet');
  assert.throws(() => parseTerminalIsland(`${TERMINAL_ISLAND_OPEN}{"facets":[</script>`), /Failed to parse prism-terminal-catalog/);
  assert.throws(() => parseTerminalIsland(`${TERMINAL_ISLAND_OPEN}{}`), /not terminated/);
});

test('normalizeTerminalCatalog fills defaults and drops id-less records', () => {
  const c = normalizeTerminalCatalog({ facets: [{ id: 'x' }, { title: 'no id' }], galleries: [{ id: 'g', categories: ['A'] }] });
  assert.equal(c.count, 1);
  const f = c.facets[0];
  assert.deepEqual([f.title, f.kind, f.glyphs, f.color, f.animated], ['x', 'scene', 'unicode', 'truecolor', true]);
  assert.deepEqual(c.galleries[0].categories, [{ name: 'A', count: null }]);
});

test('resolveTerminalPaths finds the island beside Prism.html and the JSON under prism-term/', () => {
  const root = path.resolve('/repo');
  assert.deepEqual(resolveTerminalPaths(path.join(root, 'Prism.html')), {
    htmlPath: path.join(root, 'Prism.html'), jsonPath: path.join(root, 'prism-term', 'catalog', 'terminal-catalog.json'),
  });
  assert.deepEqual(resolveTerminalPaths(path.join(root, 'catalog', 'manifest.json')), {
    htmlPath: path.join(root, 'Prism.html'), jsonPath: path.join(root, 'prism-term', 'catalog', 'terminal-catalog.json'),
  });
  assert.deepEqual(resolveTerminalPaths('x', path.join(root, 't.json')), { htmlPath: null, jsonPath: path.join(root, 't.json') });
  assert.deepEqual(resolveTerminalPaths('x', path.join(root, 'p.html')), { htmlPath: path.join(root, 'p.html'), jsonPath: null });
});

// ---------------------------------------------------------------- loading

test('store prefers the Prism.html island over the JSON fallback', async () => {
  const dir = tmpdir();
  const html = path.join(dir, 'Prism.html'), json = path.join(dir, 'terminal-catalog.json');
  fs.writeFileSync(html, page(mainIsland(FIXTURE), island(TERMINAL_FIXTURE)));
  fs.writeFileSync(json, JSON.stringify({ ...TERMINAL_FIXTURE, facets: TERMINAL_FIXTURE.facets.slice(0, 1) }));
  const t = new TerminalCatalogStore({ htmlPath: html, jsonPath: json, logger: silent });
  await t.load();
  assert.equal(t.source, 'island');
  assert.equal(t.meta().facetCount, 5);
  assert.equal(t.meta().filePath, html);
});

test('store falls back to terminal-catalog.json when Prism.html has no island', async () => {
  const dir = tmpdir();
  const html = path.join(dir, 'Prism.html'), json = path.join(dir, 'terminal-catalog.json');
  fs.writeFileSync(html, page(mainIsland(FIXTURE)));
  fs.writeFileSync(json, JSON.stringify(TERMINAL_FIXTURE));
  const t = new TerminalCatalogStore({ htmlPath: html, jsonPath: json, logger: silent });
  await t.load();
  assert.equal(t.source, 'json');
  assert.equal(t.available, true);
  assert.match(t.meta().problems[0], /no prism-terminal-catalog island/);
});

test('a malformed island falls through to the JSON; nothing at all leaves the store empty', async () => {
  const dir = tmpdir();
  const html = path.join(dir, 'Prism.html'), json = path.join(dir, 'terminal-catalog.json');
  fs.writeFileSync(html, `${TERMINAL_ISLAND_OPEN}{broken</script>`);
  fs.writeFileSync(json, JSON.stringify(TERMINAL_FIXTURE));
  const t = new TerminalCatalogStore({ htmlPath: html, jsonPath: json, logger: silent });
  await t.load();
  assert.equal(t.source, 'json');

  const none = new TerminalCatalogStore({ htmlPath: path.join(dir, 'nope.html'), jsonPath: path.join(dir, 'nope.json'), logger: silent });
  await none.load(); // must not throw
  assert.equal(none.available, false);
  assert.equal(none.source, 'none');
  assert.equal(none.meta().problems.length, 2);
});

test('hot reload picks up a rebuilt terminal-catalog.json and keeps the last good copy on a bad write', async () => {
  const dir = tmpdir();
  const json = path.join(dir, 'terminal-catalog.json');
  fs.writeFileSync(json, JSON.stringify({ ...TERMINAL_FIXTURE, facets: TERMINAL_FIXTURE.facets.slice(0, 2) }));
  const t = new TerminalCatalogStore({ jsonPath: json, watch: true, logger: silent });
  await t.load();
  assert.equal(t.meta().facetCount, 2);
  try {
    const reloaded = new Promise((resolve) => t.once('reload', resolve));
    fs.writeFileSync(json, JSON.stringify(TERMINAL_FIXTURE));
    const stats = await Promise.race([reloaded, new Promise((_, rej) => setTimeout(() => rej(new Error('no reload event')), 5000))]);
    assert.equal(stats.facets, 5);

    const errored = new Promise((resolve) => t.once('error', resolve));
    fs.writeFileSync(json, '{ "facets": [ truncated');
    await Promise.race([errored, new Promise((_, rej) => setTimeout(() => rej(new Error('no error event')), 5000))]);
    assert.equal(t.meta().facetCount, 5, 'still serving the last good catalog');
  } finally {
    t.close();
  }
});

// ---------------------------------------------------------------- tools

test('list_terminal_galleries reports declared vs live counts per category', async () => {
  const r = await ctx().call('list_terminal_galleries');
  assert.equal(r.total, 3);
  const loaders = r.items.find((g) => g.id === 'loaders');
  assert.equal(loaders.liveCount, 2);
  assert.deepEqual(loaders.categories.map((c) => c.count), [1, 1]);
});

test('list_terminal_facets filters by gallery, category, kind, tags and animated', async () => {
  const c = ctx();
  assert.deepEqual((await c.call('list_terminal_facets', { gallery: 'fx' })).items.map((f) => f.id), ['plasma', 'matrix']);
  assert.deepEqual((await c.call('list_terminal_facets', { category: 'braille spinners' })).items.map((f) => f.id), ['loaders-braille-orbit']);
  assert.equal((await c.call('list_terminal_facets', { kind: 'spinner' })).total, 2);
  assert.deepEqual((await c.call('list_terminal_facets', { tags: ['spinner', 'ascii'] })).items.map((f) => f.id), ['loaders-ascii-line']);
  assert.deepEqual((await c.call('list_terminal_facets', { animated: false })).items.map((f) => f.id), ['progress-download']);
  const light = (await c.call('list_terminal_facets', { limit: 1 })).items[0];
  assert.ok(!('source' in light) && !('preview' in light), 'list returns light records');
  assert.match(light.usage.cli, /^prism-term play /);
});

test('list_terminal_facets matches facets to what a terminal can draw (maxGlyphs / maxColor)', async () => {
  const c = ctx();
  // A Linux VT: ASCII only, 16 colours.
  assert.deepEqual((await c.call('list_terminal_facets', { maxGlyphs: 'ascii', maxColor: '16' })).items.map((f) => f.id), ['loaders-ascii-line']);
  // Unicode without braille, 256 colours.
  assert.deepEqual((await c.call('list_terminal_facets', { maxGlyphs: 'unicode', maxColor: '256' })).items.map((f) => f.id).sort(), ['loaders-ascii-line', 'matrix', 'progress-download']);
  // Exact requirement.
  assert.deepEqual((await c.call('list_terminal_facets', { glyphs: 'braille' })).items.map((f) => f.id), ['loaders-braille-orbit']);
  assert.deepEqual((await c.call('list_terminal_facets', { color: 'truecolor' })).items.map((f) => f.id), ['plasma']);
  // Size budget: a one-line status area.
  assert.deepEqual((await c.call('list_terminal_facets', { maxWidth: 12, maxHeight: 1 })).items.map((f) => f.id).sort(), ['loaders-ascii-line', 'loaders-braille-orbit']);
});

test('list_terminal_facets paginates', async () => {
  const c = ctx();
  const p1 = await c.call('list_terminal_facets', { limit: 2, offset: 0 });
  const p3 = await c.call('list_terminal_facets', { limit: 2, offset: 4 });
  assert.equal(p1.total, 5);
  assert.equal(p1.returned, 2);
  assert.equal(p3.returned, 1);
  assert.equal((await c.call('list_terminal_facets', { offset: 99 })).returned, 0);
});

test('search_terminal_facets ranks title/tag hits above description-only hits', async () => {
  const c = ctx();
  const r = await c.call('search_terminal_facets', { query: 'spinner' });
  assert.deepEqual(r.items.map((f) => f.id).slice(0, 2).sort(), ['loaders-ascii-line', 'loaders-braille-orbit']);
  assert.ok(r.items.every((f) => typeof f.score === 'number' && f.score > 0));
  const exact = await c.call('search_terminal_facets', { query: 'plasma' });
  assert.equal(exact.items[0].id, 'plasma');
  const multi = await c.call('search_terminal_facets', { query: 'download eta' });
  assert.equal(multi.items[0].id, 'progress-download');
  // Scores are monotonically non-increasing.
  for (let i = 1; i < r.items.length; i++) assert.ok(r.items[i - 1].score >= r.items[i].score);
});

test('search_terminal_facets combines query with filters; filters alone are enough', async () => {
  const c = ctx();
  const r = await c.call('search_terminal_facets', { query: 'spinner', maxGlyphs: 'ascii' });
  assert.deepEqual(r.items.map((f) => f.id), ['loaders-ascii-line']);
  const f = await c.call('search_terminal_facets', { gallery: 'progress' });
  assert.deepEqual(f.items.map((x) => x.id), ['progress-download']);
  assert.equal((await c.call('search_terminal_facets', { query: 'zzz-nothing' })).total, 0);
  const e = await c.fail('search_terminal_facets', {});
  assert.ok(e instanceof ToolError);
  assert.equal(e.code, 'invalid_argument');
});

test('get_terminal_facet returns the full record, can omit source/preview, suggests on a miss', async () => {
  const c = ctx();
  const full = await c.call('get_terminal_facet', { id: 'plasma' });
  assert.match(full.source, /export default/);
  assert.deepEqual(full.imports, ['../../canvas.js']);
  assert.equal(full.params.speed.default, 1);
  assert.match(full.usage.npx, /npx -y --package=/);
  assert.equal(full.engine.package, 'prism-term');
  assert.ok(full.preview.text);
  const lean = await c.call('get_terminal_facet', { id: 'plasma', includeSource: false, includePreview: false });
  assert.ok(!('source' in lean) && !('preview' in lean));
  const miss = await c.fail('get_terminal_facet', { id: 'braille-spinner' });
  assert.equal(miss.code, 'not_found');
  assert.ok(miss.data.suggestions.includes('loaders-braille-orbit'));
});

test('get_terminal_catalog_stats aggregates by gallery, kind, glyphs and colour', async () => {
  const s = await ctx().call('get_terminal_catalog_stats');
  assert.equal(s.totalFacets, 5);
  assert.deepEqual(s.byGallery, { fx: 2, loaders: 2, progress: 1 });
  assert.deepEqual(s.byKind, { scene: 2, spinner: 2, progress: 1 });
  assert.deepEqual(s.byGlyphs, { unicode: 3, braille: 1, ascii: 1 });
  assert.equal(s.animated + s.still, 5);
  assert.equal(s.topTags[0].tag, 'spinner');
  assert.equal(s.engine.package, 'prism-term');
  assert.equal(s.source, 'json');
});

// ---------------------------------------------------------------- schema 1 vs 2

test('schema 1: per-facet `source` still loads, with no helpers', async () => {
  const c = ctx();
  assert.equal(c.terminal.meta().schema, 1);
  assert.equal(c.terminal.meta().sourceModules, 0);
  const rec = await c.call('get_terminal_facet', { id: 'plasma' });
  assert.equal(rec.source, TERMINAL_FIXTURE.facets[0].source);
  assert.deepEqual(rec.helpers, []);
});

test('schema 2: `source` comes from the shared `sources` map; facets in one module share it', () => {
  const raw = TERMINAL_FIXTURE_V2;
  assert.ok(raw.facets.every((f) => !('source' in f)), 'fixture records carry no source');
  const cat = normalizeTerminalCatalog(raw);
  assert.equal(cat.schema, 2);
  assert.equal(cat.sources, raw.sources, 'the map is referenced, not copied');
  const by = Object.fromEntries(cat.facets.map((f) => [f.id, f]));
  assert.equal(by.plasma.source, raw.sources[V2_MODULES.plasma]);
  assert.equal(by['loaders-braille-orbit'].source, raw.sources[V2_MODULES.loaders]);
  assert.equal(by['loaders-ascii-line'].source, by['loaders-braille-orbit'].source);
  // sources[module] wins; a module missing from the map falls back to the record's own source, else ''
  const mixed = normalizeTerminalCatalog({ sources: { 'a.js': 'shared' }, facets: [{ id: 'a', module: 'a.js', source: 'stale' }, { id: 'b', module: 'b.js', source: 'own' }, { id: 'c', module: 'c.js' }] });
  assert.deepEqual(mixed.facets.map((f) => f.source), ['shared', 'own', '']);
  assert.equal(normalizeTerminalCatalog({ sources: [], facets: [] }).schema, 1, 'a non-object `sources` is ignored');
});

test('schema 2: helpers are the "_" modules a facet imports (and their re-exports), never engine modules', () => {
  assert.equal(resolveImport(`${P}fx/interference.js`, '../retro/_kit.js'), `${P}retro/_kit.js`);
  assert.equal(resolveImport(`${P}fx/plasma.js`, '../../canvas.js'), 'prism-term/src/canvas.js');
  assert.equal(resolveImport(`${P}fx/plasma.js`, 'prism-term'), null, 'bare specifiers are not resolved');
  const t = fixtureTerminal(TERMINAL_FIXTURE_V2);
  const paths = (id) => t.helpersOf(t.get(id)).map((h) => h.path);
  assert.deepEqual(paths('plasma'), [`${P}fx/_kit.js`]);
  assert.deepEqual(paths('loaders-ascii-line'), [`${P}loaders/_frames.js`, `${P}fx/_kit.js`], 'a helper re-exported across galleries comes too');
  assert.deepEqual(paths('loaders-braille-orbit'), paths('loaders-ascii-line'));
  assert.deepEqual(paths('matrix'), [], 'prism-term/src/canvas.js is in sources but is an engine module');
  assert.deepEqual(paths('progress-download'), [], 'a helper missing from sources is skipped');
  // re-export cycles terminate; each helper appears once
  const cyc = { [`${P}g/_a.js`]: "export * from './_b.js';\n", [`${P}g/_b.js`]: "export * from './_a.js';\nexport * from './_a.js';\n" };
  assert.deepEqual(facetHelpers({ module: `${P}g/x.js`, imports: ['./_a.js', './_b.js'] }, cyc).map((h) => h.path), [`${P}g/_a.js`, `${P}g/_b.js`]);
  assert.deepEqual(facetHelpers({ module: null, imports: ['./_a.js'] }, cyc), []);
});

test('schema 2: get_terminal_facet returns `source` and `helpers`; includeHelpers / includeSource trim them', async () => {
  const c = ctx(fixtureTerminal(TERMINAL_FIXTURE_V2));
  const rec = await c.call('get_terminal_facet', { id: 'loaders-ascii-line' });
  assert.equal(rec.module, V2_MODULES.loaders);
  assert.equal(rec.source, TERMINAL_FIXTURE_V2.sources[V2_MODULES.loaders]);
  assert.deepEqual(rec.helpers, [
    { path: `${P}loaders/_frames.js`, source: TERMINAL_FIXTURE_V2.sources[`${P}loaders/_frames.js`] },
    { path: `${P}fx/_kit.js`, source: TERMINAL_FIXTURE_V2.sources[`${P}fx/_kit.js`] },
  ]);
  assert.ok(!('sources' in rec), 'the shared map is never returned whole');
  const noHelpers = await c.call('get_terminal_facet', { id: 'loaders-ascii-line', includeHelpers: false });
  assert.ok('source' in noHelpers && !('helpers' in noHelpers));
  const lean = await c.call('get_terminal_facet', { id: 'loaders-ascii-line', includeSource: false });
  assert.ok(!('source' in lean) && !('helpers' in lean));
  const stats = await c.call('get_terminal_catalog_stats');
  assert.deepEqual([stats.schema, stats.sourceModules, stats.totalFacets], [2, 7, 5]);
});

test('schema 2 loads from a Prism.html island too (</script inside module code survives)', async () => {
  const dir = tmpdir();
  const html = path.join(dir, 'Prism.html');
  fs.writeFileSync(html, page(mainIsland(FIXTURE), island(TERMINAL_FIXTURE_V2)));
  const t = new TerminalCatalogStore({ htmlPath: html, jsonPath: path.join(dir, 'terminal-catalog.json'), logger: silent });
  await t.load();
  assert.equal(t.source, 'island');
  assert.deepEqual([t.meta().schema, t.meta().sourceModules, t.meta().facetCount], [2, 7, 5]);
  assert.match(t.get('loaders-braille-orbit').source, /const s = "<\/script>";/);
  assert.equal(t.helpersOf(t.get('plasma'))[0].path, `${P}fx/_kit.js`);
});

test('schema 2 keeps memory and responses flat: one string per module, not per facet', async () => {
  const MB = 1024 * 1024;
  const big = `// shared module\n${'x'.repeat(2 * MB)}\n`;
  const helper = `// shared helper\n${'y'.repeat(MB / 2)}\n`;
  const N = 60; // 60 copies of the module would be 120 MB
  const raw = {
    _ai: { schema: 2 },
    galleries: [{ id: 'g', title: 'G', categories: [{ name: 'C', count: N }] }],
    facets: Array.from({ length: N }, (_, i) => ({ id: `f${i}`, title: `Facet ${i}`, gallery: 'g', category: 'C', module: `${P}g/all.js`, imports: ['./_h.js'], usage: { cli: `prism-term play f${i}` } })),
    sources: { [`${P}g/all.js`]: big, [`${P}g/_h.js`]: helper },
  };
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  const t = fixtureTerminal(raw);
  const helpers = t.all().map((f) => t.helpersOf(f));
  const grown = process.memoryUsage().heapUsed - before;
  assert.ok(grown < 16 * MB, `loading ${N} facets of one module grew the heap by ${(grown / MB).toFixed(1)} MB`);
  assert.equal(helpers.length, N);

  const c = ctx(t);
  const list = JSON.stringify(await c.call('list_terminal_facets', { limit: N }));
  const search = JSON.stringify(await c.call('search_terminal_facets', { query: 'facet', limit: N }));
  assert.ok(list.length < 64 * 1024 && search.length < 64 * 1024, 'list/search never carry module code');
  const rec = JSON.stringify(await c.call('get_terminal_facet', { id: 'f7' }));
  assert.equal(rec.split('// shared module').length - 1, 1, 'the module source appears once');
  assert.equal(rec.split('// shared helper').length - 1, 1, 'each helper appears once');
  assert.ok(rec.length < big.length + helper.length + 8 * 1024);
});

test('every terminal tool reports `unavailable` (with where it looked) when there is no catalog', async () => {
  const t = new TerminalCatalogStore({ htmlPath: path.join(tmpdir(), 'Prism.html'), jsonPath: path.join(tmpdir(), 'x.json'), logger: silent });
  const c = ctx(t);
  for (const [name, args] of [['list_terminal_galleries', {}], ['list_terminal_facets', {}], ['search_terminal_facets', { query: 'x' }], ['get_terminal_facet', { id: 'x' }], ['get_terminal_catalog_stats', {}]]) {
    const e = await c.fail(name, args);
    assert.ok(e instanceof ToolError, name);
    assert.equal(e.code, 'unavailable', name);
    assert.equal(e.data.searched.length, 2, name);
    assert.match(e.message, /npm run catalog/);
  }
  const noStore = await ctx(null).fail('list_terminal_facets');
  assert.equal(noStore.code, 'unavailable');
});

// ---------------------------------------------------------------- server

test('server: terminal tools work over JSON-RPC and are listed with schemas', async () => {
  const s = new PrismMCPServer('(fixture)', { watch: false, logLevel: 'silent', collectionsInMemory: true, terminal: fixtureTerminal() });
  s.store.catalog = normalizeCatalog(FIXTURE);
  s.store._reindex();
  const list = await s.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const names = list.result.tools.map((t) => t.name);
  for (const n of ['list_terminal_galleries', 'list_terminal_facets', 'search_terminal_facets', 'get_terminal_facet', 'get_terminal_catalog_stats']) assert.ok(names.includes(n), n);
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_terminal_facets', arguments: { query: 'braille' } } });
  assert.equal(res.result.isError, false);
  assert.equal(JSON.parse(res.result.content[0].text).items[0].id, 'loaders-braille-orbit');
  const miss = await s.handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_terminal_facet', arguments: { id: 'ghost' } } });
  assert.equal(miss.result.isError, true);
  assert.equal(JSON.parse(miss.result.content[0].text).code, 'not_found');
  const init = await s.handleMessage({ jsonrpc: '2.0', id: 4, method: 'initialize', params: {} });
  assert.match(init.result.instructions, /search_terminal_facets/);
});

test('server: load() resolves the terminal catalog next to Prism.html (island, then JSON)', async () => {
  const root = tmpdir();
  const html = path.join(root, 'Prism.html');
  fs.mkdirSync(path.join(root, 'prism-term', 'catalog'), { recursive: true });
  fs.writeFileSync(path.join(root, 'prism-term', 'catalog', 'terminal-catalog.json'), JSON.stringify(TERMINAL_FIXTURE));
  fs.writeFileSync(html, page(mainIsland(FIXTURE)));
  const a = new PrismMCPServer(html, { watch: false, logLevel: 'silent', collectionsInMemory: true });
  await a.load();
  assert.equal(a.terminal.source, 'json');
  assert.equal(a.store.meta().effectCount, 3, 'main catalog unaffected');
  a.close();

  fs.writeFileSync(html, page(mainIsland(FIXTURE), island({ ...TERMINAL_FIXTURE, facets: TERMINAL_FIXTURE.facets.slice(0, 3) })));
  const b = new PrismMCPServer(html, { watch: false, logLevel: 'silent', collectionsInMemory: true });
  await b.load();
  assert.equal(b.terminal.source, 'island');
  assert.equal(b.terminal.meta().facetCount, 3);
  b.close();
});

test('server: a missing terminal catalog never breaks the main catalog', async () => {
  const root = tmpdir();
  const html = path.join(root, 'Prism.html');
  fs.writeFileSync(html, page(mainIsland(FIXTURE)));
  const s = new PrismMCPServer(html, { watch: false, logLevel: 'silent', collectionsInMemory: true });
  await s.load();
  assert.equal(s.terminal.available, false);
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_catalog_stats', arguments: {} } });
  assert.equal(JSON.parse(res.result.content[0].text).totalEffects, 3);
  const t = await s.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_terminal_galleries', arguments: {} } });
  assert.equal(t.result.isError, true);
  assert.equal(JSON.parse(t.result.content[0].text).code, 'unavailable');
  s.close();
});

// ---------------------------------------------------------------- real data

test('loads the real prism-term terminal catalog (JSON fallback)', async (t) => {
  if (!fs.existsSync(REAL_JSON)) return t.skip('prism-term/catalog/terminal-catalog.json not built');
  const store = new TerminalCatalogStore({ jsonPath: REAL_JSON, logger: silent });
  await store.load();
  assert.ok(store.available);
  assert.ok(store.meta().facetCount >= 20);
  const c = ctx(store);
  const stats = await c.call('get_terminal_catalog_stats');
  assert.equal(stats.totalFacets, store.meta().facetCount);
  const first = store.all()[0];
  const rec = await c.call('get_terminal_facet', { id: first.id });
  assert.ok(rec.source.length > 0 && rec.usage.cli);
  assert.ok(store.all().every((f) => f.source.length > 0), 'every facet resolves its module source');
  const galleries = await c.call('list_terminal_galleries');
  assert.equal(galleries.items.reduce((n, g) => n + g.liveCount, 0), stats.totalFacets);
  if (store.meta().schema >= 2) {
    const withHelper = store.all().find((f) => f.imports.some((i) => /(^|\/)_[^/]*\.js$/.test(i)));
    const helpers = store.helpersOf(withHelper);
    assert.ok(helpers.length > 0, `${withHelper.id} imports a "_" helper`);
    assert.ok(helpers.every((h) => h.path.startsWith(P) && h.source.length > 0), 'helpers are facet-gallery modules with code');
  }
});

test('loads the real terminal island from Prism.html (when embedded)', async (t) => {
  const html = fs.existsSync(REAL_HTML) ? fs.readFileSync(REAL_HTML, 'utf8') : '';
  if (!parseTerminalIsland(html)) return t.skip('Prism.html has no prism-terminal-catalog island yet');
  const store = new TerminalCatalogStore({ htmlPath: REAL_HTML, logger: silent });
  await store.load();
  assert.equal(store.source, 'island');
  assert.ok(store.available && store.all().every((f) => f.source.length > 0));
  if (fs.existsSync(REAL_JSON)) {
    const json = new TerminalCatalogStore({ jsonPath: REAL_JSON, logger: silent });
    await json.load();
    assert.equal(store.meta().facetCount, json.meta().facetCount, 'island and JSON agree');
  }
});
