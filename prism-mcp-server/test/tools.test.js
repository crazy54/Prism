// Integration tests for all 15 tools + tool-level behavior, using the fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolCtx } from './helper.js';

// -------------------- Discovery --------------------

test('list_effects returns light metadata with pagination', () => {
  const ctx = toolCtx();
  const r = ctx.call('list_effects', {});
  assert.equal(r.total, 3);
  assert.equal(r.items.length, 3);
  assert.ok(!('css' in r.items[0]), 'light projection excludes css');
  assert.ok('hasCss' in r.items[0]);
});

test('list_effects filters by gallery and background', () => {
  const ctx = toolCtx();
  assert.equal(ctx.call('list_effects', { gallery: 'charts' }).total, 2);
  assert.equal(ctx.call('list_effects', { usableAsBackground: true }).total, 1);
  assert.equal(ctx.call('list_effects', { tag: 'kpi' }).total, 2);
});

test('list_effects pagination offset/limit', () => {
  const ctx = toolCtx();
  const r = ctx.call('list_effects', { limit: 1, offset: 1 });
  assert.equal(r.returned, 1);
  assert.equal(r.offset, 1);
});

// Regression (JFH-8 sweep): paginate() coerced offset/limit with `x | 0`, a 32-bit
// signed conversion. Any value >= 2^31 wrapped negative and clamped to 0 — so a large
// paging offset silently returned page 1 again (infinite re-paging) and a large limit
// returned nothing. nonNegInt (Math.trunc(Number(x))) handles the full safe-integer range.
test('list_effects pagination survives offsets/limits >= 2^31', () => {
  const ctx = toolCtx();
  const total = ctx.call('list_effects', {}).total;
  // A huge offset must be treated as past-the-end (empty), NOT wrapped to page 1.
  const past = ctx.call('list_effects', { offset: 2147483648, limit: 5 });
  assert.equal(past.offset, 2147483648, 'offset preserved, not wrapped to 0');
  assert.equal(past.returned, 0, 'past-the-end offset returns an empty page');
  assert.equal(past.items.length, 0);
  // A huge limit must return everything, NOT nothing.
  const big = ctx.call('list_effects', { limit: 2147483648, offset: 0 });
  assert.equal(big.returned, total, 'huge limit returns all items, not zero');
});

test('search_effects ranks by relevance', () => {
  const ctx = toolCtx();
  const r = ctx.call('search_effects', { query: 'pulsing kpi' });
  assert.ok(r.total >= 1);
  assert.equal(r.items[0].id, 'charts-kpi-pulse');
  assert.ok(r.items[0].score > 0);
});

test('search_effects "wind backdrop" finds the fx background', () => {
  const ctx = toolCtx();
  const r = ctx.call('search_effects', { query: 'wind backdrop' });
  assert.equal(r.items[0].id, 'fx-wind-bg');
});

test('search_effects rejects empty query', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('search_effects', { query: '   ' });
  assert.equal(r.ok, false);
  assert.ok(r.isToolError);
});

test('get_effect returns full record incl html/css', () => {
  const ctx = toolCtx();
  const e = ctx.call('get_effect', { id: 'charts-kpi-pulse' });
  assert.equal(e.id, 'charts-kpi-pulse');
  assert.ok(e.html.includes('kpi pulse'));
  assert.ok(e.css.includes('@keyframes kpiPulse'));
});

test('get_effect honors includeCss:false', () => {
  const ctx = toolCtx();
  const e = ctx.call('get_effect', { id: 'charts-kpi-pulse', includeCss: false });
  assert.ok(!('css' in e));
  assert.ok('html' in e);
});

test('get_effect unknown id throws ToolError with suggestions', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('get_effect', { id: 'charts-kpi' });
  assert.equal(r.ok, false);
  assert.ok(r.isToolError);
  assert.equal(r.error.code, 'not_found');
  assert.ok(Array.isArray(r.error.data.suggestions));
});

test('get_theme_variants returns tokens css + semantic tokens', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_theme_variants', {});
  assert.ok(r.tokensCss.includes('--accent'));
  assert.ok(r.semanticTokens.includes('--pos'));
});

test('list_galleries reports declared vs live counts', () => {
  const ctx = toolCtx();
  const r = ctx.call('list_galleries', {});
  assert.equal(r.total, 2);
  const charts = r.items.find((g) => g.id === 'charts');
  assert.equal(charts.liveCount, 2);
});

test('get_catalog_stats aggregates correctly', () => {
  const ctx = toolCtx();
  const s = ctx.call('get_catalog_stats', {});
  assert.equal(s.totalEffects, 3);
  assert.equal(s.byGallery.charts, 2);
  assert.equal(s.backgroundCapable, 1);
  assert.equal(s.needsJs, 1);
  assert.ok(s.topTags.length > 0);
});

// -------------------- Composition --------------------

test('compose merges html, dedupes css, reports metrics', () => {
  const ctx = toolCtx();
  const r = ctx.call('compose', { ids: ['charts-kpi-pulse', 'charts-kpi-delta'] });
  assert.equal(r.ok, true);
  assert.ok(r.html.includes('kpi pulse'));
  assert.ok(r.html.includes('kpi delta'));
  // .shared-badge appears in both effects -> exactly one copy after dedup
  const badgeCount = (r.css.match(/\.shared-badge/g) || []).length;
  assert.equal(badgeCount, 1, 'duplicate rule deduped');
  assert.ok(r.metrics.duplicatesRemoved >= 1);
  assert.equal(r.validation.valid, true);
});

test('compose reduces size vs naive concatenation', () => {
  const ctx = toolCtx();
  const r = ctx.call('compose', { ids: ['charts-kpi-pulse', 'charts-kpi-delta'] });
  assert.ok(r.metrics.finalCssLength < r.metrics.naiveCssLength, 'final smaller than naive');
});

test('compose includes tokens once and merges :root', () => {
  const ctx = toolCtx();
  const r = ctx.call('compose', { ids: ['charts-kpi-pulse'], includeTokens: true });
  const rootCount = (r.css.match(/:root\{/g) || []).length;
  assert.equal(rootCount, 1, 'single merged :root');
  assert.ok(r.css.includes('--accent'));
});

test('compose surfaces required initializers', () => {
  const ctx = toolCtx();
  const r = ctx.call('compose', { ids: ['fx-wind-bg'] });
  assert.deepEqual(r.initializers, ['wind-init']);
});

test('compose with wrap wraps markup', () => {
  const ctx = toolCtx();
  const r = ctx.call('compose', { ids: ['charts-kpi-pulse'], wrap: { tag: 'section', className: 'dash' } });
  assert.ok(r.html.startsWith('<section class="dash">'));
  assert.ok(r.html.trimEnd().endsWith('</section>'));
});

test('compose unknown id fails with structured error', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('compose', { ids: ['charts-kpi-pulse', 'nope'] });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'compose_failed');
  assert.deepEqual(r.error.data.missing, ['nope']);
});

test('compose_with_template applies grid template', () => {
  const ctx = toolCtx();
  const r = ctx.call('compose_with_template', { ids: ['charts-kpi-pulse', 'charts-kpi-delta'], template: 'grid' });
  assert.equal(r.template, 'grid');
  assert.ok(r.html.includes('prism-compose-grid'));
  assert.ok(r.css.includes('.prism-compose-grid'));
});

test('validate_composition flags missing + needsJs', () => {
  const ctx = toolCtx();
  const good = ctx.call('validate_composition', { ids: ['fx-wind-bg'] });
  assert.equal(good.valid, true);
  assert.ok(good.warnings.some((w) => w.includes('wind-init')));
  const bad = ctx.call('validate_composition', { ids: ['ghost'] });
  assert.equal(bad.valid, false);
  assert.deepEqual(bad.missing, ['ghost']);
});

// -------------------- Content creation --------------------

test('validate_facet passes a well-formed facet', () => {
  const ctx = toolCtx();
  const v = ctx.call('validate_facet', {
    id: 'charts-my-widget', name: 'My Widget', gallery: 'charts',
    description: 'A tidy little widget for dashboards.',
    html: '<div class="mw">hi</div>', css: '.mw{color:var(--ink)}',
  });
  assert.equal(v.valid, true);
  assert.equal(v.errors.length, 0);
});

test('validate_facet rejects bad id and missing fields', () => {
  const ctx = toolCtx();
  const v = ctx.call('validate_facet', { id: 'Charts_BadID', name: '', gallery: 'charts', html: '' });
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.includes('kebab-case')));
  assert.ok(v.errors.some((e) => e.includes('name')));
  assert.ok(v.errors.some((e) => e.toLowerCase().includes('html')));
});

test('validate_facet flags unbalanced css and unknown token', () => {
  const ctx = toolCtx();
  const v = ctx.call('validate_facet', {
    id: 'charts-x', name: 'X', gallery: 'charts', description: 'desc long enough',
    html: '<div class="x"></div>', css: '.x{color:var(--totally-made-up)',
  });
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => e.includes('Unbalanced')));
  assert.ok(v.warnings.some((w) => w.includes('--totally-made-up')));
});

test('create_facet registers a runtime facet, discoverable immediately', () => {
  const ctx = toolCtx();
  const before = ctx.call('get_catalog_stats', {}).totalEffects;
  const r = ctx.call('create_facet', {
    id: 'charts-runtime-widget', name: 'Runtime Widget', gallery: 'charts',
    description: 'Created at runtime for the test.',
    html: '<div class="rw">rw</div>', css: '.rw{color:var(--accent)}',
    tags: ['charts', 'runtime'],
  });
  assert.equal(r.created, 'charts-runtime-widget');
  assert.equal(r.persisted, false);
  assert.equal(ctx.call('get_catalog_stats', {}).totalEffects, before + 1);
  const got = ctx.call('get_effect', { id: 'charts-runtime-widget' });
  assert.equal(got.name, 'Runtime Widget');
  const found = ctx.call('search_effects', { query: 'runtime widget' });
  assert.equal(found.items[0].id, 'charts-runtime-widget');
});

test('create_facet rejects duplicate id', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('create_facet', {
    id: 'charts-kpi-pulse', name: 'Dup', gallery: 'charts',
    html: '<div>x</div>', description: 'dup id test long enough',
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'validation_failed');
});

test('update_facet updates an existing effect', () => {
  const ctx = toolCtx();
  const r = ctx.call('update_facet', { id: 'charts-kpi-delta', description: 'Updated description for delta tile.' });
  assert.equal(r.updated, 'charts-kpi-delta');
  assert.equal(ctx.call('get_effect', { id: 'charts-kpi-delta' }).description, 'Updated description for delta tile.');
});

test('update_facet on unknown id errors', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('update_facet', { id: 'does-not-exist', name: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'not_found');
});

test('update_facet on a base-catalog effect does not duplicate it in the gallery', () => {
  const ctx = toolCtx();
  // 'charts' has two base-catalog effects. Updating one used to layer a second
  // copy into _byGallery (base push + runtime push), inflating list_galleries
  // and export_collection(gallery). It must stay at exactly two, no dupes.
  ctx.call('update_facet', { id: 'charts-kpi-delta', description: 'Updated description for delta tile.' });
  const g = ctx.store.gallery('charts');
  assert.equal(g.length, 2, 'gallery must not grow on update');
  const ids = g.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids in gallery index');
  assert.equal(ctx.call('list_galleries', {}).items.find((x) => x.id === 'charts').liveCount, 2);
  const exp = ctx.call('export_collection', { gallery: 'charts' });
  assert.equal(exp.effects.length, 2, 'export_collection must not double-list the updated effect');
  assert.equal(new Set(exp.effects).size, exp.effects.length);
  // the update itself still took effect
  assert.equal(ctx.call('get_effect', { id: 'charts-kpi-delta' }).description, 'Updated description for delta tile.');
});

// -------------------- Catalog management --------------------

test('get_catalog_metadata returns meta', () => {
  const ctx = toolCtx();
  const m = ctx.call('get_catalog_metadata', {});
  assert.equal(m.name, 'prism-effects-test');
  assert.equal(m.effectCount, 3);
});

test('export_collection by ids returns bundle', () => {
  const ctx = toolCtx();
  const b = ctx.call('export_collection', { ids: ['charts-kpi-pulse', 'charts-kpi-delta'], title: 'Dash' });
  assert.equal(b.title, 'Dash');
  assert.equal(b.effects.length, 2);
  assert.ok(b.css.length > 0);
  assert.ok(!('document' in b));
});

test('export_collection by gallery + asDocument yields full html', () => {
  const ctx = toolCtx();
  const b = ctx.call('export_collection', { gallery: 'charts', asDocument: true });
  assert.equal(b.effects.length, 2);
  assert.ok(b.document.startsWith('<!DOCTYPE html>'));
  assert.ok(b.document.includes('<style>'));
});

test('export_collection with nothing to export errors', () => {
  const ctx = toolCtx();
  const r = ctx.callSafe('export_collection', {});
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'invalid_argument');
});

test('get_token_reference lists tokens and recolor classes', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_token_reference', {});
  assert.ok(r.tokensCss.includes('--accent'));
  assert.ok(r.tokens.some((t) => t.token === '--pos'));
  assert.ok(r.recolorClasses.includes('c-pos'));
});
