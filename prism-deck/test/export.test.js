// Prism Deck exports: ZIP, the JSON-schema validator (against Elgato's official
// manifest/layout schemas from the research handoff), the plugin package, icon packs
// and ProfilesV3 profiles. Builds into temp dirs only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip, readZip, crc32 } from '../src/export/plugin-zip.js';
import { validate, findSchemas, imageSize } from '../src/export/plugin-schema.js';
import { decodePng, encodePng, downscale } from '../src/export/plugin-png.js';
import { pluginManifest, buildPluginFolder, validatePluginFolder, packPlugin, checkPluginPackage } from '../src/export/plugin.js';
import { buildIconPack, checkIconPack, loadRaster, packPlan, gifFrameCount } from '../src/export/iconpack.js';
import { buildProfile, sampleProfiles, checkProfile, SAMPLE_LAYOUTS, HOME_LAYOUTS, BUILTINS, detUuid } from '../src/export/profile.js';
import { BUNDLED_PROFILES } from '../src/plugin/settings.js';
import { PLUGIN_VERSION } from '../src/plugin/index.js';
import { CANVAS_LAYOUT, INFOBAR_LAYOUT } from '../src/plugin/feedback.js';
import { validateSvg } from '../src/scene/validate.js';
import { getDevice } from '../src/devices.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMAS = findSchemas();
const noSchemas = !SCHEMAS && 'official schemas not on this machine (set PRISM_SD_SCHEMAS)';
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'prism-deck-export-'));

// ── zip ──────────────────────────────────────────────────────────────────────
test('zip: round trip with deflate/store, UTF-8 names, auto parent dirs, CRC-checked reads', () => {
  const big = Buffer.from('prism '.repeat(5000));
  const zip = writeZip([{ name: 'root.sdPlugin/manifest.json', data: '{"a":1}' }, { name: 'root.sdPlugin/bin/big.txt', data: big }, { name: 'root.sdPlugin/λ.txt', data: 'λ' }, { name: 'root.sdPlugin/empty/' }]);
  const e = readZip(zip);
  const names = e.map((x) => x.name);
  for (const n of ['root.sdPlugin/', 'root.sdPlugin/bin/', 'root.sdPlugin/empty/', 'root.sdPlugin/λ.txt']) assert.ok(names.includes(n), n);
  assert.equal(e.find((x) => x.name.endsWith('big.txt')).data.equals(big), true);
  assert.ok(zip.length < big.length / 10, 'deflated');
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const one = writeZip([{ name: 'f.txt', data: 'abc' }]);              // stored (too small to deflate)
  const flipped = Buffer.from(one); flipped[30 + 'f.txt'.length] ^= 0xff; // first data byte
  assert.throws(() => readZip(flipped), /CRC/);
  assert.throws(() => readZip(Buffer.from('not a zip at all, sorry')), /not a zip/);
  assert.throws(() => writeZip([{ name: '../evil', data: 'x' }]));
  assert.deepEqual(writeZip([{ name: 'a', data: 'b' }]), writeZip([{ name: 'a', data: 'b' }]), 'reproducible');
});

// ── schema validator ─────────────────────────────────────────────────────────
test('schema: the draft-07 subset (refs with encoded pointers, if/then, anyOf, tuples, additionalProperties)', () => {
  const s = {
    definitions: { 'A<"x">': { type: 'object', properties: { k: { type: 'string', pattern: '^[a-z]+$', errorMessage: 'lowercase only' } }, required: ['k'], additionalProperties: false } },
    type: 'object',
    properties: { a: { $ref: '#/definitions/A%3C%22x%22%3E' }, t: { type: 'array', items: [{ type: 'number', maximum: 2 }, { type: 'string' }], minItems: 2, maxItems: 2 }, e: { enum: [1, 'two'] }, u: { type: 'array', uniqueItems: true } },
    allOf: [{ if: { properties: { mode: { const: 'x' } }, required: ['mode'] }, then: { required: ['extra'] } }],
    anyOf: [{ required: ['a'] }, { required: ['t'] }],
  };
  assert.deepEqual(validate(s, { a: { k: 'ok' } }), []);
  assert.equal(validate(s, { a: { k: 'NO' } })[0].message, 'lowercase only');
  assert.equal(validate(s, { a: { k: 'ok', z: 1 } })[0].keyword, 'additionalProperties');
  assert.equal(validate(s, { t: [3, 'x'] })[0].keyword, 'maximum');
  assert.equal(validate(s, { t: [1, 'x'], e: 3 })[0].keyword, 'enum');
  assert.equal(validate(s, { a: { k: 'ok' }, mode: 'x' })[0].path, '$.extra');
  assert.ok(validate(s, {}).length > 0, 'anyOf: neither a nor t');
  assert.equal(validate(s, { a: { k: 'ok' }, u: [1, 1] })[0].keyword, 'uniqueItems');
});

test('schema: Elgato manifest + layout schemas accept the research example and reject the known-bad ones', { skip: noSchemas }, () => {
  const ex = path.join(SCHEMAS.dir, 'examples', 'prism-deck-minimal', 'com.prismdeck.demo.sdPlugin');
  const man = JSON.parse(fs.readFileSync(path.join(ex, 'manifest.json'), 'utf8'));
  assert.deepEqual(validate(SCHEMAS.manifest, man), []);
  const bad = (f) => { const m = structuredClone(man); f(m); return validate(SCHEMAS.manifest, m).map((e) => `${e.path} ${e.keyword}`); };
  assert.ok(bad((m) => { m.UUID = 'Com.Bad_UUID'; }).includes('$.UUID pattern'));
  assert.ok(bad((m) => { delete m.CodePath; }).includes('$.CodePath required'));
  assert.ok(bad((m) => { m.Nodejs.Version = '22'; }).includes('$.Nodejs.Version enum'));
  assert.ok(bad((m) => { m.Actions[1].Encoder.layout = '$Z9'; }).includes('$.Actions[1].Encoder.layout pattern'));
  assert.ok(bad((m) => { m.Software.MinimumVersion = '7.0'; m.Nodejs.Version = '24'; }).length > 0, 'Node 24 needs Software ≥ 7.1');
  for (const f of fs.readdirSync(path.join(SCHEMAS.dir, 'examples', 'official', 'layouts'))) assert.deepEqual(validate(SCHEMAS.layout, JSON.parse(fs.readFileSync(path.join(SCHEMAS.dir, 'examples', 'official', 'layouts', f), 'utf8'))), [], f);
  assert.deepEqual(validate(SCHEMAS.layout, CANVAS_LAYOUT), []);
  assert.deepEqual(validate(SCHEMAS.layout, INFOBAR_LAYOUT), []);
  assert.ok(validate(SCHEMAS.layout, { ...CANVAS_LAYOUT, items: [{ key: 'canvas', type: 'pixmap', rect: [0, 0, 201, 100] }] }).length > 0, 'pixmap outside 200×100');
  assert.ok(validate(SCHEMAS.layout, { ...INFOBAR_LAYOUT, items: [{ key: 'canvas', type: 'pixmap', rect: [0, 0, 232, 51] }] }).length > 0, 'pixmap outside the Neo 232×50 canvas');
});

test('schema: the Prism manifest is valid for Software 7.6 (with the Neo action) and 7.1 (without)', { skip: noSchemas }, () => {
  const profiles = [{ name: 'profiles/prism-galleon', deviceType: 12 }];
  const m76 = pluginManifest({ minSoftware: '7.6', profiles });
  const m71 = pluginManifest({ minSoftware: '7.1', profiles });
  assert.deepEqual(validate(SCHEMAS.manifest, m76), []);
  assert.deepEqual(validate(SCHEMAS.manifest, m71), []);
  assert.deepEqual(m76.Actions.map((a) => a.UUID), ['com.jeremyfhall.prism.facet', 'com.jeremyfhall.prism.infobar']);
  assert.deepEqual(m71.Actions.map((a) => a.UUID), ['com.jeremyfhall.prism.facet']);
  assert.equal(m76.Nodejs.Version, '20');
  assert.ok(m76.Actions.every((a) => a.UUID.startsWith(`${m76.UUID}.`)), 'action UUIDs are prefixed by the plugin UUID');
  assert.deepEqual(m76.Actions[0].Controllers, ['Keypad', 'Encoder']);
  assert.equal(m76.Actions[0].Name, 'Prism Display', 'the action says what it is: visual');
  assert.match(m76.Actions[0].Tooltip, /Visual only/);
  assert.match(m76.SupportURL, /^https:\/\//);
  assert.equal(m76.Version, PLUGIN_VERSION);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version, PLUGIN_VERSION.split('.').slice(0, 3).join('.'), 'package.json and the plugin share one version');
});

// ── plugin package ───────────────────────────────────────────────────────────
test('plugin: the built folder passes the official schemas with file/image checks; the package unzips to one root', { timeout: 60000 }, () => {
  const dir = tmpdir();
  try {
    const built = buildPluginFolder({ root: ROOT, outDir: path.join(dir, 'com.jeremyfhall.prism.sdPlugin') });
    const problems = validatePluginFolder(built.dir, SCHEMAS);
    assert.deepEqual(SCHEMAS ? problems : problems.slice(1), []);
    assert.deepEqual(imageSize(path.join(built.dir, 'imgs/plugin/icon.png')), { w: 256, h: 256 });
    assert.deepEqual(imageSize(path.join(built.dir, 'imgs/plugin/icon@2x.png')), { w: 512, h: 512 });
    assert.deepEqual(imageSize(path.join(built.dir, 'imgs/actions/facet/strip.svg')), { w: 200, h: 100 });
    for (const f of ['bin/plugin.js', 'bin/package.json', 'ui/pi.html', 'ui/catalog.js', 'layouts/prism-canvas.json', 'bin/prism-deck/src/plugin/runtime.js', 'bin/prism-deck/src/render.js', 'LICENSE.txt', 'ui/fonts/OFL.txt', 'bin/prism-deck/src/scene/fonts/OFL.txt']) assert.ok(fs.existsSync(path.join(built.dir, f)), f);
    assert.match(fs.readFileSync(path.join(built.dir, 'LICENSE.txt'), 'utf8'), /MIT License[\s\S]*SIL OPEN FONT LICENSE Version 1\.1/);
    assert.match(fs.readFileSync(path.join(built.dir, 'ui/fonts/OFL.txt'), 'utf8'), /The Inter Project Authors/);
    assert.deepEqual(built.manifest.Profiles.map((p) => p.Name).sort(), Object.values(BUNDLED_PROFILES).sort(), 'profile names = the ones the runtime switches to');
    for (const f of ['bin/prism-deck/src/export', 'bin/prism-deck/src/plugin/dev', 'bin/prism-deck/src/web']) assert.equal(fs.existsSync(path.join(built.dir, f)), false, `${f} is not shipped`);
    const cat = fs.readFileSync(path.join(built.dir, 'ui/catalog.js'), 'utf8');
    const C = JSON.parse(cat.slice(cat.indexOf('=') + 1).trim().replace(/;$/, ''));
    assert.ok(Object.keys(C.facets).length >= 50 && C.themes.length >= 8 && C.glyphs.length >= 50);
    const pkg = packPlugin(built.dir);
    const chk = checkPluginPackage(pkg);
    assert.deepEqual(chk.problems, []);
    assert.equal(readZip(pkg).filter((e) => /\.log$|(^|\/)\./.test(e.name.split('/').slice(1).join('/'))).length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('plugin: brand icon PNG codec (decode → downscale → encode round trip)', () => {
  const brand = path.resolve(ROOT, '..', 'design', 'brand', 'prism-icon-512.png');
  if (!fs.existsSync(brand)) return;
  const img = decodePng(fs.readFileSync(brand));
  assert.equal(img.width, 512);
  const small = downscale(img, 2);
  const back = decodePng(encodePng(small));
  assert.equal(back.width, 256); assert.ok(back.data.equals(small.data));
});

// ── icon packs ───────────────────────────────────────────────────────────────
test('iconpack: every glyph × state × mode is planned with unique ≤ 80-char names', () => {
  const { list, theme } = packPlan('prism');
  assert.ok(list.length >= 56 * 2, `${list.length} icons`);
  assert.equal(new Set(list.map((x) => x.base)).size, list.length);
  assert.ok(list.every((x) => `${x.base}.gif`.length <= 80));
  assert.deepEqual([...new Set(list.map((x) => x.mode))].sort(), [...theme.modes].sort());
});

test('iconpack: a pack (GIF + PNG twins via src/raster, SVG otherwise) passes the format checks', { timeout: 120000 }, async () => {
  const raster = await loadRaster();
  const glyphs = ['mic', 'power', 'clock', 'lock'];
  for (const R of [raster, null]) {
    const p = await buildIconPack({ theme: 'neon', glyphs, raster: R });
    assert.deepEqual(checkIconPack(p.zip), []);
    assert.deepEqual(p.stats.invalid, []);
    assert.equal(p.folder, 'com.jeremyfhall.prism.icons.neon.sdIconPack');
    assert.match(p.manifest.Version, /^\d+\.\d+\.\d+$/);
    const entries = readZip(p.zip);
    assert.ok(entries.some((e) => e.name.endsWith('/OFL.txt')), 'Inter OFL ships with the pack');
    assert.match(entries.find((e) => e.name.endsWith('/license.txt')).data.toString('utf8'), /SIL OPEN FONT LICENSE/);
    if (R) {
      assert.ok(p.stats.gif > 0, 'animated glyphs became GIFs');
      for (const ic of p.icons.filter((x) => x.path.endsWith('.gif'))) {
        const png = ic.path.replace(/\.gif$/, '.png');
        assert.ok(entries.some((e) => e.name.endsWith(`icons/${png}`)), `${ic.path} has a PNG twin`);
        assert.ok(p.icons.some((x) => x.path === png && x.tags.includes('still')), `${png} is listed as a still`);
        assert.ok(gifFrameCount(entries.find((e) => e.name.endsWith(`icons/${ic.path}`)).data) >= 2, `${ic.path} really animates`);
      }
      assert.ok(p.stats.stillLoops > 0, 'states whose loop does not move became static SVGs');
      assert.ok(p.manifest.Description.startsWith(`${p.icons.length} icons`) && p.manifest.Description.includes(`${p.stats.gif} animated`) && p.manifest.Description.includes(`${p.stats.svg} static`), p.manifest.Description);
      assert.ok(entries.some((e) => e.name.endsWith('previews/night.png')));
    } else assert.equal(p.stats.gif, 0);
    for (const e of entries.filter((x) => x.name.endsWith('.svg') && x.name.includes('/icons/'))) assert.deepEqual(validateSvg(e.data.toString('utf8'), { maxBytes: 32768 }), [], e.name);
  }
  const broken = writeZip([{ name: 'com.example.broken.sdIconPack/manifest.json', data: '{"Name":"x"}' }, { name: 'com.example.broken.sdIconPack/icons.json', data: '[{"path":"a.gif","name":"a"}]' }]);
  assert.ok(checkIconPack(broken).length >= 3, checkIconPack(broken).join('; '));
  assert.match(checkIconPack(writeZip([{ name: 'x.sdIconPack/manifest.json', data: '{}' }]))[0], /reverse-dns/);
});

// ── profiles ─────────────────────────────────────────────────────────────────
test('profile: sample profiles for Galleon 100 SD, Stream Deck +, MK.2, XL, Mini, Neo, + XL are valid FormatVersion 1 exports', () => {
  const all = sampleProfiles();
  assert.deepEqual(all.map((p) => p.device), ['galleon', 'plus', 'mk2', 'xl-2022', 'mini-2022', 'neo', 'plusxl']);
  const pxl = all[6];
  assert.equal(pxl.deviceType, 13, '+ XL: DeviceType 13 (StreamDeckPlusXL)');
  assert.equal(pxl.file, 'Prism - Stream Deck + XL');
  const pxlEnc = JSON.parse(readZip(pxl.zip).find((e) => e.name.endsWith(`${pxl.pages[0].toUpperCase()}/manifest.json`)).data.toString('utf8')).Controllers.find((c) => c.Type === 'Encoder');
  assert.deepEqual(Object.keys(pxlEnc.Actions).sort(), ['0,0', '1,0', '2,0', '3,0', '4,0', '5,0'], '+ XL: six dials');
  const pageOf = (p, i) => JSON.parse(readZip(p.zip).find((e) => e.name.endsWith(`${p.pages[i].toUpperCase()}/manifest.json`)).data.toString('utf8'));
  for (const p of all) {
    assert.deepEqual(checkProfile(p.zip), [], p.name);
    assert.deepEqual(p.dropped, [], `${p.name}: every key references a real facet or built-in that fits`);
    assert.equal(p.package.FormatVersion, 1);
    assert.equal(p.package.RequiredPlugins[0], 'com.jeremyfhall.prism');
    assert.ok(p.package.RequiredPlugins.includes('com.elgato.streamdeck.system.multimedia') && p.package.RequiredPlugins.includes('com.elgato.streamdeck.page'), `${p.name}: lists the built-in plugins it uses, like the app's own exports`);
    assert.equal(p.manifest.Device.Model, getDevice(p.device).model);
    const d = getDevice(p.device);
    // page 1, Home: Stream Deck's own actions in Prism art (they DO something), plus live Prism readouts
    const home = pageOf(p, 0);
    assert.equal(home.Name, 'Home');
    const keys = home.Controllers.find((c) => c.Type === 'Keypad').Actions;
    const builtins = Object.values(keys).filter((a) => a.Plugin.UUID !== 'com.jeremyfhall.prism');
    assert.ok(builtins.length >= 6, `${p.name}: Home is built on built-in actions (${builtins.length})`);
    const play = builtins.find((a) => a.UUID === 'com.elgato.streamdeck.system.multimedia' && a.Settings.actionIdx === 1);
    assert.ok(play, `${p.name}: a real play / pause key`);
    assert.match(play.States[0].Image, /^Images\/[0-9A-Z]{26}Z\.png$/);
    const img = readZip(p.zip).find((e) => e.name.endsWith(`${p.pages[0].toUpperCase()}/${play.States[0].Image}`));
    assert.ok(img && img.data.readUInt32BE(16) === 144, 'the Prism art is a 144 px PNG in the page Images/');
    for (const a of Object.values(keys)) if (a.Plugin.UUID === 'com.jeremyfhall.prism') { assert.deepEqual(a.States, [{}], 'Prism Display keys carry no state image'); assert.equal(a.Name, 'Prism Display'); }
    for (const coord of Object.keys(keys)) { const [c, r] = coord.split(',').map(Number); assert.ok(c < d.cols && r < d.rows, coord); }
    assert.ok(!JSON.stringify(home).includes('weather'), 'no weather on Home (it has no source)');
    // pages 2…: the Prism showcases, each with a built-in Home key
    assert.equal(p.pages.length, 1 + SAMPLE_LAYOUTS[p.device].pages.length);
    for (let i = 1; i < p.pages.length; i++) {
      const pg = pageOf(p, i);
      assert.match(pg.Name, /^Showcase/);
      const acts = Object.values(pg.Controllers.find((c) => c.Type === 'Keypad').Actions);
      const nav = acts.filter((a) => a.UUID === 'com.elgato.streamdeck.page.goto');
      assert.equal(nav.length, 1); assert.equal(nav[0].Settings.PageIndex, 1, 'Go to Page counts from 1: Home');
      assert.ok(acts.filter((a) => a !== nav[0]).every((a) => a.UUID === 'com.jeremyfhall.prism.facet'));
    }
    const gotoPages = builtins.filter((a) => a.UUID === 'com.elgato.streamdeck.page.goto').map((a) => a.Settings.PageIndex).sort();
    assert.deepEqual(gotoPages, Array.from({ length: p.pages.length - 1 }, (_, i) => i + 2), `${p.name}: Home reaches every Showcase page`);
  }
  assert.ok(Object.values(BUILTINS).every((b) => b.art && b.plugin.Version === '1.0'));
  assert.deepEqual(Object.keys(HOME_LAYOUTS).sort(), Object.keys(SAMPLE_LAYOUTS).sort());
  const g = JSON.parse(readZip(all[0].zip).find((e) => e.name.endsWith(`${all[0].pages[0].toUpperCase()}/manifest.json`)).data.toString('utf8'));
  const enc = g.Controllers.find((c) => c.Type === 'Encoder');
  assert.deepEqual(Object.keys(enc.Actions).sort(), ['0,0', '0,1', '1,0', '1,1'], 'Galleon: 2 dials × 2 layers ("dial,layer")');
  assert.deepEqual(enc.Routers, { '0,0': '0,0', '1,0': '1,0' });
  assert.deepEqual([enc.Actions['0,0'].UUID, enc.Actions['0,0'].Settings], ['com.elgato.streamdeck.system.multimedia', { actionIdx: 18 }], 'Galleon dial 0: the system volume (built-in)');
  assert.match(enc.Actions['0,0'].Encoder.Icon, /^Images\/[0-9A-Z]{26}Z\.png$/);
  const plusEnc = JSON.parse(readZip(all[1].zip).find((e) => e.name.endsWith(`${all[1].pages[0].toUpperCase()}/manifest.json`)).data.toString('utf8')).Controllers.find((c) => c.Type === 'Encoder').Actions;
  assert.equal(plusEnc['1,0'].Settings.Hotkeys.length, 4, 'a hotkey dial: turn left / right / push / touch');
  const neo = JSON.parse(readZip(all[5].zip).find((e) => e.name.endsWith(`${all[5].pages[0].toUpperCase()}/manifest.json`)).data.toString('utf8'));
  assert.equal(neo.Controllers.find((c) => c.Type === 'Neo').Actions['1,0'].UUID, 'com.jeremyfhall.prism.infobar');
  assert.deepEqual(sampleProfiles()[0].zip, all[0].zip, 'deterministic bytes');
  assert.match(detUuid('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('profile: unknown facets, misfits and off-grid keys are dropped, not exported', () => {
  const p = buildProfile({ device: 'mini-2022', name: 'Test', pages: [{ keys: [{ col: 0, row: 0, settings: { facet: 'icon-nope' } }, { col: 5, row: 0, settings: { facet: 'icon-mic' } }, { col: 1, row: 0, settings: { facet: 'dial-volume' } }, { col: 2, row: 1, settings: { facet: 'icon-mic' } }] }] });
  assert.equal(p.dropped.length, 3);
  assert.deepEqual(checkProfile(p.zip), []);
  assert.ok(Object.keys(SAMPLE_LAYOUTS).length >= 6);
});
