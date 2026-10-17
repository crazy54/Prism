// The browser runtime's pure parts (src/web/core.js) and the offline island loader
// (src/web/island.js). DOM-driven behavior (DeckView / KeyView) is covered by the
// headless-Chrome checks of Prism.html's Stream Deck page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAL_SWEEP, WHEEL_PX, clamp01, dialAngle, dialStep, stepValue, wheelTicks, dragTicks, isTap, segmentAt, fitWidth,
  frameTime, slotLabel, keyPool, showcaseLayout, devicesFor, KEY_SIZE_DEVICES, stripTouch, inputState, HOLD_S,
} from '../src/web/core.js';

test('stripTouch maps a pointer on the + strip to its segment and native px', () => {
  const strip = { w: 800, h: 100, segments: 4 };
  assert.deepEqual(stripTouch(0, 0, 400, 50, strip), { i: 0, x: 0, y: 0, segX: 0 });
  assert.deepEqual(stripTouch(150, 25, 400, 50, strip), { i: 1, x: 300, y: 50, segX: 100 });
  assert.deepEqual(stripTouch(400, 50, 400, 50, strip), { i: 3, x: 800, y: 100, segX: 200 });
  assert.equal(stripTouch(-20, 80, 400, 50, strip).i, 0);
  assert.equal(stripTouch(599, 10, 600, 50, { w: 1200, h: 100, segments: 6 }).i, 5);
  assert.ok(HOLD_S > 0);
});

test('inputState derives API 1.3 pressedFor / turnAge / touch from a slot', () => {
  assert.deepEqual(inputState({}, 3), { pressedFor: 0, turnAge: Infinity, touch: undefined });
  const s = inputState({ pressed: true, pressStart: 1, turnAt: 2.5, touch: { x: 40, y: 60, hold: true, at: 2 } }, 3);
  assert.equal(s.pressedFor, 2);
  assert.equal(s.turnAge, 0.5);
  assert.deepEqual(s.touch, { x: 40, y: 60, hold: true, age: 1 });
  assert.equal(inputState({ pressed: false, pressStart: 1 }, 9).pressedFor, 0);
  assert.equal(inputState({ turnAt: 5 }, 4).turnAge, 0, 'never negative');
});
import { createModuleLoader, loadIsland } from '../src/web/island.js';
import { getDevice, deviceLayout, keySize, DEVICE_IDS } from '../src/devices.js';
import { allFacets } from '../src/facets/index.js';

test('dial angle sweeps 270° around 12 o\'clock and clamps', () => {
  assert.equal(DIAL_SWEEP, 270);
  assert.equal(dialAngle(0), -135);
  assert.equal(dialAngle(0.5), 0);
  assert.equal(dialAngle(1), 135);
  assert.equal(dialAngle(2), 135);
  assert.equal(dialAngle(-1), -135);
  assert.equal(dialAngle(NaN), -135);
  assert.equal(clamp01(undefined), 0);
});

test('stepValue turns by detents, clamps to 0–1 and does not drift', () => {
  assert.equal(stepValue(0.5, 1, 0.02), 0.52);
  assert.equal(stepValue(0.5, -3, 0.1), 0.2);
  assert.equal(stepValue(0.99, 5, 0.02), 1);
  assert.equal(stepValue(0.01, -5, 0.02), 0);
  let v = 0;
  for (let i = 0; i < 50; i++) v = stepValue(v, 1, 0.02);
  assert.equal(v, 1);
  for (let i = 0; i < 10; i++) v = stepValue(v, -1, 0.1);
  assert.equal(v, 0);
  assert.equal(stepValue(undefined, 1, 0.25), 0.25);
});

test('dialStep reads params, then the facet step param, then 0.02', () => {
  assert.equal(dialStep({ params: { step: { default: 0.05 } } }, {}), 0.05);
  assert.equal(dialStep({ params: { step: { default: 0.05 } } }, { step: 0.1 }), 0.1);
  assert.equal(dialStep({}, {}), 0.02);
  assert.equal(dialStep(null), 0.02);
  assert.equal(dialStep({ params: { step: { default: 0 } } }), 0.02);
});

test('wheelTicks: one detent per mouse notch, trackpad deltas accumulate, up is clockwise', () => {
  assert.deepEqual(wheelTicks(0, -100), { ticks: 1, acc: 0 });       // Chrome / Windows notch up
  assert.deepEqual(wheelTicks(0, 100), { ticks: -1, acc: 0 });       // notch down
  assert.deepEqual(wheelTicks(0, -300), { ticks: 3, acc: 0 });       // a fast flick
  assert.deepEqual(wheelTicks(0, 3, 1), { ticks: -1, acc: 0 });      // Firefox: 3 lines
  assert.deepEqual(wheelTicks(0, -1, 2), { ticks: 1, acc: 0 });      // a page
  assert.deepEqual(wheelTicks(0, 0), { ticks: 0, acc: 0 });
  // a trackpad: 12 × −10 px = two detents up, remainder kept
  let acc = 0, ticks = 0;
  for (let i = 0; i < 12; i++) { const r = wheelTicks(acc, -10); acc = r.acc; ticks += r.ticks; }
  assert.equal(ticks, 2);
  assert.equal(acc, 0);
  const r = wheelTicks(0, 59);
  assert.equal(r.ticks, 0);
  assert.equal(r.acc, 59);
  assert.ok(WHEEL_PX > 0);
});

test('dragTicks: 6 px per detent, remainder carried', () => {
  assert.deepEqual(dragTicks(13), { ticks: 2, rest: 1 });
  assert.deepEqual(dragTicks(-7), { ticks: -1, rest: -1 });
  assert.deepEqual(dragTicks(5), { ticks: 0, rest: 5 });
  assert.deepEqual(dragTicks(20, 10), { ticks: 2, rest: 0 });
});

test('isTap separates a push from a drag', () => {
  assert.equal(isTap(0, 0), true);
  assert.equal(isTap(3, 3), true);
  assert.equal(isTap(0, 8), false);
  assert.equal(isTap(4, 4, 5), false);
});

test('segmentAt maps a strip touch to its dial', () => {
  assert.equal(segmentAt(0, 800, 4), 0);
  assert.equal(segmentAt(199, 800, 4), 0);
  assert.equal(segmentAt(200, 800, 4), 1);
  assert.equal(segmentAt(799, 800, 4), 3);
  assert.equal(segmentAt(900, 800, 4), 3);
  assert.equal(segmentAt(-5, 800, 4), 0);
  assert.equal(segmentAt(600, 1200, 6), 3);
  assert.equal(segmentAt(10, 0, 4), 0);
});

test('fitWidth fits every device into a box, keeping its aspect', () => {
  for (const id of DEVICE_IDS) {
    const L = deviceLayout(getDevice(id));
    const w = fitWidth(id, { width: 900, height: 500 });
    assert.ok(w <= 900, `${id} wider than the box`);
    assert.ok((w * L.h) / L.w <= 500 + 1, `${id} taller than the box`);
    assert.ok(w >= 40);
  }
  const g = deviceLayout(getDevice('galleon'));
  assert.equal(fitWidth('galleon', { width: 2000, height: 600 }), Math.floor((600 * g.w) / g.h)); // portrait: height-bound
  assert.equal(fitWidth('mk2', { width: 500 }), 500);                                             // width-bound
  assert.equal(fitWidth('mk2', { width: 900, max: 640 }), 640);
  assert.equal(fitWidth('mk2', { width: 10, min: 120 }), 120);
});

test('frameTime: stills under reduced motion, the fps grid otherwise', () => {
  const f = { animated: true, loop: 6 };
  assert.ok(Math.abs(frameTime(f, 1.234, { still: true }) - 2.4) < 1e-9);
  assert.equal(frameTime({ animated: false, loop: 6 }, 9, { still: true }), 0);
  assert.equal(frameTime(f, 1.234, { fps: 10 }), 1.2);
  assert.equal(frameTime(f, 1.25, { fps: 4 }), 1.25);
});

test('slotLabel speaks the facet, its state and a dial value', () => {
  assert.equal(slotLabel({ title: 'Microphone', states: ['on', 'off'] }, { state: 1 }), 'Microphone — off');
  assert.equal(slotLabel({ title: 'Volume', states: [] }, { role: 'dial', value: 0.637 }), 'Volume — 64%');
  assert.equal(slotLabel(null, { index: 3 }), 'Key 4 (empty)');
  assert.equal(slotLabel(null, { role: 'dial', index: 0 }), 'Dial 1 (empty)');
});

const facets = allFacets();

test('keyPool interleaves key facets, icons first, and keeps every one', () => {
  const pool = keyPool(facets);
  const keys = facets.filter((f) => f.surface === 'key');
  assert.equal(pool.length, keys.length);
  assert.deepEqual(new Set(pool.map((f) => f.id)), new Set(keys.map((f) => f.id)));
  assert.equal(pool[0].gallery, 'icons');
  assert.ok(pool.every((f) => f.surface === 'key'));
});

test('showcaseLayout fills every key, the + dials and the Galleon / Neo screens', () => {
  const ids = new Set(facets.map((f) => f.id));
  for (const id of ['mk2', 'mini', 'xl', 'plus', 'plusxl', 'galleon', 'neo', 'studio']) {
    const d = getDevice(id), L = showcaseLayout(id, facets);
    assert.equal(L.keys.length, d.cols * d.rows, `${id}: one facet per key`);
    for (const k of L.keys) assert.ok(ids.has(k.facet), `${id}: unknown key facet ${k.facet}`);
    if (d.strip) {
      if (L.dials.length) { assert.equal(L.dials.length, d.strip.segments); for (const x of L.dials) assert.equal(facets.find((f) => f.id === x).surface, 'strip'); }
      else assert.ok(L.strip === null || ids.has(L.strip));
    } else assert.equal(L.dials.length, 0);
    if (d.screen?.kind === 'galleon' && facets.some((f) => f.surface === 'screen' && f.screens.includes('galleon'))) assert.ok(L.screen, `${id}: galleon screen`);
    if (d.screen?.kind === 'infobar' && facets.some((f) => f.surface === 'screen' && f.screens.includes('infobar'))) assert.ok(L.screen, `${id}: info bar`);
    if (!d.screen) assert.equal(L.screen, null);
  }
  // some stateful keys start lit, and an offset rotates the pool
  const L = showcaseLayout('xl', facets);
  assert.ok(L.keys.some((k) => k.state === 1));
  assert.notEqual(showcaseLayout('mk2', facets, { offset: 1 }).keys[0].facet, showcaseLayout('mk2', facets).keys[0].facet);
  assert.deepEqual(showcaseLayout('pedal', facets), { keys: [], dials: [], strip: null, screen: null });
  assert.deepEqual(showcaseLayout('mk2', []), { keys: [], dials: [], strip: null, screen: null });
});

test('devicesFor: one model per key size, + family for strips, the right screen hosts', () => {
  const sizes = KEY_SIZE_DEVICES.map((id) => { const k = keySize(id); return `${k.w}x${k.h}`; });
  assert.equal(new Set(sizes).size, KEY_SIZE_DEVICES.length, 'one model per distinct key size');
  assert.deepEqual(devicesFor({ surface: 'key' }), KEY_SIZE_DEVICES);
  assert.deepEqual(devicesFor({ surface: 'key', devices: ['plus'] }), ['plus']);
  assert.deepEqual(devicesFor({ surface: 'strip', segments: 1 }), ['plus', 'plusxl']);
  assert.deepEqual(devicesFor({ surface: 'screen', screens: ['galleon', 'galleon-widget'] }), ['galleon']);
  assert.deepEqual(devicesFor({ surface: 'screen', screens: ['infobar'] }), ['neo']);
  assert.deepEqual(devicesFor({ surface: 'span', targets: [{ device: 'mini' }, { device: 'plus' }] }), ['mini', 'plus']);
  assert.ok(devicesFor({ surface: 'deck' }).includes('galleon'));
  for (const f of facets) for (const id of devicesFor(f)) assert.equal(getDevice(id).id, id, `${f.id}: ${id} is a real model`);
});

// ── island loader ───────────────────────────────────────────────────────────

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

test('createModuleLoader rewrites relative imports across folders and keeps modules singletons', async () => {
  const sources = {
    'pkg/src/a.js': "import { b } from './lib/b.js';\nimport * as c from '../src/c.js';\nexport { d } from \"./lib/d.js\";\nexport const a = () => b() + c.c;",
    'pkg/src/lib/b.js': "import { c } from '../c.js';\nexport const b = () => c * 2;",
    'pkg/src/c.js': 'export const c = 5;\nexport const box = { n: 0 };',
    'pkg/src/lib/d.js': "import { box } from '../c.js';\nbox.n++;\nexport const d = box;",
  };
  const loader = createModuleLoader(sources, { urlFor: dataUrl });
  const a = await loader.import('pkg/src/a.js');
  assert.equal(a.a(), 15);
  assert.equal(a.d.n, 1);
  const c = await loader.import('pkg/src/c.js');
  assert.equal(c.box, a.d, 'one instance per module');
  assert.equal(loader.url('pkg/src/c.js'), loader.url('pkg/src/c.js'));
});

test('createModuleLoader leaves bare specifiers alone and reports missing modules and cycles', async () => {
  const loader = createModuleLoader({ 'x/a.js': "import './missing.js';" }, { urlFor: dataUrl });
  assert.throws(() => loader.url('x/a.js'), /no source for x\/missing\.js/);
  const cyc = createModuleLoader({ 'x/a.js': "import './b.js';", 'x/b.js': "import './a.js';" }, { urlFor: dataUrl });
  assert.throws(() => cyc.url('x/a.js'), /cycle/);
  const bare = createModuleLoader({ 'x/a.js': "export const ok = 1;\n// import x from 'node:fs' in a comment line is not a statement" }, { urlFor: dataUrl });
  assert.equal((await bare.import('x/a.js')).ok, 1);
});

test('loadIsland runs facets straight from a catalog `sources` map', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const sources = {};
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name), r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(p, r);
      else if (e.name.endsWith('.js')) sources[`prism-deck/src${r}`] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(root, '');
  const first = allFacets()[0];
  const catalog = { facets: [{ id: first.id }], sources };
  // Node: one temp file per module (nested data: URLs would grow with every level of the graph).
  const os = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-web-'));
  let n = 0;
  const fileUrl = (code) => { const f = path.join(tmp, `m${n++}.mjs`); fs.writeFileSync(f, code); return pathToFileURL(f).href; };
  const deck = await loadIsland(catalog, { urlFor: fileUrl });
  assert.equal(deck.record(first.id).id, first.id);
  const f = await deck.facet(first.id);
  assert.equal(f.id, first.id);
  const { render } = await deck.render();
  const out = render(f, { device: 'mk2', t: 1 });
  assert.match(out.svg, /^<svg/);
  const web = await deck.import('prism-deck/src/web/core.js');
  assert.equal(web.dialAngle(1), 135);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ── games, non-visually (F3): per-key state + spoken results ────────────────
import { gameCell, gameAnnouncement } from '../src/web/core.js';
import { createGameHost } from '../src/scene/game.js';
import { findFacet as findDeckFacet } from '../src/facets/index.js';

test('gameCell: Lights Out keys say lit / off and expose aria-pressed; facets without the hook say nothing', () => {
  const lo = findDeckFacet('game-lights-out');
  const h = createGameHost(lo, { device: 'mk2', seed: 3, params: { difficulty: 'normal' } });
  const s = h.state;
  for (let k = 0; k < s.lights.length; k++) {
    const c = gameCell(lo, s, k);
    assert.equal(c.pressed, s.lights[k] === '1');
    assert.equal(c.label, s.lights[k] === '1' ? 'lit' : 'off');
  }
  assert.equal(gameCell(lo, s, -1), null);
  assert.equal(gameCell(findDeckFacet('game-dice'), {}, 0), null);
  assert.equal(gameCell({ game: { cell: () => { throw new Error('x'); } } }, {}, 0), null);
});

test('gameAnnouncement: chance games speak the result; tic-tac-toe speaks Prism\'s move and the winner', () => {
  for (const id of ['game-dice', 'game-coin', 'game-oracle']) {
    const f = findDeckFacet(id);
    const h = createGameHost(f, { device: 'mk2', seed: 5 });
    const before = h.state;
    h.dispatch({ type: 'press', key: 0, t: 1 });
    const said = gameAnnouncement(f, before, h.state);
    assert.ok(said.length > 4, `${id} says something after a press`);
    assert.match(said, /:/, `${id}: "title: value"`);
  }
  const dice = findDeckFacet('game-dice');
  const d = createGameHost(dice, { device: 'mk2', seed: 9 });
  const d0 = d.state; d.dispatch({ type: 'press', key: 0, t: 1 });
  assert.match(gameAnnouncement(dice, d0, d.state), /^Rolled: \d+/);
  const ttt = findDeckFacet('game-tictactoe');
  const g = createGameHost(ttt, { device: 'mk2', seed: 2 });
  const g0 = g.state;
  const k = g.grid.cells[4].i;                       // the center square's device key
  g.dispatch({ type: 'press', key: k, t: 1 });
  assert.match(gameAnnouncement(ttt, g0, g.state), /^Prism played (top|middle|bottom|center)[a-z ]*\. Your move\.$/);
  assert.match(gameCell(ttt, g.state, 4).label, /^center, your cross$/);
  assert.equal(gameAnnouncement(ttt, g.state, g.state), 'Your move.');
});
