// Conformance — every facet, theme and glyph in the manifests, automatically.
//
//   node --test test/facets.test.js                                      everything
//   node --test --test-name-pattern="facet icons/" test/facets.test.js   one gallery
//   node --test --test-name-pattern="theme prism" test/facets.test.js    one theme
//   node --test --test-name-pattern="glyph audio/" test/facets.test.js   one glyph category
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { allFacets, catalogTree, searchFacets, findFacet } from '../src/facets/index.js';
import { renderTargets } from '../src/facets/schema.js';
import { render, stillTime } from '../src/render.js';
import { validateSvg } from '../src/scene/validate.js';
import { toDeviceSvg } from '../src/scene/qt.js';
import { getDevice } from '../src/devices.js';
import { createGameHost, replayGame, isPlainJson, GAME_STATE_MAX } from '../src/scene/game.js';
import { rng as seededRng } from '../src/scene/noise.js';
import { themeRegistry, allThemes } from '../src/themes/_registry.js';
import { glyphRegistry, allGlyphs } from '../src/glyphs/_registry.js';
import { drawGlyph } from '../src/glyphs/_glyph.js';
import { flattenPath } from '../src/scene/geom.js';
import { contrast } from '../src/scene/color.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const facets = allFacets();
const themes = allThemes();
const BUDGET = { key: 32768, span: 393216, strip: 98304, screen: 131072, deck: 524288 };
const SLICE_BUDGET = 98304; // per key / dial / widget slice after culling (API 1.2): 3 × the key budget — aim for the key budget
// API 1.4 complexity budget: the Stream Deck app's Qt renderer keeps up with ~300-element frames but
// collapses near 1,200 (hardware-lab/RESULTS.md), so every frame one key / dial segment / Galleon widget /
// info bar receives (after toDeviceSvg) stays under ELEMENTS. Whole Galleon screens and monitor canvases
// aren't app frames (hidraw rasterizes them; the app gets the four widgets).
const ELEMENTS = 300;
const elements = (svg) => (svg.match(/<[A-Za-z]/g) || []).length;
const isInfobar = (r) => getDevice(r.device)?.screen?.kind === 'infobar';
function appFrames(r) {
  if (r.surface === 'key') return [['key', r.svg]];
  if (r.surface === 'screen') return r.widgets ? r.widgets.map((w) => [`widget ${w.dial},${w.layer}`, w.svg]) : r.w <= 400 ? [['screen', r.svg]] : [];
  const out = [...(r.keys || []).map((k) => [`key ${k.i}`, k.svg]), ...(r.segments || []).map((s, i) => [`segment ${i}`, s])];
  if (r.screen && isInfobar(r)) out.push(['info bar', r.screen]);
  for (const w of r.widgets || []) out.push([`widget ${w.dial},${w.layer}`, w.svg]);   // deck facets on the Galleon (API 1.5.1)
  return out;
}
const MS = { key: 25, span: 120, strip: 60, screen: 80, deck: 250 }; // fail above (targets are ~5× lower)
const variants = (f) => themes.flatMap((t) => t.modes.map((mode) => ({ theme: t.id, mode })));

test('manifests are up to date with src/{themes,glyphs,facets}/', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'gen-manifest.mjs'), '--check'], { stdio: 'pipe' });
});

test('registries are clean: facets, themes, glyphs', () => {
  assert.deepEqual(facets.problems, [], facets.problems.join('\n'));
  assert.deepEqual(themeRegistry().problems, [], themeRegistry().problems.join('\n'));
  assert.deepEqual(glyphRegistry().problems, [], glyphRegistry().problems.join('\n'));
  assert.equal(new Set(facets.map((f) => f.id)).size, facets.length);
  assert.ok(themes.length >= 1 && allGlyphs().length >= 1);
});

test('gallery tree and search are consistent', () => {
  const tree = catalogTree();
  assert.equal(tree.reduce((n, g) => n + g.count, 0), facets.length);
  if (facets.length) assert.equal(findFacet(facets[0].id), facets[0]);
  assert.ok(searchFacets('waveform').every((f) => `${f.id} ${f.title} ${f.description} ${f.tags}`.toLowerCase().includes('waveform')));
});

test('every glyph has an icons facet', () => {
  const have = new Set(facets.filter((f) => f.gallery === 'icons').map((f) => f.glyph));
  const missing = allGlyphs().filter((g) => !have.has(g.id)).map((g) => g.id);
  assert.deepEqual(missing, [], `add src/facets/icons/<id>.js for: ${missing.join(', ')}`);
});

for (const t of themes) {
  test(`theme ${t.id}: palettes meet text contrast (ink ≥ 7, muted ≥ 4.5 on surface; accent ≥ 3)`, () => {
    for (const mode of t.modes) {
      const C = t.resolve(mode).colors;
      for (const bg of [C.surface, C.surface2]) {
        assert.ok(contrast(C.ink, bg) >= 7, `${t.id}/${mode}: ink on ${bg} = ${contrast(C.ink, bg).toFixed(2)}`);
        assert.ok(contrast(C.muted, bg) >= 4.5, `${t.id}/${mode}: muted on ${bg} = ${contrast(C.muted, bg).toFixed(2)}`);
        assert.ok(contrast(C.accent, bg) >= 3, `${t.id}/${mode}: accent on ${bg} = ${contrast(C.accent, bg).toFixed(2)}`);
      }
    }
  });
}

for (const g of allGlyphs()) {
  test(`glyph ${g.category}/${g.id}: draws in every state inside the 6–42 safe area`, () => {
    for (const state of g.stateNames) for (const t of [0, 0.3, 1.1, 2.7]) {
      const { pen } = drawGlyph(g, { state, t, since: t, level: 0.9 });
      const prims = pen.flat();
      assert.ok(prims.length > 0, `${g.id}/${state}: draws nothing`);
      for (const p of prims) {
        assert.ok(['line', 'fill', 'accent', 'dim', 'spark'].includes(p.role));
        if (p.transforms.length) continue; // grouped geometry: checked visually
        for (const pl of flattenPath(p.d, 0.5)) for (const [x, y] of pl.pts) {
          assert.ok(x >= 5.5 && x <= 42.5 && y >= 5.5 && y <= 42.5, `${g.id}/${state} t=${t}: point (${x.toFixed(1)}, ${y.toFixed(1)}) outside the safe area`);
        }
      }
    }
  });
}

for (const f of facets) {
  test(`facet ${f.gallery}/${f.id}: valid deck SVG at every target, theme, mode and state`, () => {
    const states = f.states.length ? f.states.map((_, i) => i) : [0];
    for (const tg of renderTargets(f)) for (const v of variants(f)) for (const state of states) {
      for (const extra of [{}, f.surface === 'key' ? { pressed: true } : null, f.surface === 'key' ? { pressAge: 0.08 } : null].filter(Boolean)) {
        const opts = { ...tg, ...v, state, t: stillTime(f) + 0.5, since: 0.2, idPrefix: 'pdtest', ...extra };
        const r = render(f, opts);
        const problems = validateSvg(r.svg, { w: r.w, h: r.h, maxBytes: BUDGET[f.surface], idPrefix: 'pdtest' });
        assert.deepEqual(problems, [], `${f.id} ${JSON.stringify(opts)}:\n  ${problems.join('\n  ')}`);
        for (const part of [...(r.keys || []).map((k) => k.svg), ...(r.segments || []), ...(r.widgets || []).map((x) => x.svg), r.screen].filter(Boolean)) {
          const pp = validateSvg(part, { maxBytes: SLICE_BUDGET, idPrefix: 'pdtest' }); // a slice is what one key / dial / screen receives
          assert.deepEqual(pp, [], `${f.id} slice:\n  ${pp.join('\n  ')}`);
        }
        for (const [where, frame] of appFrames(r)) {
          const c = elements(toDeviceSvg(frame));
          assert.ok(c < ELEMENTS, `${f.id} ${where} ${JSON.stringify(opts)}: ${c} elements per frame (budget < ${ELEMENTS}; the Stream Deck app slows down — merge paths with identical paint)`);
        }
      }
    }
  });

  test(`facet ${f.gallery}/${f.id}: deterministic, animated as declared, within the frame budget`, () => {
    const tg = renderTargets(f)[0];
    const at = (t, state = 0, seed = 11) => render(f, { ...tg, t, since: t, state, seed, idPrefix: 'pdtest' }).svg;
    assert.equal(at(1.25), at(1.25), 'same (t, seed) must give the same SVG');
    if (f.animated) {
      const states = f.states.length ? f.states.map((_, i) => i) : [0];
      const moves = states.some((st) => new Set([0.2, 0.9, 1.7, 2.6, f.loop * 0.55].map((t) => at(t, st))).size > 1);
      assert.ok(moves, `${f.id} is animated but every frame of every state is identical`);
    }
    const n = 6, t0 = performance.now();
    for (let i = 0; i < n; i++) at(0.3 + i * 0.41);
    const ms = (performance.now() - t0) / n;
    assert.ok(ms < MS[f.surface], `${f.id}: ${ms.toFixed(1)} ms per frame > ${MS[f.surface]} ms`);
  });
}

// API 1.5 — every game facet: JSON state ≤ GAME_STATE_MAX, reduce pure (frozen inputs) and deterministic,
// a played game replays from its log and resumes from its snapshot, and its frames stay valid mid-transition.
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const GAME_THEMES = ['prism', 'neon', 'paper', 'phosphor'];
function playGame(f, tg, seed, { frames = false } = {}) {
  const h = createGameHost(f, { ...tg, seed, log: true });
  const r = seededRng(seed * 7 + 1), cells = h.grid.cells;
  for (let i = 0; i < 40; i++) {
    deepFreeze(h.state);   // reduce must not mutate its input (a frozen object throws in strict mode)
    const x = r(), t = i * 0.5, key = cells[Math.floor(r() * cells.length)].i;
    const ev = x < 0.6 ? { type: 'press', key, t } : x < 0.75 ? { type: 'release', key, t } : x < 0.85 ? { type: 'tick', t }
      : x < 0.92 ? { type: 'rotate', dial: 0, ticks: r() < 0.5 ? -1 : 2, t } : x < 0.97 ? { type: 'touch', x: 50, y: 40, hold: false, t } : { type: 'reset', t };
    h.dispatch(ev);
    assert.ok(isPlainJson(h.state), `${f.id}: state after ${ev.type} is not plain JSON`);
    assert.ok(JSON.stringify(h.state).length <= GAME_STATE_MAX, `${f.id}: state is ${JSON.stringify(h.state).length} B > ${GAME_STATE_MAX}`);
    if (frames && i % 8 === 0) for (const theme of GAME_THEMES) for (const age of [0.05, 0.3, (f.game.animate ?? 0.6) + 0.1]) {
      const opts = { ...tg, theme, seed, idPrefix: 'pdtest', t: t + age, ...h.renderOpts(t + age) };
      const fr = render(f, opts);
      const problems = validateSvg(fr.svg, { w: fr.w, h: fr.h, maxBytes: BUDGET[f.surface], idPrefix: 'pdtest' });
      assert.deepEqual(problems, [], `${f.id} after ${ev.type} (${theme}, age ${age}): ${problems.join(' | ')}`);
      for (const [where, frame] of appFrames(fr)) {
        assert.deepEqual(validateSvg(frame, { maxBytes: SLICE_BUDGET, idPrefix: 'pdtest' }), [], `${f.id} ${where}`);
        assert.ok(elements(toDeviceSvg(frame)) < ELEMENTS, `${f.id} ${where} mid-game: over ${ELEMENTS} elements`);
      }
    }
  }
  return h;
}
for (const f of facets.filter((x) => x.game)) {
  test(`facet ${f.gallery}/${f.id}: game contract — JSON state, pure deterministic reduce, replay, resume, valid frames mid-game`, () => {
    for (const [i, tg] of renderTargets(f).entries()) {
      const seed = 21 + i;
      const a = playGame(f, tg, seed, { frames: i === 0 }), b = playGame(f, tg, seed);
      assert.deepEqual(a.state, b.state, `${f.id} ${JSON.stringify(tg)}: same seed + events → same state`);
      assert.deepEqual(replayGame(f, { ...tg, seed }, a.log), a.state, `${f.id}: the event log replays to the same state`);
      const resumed = createGameHost(f, { ...tg, seed, snapshot: JSON.parse(JSON.stringify(a.snapshot())) });
      assert.deepEqual(resumed.state, a.state, `${f.id}: a snapshot resumes the game`);
      const key = a.grid.cells[a.grid.cells.length - 1].i;
      assert.deepEqual(resumed.dispatch({ type: 'press', key, t: 99 }).state, a.dispatch({ type: 'press', key, t: 99 }).state, `${f.id}: a resumed game plays on identically`);
      assert.ok(!a.needsTick() || f.game.tickHz > 0);
    }
  });
}
