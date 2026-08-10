// Tests for the JFH-8 faceted search surface: the enhanced search_effects and the
// five new tools (get_available_filters, list_filter_values, create_saved_search,
// get_saved_searches, execute_saved_search), plus interaction normalization.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolCtx } from './helper.js';
import { normalizeInteractions } from '../tools/index.js';

// -------------------- interaction normalization --------------------

test('normalizeInteractions de-truncates, splits, de-dupes (string form)', () => {
  assert.deepEqual(normalizeInteractions('hover click'), ['hover', 'click']);
  assert.deepEqual(normalizeInteractions('tatic'), ['static']);
  assert.deepEqual(normalizeInteractions('focu'), ['focus']);
  assert.deepEqual(normalizeInteractions('croll'), ['scroll']);
});

test('normalizeInteractions handles array form with stray whitespace/commas', () => {
  // Mirrors real catalog data like ["focu"," click"] and ["click ","tatic"].
  assert.deepEqual(normalizeInteractions(['focu', ' click']), ['focus', 'click']);
  assert.deepEqual(normalizeInteractions(['click ', 'tatic']), ['click', 'static']);
  assert.deepEqual(normalizeInteractions([]), []);
  assert.deepEqual(normalizeInteractions(null), []);
});

test('normalizeInteractions never yields empty tokens', () => {
  const toks = normalizeInteractions(['focu', ' ', ',', 'auto-play']);
  assert.deepEqual(toks, ['focus', 'auto-play']);
  assert.ok(toks.every((t) => t.length > 0));
});

// -------------------- search_effects filters --------------------

test('search_effects filters by gallery without a query', () => {
  const ctx = toolCtx();
  const r = ctx.call('search_effects', { filters: { galleries: ['charts'] } });
  assert.equal(r.total, 2);
  assert.ok(r.items.every((i) => i.gallery === 'charts'));
  assert.equal(r.query, null);
  assert.equal(r.sort, 'name', 'defaults to name sort when no query');
});

test('search_effects OR within a facet, AND across facets', () => {
  const ctx = toolCtx();
  // galleries OR: charts OR fx = all 3
  assert.equal(ctx.call('search_effects', { filters: { galleries: ['charts', 'fx'] } }).total, 3);
  // across facets AND: gallery charts AND background-capable = 0 (bg is in fx)
  assert.equal(ctx.call('search_effects', { filters: { galleries: ['charts'], usableAsBackground: true } }).total, 0);
});

test('search_effects tags use AND semantics', () => {
  const ctx = toolCtx();
  // both charts kpi effects have 'kpi'; only the pulse one also has 'pulse'
  assert.equal(ctx.call('search_effects', { filters: { tags: ['kpi'] } }).total, 2);
  const r = ctx.call('search_effects', { filters: { tags: ['kpi', 'pulse'] } });
  assert.equal(r.total, 1);
  assert.equal(r.items[0].id, 'charts-kpi-pulse');
});

test('search_effects filters by normalized interaction', () => {
  const ctx = toolCtx();
  // charts-kpi-pulse has interaction ["focu"," click"] -> focus+click
  const focus = ctx.call('search_effects', { filters: { interactions: ['focus'] } });
  assert.equal(focus.total, 1);
  assert.equal(focus.items[0].id, 'charts-kpi-pulse');
  // 'static' matches the delta tile
  const stat = ctx.call('search_effects', { filters: { interactions: ['static'] } });
  assert.equal(stat.items[0].id, 'charts-kpi-delta');
  // items expose the normalized interactions array
  assert.deepEqual(focus.items[0].interactions.sort(), ['click', 'focus']);
});

test('search_effects filters by spectrum', () => {
  const ctx = toolCtx();
  const r = ctx.call('search_effects', { filters: { spectrums: ['glassmorphism'] } });
  assert.equal(r.total, 1);
  assert.equal(r.items[0].id, 'charts-kpi-pulse');
});

test('search_effects isNew boolean flag filter', () => {
  const ctx = toolCtx();
  // pulse + wind are isNew:true in the fixture
  const r = ctx.call('search_effects', { filters: { isNew: true } });
  assert.equal(r.total, 2);
  assert.ok(r.items.every((i) => i.isNew));
});

test('search_effects query + filter combine (relevance sort)', () => {
  const ctx = toolCtx();
  const r = ctx.call('search_effects', { query: 'kpi', filters: { galleries: ['charts'] } });
  assert.ok(r.total >= 1);
  assert.equal(r.sort, 'relevance');
  assert.ok(r.items[0].score > 0);
});

test('search_effects sort options', () => {
  const ctx = toolCtx();
  const names = ctx.call('search_effects', { filters: { galleries: ['charts'] }, sort: 'name' }).items.map((i) => i.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('search_effects paginates with offset/limit', () => {
  const ctx = toolCtx();
  const r = ctx.call('search_effects', { filters: { galleries: ['charts', 'fx'] }, limit: 1, offset: 2 });
  assert.equal(r.total, 3);
  assert.equal(r.returned, 1);
  assert.equal(r.offset, 2);
});

test('search_effects requires a query or a filter', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('search_effects', {});
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'invalid_argument');
});

test('search_effects back-compat: query + gallery shorthand still works', () => {
  const ctx = toolCtx();
  const r = ctx.call('search_effects', { query: 'wind', gallery: 'fx' });
  assert.equal(r.items[0].id, 'fx-wind-bg');
});

// -------------------- get_available_filters --------------------

test('get_available_filters returns facets, flags, sorts', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_available_filters', {});
  assert.equal(r.totalEffects, 3);
  assert.ok(r.facets.gallery.values.some((v) => v.value === 'charts' && v.count === 2));
  // interaction facet is normalized (no 'focu'/'tatic' remnants)
  const interVals = r.facets.interaction.values.map((v) => v.value);
  assert.ok(interVals.includes('focus'));
  assert.ok(interVals.includes('static'));
  assert.ok(!interVals.includes('focu'));
  assert.ok(!interVals.includes('tatic'));
  assert.ok(!interVals.includes(''));
  // boolean flags present with counts
  assert.equal(r.booleanFlags.usableAsBackground.count, 1);
  assert.deepEqual(r.sorts, ['relevance', 'name', 'newest', 'gallery']);
  // each facet advertises the filterKey clients pass to search_effects
  assert.equal(r.facets.gallery.filterKey, 'galleries');
  assert.equal(r.facets.tag.filterKey, 'tags');
});

test('get_available_filters topValues caps values per facet', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_available_filters', { topValues: 1 });
  assert.equal(r.facets.gallery.values.length, 1);
  assert.ok(r.facets.gallery.totalValues >= 2, 'totalValues reflects the full set');
});

// -------------------- list_filter_values --------------------

test('list_filter_values enumerates one facet with counts', () => {
  const ctx = toolCtx();
  const r = ctx.call('list_filter_values', { facet: 'tag' });
  assert.equal(r.facet, 'tag');
  const kpi = r.items.find((i) => i.value === 'kpi');
  assert.equal(kpi.count, 2);
});

test('list_filter_values prefix filters values', () => {
  const ctx = toolCtx();
  const r = ctx.call('list_filter_values', { facet: 'gallery', prefix: 'ch' });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].value, 'charts');
});

test('list_filter_values rejects unknown facet', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('list_filter_values', { facet: 'bogus' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'invalid_argument');
  assert.ok(Array.isArray(r.error.data.validFacets));
});

// -------------------- saved searches --------------------

test('create/get/execute saved search round-trips', () => {
  const ctx = toolCtx();
  const created = ctx.call('create_saved_search', {
    name: 'KPI in charts',
    query: 'kpi',
    filters: { galleries: ['charts'] },
    sort: 'name',
  });
  assert.ok(created.created);
  assert.equal(created.savedSearch.name, 'KPI in charts');

  const list = ctx.call('get_saved_searches', {});
  assert.equal(list.total, 1);
  assert.equal(list.items[0].id, created.created);

  const run = ctx.call('execute_saved_search', { id: created.created });
  assert.equal(run.savedSearch.id, created.created);
  assert.ok(run.total >= 1);
  assert.ok(run.items.every((i) => i.gallery === 'charts'));
});

test('create_saved_search generates unique ids for same name', () => {
  const ctx = toolCtx();
  const a = ctx.call('create_saved_search', { name: 'Dupe', filters: { galleries: ['charts'] } });
  const b = ctx.call('create_saved_search', { name: 'Dupe', filters: { galleries: ['fx'] } });
  assert.notEqual(a.created, b.created);
  assert.equal(ctx.call('get_saved_searches', {}).total, 2);
});

test('create_saved_search caps id-collision attempts instead of looping forever', () => {
  const ctx = toolCtx();
  // Pre-seed the session store with the base slug + every numeric-suffix variant
  // the loop would try, so the next create can never find a free id. Without the
  // MAX_ID_ATTEMPTS bound this would spin indefinitely; with it, it throws.
  const store = ctx.store._savedSearches = new Map();
  const base = 'flood';
  store.set(base, {});
  for (let n = 2; n < 2 + 10000; n++) store.set(`${base}-${n}`, {});
  const r = ctx.callSafe('create_saved_search', { name: 'Flood', filters: { galleries: ['charts'] } });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'id_generation_failed');
});

test('create_saved_search requires a query or filter', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('create_saved_search', { name: 'Empty' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'invalid_argument');
});

test('execute_saved_search can override sort/limit', () => {
  const ctx = toolCtx();
  const created = ctx.call('create_saved_search', { name: 'All charts+fx', filters: { galleries: ['charts', 'fx'] }, sort: 'name' });
  const run = ctx.call('execute_saved_search', { id: created.created, limit: 1 });
  assert.equal(run.returned, 1);
  assert.equal(run.total, 3);
});

test('execute_saved_search unknown id errors with available list', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('execute_saved_search', { id: 'nope' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'not_found');
  assert.ok(Array.isArray(r.error.data.available));
});
