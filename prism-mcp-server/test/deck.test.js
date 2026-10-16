// Prism Deck catalog + render tools: the #prism-deck-catalog island / deck-catalog.json
// loader, the 7 catalog tools over a real-catalog fixture, deck_render through the real
// prism-deck engine (SVG + PNG image content), and the real catalog end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeckIsland, DeckCatalogStore, resolveDeckPaths, DECK_ISLAND_OPEN, normalizeDeckCatalog, facetFitsDevice } from '../utils/deck-catalog.js';
import { MCP_CONTENT } from '../tools/deck.js';
import { PrismMCPServer } from '../index.js';
import { normalizeCatalog } from '../utils/catalog.js';
import { FIXTURE } from './fixture.js';
import { deckCtx, scratch, silent, DECK_FIXTURE, engine } from './deck-helper.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const island = (obj) => `<!doctype html><body>${DECK_ISLAND_OPEN}${JSON.stringify(obj).split('</script').join('<\\/script')}</script></body>`;
const PNG_SIG = '89504e470d0a1a0a';

// ---------------------------------------------------------------- loader

test('parseDeckIsland: absent → null, empty → null, malformed → throws, </script escapes round-trip', () => {
  assert.equal(parseDeckIsland('<html></html>'), null);
  assert.equal(parseDeckIsland(`${DECK_ISLAND_OPEN}   </script>`), null);
  assert.throws(() => parseDeckIsland(`${DECK_ISLAND_OPEN}{nope</script>`), /Failed to parse prism-deck-catalog/);
  assert.throws(() => parseDeckIsland(`${DECK_ISLAND_OPEN}{}`), /not terminated/);
  const raw = parseDeckIsland(island({ ...DECK_FIXTURE, facets: [{ ...DECK_FIXTURE.facets[1], description: 'has </script> and <!-- inside' }] }));
  assert.equal(raw.facets[0].description, 'has </script> and <!-- inside');
});

test('DeckCatalogStore: an island without previews (Prism.html leaves them out) gets them from deck-catalog.json', async (t) => {
  const s = scratch();
  t.after(s.cleanup);
  const html = s.file('Prism.html');
  const json = path.join(s.dir, 'prism-deck', 'catalog', 'deck-catalog.json');
  fs.mkdirSync(path.dirname(json), { recursive: true });
  fs.writeFileSync(json, JSON.stringify(DECK_FIXTURE));
  fs.writeFileSync(html, island({ ...DECK_FIXTURE, facets: DECK_FIXTURE.facets.map(({ preview, ...f }) => f) }));
  const st = new DeckCatalogStore({ ...resolveDeckPaths(html), logger: silent });
  await st.load();
  assert.equal(st.source, 'island');
  const withPrev = DECK_FIXTURE.facets.filter((f) => f.preview);
  assert.ok(withPrev.length > 0);
  for (const f of withPrev) assert.deepEqual(st.get(f.id).preview, f.preview, f.id);
  const alone = new DeckCatalogStore({ htmlPath: html, logger: silent });
  await alone.load();
  assert.ok(alone.all().every((f) => f.preview === null), 'no JSON next to it: no previews');
});

test('DeckCatalogStore: island first, then deck-catalog.json, else unavailable with the paths it searched', async (t) => {
  const s = scratch();
  t.after(s.cleanup);
  const html = s.file('Prism.html');
  const json = path.join(s.dir, 'prism-deck', 'catalog', 'deck-catalog.json');
  fs.mkdirSync(path.dirname(json), { recursive: true });
  fs.writeFileSync(json, JSON.stringify({ ...DECK_FIXTURE, facets: DECK_FIXTURE.facets.slice(0, 2) }));
  fs.writeFileSync(html, '<html>no island</html>');
  const paths = resolveDeckPaths(html);
  assert.equal(paths.jsonPath, json);
  const a = new DeckCatalogStore({ ...paths, logger: silent });
  await a.load();
  assert.equal(a.source, 'json');
  assert.equal(a.all().length, 2);
  assert.match(a.meta().problems[0], /no prism-deck-catalog island/);
  fs.writeFileSync(html, island(DECK_FIXTURE));
  const b = new DeckCatalogStore({ ...paths, logger: silent });
  await b.load();
  assert.equal(b.source, 'island');
  assert.equal(b.all().length, DECK_FIXTURE.facets.length);
  assert.equal(b.meta().schema, 2);
  const none = new DeckCatalogStore({ htmlPath: s.file('missing.html'), jsonPath: s.file('missing.json'), logger: silent });
  await none.load();
  assert.equal(none.available, false);
  assert.equal(none.meta().searched.length, 2);
  const ctx = await deckCtx({ deck: none });
  const r = await ctx.callSafe('deck_list_facets', {});
  assert.equal(r.error.code, 'unavailable');
  assert.equal(r.error.data.searched.length, 2);
});

test('facetFitsDevice: keys on keyed devices, strips need dials, screens need the matching screen', () => {
  const c = normalizeDeckCatalog(DECK_FIXTURE);
  const dev = (id) => c.devices.find((d) => d.id === id);
  const f = (id) => c.facets.find((x) => x.id === id);
  assert.ok(facetFitsDevice(f('icon-mic'), dev('mk2')));
  assert.ok(!facetFitsDevice(f('icon-mic'), dev('pedal')), 'the Pedal has no display');
  assert.ok(facetFitsDevice(f('dial-volume'), dev('plus')));
  assert.ok(facetFitsDevice(f('dial-volume'), dev('galleon')), 'Galleon dials draw 200×100 segments in their widgets');
  assert.ok(!facetFitsDevice(f('dial-volume'), dev('mk2')));
  assert.ok(facetFitsDevice(f('screen-galleon-dashboard'), dev('galleon')));
  assert.ok(!facetFitsDevice(f('screen-galleon-dashboard'), dev('plus')));
  assert.ok(facetFitsDevice(f('screen-neo-clock'), dev('neo')));
  assert.ok(!facetFitsDevice(f('theme-prism'), dev('mcp')), 'deck facets need an LCD panel');
});

// ---------------------------------------------------------------- catalog tools

test('deck_list_galleries: galleries with live counts, totals, catalog source', async () => {
  const c = await deckCtx();
  const r = await c.call('deck_list_galleries');
  assert.deepEqual(r.galleries.map((g) => g.id), ['themes', 'icons', 'motion', 'spans', 'dials', 'screens', 'apps']);
  assert.equal(r.galleries.find((g) => g.id === 'icons').liveCount, 3);
  assert.equal(r.totals.facets, DECK_FIXTURE.facets.length);
  assert.equal(r.totals.bySurface.strip, 2);
  assert.equal(r.plugin, 'com.jeremyfhall.prism');
});

test('deck_list_facets: surface / gallery / device / tag / data filters + pagination; light records', async () => {
  const c = await deckCtx();
  const strips = await c.call('deck_list_facets', { surface: 'strip' });
  assert.deepEqual(strips.items.map((f) => f.id).sort(), ['dial-volume', 'strip-refraction']);
  assert.deepEqual(strips.items.find((f) => f.id === 'dial-volume').footprint, { segments: 1 });
  assert.ok(!('preview' in strips.items[0]) && Array.isArray(strips.items[0].params), 'light records: param names, no preview');
  const mk2 = await c.call('deck_list_facets', { device: 'streamdeck-mk2' });
  assert.ok(mk2.items.every((f) => ['key', 'span', 'deck'].includes(f.surface)), 'DESIGN device names resolve; mk2 has no dials or screens');
  const galleon = await c.call('deck_list_facets', { device: 'galleon-100-sd', surface: 'screen' });
  assert.deepEqual(galleon.items.map((f) => f.id), ['screen-galleon-dashboard']);
  const audio = await c.call('deck_list_facets', { data: 'audio' });
  assert.ok(audio.items.some((f) => f.id === 'span-waveform'));
  const page = await c.call('deck_list_facets', { limit: 2, offset: 2 });
  assert.equal(page.items.length, 2);
  assert.equal(page.total, DECK_FIXTURE.facets.length);
  const bad = await c.callSafe('deck_list_facets', { device: 'toaster' });
  assert.equal(bad.error.code, 'unknown_device');
});

test('deck_search_facets: ranked, filterable, needs a query or a filter', async () => {
  const c = await deckCtx();
  const r = await c.call('deck_search_facets', { query: 'volume dial' });
  assert.equal(r.items[0].id, 'dial-volume');
  assert.ok(r.items[0].score > 0);
  const g = await c.call('deck_search_facets', { query: 'galleon dashboard' });
  assert.equal(g.items[0].id, 'screen-galleon-dashboard');
  const f = await c.call('deck_search_facets', { query: 'mic', surface: 'span' });
  assert.equal(f.items.length, 0);
  const e = await c.callSafe('deck_search_facets', {});
  assert.equal(e.error.code, 'invalid_argument');
});

test('deck_get_facet: params, named states with tones, press rule, placement; not_found suggests', async () => {
  const c = await deckCtx();
  const r = await c.call('deck_get_facet', { id: 'dial-volume' });
  assert.equal(r.surface, 'strip');
  assert.equal(r.press, 'toggle');
  assert.deepEqual(r.stateTones.map((s) => s.name), ['on', 'muted']);
  assert.equal(r.stateTones[1].tone, 'neg');
  assert.equal(r.params.step.type, 'number');
  assert.ok(r.placement.devices.includes('plus') && r.placement.devices.includes('galleon') && !r.placement.devices.includes('mk2'));
  assert.ok(!('preview' in r) && r.previewAvailable === true);
  const withPrev = await c.call('deck_get_facet', { id: 'icon-mic', includePreview: true, includeSource: true });
  assert.match(withPrev.preview.svg, /^<svg/);
  assert.match(withPrev.source, /iconFacet|export default/);
  const miss = await c.callSafe('deck_get_facet', { id: 'dial-volum' });
  assert.equal(miss.error.code, 'not_found');
  assert.ok(miss.error.data.suggestions.includes('dial-volume'));
});

test('deck_list_themes / deck_list_glyphs: modes, palettes from the engine, glyph search', async (t) => {
  const c = await deckCtx();
  const th = await c.call('deck_list_themes', {});
  assert.deepEqual(th.items.map((x) => x.id), ['prism', 'paper', 'mono']);
  assert.equal(th.items[0].previewFacet, 'theme-prism');
  if (!(await engine()).available) return t.skip('prism-deck engine not found');
  const pal = await c.call('deck_list_themes', { mode: 'light', includePalette: true });
  for (const it of pal.items) {
    assert.deepEqual(Object.keys(it.palette), ['light']);
    assert.match(it.palette.light.ink, /^#[0-9a-f]{6}$/i);
    assert.match(it.palette.light.accent, /^#[0-9a-f]{6}$/i);
  }
  const gl = await c.call('deck_list_glyphs', { query: 'microphone' });
  assert.equal(gl.items[0].id, 'mic');
  assert.equal(gl.items[0].facet, 'icon-mic');
  assert.ok(gl.items[0].states.length >= 2);
  const cat = await c.call('deck_list_glyphs', { category: 'time' });
  assert.deepEqual(cat.items.map((g) => g.id), ['clock']);
});

test('deck_list_devices: every model from the engine (31 incl. the hidden joke device), geometry, DESIGN aliases', async (t) => {
  const e = await engine();
  if (!e.available) return t.skip('prism-deck engine not found');
  const c = await deckCtx();
  const r = await c.call('deck_list_devices', {});
  assert.equal(r.source, 'engine');
  assert.equal(r.models, e.mods.core.DATA.length);
  assert.equal(r.total, e.mods.core.DEVICE_IDS.length);
  const all = await c.call('deck_list_devices', { includeHidden: true });
  assert.equal(all.total, r.models);
  const g = r.items.find((d) => d.id === 'galleon');
  assert.equal(g.name, 'Corsair Galleon 100 SD');
  assert.deepEqual(g.grid, { cols: 3, rows: 4 });
  assert.equal(g.dials.count, 2);
  assert.equal(g.dials.layers, 2);
  assert.equal(g.dials.touch, false);
  assert.equal(g.screen.kind, 'galleon');
  assert.ok(g.aliases.includes('galleon-100-sd'));
  const plus = r.items.find((d) => d.id === 'plus');
  assert.equal(plus.strip.segments, 4);
  assert.equal(plus.dials.touch, true);
  assert.ok(plus.aliases.includes('streamdeck-plus'));
  const dials = await c.call('deck_list_devices', { hasDials: true });
  for (const id of ['galleon', 'plus', 'plusxl']) assert.ok(dials.items.some((d) => d.id === id), id);
  assert.ok(!dials.items.some((d) => d.id === 'mk2'));
  const lcd = await c.call('deck_list_devices', { includeVirtual: false });
  assert.ok(!lcd.items.some((d) => d.id === 'mcp'));
});

// ---------------------------------------------------------------- render

test('deck_render (facet): PNG image content by default, SVG + per-key slices on request, state by name', async (t) => {
  const e = await engine();
  if (!e.available) return t.skip('prism-deck engine not found');
  const c = await deckCtx();
  const r = await c.call('deck_render', { facet: 'icon-mic', device: 'galleon', theme: 'prism-day', state: 'off' });
  assert.equal(r.device, 'galleon');
  assert.equal(r.theme, 'prism');
  assert.equal(r.mode, 'light');
  assert.equal(r.stateName, 'off');
  assert.deepEqual([r.w, r.h], [160, 160]);
  assert.ok(!('svg' in r), 'png format carries no svg text');
  const [img] = r[MCP_CONTENT];
  assert.equal(img.type, 'image');
  assert.equal(img.mimeType, 'image/png');
  const buf = Buffer.from(img.data, 'base64');
  assert.equal(buf.subarray(0, 8).toString('hex'), PNG_SIG);
  assert.equal(buf.readUInt32BE(16), 160);
  const span = await c.call('deck_render', { facet: 'span-waveform', device: 'plus', format: 'svg', slices: true, t: 1.5 });
  assert.equal(span.surface, 'span');
  assert.equal(span.sliceSvgs.length, 4, 'a row of the Stream Deck + (4 keys)');
  assert.ok(span.sliceSvgs.every((s) => s.kind === 'key' && /^<svg/.test(s.svg)));
  assert.equal(span[MCP_CONTENT], undefined);
  const dial = await c.call('deck_render', { facet: 'dial-volume', format: 'both', params: { label: 'Mic', bogus: 1 }, value: 0.3, scale: 2 });
  assert.equal(dial.device, 'plus', 'strip facets default to the Stream Deck +');
  assert.deepEqual([dial.w, dial.h], [200, 100]);
  assert.equal(dial.png.width, 400);
  assert.match(dial.svg, /^<svg/);
  assert.equal(dial.warnings[0].code, 'unknown_param');
  const screen = await c.call('deck_render', { facet: 'screen-galleon-dashboard', format: 'svg' });
  assert.deepEqual([screen.w, screen.h, screen.slices], [720, 384, 4], 'Galleon screen = 4 dial-layer widgets');
  const badState = await c.callSafe('deck_render', { facet: 'icon-mic', state: 'exploded' });
  assert.equal(badState.error.code, 'invalid_state');
  const badTheme = await c.callSafe('deck_render', { facet: 'icon-mic', theme: 'chartreuse' });
  assert.equal(badTheme.error.code, 'unknown_theme');
  const ghost = await c.callSafe('deck_render', { facet: 'icon-ghost' });
  assert.equal(ghost.error.code, 'not_found');
  assert.ok(ghost.error.data.suggestions.length > 0);
  const nothing = await c.callSafe('deck_render', {});
  assert.equal(nothing.error.code, 'invalid_argument');
  const theme = await c.call('deck_render', { theme: 'paper:light', device: 'plus', format: 'svg' });
  assert.deepEqual([theme.facet, theme.surface, theme.device, theme.mode], ['theme-paper', 'deck', 'plus', 'light'], 'a theme alone previews the whole device in that material');
});

test('deck_render over JSON-RPC: the PNG rides as an MCP image block after the JSON text', async (t) => {
  const e = await engine();
  if (!e.available) return t.skip('prism-deck engine not found');
  const s = new PrismMCPServer('(fixture)', { watch: false, logLevel: 'silent', collectionsInMemory: true, deck: new DeckCatalogStore({ raw: DECK_FIXTURE }), deckEngine: e });
  s.store.catalog = normalizeCatalog(FIXTURE);
  s.store._reindex();
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'deck_render', arguments: { facet: 'icon-play-pause', device: 'mk2' } } });
  assert.equal(res.result.isError, false);
  assert.equal(res.result.content.length, 2);
  assert.equal(JSON.parse(res.result.content[0].text).facet, 'icon-play-pause');
  assert.equal(res.result.content[1].type, 'image');
  assert.equal(Buffer.from(res.result.content[1].data, 'base64').readUInt32BE(16), 72, 'MK.2 keys are 72 px');
});

// ---------------------------------------------------------------- the real catalog

test('real deck catalog: Prism.html island (or deck-catalog.json) loads; every facet renders through the engine', async (t) => {
  const paths = resolveDeckPaths(path.join(REPO, 'Prism.html'));
  if (!fs.existsSync(paths.htmlPath) && !fs.existsSync(paths.jsonPath)) return t.skip('no deck catalog in this checkout');
  const store = new DeckCatalogStore({ ...paths, logger: silent });
  await store.load();
  assert.ok(store.available, store.meta().problems.join('; '));
  const m = store.meta();
  assert.equal(m.schema, 2);
  assert.ok(m.facetCount >= 100, `facets ${m.facetCount}`);
  assert.ok(m.themeCount >= 8, `themes ${m.themeCount}`);
  assert.ok(m.glyphCount >= 50, `glyphs ${m.glyphCount}`);
  assert.ok(m.deviceCount >= 30, `devices ${m.deviceCount}`);
  assert.ok(m.sourceModules > 100);
  for (const id of ['galleon', 'plus', 'plusxl']) assert.ok(store.devices().some((d) => d.id === id), id);
  const e = await engine();
  if (!e.available) return;
  const missing = store.all().filter((f) => !e.facet(f.id)).map((f) => f.id);
  assert.deepEqual(missing, [], 'every catalog facet exists in the engine');
  const c = await deckCtx({ deck: store });
  for (const id of ['theme-prism', 'icon-mic', 'span-waveform', 'dial-volume', 'screen-galleon-dashboard']) {
    if (!store.get(id)) continue;
    const r = await c.call('deck_render', { facet: id, format: 'svg' });
    assert.ok(r.svgBytes > 100, id);
  }
});
