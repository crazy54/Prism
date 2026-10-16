// Tests for the JFH-9 Component Variant Matrix tools:
//   get_theme_palette, get_component_variants, get_variants_for_theme,
//   and the themeSensitive facet on search_effects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolCtx } from './helper.js';
import fs from 'node:fs';
import { THEMES, THEME_IDS, BASE_TOKENS, CONTRACT_TOKENS, DEFAULT_THEME_ID, usesTokens, isThemeSensitive } from '../utils/themes.js';

// -------------------- get_theme_palette --------------------

test('get_theme_palette returns every registered theme, Prism (default) first, Cloudscape always present', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_theme_palette', {});
  // Count is registry-driven so scaffolded packs (F6) flow through with no edit.
  // Refraction's Prism pair (the default) leads; the Cloudscape base pair is a
  // permanent floor right after it.
  assert.equal(r.themeCount, THEME_IDS.length);
  assert.ok(THEME_IDS.length >= 4, 'at least the two Prism and two Cloudscape modes ship');
  assert.deepEqual(r.themes.map((t) => t.id), THEME_IDS, 'palette lists exactly the registered themes, in order');
  assert.deepEqual(THEME_IDS.slice(0, 4), ['prism-dark', 'prism-light', 'cloudscape-dark', 'cloudscape-light'], 'Prism Night (default) leads, then Day, then Cloudscape');
  assert.equal(DEFAULT_THEME_ID, 'prism-dark');
  assert.deepEqual(THEMES.filter((t) => t.isDefault).map((t) => t.id), ['prism-dark'], 'exactly one default theme');
  assert.ok(r.base['--accent'], 'base token map present');
  assert.ok(r.tokenMeta.length >= 10);
});

test('get_theme_palette(prism-dark) is the default/base (Prism Night), like the app themeMatrix()', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_theme_palette', { theme: 'prism-dark' });
  assert.equal(r.default, true);
  assert.equal(r.ds, 'prism');
  assert.equal(r.dsName, 'Prism', 'the shell labels the family "Prism"');
  // Prism Night IS the base, so it carries zero overrides.
  assert.equal(r.overrideCount, 0);
  assert.equal(BASE_TOKENS['--bg'], '#0a0c12');
  assert.equal(BASE_TOKENS['--accent'], '#b8a2f2');
  assert.equal(r.tokens['--accent'], BASE_TOKENS['--accent']);
  for (const k of CONTRACT_TOKENS) assert.ok(k in BASE_TOKENS, `base defines contract token ${k}`);
  // the --rf-* layer is opt-in
  assert.ok(r.refractionTokenCount > 100);
  assert.ok(!('refraction' in r));
  assert.ok(!/--rf-/.test(r.css));
  const full = ctx.call('get_theme_palette', { theme: 'prism-dark', includeRefraction: true });
  assert.equal(full.refraction['--rf-beam-core'], '#ffffff');
  assert.match(full.css, /--rf-spectrum:/);
  const all = ctx.call('get_theme_palette', {});
  assert.equal(all.baseTheme, 'prism-dark');
  assert.ok(all.themes.every((t) => !('refraction' in t)), 'no --rf-* payload unless asked');
});

test('get_theme_palette(cloudscape-dark) is an optional skin with the AWS-console dark values', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_theme_palette', { theme: 'cloudscape-dark' });
  assert.equal(r.mode, 'dark');
  assert.equal(r.default, false);
  assert.equal(r.tokens['--bg'], '#0f1621');
  assert.equal(r.tokens['--accent'], '#539fe5');
  assert.equal(r.tokens['--accent-rgb'], '83,159,229');
  // overrides are computed against the Prism Night base
  assert.ok(r.overrideCount > 0);
  assert.equal(r.overrides['--accent'], '#539fe5');
  assert.ok(!('--r-md' in r.overrides), 'tokens equal to the base are not overrides');
  assert.ok(!('refractionTokenCount' in r), 'only the prism family carries a refraction layer');
  assert.match(r.css, /:root\{/);
});

test('rebasing on Prism Night keeps every pack complete; refraction tokens are in sync with design/themes.js', async (t) => {
  for (const th of THEMES) for (const k of CONTRACT_TOKENS) assert.ok(th.tokens[k], `${th.id} defines ${k}`);
  const { DESIGN_THEMES, buildSource, OUT } = await import('../scripts/sync-refraction.mjs');
  if (!fs.existsSync(DESIGN_THEMES)) return t.skip('design/themes.js not found');
  assert.ok(fs.readFileSync(OUT, 'utf8') === await buildSource(), 'utils/refraction-tokens.js is stale: run node scripts/sync-refraction.mjs');
});

test('get_theme_palette(prism-dark / prism-light) are complete Refraction token maps', () => {
  const ctx = toolCtx();
  const night = ctx.call('get_theme_palette', { theme: 'prism-dark' });
  const day = ctx.call('get_theme_palette', { theme: 'prism-light' });
  assert.equal(night.mode, 'dark');
  assert.equal(day.mode, 'light');
  assert.equal(night.name, 'Prism Night');
  assert.equal(day.name, 'Prism Day');
  for (const r of [night, day]) {
    for (const k of Object.keys(BASE_TOKENS)) assert.ok(r.tokens[k], `${r.id} defines ${k}`);
    for (const k of ['accent', 'info', 'pos', 'warn', 'neg', 'crit']) {
      const [R, G, B] = r.tokens['--' + k].match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16));
      assert.equal(r.tokens['--' + k + '-rgb'], `${R},${G},${B}`, `${r.id} --${k}-rgb matches --${k}`);
    }
    assert.match(r.css, /:root{/);
  }
});

test('get_theme_palette(cloudscape-light) is a light theme with the AWS-console palette', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_theme_palette', { theme: 'cloudscape-light' });
  assert.equal(r.mode, 'light');
  assert.equal(r.tokens['--bg'], '#f2f3f3');
  assert.equal(r.tokens['--accent'], '#0972d3');
  assert.ok(r.overrideCount > 0);
  assert.match(r.css, /:root\{/);
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
  // One variant per registered theme — registry-driven so a scaffolded pack (F6)
  // adds its modes here automatically.
  assert.equal(r.variantCount, THEME_IDS.length);
  assert.equal(r.variants.length, THEME_IDS.length);
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
  // charts-kpi-delta consumes --pos; Cloudscape Light changes --pos, so relevantOverrides carries it.
  const light = r.variants.find((v) => v.theme === 'cloudscape-light');
  assert.ok('--pos' in light.relevantOverrides, 'relevant override for consumed token');
  assert.equal(light.relevantOverrides['--pos'], light.overrides['--pos'], 'carries the OVERRIDE value, not the resolved base value');
  // it does NOT consume --bg, so --bg should not appear in relevantOverrides.
  assert.ok(!('--bg' in light.relevantOverrides));
});

test('get_component_variants relevantOverrides is a subset of the theme overrides (base theme => empty)', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_component_variants', { id: 'charts-kpi-pulse' });
  for (const v of r.variants) {
    // a consumed token the theme does NOT override is not "relevant"
    for (const k of Object.keys(v.relevantOverrides)) {
      assert.ok(k in v.overrides, `${v.theme}: relevantOverrides key ${k} must be an actual override`);
      assert.equal(v.relevantOverrides[k], v.overrides[k], `${v.theme}: relevantOverrides[${k}] must equal the override value`);
    }
  }
  // prism-dark is the base (zero overrides) -> nothing is "relevant" even though the component consumes --ink
  const dark = r.variants.find((v) => v.theme === 'prism-dark');
  assert.deepEqual(dark.relevantOverrides, {}, 'base theme yields no relevant overrides');
  assert.ok(r.usesTokens.includes('--ink'), 'sanity: it does consume a token');
});

test('get_component_variants can restrict to a subset of themes', () => {
  const ctx = toolCtx();
  const r = ctx.call('get_component_variants', { id: 'charts-kpi-pulse', themes: ['cloudscape-light'] });
  assert.equal(r.variantCount, 1);
  assert.deepEqual(r.variants.map((v) => v.theme), ['cloudscape-light']);
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
  const r = ctx.call('get_variants_for_theme', { theme: 'cloudscape-light' });
  assert.equal(r.theme.id, 'cloudscape-light');
  assert.equal(r.total, 3);
  const pulse = r.items.find((i) => i.id === 'charts-kpi-pulse');
  // --ink under Cloudscape Light is #16191f — the tool resolves the value for the token it uses.
  assert.equal(pulse.tokenValues['--ink'], '#16191f');
});

test('get_variants_for_theme filters by gallery + themeSensitiveOnly + paginates', () => {
  const ctx = toolCtx();
  assert.equal(ctx.call('get_variants_for_theme', { theme: 'cloudscape-light', gallery: 'charts' }).total, 2);
  const sens = ctx.call('get_variants_for_theme', { theme: 'cloudscape-light', themeSensitiveOnly: true });
  assert.ok(sens.total >= 2);
  const page = ctx.call('get_variants_for_theme', { theme: 'cloudscape-light', limit: 1, offset: 1 });
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
