// Tests for the JFH-9 Component Variant Matrix tools:
//   get_theme_palette, get_component_variants, get_variants_for_theme,
//   and the themeSensitive facet on search_effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolCtx } from './helper.js';
import { THEME_IDS, BASE_TOKENS, usesTokens, isThemeSensitive } from '../utils/themes.js';

// -------------------- get_theme_palette --------------------

test('get_theme_palette returns all five themes with token maps', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_theme_palette', {});
  assert.equal(r.themeCount, 5);
  assert.deepEqual(r.themes.map((t) => t.id), ['prism-dark', 'oled-dark', 'cyberpunk-dark', 'light', 'dark']);
  assert.ok(r.base['--accent'], 'base token map present');
  assert.ok(r.tokenMeta.length >= 10);
});

test('get_theme_palette(prism-dark) has zero overrides (it is the base)', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_theme_palette', { theme: 'prism-dark' });
  assert.equal(r.overrideCount, 0);
  assert.equal(r.tokens['--accent'], BASE_TOKENS['--accent']);
});

test('get_theme_palette(oled-dark) matches the app THEMES override values', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_theme_palette', { theme: 'oled-dark' });
  assert.equal(r.mode, 'dark');
  assert.equal(r.tokens['--accent'], '#ffb300');
  assert.equal(r.tokens['--bg'], '#000000');
  assert.ok(r.overrideCount > 0);
  assert.match(r.css, /:root\{/);
});

test('get_theme_palette(light) is a light theme', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_theme_palette', { theme: 'light' });
  assert.equal(r.mode, 'light');
  assert.equal(r.tokens['--bg'], '#f4f6fb');
});

test('get_theme_palette rejects an unknown theme', () => {
  const ctx = toolCtx();
  const res = ctx.callSafe('get_theme_palette', { theme: 'chartreuse' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'not_found');
  assert.deepEqual(res.error.data.themes, THEME_IDS);
});

// -------------------- get_component_variants --------------------

test('get_component_variants returns one payload + one variant per theme', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_component_variants', { id: 'charts-kpi-pulse' });
  assert.equal(r.id, 'charts-kpi-pulse');
  assert.equal(r.variantCount, 5);
  assert.equal(r.variants.length, 5);
  assert.ok(r.html, 'payload html present once');
  assert.ok(!('css' in r), 'css omitted by default');
  assert.equal(r.themeSensitive, true);
  assert.ok(r.usesTokens.includes('--ink'), 'detects the --ink it consumes');
});

test('get_component_variants includeCss returns the shared css once', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_component_variants', { id: 'charts-kpi-pulse', includeCss: true });
  assert.ok(r.css && r.css.includes('kpiPulse'));
});

test('get_component_variants relevantOverrides is scoped to consumed tokens', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_component_variants', { id: 'charts-kpi-delta' });
  // charts-kpi-delta consumes --pos; oled changes --pos, so relevantOverrides carries it.
  const oled = r.variants.find((v) => v.theme === 'oled-dark');
  assert.ok('--pos' in oled.relevantOverrides, 'relevant override for consumed token');
  // it does NOT consume --bg, so --bg should not appear in relevantOverrides.
  assert.ok(!('--bg' in oled.relevantOverrides));
});

test('get_component_variants can restrict to a subset of themes', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_component_variants', { id: 'charts-kpi-pulse', themes: ['prism-dark', 'light'] });
  assert.equal(r.variantCount, 2);
  assert.deepEqual(r.variants.map((v) => v.theme), ['prism-dark', 'light']);
});

test('get_component_variants rejects unknown theme and unknown id', () => {
  const ctx = toolCtx();
  assert.equal(ctx.callSafe('get_component_variants', { id: 'charts-kpi-pulse', themes: ['nope'] }).error.code, 'invalid_argument');
  const miss = ctx.callSafe('get_component_variants', { id: 'ghost' });
  assert.equal(miss.error.code, 'not_found');
  assert.ok(Array.isArray(miss.error.data.suggestions));
});

// -------------------- get_variants_for_theme --------------------

test('get_variants_for_theme lists components under one theme with token values', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_variants_for_theme', { theme: 'cyberpunk-dark' });
  assert.equal(r.theme.id, 'cyberpunk-dark');
  assert.equal(r.total, 3);
  const pulse = r.items.find((i) => i.id === 'charts-kpi-pulse');
  // --ink under cyberpunk is #f7f0ff — the tool resolves the value for the token it uses.
  assert.equal(pulse.tokenValues['--ink'], '#f7f0ff');
});

test('get_variants_for_theme filters by gallery + themeSensitiveOnly + paginates', () => {
  const ctx = toolCtx();
  assert.equal(ctx.call('get_variants_for_theme', { theme: 'light', gallery: 'charts' }).total, 2);
  const sens = ctx.call('get_variants_for_theme', { theme: 'light', themeSensitiveOnly: true });
  assert.ok(sens.total >= 2);
  const page = ctx.call('get_variants_for_theme', { theme: 'light', limit: 1, offset: 1 });
  assert.equal(page.returned, 1);
  assert.equal(page.offset, 1);
});

test('get_variants_for_theme rejects unknown theme', () => {
  const ctx = toolCtx();
  assert.equal(ctx.callSafe('get_variants_for_theme', { theme: 'nope' }).error.code, 'not_found');
});

// -------------------- search_effects themeSensitive facet --------------------

test('search_effects themeSensitive facet narrows results', () => {
  const ctx = toolCtx();
  const sensitive = ctx.call('search_effects', { filters: { themeSensitive: true } });
  assert.ok(sensitive.total >= 1);
  // every returned effect is genuinely theme-sensitive
  for (const it of sensitive.items) {
    const full = ctx.store.get(it.id);
    assert.equal(isThemeSensitive(full), true);
  }
});

// -------------------- themes util sanity --------------------

test('usesTokens detects direct var(--x) refs, not incidental text', () => {
  assert.deepEqual(usesTokens({ html: '<div style="color:var(--accent)"></div>', css: '' }), ['--accent']);
  assert.deepEqual(usesTokens({ html: '<div>accent</div>', css: '' }), []);
});
