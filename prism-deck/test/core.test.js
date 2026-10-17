// Engine core: devices, text, SVG builder, color, geometry, validator, scheduler,
// surfaces/slicing, glyph + theme contracts, catalog + island.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEVICE_IDS, LCD_DEVICES, KEY_SIZES, getDevice, deviceFromInfo, keySize, spanGrid, stripGrid, deckLayout, deviceLayout } from '../src/devices.js';
import { measureText, textPath, fitText, wrapText, textOutline, capHeight } from '../src/scene/text.js';
import { n, attrs, svgWindow, suffixIds, svgDataUrl, base64 } from '../src/scene/svg.js';
import { oklch, hexToOklch, contrast, lambdaOf, mix } from '../src/scene/color.js';
import { flattenPath, pathBounds, insidePolys, transformPath } from '../src/scene/geom.js';
import { validateSvg } from '../src/scene/validate.js';
import { createScheduler, effectiveFps, quantize } from '../src/scene/scheduler.js';
import { render, nextState, stillTime } from '../src/render.js';
import { createContext } from '../src/scene/context.js';
import { elementBounds, parseTransform, prepareCull } from '../src/scene/cull.js';
import { findFacet } from '../src/facets/index.js';
import { defineGlyph, Pen } from '../src/glyphs/_glyph.js';
import { defineTheme } from '../src/themes/_theme.js';
import { useTheme } from '../src/themes/_registry.js';
import { islandJson, extractIsland, catalogProblems, islandPart, islandCatalog } from '../scripts/embed-island.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = (name, ...args) => execFileSync(process.execPath, [path.join(ROOT, 'scripts', name), ...args], { stdio: 'pipe', encoding: 'utf8' });
const RESEARCH = [path.resolve(ROOT, '..', '..', 'aaa-prism-deck-team', 'research', 'devices.json'), path.resolve(ROOT, '..', '..', 'aaa-prism-ds', 'handoff-from-prism-e0', 'research', 'devices.json')].find((p) => fs.existsSync(p));
const FONT_SRC = [path.resolve(ROOT, '..', '..', 'aaa-prism-ds', 'parts', 'shell-style.html'), path.resolve(ROOT, '..', 'Prism.html')].find((p) => fs.existsSync(p));

// ── devices ──────────────────────────────────────────────────────────────────
test('devices.js and docs/devices.md are generated from the research', { skip: !RESEARCH && 'research/devices.json not on this machine' }, () => { script('gen-devices.mjs', '--check'); });

test('device registry: every model, native key sizes, gaps, controls', () => {
  assert.equal(DEVICE_IDS.length, 30);
  for (const id of ['mk2', 'mini', 'xl', 'neo', 'plus', 'plusxl', 'studio', 'pedal', 'galleon', 'mobile', 'virtual', 'mcp']) assert.ok(DEVICE_IDS.includes(id), id);
  assert.deepEqual(KEY_SIZES.map((k) => `${k.w}x${k.h}`), ['72x72', '80x80', '96x96', '112x112', '120x120', '144x112', '160x160']);
  assert.equal(getDevice(7).id, 'plus');
  assert.equal(getDevice(12).id, 'galleon');
  assert.equal(getDevice('sd+').id, 'plus');
  assert.equal(getDevice('gretsch').id, 'galleon');
  const plus = getDevice('plus');
  assert.equal(plus.panel.gapX, 99);
  assert.equal(stripGrid('plus').segments.length, 4);
  assert.equal(stripGrid('plusxl').segments.length, 6);
  assert.equal(stripGrid('mk2'), null);
  const g = getDevice('galleon');
  assert.deepEqual([g.cols, g.rows, g.keyPx.w, g.dials.count, g.dials.touch, g.dials.layers, g.screen.w, g.screen.h], [3, 4, 160, 2, false, 2, 720, 384]);
  assert.deepEqual(keySize('studio'), { w: 144, h: 112 });
  assert.deepEqual(keySize('voyager'), { w: 144, h: 144 });
});

test('deviceFromInfo maps registration info (incl. MCP Deck type 14 and app-sized grids)', () => {
  assert.equal(deviceFromInfo({ type: 7, size: { columns: 4, rows: 2 } }).id, 'plus');
  assert.equal(deviceFromInfo({ type: 12, size: { columns: 3, rows: 4 }, name: 'Galleon 100 SD' }).id, 'galleon');
  const mcp = deviceFromInfo({ type: 14, size: { columns: 8, rows: 4 }, name: 'MCP Deck 2' });
  assert.equal(mcp.cols * mcp.rows, 32);
  const mob = deviceFromInfo({ type: 3, size: { columns: 4, rows: 3 } });
  assert.deepEqual([mob.cols, mob.rows, mob.keyPx.w], [4, 3, 72]);
  assert.equal(deviceFromInfo({ type: 0, size: { columns: 5, rows: 3 } }).cols, 5);
});

test('span / deck / layout geometry includes the physical gaps', () => {
  const sp = spanGrid('mk2');
  assert.equal(sp.cells.length, 15);
  assert.equal(sp.w, 5 * 72 + 4 * 25);
  assert.equal(sp.cells[1].x, 97);
  const row = spanGrid('plus', { row: 1, cols: 2 });
  assert.deepEqual(row.cells.map((c) => c.i), [4, 5]);
  assert.equal(row.cells[1].x, 120 + 99);
  const dk = deckLayout('plus');
  assert.equal(dk.keys.length, 8);
  assert.deepEqual([dk.strip.y, dk.strip.w, dk.strip.segments], [380, 800, 4]);
  for (const id of LCD_DEVICES) { const L = deviceLayout(id); assert.equal(L.keys.length, getDevice(id).cols * getDevice(id).rows, id); for (const k of L.keys) assert.ok(k.x >= 0 && k.y >= 0 && k.x + k.w <= L.w && k.y + k.h <= L.h, `${id} key ${k.i} outside the body`); }
  assert.equal(deviceLayout('galleon').dials.length, 2);
  assert.equal(deviceLayout('plusxl').dials.length, 6);
});

// ── text → paths ─────────────────────────────────────────────────────────────
test('font outlines are extracted from Prism.html', { skip: !FONT_SRC && 'Prism.html parts not on this machine' }, () => { script('extract-fonts.mjs', '--check'); });

test('text: real metrics, kerning, tabular figures, fitting, wrapping', () => {
  const o = { size: 40, weight: 600 };
  assert.ok(measureText('AV', o) < measureText('A', o) + measureText('V', o), 'GPOS kerning applies');
  assert.ok(Math.abs(measureText('1111', { ...o, tabular: true }) - measureText('8888', { ...o, tabular: true })) < 1e-6, 'tabular digits share one width');
  assert.ok(measureText('Hi', { size: 20 }) * 2 - measureText('Hi', { size: 40 }) < 1e-6);
  assert.ok(measureText('ABC', { size: 20, tracking: 0.1 }) > measureText('ABC', { size: 20 }));
  const p = textPath('Healthy · 42% → λ', { x: 10, y: 30, size: 18, anchor: 'middle' });
  assert.match(p, /^<path transform="translate\([\d.-]+ 30\)" d="M/);
  assert.doesNotMatch(p, /NaN|undefined/);
  const f = fitText('Production deploy pipeline', { maxWidth: 100, size: 20, minSize: 12 });
  assert.ok(f.width <= 100 && f.size >= 12);
  assert.ok(f.truncated ? f.text.endsWith('…') : true);
  const w = wrapText('Turn on all the lights now', { maxWidth: 90, size: 16, maxLines: 2 });
  assert.ok(w.lines.length <= 2 && w.lines.every((l) => measureText(l, { size: w.size }) <= 90.01));
  assert.ok(capHeight(100) > 70 && capHeight(100) < 75, 'Inter cap height ≈ 0.727 em');
  assert.equal(textOutline('', { size: 12 }).d, '');
  assert.equal(textPath(''), '');
});

// ── svg / color / geometry ───────────────────────────────────────────────────
test('svg builder: numbers, attributes, windows, ids, data URLs', () => {
  assert.equal(n(1.23456), '1.23');
  assert.equal(n(-0.0001), '0');
  assert.throws(() => n(NaN), /non-finite/);
  assert.equal(attrs({ strokeWidth: 2, fillOpacity: 0.5, viewBox: '0 0 1 1', gone: null }), ' stroke-width="2" fill-opacity="0.5" viewBox="0 0 1 1"');
  const doc = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><defs><linearGradient id="a-g"/></defs><rect fill="url(#a-g)" width="10" height="10"/></svg>';
  const win = svgWindow(doc, { x: 2, y: 3, w: 4, h: 5, idSuffix: 's1' });
  assert.match(win, /viewBox="2 3 4 5"/);
  assert.match(win, /id="a-gs1"/);
  assert.match(win, /url\(#a-gs1\)/);
  assert.equal(suffixIds('<g/>', 'x'), '<g/>');
  assert.equal(base64('Hé✓'), Buffer.from('Hé✓').toString('base64'));
  assert.match(svgDataUrl(doc), /^data:image\/svg\+xml;base64,/);
});

test('color: OKLCH round trip, contrast, Spectrum wavelength', () => {
  const [L, C, H] = hexToOklch('#b8a2f2');
  assert.equal(oklch(L, C, H), '#b8a2f2');
  assert.ok(contrast('#ffffff', '#000000') > 20.9);
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.ok(lambdaOf(25) > lambdaOf(150) && lambdaOf(150) > lambdaOf(285));
});

test('geometry: parse, flatten, bounds, winding, transforms', () => {
  const b = pathBounds('M14 24a10 10 0 1 0 20 0a10 10 0 1 0-20 0z');
  assert.ok(Math.abs(b.x - 14) < 0.2 && Math.abs(b.w - 20) < 0.3 && Math.abs(b.h - 20) < 0.3);
  const polys = flattenPath('M0 0H10V10H0Z');
  assert.ok(insidePolys(5, 5, polys) && !insidePolys(15, 5, polys));
  assert.equal(transformPath('M1 2L3 4', [2, 0, 0, 2, 10, 0]), 'M12 4L16 8');
});

test('validator: the deck SVG subset', () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><defs><radialGradient id="pd-g"><stop offset="0" stop-color="#ffffff"/></radialGradient></defs><rect width="72" height="72" fill="url(#pd-g)"/><path d="M0 0L1 1" stroke="#b8a2f2" stroke-opacity="0.5"/></svg>';
  assert.deepEqual(validateSvg(ok, { w: 72, h: 72, idPrefix: 'pd' }), []);
  const bad = (inner) => validateSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">${inner}</svg>`, { w: 72, h: 72 });
  assert.ok(bad('<text x="1" y="1">hi</text>').some((p) => /text/.test(p)));
  assert.ok(bad('<rect width="1" height="1" fill="#ffffff80"/>').some((p) => /8-digit|AARRGGBB/.test(p)));
  assert.ok(bad('<rect width="1" height="1" fill="rgba(0,0,0,.5)"/>').length);
  assert.ok(bad('<filter id="f"/>').some((p) => /subset/.test(p)));
  assert.ok(bad('<rect width="1" height="1" fill="url(#nope)"/>').some((p) => /missing/.test(p)));
  assert.ok(bad('<rect width="NaN" height="1"/>').length);
  assert.ok(bad('<rect width="1" height="1" style="fill:red"/>').length);
  assert.ok(validateSvg('<svg', {}).length);
});

// ── scheduler ────────────────────────────────────────────────────────────────
test('scheduler: per-slot fps, caps, sleeping slots, quantized time', () => {
  let now = 0;
  const timers = [];
  const s = createScheduler({ cap: 15, now: () => now, setTimer: (fn, ms) => { const h = { fn, at: now + ms }; timers.push(h); return h; }, clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); } });
  const ticks = { a: 0, b: 0, c: 0, d: 0 };
  s.add({ fps: 10, phase: 0, tick: () => ticks.a++ });
  s.add({ fps: 5, phase: 0, tick: () => ticks.b++ });
  s.add({ fps: 30, phase: 0, tick: () => ticks.c++ });
  s.add({ fps: 10, phase: 0, active: () => false, tick: () => ticks.d++ });
  while (now <= 1000) { timers.sort((x, y) => x.at - y.at); const h = timers.shift(); if (!h) break; now = Math.max(now, h.at); h.fn(); }
  assert.ok(Math.abs(ticks.a - 10) <= 1, `a ${ticks.a}`);
  assert.ok(Math.abs(ticks.b - 5) <= 1, `b ${ticks.b}`);
  assert.ok(ticks.c <= 17, `c capped at 15 fps, got ${ticks.c}`);
  assert.equal(ticks.d, 0);
  s.stop();
  assert.equal(effectiveFps({ animated: false, fps: 0 }), 0);
  assert.equal(effectiveFps({ animated: true, fps: 30 }, { cap: 12 }), 12);
  assert.equal(effectiveFps({ animated: true, fps: 10 }, { reduced: true }), 0);
  assert.equal(quantize(1.37, 10), 1.3);
});

// ── surfaces ─────────────────────────────────────────────────────────────────
test('render slices every surface for the hardware', () => {
  const key = render(findFacet('icon-mic'), { device: 'galleon', t: 1 });
  assert.deepEqual([key.surface, key.w, key.h], ['key', 160, 160]);
  const studio = render(findFacet('icon-mic'), { device: 'studio', t: 1 });
  assert.deepEqual([studio.w, studio.h], [144, 112]);
  const span = render(findFacet('span-waveform'), { device: 'plus', t: 1 });
  assert.equal(span.keys.length, 4);
  assert.match(span.keys[1].svg, /width="120" height="120" viewBox="219 0 120 120"/);
  assert.equal(render(findFacet('span-first-light'), { device: 'xl', t: 3 }).keys.length, 32);
  assert.equal(render(findFacet('strip-refraction'), { device: 'plusxl' }).segments.length, 6);
  assert.equal(render(findFacet('dial-volume'), {}).w, 200);
  const scr = render(findFacet('screen-galleon-dashboard'), { t: 2 });
  assert.equal(scr.widgets.length, 4);
  assert.match(scr.widgets[3].svg, /width="360" height="180" viewBox="360 198 360 180"/); // 2:1 windows centered in the 360 × 192 quadrants (API 1.4)
  assert.deepEqual(scr.widgets.map((w) => [w.dial, w.layer, w.x, w.y, w.w, w.h]), [[0, 0, 0, 6, 360, 180], [1, 0, 360, 6, 360, 180], [0, 1, 0, 198, 360, 180], [1, 1, 360, 198, 360, 180]]);
  assert.deepEqual(deviceLayout(getDevice("galleon")).widgets.map((w) => [w.w, w.h]), [[360, 180], [360, 180], [360, 180], [360, 180]]);
  const deck = render(findFacet('theme-prism'), { device: 'plus', t: 1 });
  assert.deepEqual([deck.keys.length, deck.segments.length], [8, 4]);
  const gal = render(findFacet('theme-prism'), { device: 'galleon', t: 1 });
  assert.ok(gal.screen && gal.keys.length === 12);
  const x2 = render(findFacet('span-waveform'), { device: 'mk2', outScale: 2 });
  assert.match(x2.keys[0].svg, /width="144" height="144"/);
  const f = findFacet('icon-mic');
  assert.equal(nextState(f, 0), 1);
  assert.equal(nextState(f, 1), 0);
  assert.equal(nextState(findFacet('press-ripple'), 0), 0);
  assert.ok(stillTime(f) > 0);
});

test('themes: modes resolve; light differs from dark; theme-facets pin their theme', () => {
  const d = useTheme('prism'), l = useTheme('prism:light');
  assert.equal(d.mode, 'dark');
  assert.equal(l.mode, 'light');
  assert.notEqual(d.colors.surface, l.colors.surface);
  const a = render(findFacet('icon-mic'), { theme: 'prism', mode: 'dark', t: 1 }).svg;
  const b = render(findFacet('icon-mic'), { theme: 'prism', mode: 'light', t: 1 }).svg;
  assert.notEqual(a, b);
});

// ── contracts ────────────────────────────────────────────────────────────────
test('glyph contract rejects bad definitions; the pen records roles', () => {
  assert.throws(() => defineGlyph({ id: 'Bad Id', title: 'x', category: 'media', draw() {} }), /kebab/);
  assert.throws(() => defineGlyph({ id: 'x', title: 'x', category: 'media', states: { on: 'shiny' }, draw() {} }), /tone/);
  const g = defineGlyph({ id: 'probe', title: 'Probe', category: 'media', states: ['on', 'off'], draw(p) { p.circle(24, 24, 10); } });
  assert.deepEqual(g.states, { on: 'active', off: 'idle' });
  const pen = new Pen();
  pen.circle(24, 24, 10, { role: 'accent' }).dot(24, 24).text('A', { size: 10 });
  const flat = pen.flat();
  assert.deepEqual(flat.map((p) => p.role), ['accent', 'spark', 'fill']);
  assert.throws(() => pen.line(0, 0, 1, 1, { role: 'glow' }), /unknown role/);
});

test('theme contract rejects incomplete palettes', () => {
  assert.throws(() => defineTheme({ id: 'x', title: 'X', description: 'a theme that is missing keys', modes: { dark: { bg: '#000000' } } }), /must be #rrggbb/);
});

// ── catalog + island ─────────────────────────────────────────────────────────
test('committed catalog/deck-catalog.json is fresh (release check: PRISM_DECK_RELEASE=1)', { skip: !process.env.PRISM_DECK_RELEASE && 'set PRISM_DECK_RELEASE=1 (the catalog changes whenever anyone adds a facet)' }, () => {
  script('build-catalog.mjs', '--check');
});

test('catalog builds consistent; its island round-trips and runs offline', async () => {
  const { buildCatalog } = await import('../scripts/build-catalog.mjs');
  const cat = JSON.parse(JSON.stringify(buildCatalog()));
  assert.deepEqual(catalogProblems(cat), []);
  const part = islandPart(cat, '\r\n');
  assert.ok(!/<\/script/i.test(islandJson(cat)), '</script must be escaped');
  // the island is the catalog without the static preview SVGs (Prism.html renders live from sources)
  assert.deepEqual(extractIsland(part), islandCatalog(cat));
  assert.ok(extractIsland(part).facets.every((f) => !('preview' in f)) && cat.facets.some((f) => f.preview), 'previews stay in deck-catalog.json only');
  // the island's sources run the engine with no access to src/
  const { createModuleLoader } = await import('../src/web/island.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-island-'));
  let i = 0;
  try {
    const loader = createModuleLoader(cat.sources, { urlFor: (code) => { const f = path.join(dir, `m${i++}.mjs`); fs.writeFileSync(f, code); return pathToFileURL(f).href; } });
    const reg = await loader.import('prism-deck/src/facets/index.js');
    const r = await loader.import('prism-deck/src/render.js');
    assert.equal(reg.allFacets().length, cat.facets.length);
    assert.equal(r.render(reg.findFacet('icon-volume'), { t: 1, size: 96 }).svg, render(findFacet('icon-volume'), { t: 1, size: 96 }).svg);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── API 1.2: per-slice culling + ctx.pressKey ────────────────────────────────
test('culling: slices keep only what they show, stay valid, and shrink', () => {
  for (const [id, device] of [['span-first-light', 'mk2'], ['span-first-light', 'plusxl'], ['span-waveform', 'studio'], ['theme-prism', 'xl'], ['theme-prism', 'galleon']]) {
    const f = findFacet(id);
    const culled = render(f, { device, t: 3.2, since: 3.2, idPrefix: 'pdtest' });
    const full = render(f, { device, t: 3.2, since: 3.2, idPrefix: 'pdtest', cull: false });
    const size = (r) => [...(r.keys || []).map((k) => k.svg), ...(r.segments || []), r.screen].filter(Boolean).reduce((a, x) => a + x.length, 0);
    assert.ok(size(culled) < size(full) * 0.75, `${id}/${device}: ${size(culled)} vs ${size(full)}`);
    for (const k of culled.keys) assert.deepEqual(validateSvg(k.svg, { idPrefix: 'pdtest', maxBytes: 393216 }), [], `${id}/${device} key ${k.i}`);
  }
  const deck = render(findFacet('theme-prism'), { device: 'xl', t: 1 });
  assert.ok(Math.max(...deck.keys.map((k) => k.svg.length)) < 32768, 'a deck key slice fits the key budget');
});

test('culling: a key whose pixels did not change is byte-identical frame to frame', () => {
  const f = findFacet('span-first-light');
  const a = render(f, { device: 'mk2', t: 0.3 }), b = render(f, { device: 'mk2', t: 0.45 });
  const same = a.keys.filter((k, i) => k.svg === b.keys[i].svg).map((k) => k.i);
  assert.ok(same.length >= 8, `only keys ${same} were stable while the beam crossed the middle row`);
  assert.ok(a.keys.some((k, i) => k.svg !== b.keys[i].svg), 'the keys on the beam path change');
});

test('culling bounds are conservative', () => {
  assert.deepEqual(parseTransform('translate(10 5) scale(2)'), [2, 0, 0, 2, 10, 5]);
  assert.equal(parseTransform('perspective(3)'), null);
  const b = elementBounds('<g transform="translate(100 0)"><rect x="0" y="0" width="10" height="10"/><circle cx="5" cy="5" r="20" stroke="#ffffff" stroke-width="2"/></g>');
  assert.ok(b[0] <= 100 - 15 - 4 && b[2] >= 100 + 25 + 4 && b[1] <= -15 - 4);
  assert.equal(elementBounds('<foo bar="1"/>'), null, 'unknown elements are kept');
  const q = elementBounds('<path d="M0 10A10 10 0 0 0 10 0"/>'); // a quarter circle: exact arc extent, not the radius disk
  assert.ok(q[0] >= -1.01 && q[2] <= 11.01 && q[1] >= -1.01 && q[3] <= 11.01, JSON.stringify(q));
  const half = elementBounds('<path d="M0 0A10 10 0 0 1 20 0"/>'); // upper half circle reaches y = -10
  assert.ok(half[1] <= -10.99 && half[3] <= 1.01, JSON.stringify(half));
  assert.equal(elementBounds('<path d=""/>'), 'empty');
  assert.ok(prepareCull('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><defs><linearGradient id="g"/></defs><rect width="1" height="1" fill="url(#g)"/></svg>').defs.length === 1);
  assert.equal(prepareCull('not svg'), null);
});

test('ctx.pressKey carries the pressed key index into span and deck facets', () => {
  assert.equal(createContext(findFacet('span-waveform'), { device: 'mk2', pressKey: 7 }).pressKey, 7);
  assert.equal(createContext(findFacet('span-waveform'), { device: 'mk2' }).pressKey, null);
});

const SNAP = path.resolve(ROOT, '..', '..', 'aaa-prism-ds', 'tools', 'snap.mjs');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
test('culled slices render pixel-identical to unculled ones (headless Chrome)', { skip: !(fs.existsSync(SNAP) && fs.existsSync(CHROME)) && 'needs Chrome + aaa-prism-ds/tools/snap.mjs', timeout: 120000 }, () => {
  const pairs = [];
  for (const [id, device, t] of [['span-first-light', 'mk2', 3.4], ['span-first-light', 'xl', 2.2], ['span-waveform', 'plus', 1.7], ['theme-prism', 'galleon', 1], ['theme-prism', 'plusxl', 1]]) {
    const f = findFacet(id);
    const a = render(f, { device, t, since: t }), b = render(f, { device, t, since: t, cull: false });
    const parts = (r) => [...r.keys.map((k) => k.svg), ...(r.segments || []), ...(r.screen ? [r.screen] : [])];
    parts(a).forEach((s, i) => pairs.push([`${id}/${device}/${i}`, s, parts(b)[i]]));
  }
  // negative control: a slice that really lost an element (its label) must be caught
  { const k = render(findFacet('theme-prism'), { device: 'mk2', t: 1 }).keys[0].svg; const lastPath = k.lastIndexOf('<path transform="translate('); pairs.push(['control', k.slice(0, lastPath) + k.slice(k.indexOf('/>', lastPath) + 2), k]); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-cull-'));
  try {
    const page = path.join(dir, 'cull.html');
    const data = JSON.stringify(pairs.map(([n, a, b]) => [n, 'data:image/svg+xml;base64,' + Buffer.from(a).toString('base64'), 'data:image/svg+xml;base64,' + Buffer.from(b).toString('base64')]));
    fs.writeFileSync(page, `<!doctype html><script>
const pairs = ${data};
const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
window.done = (async () => {
  const bad = [];
  for (const [name, a, b] of pairs) {
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = ia.naturalWidth, h = ia.naturalHeight, c = document.createElement('canvas'); c.width = w * 2; c.height = h;
    const g = c.getContext('2d'); g.drawImage(ia, 0, 0, w, h); g.drawImage(ib, w, 0, w, h);
    const A = g.getImageData(0, 0, w, h).data, B = g.getImageData(w, 0, w, h).data;
    // Chrome's SVG rasterizer anti-aliases slightly differently when a document holds more
    // (even invisible, far-away) geometry, so 'identical' = no visible change: under 1% of
    // pixels differ by more than 2, none by more than 80. A culled-away element shows up as a
    // region, far above that.
    let max = 0, off = 0; for (let k = 0; k < A.length; k++) { const d = Math.abs(A[k] - B[k]); if (d > max) max = d; if (d > 2) off++; }
    const frac = off / A.length;
    if (frac > 0.01 || max > 80) bad.push(name + ' ' + (frac * 100).toFixed(2) + '% Δ' + max);
  }
  return { n: pairs.length, bad };
})();
</script>`);
    const outPng = path.join(dir, 'cull.png');
    const res = execFileSync(process.execPath, [SNAP, page, outPng, '--w=400', '--h=300', '--wait=400', '--eval=return JSON.stringify(await window.done)'], { encoding: 'utf8' });
    const m = res.match(/eval: ({.*})/);
    assert.ok(m, res);
    const r = JSON.parse(m[1]);
    assert.ok(r.n > 50, `compared ${r.n} slices`);
    assert.ok(r.bad.some((b) => b.startsWith('control')), 'the comparison must detect a missing element');
    assert.deepEqual(r.bad.filter((b) => !b.startsWith('control')), [], r.bad.join(', '));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── API 1.3 ──────────────────────────────────────────────────────────────────
test('context: pressedFor, turnAge and touch', () => {
  const span = findFacet('span-waveform'), dial = findFacet('dial-volume');
  assert.equal(createContext(span, { device: 'mk2', pressed: true, pressedFor: 0.4 }).pressedFor, 0.4);
  assert.equal(createContext(span, { device: 'mk2', pressed: false, pressedFor: 0.4 }).pressedFor, 0, '0 when released');
  assert.equal(createContext(dial, { turnAge: 0.12 }).turnAge, 0.12);
  assert.equal(createContext(dial, {}).turnAge, Infinity);
  assert.deepEqual(createContext(dial, { device: 'plus', touch: { x: 50, y: 40, hold: true, age: 0.1 } }).touch, { x: 50, y: 40, hold: true, age: 0.1 });
  assert.equal(createContext(dial, { device: 'galleon', touch: { x: 50, y: 40 } }).touch, undefined, 'the Galleon has no touch');
  assert.equal(createContext(findFacet('icon-mic'), { touch: { x: 1, y: 1 } }).touch, undefined, 'keys report presses, not touches');
});

test('paintGlyph receives the glyph box', () => {
  const seen = [];
  const theme = defineTheme({ id: 'probe', title: 'Probe', description: 'records what paintGlyph receives', modes: { dark: useTheme('prism').resolve('dark').colors }, paintGlyph(k, pen, o) { seen.push(o.box); return ''; } });
  render(findFacet('icon-mic'), { theme, size: 96, t: 1 });
  assert.ok(seen.length && seen[0].size > 0 && Number.isFinite(seen[0].x), JSON.stringify(seen[0]));
});

test('arc flags: compact forms are rejected by parsePath and the validator (so by the rasterizer too); g in clipPath is flagged', async () => {
  const { parsePath } = await import('../src/scene/geom.js');
  const { compactArcFlags } = await import('../src/scene/validate.js');
  assert.throws(() => parsePath('M0 0a5 5 0 0110 10'), /arc flags/);
  assert.deepEqual(parsePath('M0 0a5 5 0 1 0 10 10')[1].v, [0, 0, 5, 5, 0, 1, 0, 10, 10]);
  assert.ok(compactArcFlags('M0 0a5 5 0 0110 10'));
  assert.ok(!compactArcFlags('M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z'));
  const doc = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">${inner}</svg>`;
  assert.ok(validateSvg(doc('<path d="M0 0a5 5 0 0110 10"/>'), { w: 10, h: 10 }).some((p) => /compact arc flags/.test(p)));
  assert.ok(validateSvg(doc('<defs><clipPath id="c"><g><rect width="1" height="1"/></g></clipPath></defs><rect width="1" height="1" clip-path="url(#c)"/>'), { w: 10, h: 10 }).some((p) => /inside <clipPath>/.test(p)));
});

// ── API 1.3.1 ────────────────────────────────────────────────────────────────
test('culling is strict: an element that only touches a slice edge stays out', async () => {
  const { prepareCull, cullInner } = await import('../src/scene/cull.js');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><defs><clipPath id="a"><rect width="100" height="100"/></clipPath><clipPath id="b"><rect width="100" height="100"/></clipPath></defs><g transform="translate(0 0)"><g clip-path="url(#a)"><rect width="100" height="100" fill="#ff0000"/></g></g><g transform="translate(100 0)"><g clip-path="url(#b)"><rect width="100" height="100" fill="#0000ff"/></g></g></svg>';
  const prep = prepareCull(svg);
  const left = cullInner(prep, { x: 0, y: 0, w: 100, h: 100 }), right = cullInner(prep, { x: 100, y: 0, w: 100, h: 100 });
  assert.ok(left.includes('#ff0000') && !left.includes('#0000ff'), left);
  assert.ok(right.includes('#0000ff') && !right.includes('#ff0000'), right);
});

test('λ labels come from the design tokens', async () => {
  const { lambdaOf } = await import('../src/scene/color.js');
  assert.equal(lambdaOf(296), 436);
  assert.equal(lambdaOf(60.4), 585);
  assert.equal(lambdaOf(8), '494c');
  const between = lambdaOf(250);
  assert.ok(between > 472 && between < 479, String(between));
});

// ── API 1.4: the device output stage (Qt SVG in the Stream Deck app) ──────────
test('toDeviceSvg: clipPath → luminance mask, no preserveAspectRatio, root aspect = viewBox; passes the device profile', async () => {
  const { toDeviceSvg } = await import('../src/scene/qt.js');
  const src = '<svg xmlns="http://www.w3.org/2000/svg" width="144" height="100" viewBox="0 0 144 144" preserveAspectRatio="xMidYMid meet"><defs><clipPath id="pd-c" clip-rule="evenodd"><path d="M10 10H60V60H10Z"/></clipPath><clipPath id="pd-o" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath></defs><g clip-path="url(#pd-c)"><rect width="144" height="144" fill="#ff0000"/></g><rect x="70" y="70" width="40" height="40" fill="#00ff00" clip-path="url(#pd-o)"/></svg>';
  const out = toDeviceSvg(src);
  assert.doesNotMatch(out, /clipPath|clip-path|preserveAspectRatio/);
  assert.match(out, /<mask id="pd-c" maskUnits="userSpaceOnUse"[^>]*><path d="M10 10H60V60H10Z" fill="#ffffff" stroke="none" fill-rule="evenodd"\/><\/mask>/);
  assert.match(out, /<mask id="pd-o" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox"/);
  assert.match(out, /mask="url\(#pd-c\)"/);
  assert.match(out, /^<svg[^>]*width="144" height="144"/);
  assert.deepEqual(validateSvg(out, { profile: 'device', w: 144, h: 144 }), []);
  assert.ok(validateSvg(src, { profile: 'device' }).some((p) => /toDeviceSvg/.test(p)), 'the device profile rejects clipPath');
  assert.ok(validateSvg(out).some((p) => /mask/.test(p)), 'the facet profile still bans <mask>');
  assert.equal(toDeviceSvg(out), out, 'idempotent');
});

test('toDeviceSvg renders like the original in Chrome (clip-heavy facets); dropping the clip visibly breaks them', { skip: !(fs.existsSync(SNAP) && fs.existsSync(CHROME)) && 'needs Chrome + aaa-prism-ds/tools/snap.mjs', timeout: 180000 }, async () => {
  const { toDeviceSvg } = await import('../src/scene/qt.js');
  const cases = [
    ['icon-play-pause', { theme: 'blueprint', size: 144, state: 1 }], ['icon-music-note', { theme: 'blueprint', size: 160 }], ['icon-viewers', { theme: 'blueprint', size: 120 }],
    ['icon-mic', { theme: 'phosphor', size: 144 }], ['icon-power', { theme: 'phosphor', size: 96, state: 1 }],
    ['theme-blueprint', { device: 'galleon' }], ['theme-prism', { device: 'plus' }],
    ['screen-galleon-media', { screen: 'galleon' }], ['screen-strip-media', { device: 'plus' }], ['screen-neo-now-playing', { screen: 'infobar', device: 'neo' }],
    ['app-now-playing', { size: 144 }], ['app-scene-switcher', { device: 'mini' }], ['app-widget-media', { screen: 'galleon-widget', device: 'galleon' }],
  ];
  const pairs = [];
  for (const [id, o] of cases) {
    const f = findFacet(id);
    if (!f) continue;
    const svg = render(f, { ...o, t: stillTime(f), since: stillTime(f) }).svg;
    if (!/<clipPath/.test(svg)) continue;
    pairs.push([id, svg, toDeviceSvg(svg)]);
    if (id === 'icon-music-note' || id === 'screen-galleon-media') pairs.push([`control:${id}`, svg, svg.replace(/\sclip-path="url\(#[^)]+\)"/g, '')]); // what Qt draws without the transform
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-qt-'));
  try {
    const page = path.join(dir, 'qt.html');
    const data = JSON.stringify(pairs.map(([nm, a, b]) => [nm, 'data:image/svg+xml;base64,' + Buffer.from(a).toString('base64'), 'data:image/svg+xml;base64,' + Buffer.from(b).toString('base64')]));
    fs.writeFileSync(page, `<!doctype html><script>
const pairs = ${data};
const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
window.done = (async () => {
  const bad = [];
  for (const [name, a, b] of pairs) {
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = ia.naturalWidth, h = ia.naturalHeight, c = document.createElement('canvas'); c.width = w * 2; c.height = h;
    const g = c.getContext('2d'); g.drawImage(ia, 0, 0, w, h); g.drawImage(ib, w, 0, w, h);
    const A = g.getImageData(0, 0, w, h).data, B = g.getImageData(w, 0, w, h).data;
    let max = 0, off = 0; for (let k = 0; k < A.length; k++) { const d = Math.abs(A[k] - B[k]); if (d > max) max = d; if (d > 2) off++; }
    const frac = off / A.length;
    // a mask's anti-aliased edge differs slightly from Chrome's clip edge (≤ 3% of channels, small Δ);
    // content that a clip should have hidden shows up as large Δ (the controls)
    if (frac > 0.03 || max > 64) bad.push(name + ' ' + (frac * 100).toFixed(2) + '% Δ' + max);
  }
  return { n: pairs.length, bad };
})();
</script>`);
    const res = execFileSync(process.execPath, [SNAP, page, path.join(dir, 'qt.png'), '--w=400', '--h=300', '--wait=400', '--eval=return JSON.stringify(await window.done)'], { encoding: 'utf8' });
    const m = res.match(/eval: (\{.*\})/);
    assert.ok(m, res);
    const r = JSON.parse(m[1]);
    assert.ok(r.n >= 10, `compared ${r.n}`);
    assert.ok(r.bad.some((b) => b.startsWith('control:icon-music-note')) && r.bad.some((b) => b.startsWith('control:screen-galleon-media')), `ignoring the clip must break the art: ${r.bad}`);
    assert.deepEqual(r.bad.filter((b) => !b.startsWith('control:')), [], r.bad.join(', '));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('API 1.5.1: span / deck geometry rounds to 2 decimals everywhere (+ XL 3-row spans validate)', async () => {
  const { spanGrid, deckLayout, getDevice } = await import('../src/devices.js');
  const g = spanGrid(getDevice('plusxl'), { rows: 3, cols: 3 });
  assert.equal(g.h, 398.66);
  assert.ok(g.cells.every((c) => [c.x, c.y, c.w, c.h].every((v) => Math.round(v * 100) / 100 === v)));
  for (const id of ['plusxl', 'xl', 'studio', 'mini']) assert.ok(deckLayout(getDevice(id)).keys.every((k) => [k.x, k.y].every((v) => Math.round(v * 100) / 100 === v)), id);
  const r = render(findFacet('span-ripple'), { device: 'plusxl', span: { cols: 3, rows: 3 } });
  assert.deepEqual(validateSvg(r.svg, { w: r.w, h: r.h, maxBytes: 1e6 }), []);
  assert.deepEqual(validateSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="398.66" viewBox="0 0 10 398.66"></svg>', { w: 10, h: 398.65999999999997 }), [], 'float noise is not a size mismatch');
  assert.match(validateSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="398.6" viewBox="0 0 10 398.6"></svg>', { w: 10, h: 398.66 }).join(), /height/);
});

test('API 1.5.1: deck surfaces return the Galleon widget windows; heldFor; per-facet still; faded text fades every copy', async () => {
  const deck = render(findFacet('theme-prism'), { device: 'galleon', t: 1 });
  assert.deepEqual(deck.widgets.map((w) => [w.dial, w.layer, w.x, w.y, w.w, w.h]), [[0, 0, 0, 6, 360, 180], [1, 0, 360, 6, 360, 180], [0, 1, 0, 198, 360, 180], [1, 1, 360, 198, 360, 180]]);
  assert.ok(deck.widgets.every((w) => validateSvg(w.svg, { w: 360, h: 180, maxBytes: 131072 }).length === 0));
  assert.equal(render(findFacet('theme-prism'), { device: 'plus', t: 1 }).widgets, undefined);
  const f = findFacet('icon-mic');
  assert.equal(createContext(f, { heldFor: 1.25 }).heldFor, 1.25);
  assert.equal(createContext(f, {}).heldFor, 0);
  assert.equal(stillTime({ animated: true, loop: 10, still: 7.5 }), 7.5);
  assert.equal(stillTime({ animated: true, loop: 10 }), 4);
  const { normalizeFacet, validateFacet } = await import('../src/facets/schema.js');
  const base = { id: 'icon-x', title: 'X', category: 'Media', description: 'A facet used to exercise the still-time rule.', tags: ['x'], glyph: 'mic', render: () => '' };
  assert.deepEqual(validateFacet(normalizeFacet({ ...base, still: 2 }, 'icons/x.js')), []);
  assert.match(validateFacet(normalizeFacet({ ...base, still: -1 }, 'icons/x.js')).join(), /still/);
  // chrome draws a shadow copy under its value text: opacity must fade it too (D8)
  const { surface } = await import('../src/scene/index.js');
  const k = surface(createContext(f, { theme: 'chrome', size: 144 }));
  k.value('42', { opacity: 0.3 });
  assert.match(k.body, /^<g opacity="0.3">/, 'multi-copy lettering fades as one group');
  const p = surface(createContext(f, { theme: 'prism', size: 144 }));
  p.label('Ok', { opacity: 0.5 });
  assert.match(p.body, /^<path opacity="0.5"/, 'a single path takes opacity= (fill and faux-bold stroke together)');
  const q = surface(createContext(f, { theme: 'prism', size: 144 }));
  q.label('Ok', { opacity: 0 });
  assert.equal(q.body, '', 'fully faded text is not drawn');
});

test('API 1.5.1: createChangeGovernor caps fps by the keys that actually changed', async () => {
  const { createChangeGovernor } = await import('../src/scene/scheduler.js');
  const g = createChangeGovernor({ budget: 60, window: 4, idle: 2 });
  assert.equal(g.fps(12), 12, 'no history: full rate');
  for (let i = 0; i < 4; i++) g.observe(3);
  assert.equal(g.fps(12), 12, '3 keys × 12 fps fits 60 updates/s');
  for (let i = 0; i < 4; i++) g.observe(32);
  assert.equal(g.fps(12), 60 / 32, 'a whole-XL repaint is throttled to the budget');
  for (let i = 0; i < 4; i++) g.observe(0);
  assert.equal(g.fps(12), 2, 'nothing changing: idle probe');
  g.reset();
  assert.equal(g.fps(12), 12, 'an interaction restores the full rate');
  assert.equal(g.fps(0), 0);
});
