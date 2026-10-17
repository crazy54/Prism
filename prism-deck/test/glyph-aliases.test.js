// Glyph aliases (src/glyphs/_aliases.js): other names for existing glyphs, resolved by the registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPH_ALIASES } from '../src/glyphs/_aliases.js';
import { glyphRegistry, allGlyphs, getGlyph, resolveGlyph, glyphAliases } from '../src/glyphs/_registry.js';
import { iconFacet } from '../src/facets/icons/_icon.js';

test('every alias resolves to a real glyph (and state), none shadows a glyph id', () => {
  const { glyphs, aliases, problems } = glyphRegistry();
  assert.deepEqual(problems, []);
  assert.equal(aliases.size, Object.keys(GLYPH_ALIASES).length);
  for (const [name, a] of Object.entries(GLYPH_ALIASES)) {
    assert.ok(!glyphs.has(name), `${name} is also a glyph id`);
    const g = glyphs.get(a.glyph);
    assert.ok(g, `${name} → ${a.glyph} does not exist`);
    if (a.state) assert.ok(g.stateNames.includes(a.state), `${name} → ${a.glyph} has no state ${a.state}`);
  }
  const names = Object.keys(GLYPH_ALIASES);
  assert.deepEqual(names, [...names].sort(), 'keep _aliases.js sorted by alias name');
});

test('getGlyph / resolveGlyph follow aliases; allGlyphs never lists them', () => {
  assert.equal(getGlyph('trash').id, 'delete');
  assert.equal(getGlyph('gear').id, 'settings');
  assert.deepEqual({ id: resolveGlyph('pause').glyph.id, state: resolveGlyph('pause').state, alias: resolveGlyph('pause').alias }, { id: 'play-pause', state: 'playing', alias: 'pause' });
  assert.deepEqual({ id: resolveGlyph('audio/mic').glyph.id, state: resolveGlyph('audio/mic').state }, { id: 'mic', state: null });
  assert.equal(resolveGlyph('no-such-glyph'), null);
  assert.equal(getGlyph('no-such-glyph'), null);
  assert.equal(getGlyph(undefined), null);
  const ids = new Set(allGlyphs().map((g) => g.id));
  for (const a of glyphAliases()) assert.ok(!ids.has(a.name), `${a.name} listed as a glyph`);
  // an alias reaches the target's icons facet, not a facet of its own
  assert.equal(iconFacet('trash').id, 'icon-delete');
});
