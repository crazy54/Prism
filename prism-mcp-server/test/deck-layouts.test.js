// Prism Deck layout documents (create / get / list / update / validate / delete), their
// validation against real device geometry (prism-deck live-validate + settings), whole-
// layout rendering, and export to .streamDeckProfile / .streamDeckIconPack files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DeckLayoutStore, LAYOUT_SCHEMA } from '../utils/deck-layouts.js';
import { MCP_CONTENT } from '../tools/deck.js';
import { deckCtx, scratch, silent, engine } from './deck-helper.js';

async function ready(t) {
  const e = await engine();
  if (!e.available) { t.skip('prism-deck engine not found'); return null; }
  return deckCtx();
}
const codes = (list) => list.map((x) => x.code);

test('deck_layout_create: blank / sample templates, DESIGN device names stored as prism-deck ids, import', async (t) => {
  const c = await ready(t); if (!c) return;
  const blank = await c.call('deck_layout_create', { device: 'galleon-100-sd', name: 'Desk', theme: 'prism:light' });
  assert.match(blank.layoutId, /^lay_[0-9a-f]{8}$/);
  assert.equal(blank.revision, 1);
  assert.equal(blank.layout.schema, LAYOUT_SCHEMA);
  assert.equal(blank.layout.device, 'galleon');
  assert.equal(blank.layout.theme, 'prism:light');
  assert.deepEqual(blank.layout.pages.map((p) => p.id), ['home']);
  assert.equal(blank.validation.ok, true);
  const sample = await c.call('deck_layout_create', { device: 'streamdeck-plus', template: 'sample' });
  assert.equal(sample.layout.device, 'plus');
  assert.equal(sample.layout.pages.length, 2);
  assert.ok(sample.layout.pages[0].dials.length === 4 && sample.layout.pages[0].keys.length === 8);
  assert.ok(sample.layout.pages[1].keys.every((k) => k.group === 'B'), 'span groups survive');
  assert.equal(sample.validation.ok, true, JSON.stringify(sample.validation.errors));
  const imported = await c.call('deck_layout_create', { layout: { device: 'mk2', name: 'Imp', pages: [{ id: 'a', keys: [{ col: 0, row: 0, look: { glyph: 'mic' } }] }] } });
  assert.equal(imported.layout.pages[0].keys[0].look.glyph, 'mic');
  const bad = await c.callSafe('deck_layout_create', { device: 'toaster' });
  assert.equal(bad.error.code, 'unknown_device');
  const noSample = await c.callSafe('deck_layout_create', { device: 'pedal', template: 'sample' });
  assert.equal(noSample.error.code, 'no_sample');
  const invalid = await c.callSafe('deck_layout_create', { layout: { device: 'mk2', pages: [{ id: 'a', keys: [{ col: 9, row: 0, look: { glyph: 'mic' } }] }] } });
  assert.equal(invalid.error.code, 'invalid_layout');
  assert.equal(invalid.error.data.errors[0].code, 'out_of_range');
  const list = await c.call('deck_layout_list', {});
  assert.equal(list.total, 3, 'the invalid import was not saved');
  const plusOnly = await c.call('deck_layout_list', { device: 'streamdeck-plus' });
  assert.deepEqual(plusOnly.items.map((x) => x.layoutId), [sample.layoutId]);
});

test('deck_layout_update: keys, spans, dials (feedback · press · rotate), screens, pages — revisioned, all or nothing', async (t) => {
  const c = await ready(t); if (!c) return;
  const { layoutId } = await c.call('deck_layout_create', { device: 'galleon', name: 'G' });
  const r = await c.call('deck_layout_update', {
    layoutId, baseRevision: 1, ops: [
      { op: 'set_key', col: 0, row: 0, look: { glyph: 'mic', title: 'Mic', fg: '#ffffff' }, behavior: { kind: 'prism.toggle' } },
      { op: 'set_key', col: 1, row: 0, look: { facet: 'app-cpu-ring', theme: 'paper' }, behavior: { kind: 'prism.app', app: 'sysmon' } },
      { op: 'place_span', facet: 'span-waveform', at: { col: 0, row: 1 }, rows: 1, params: { speed: 1.5 } },
      { op: 'set_dial', dial: 0, layer: 0, feedback: { facet: 'dial-volume', params: { label: 'Mix' } }, rotate: { step: 0.05, value: 0.4 }, press: { kind: 'prism.toggle' }, touch: 'swipe' },
      { op: 'add_page', id: 'studio', name: 'Studio' },
      { op: 'set_key', page: 'studio', col: 2, row: 3, look: { glyph: 'clock' }, behavior: { kind: 'prism.page', page: 'home' } },
      { op: 'set_key', col: 2, row: 0, look: { title: 'More' }, behavior: { kind: 'prism.page', page: 'studio' } },
    ],
  });
  assert.equal(r.revision, 2);
  assert.equal(r.applied, 7);
  assert.equal(r.validation.ok, true, JSON.stringify(r.validation.errors));
  const home = r.layout.pages[0];
  assert.equal(home.keys.filter((k) => k.look.facet === 'span-waveform').length, 3, 'span across the 3 keys of row 1');
  const d0 = home.dials[0];
  assert.deepEqual(d0.feedback.params, { label: 'Mix', step: 0.05 });
  assert.equal(d0.feedback.value, 40);
  assert.equal(d0.behavior.kind, 'prism.toggle');
  assert.ok(codes(r.warnings).includes('touch_follows_press'));
  assert.ok(codes(r.validation.warnings).includes('ignored_field'), 'fg/bg ignored with a warning');
  assert.ok(r.validation.review.some((x) => /prism\.page/.test(x.reason)), 'page links are live-only on export');
  // merge semantics: a second set_key keeps the look's other fields
  const m = await c.call('deck_layout_update', { layoutId, ops: [{ op: 'set_key', col: 0, row: 0, look: { state: 1 } }, { op: 'place_screen', facet: 'screen-galleon-dashboard', group: 'C' }] });
  const k00 = m.layout.pages[0].keys.find((k) => k.col === 0 && k.row === 0);
  assert.deepEqual([k00.look.glyph, k00.look.state, k00.look.title], ['mic', 1, 'Mic']);
  const widgets = m.layout.pages[0].dials.filter((d) => d.feedback.facet === 'screen-galleon-dashboard');
  assert.equal(widgets.length, 4, 'Galleon: 2 dials × 2 layers');
  assert.ok(widgets.every((d) => d.group === 'C'));
  // stale revision
  const stale = await c.callSafe('deck_layout_update', { layoutId, baseRevision: 1, ops: [{ op: 'clear_key', col: 0, row: 0 }] });
  assert.equal(stale.error.code, 'revision_conflict');
  assert.equal(stale.error.data.revision, 3);
  // an op batch that ends invalid saves nothing
  const oob = await c.callSafe('deck_layout_update', { layoutId, ops: [{ op: 'clear_key', col: 0, row: 0 }, { op: 'set_dial', dial: 0, layer: 2, feedback: { title: 'x' } }] });
  assert.equal(oob.error.code, 'invalid_layout');
  assert.equal(oob.error.data.errors[0].code, 'invalid_layer');
  assert.equal((await c.call('deck_layout_get', { layoutId })).revision, 3);
  const bogus = await c.callSafe('deck_layout_update', { layoutId, ops: [{ op: 'explode' }] });
  assert.equal(bogus.error.code, 'invalid_ops');
  const wrongFit = await c.callSafe('deck_layout_update', { layoutId, ops: [{ op: 'place_screen', facet: 'icon-mic' }] });
  assert.equal(wrongFit.error.code, 'facet_does_not_fit');
  const draft = await c.call('deck_layout_update', { layoutId, allowInvalid: true, ops: [{ op: 'set_key', col: 7, row: 0, look: { glyph: 'mic' } }] });
  assert.equal(draft.validation.ok, false);
  assert.equal(draft.revision, 4);
  const page = await c.call('deck_layout_get', { layoutId, page: 'studio' });
  assert.deepEqual(page.layout.pages.map((p) => p.id), ['studio']);
});

test('deck_layout_validate: geometry, slot fit, behavior safety (review vs live), spans and screens', async (t) => {
  const c = await ready(t); if (!c) return;
  const v = (layout, live = false) => c.call('deck_layout_validate', { layout, live });
  const base = (device, page) => ({ schema: LAYOUT_SCHEMA, device, pages: [{ id: 'p', keys: [], dials: [], ...page }] });
  const native = base('plus', { keys: [{ col: 0, row: 0, look: { glyph: 'mic' }, behavior: { kind: 'native', uuid: 'com.elgato.streamdeck.system.hotkey', settings: {} } }] });
  const off = await v(native);
  assert.equal(off.ok, true);
  assert.ok(off.review.some((x) => /keystrokes/.test(x.reason)), 'export-only actions go to review');
  const live = await v(native, true);
  assert.equal(live.ok, false);
  assert.deepEqual(codes(live.errors), ['requires_export']);
  const deep = await v(base('plus', { keys: [{ col: 0, row: 0, look: { glyph: 'mic' }, behavior: { kind: 'native', uuid: 'x.y', settings: { url: 'streamdeck://plugins/uninstall' } } }] }));
  assert.deepEqual(codes(deep.errors), ['forbidden_behavior']);
  const mcp = await v(base('mcp-deck', { dials: [{ dial: 0, feedback: { title: 'x' } }] }));
  assert.deepEqual(codes(mcp.errors), ['no_dials'], 'the MCP Deck has no dials');
  const fit = await v(base('mk2', { keys: [{ col: 0, row: 0, look: { facet: 'dial-volume' } }] }));
  assert.deepEqual(codes(fit.errors), ['facet_does_not_fit']);
  const keyOnDial = await v(base('plus', { dials: [{ dial: 1, feedback: { facet: 'icon-mic' } }] }));
  assert.equal(keyOnDial.ok, true);
  assert.ok(keyOnDial.review.some((x) => x.reason === 'key art on a dial'));
  const span = await v(base('xl-2022', { keys: [{ col: 0, row: 0, look: { facet: 'span-waveform' } }, { col: 2, row: 0, look: { facet: 'span-waveform' } }] }));
  assert.ok(codes(span.warnings).includes('span_incomplete'));
  const screen = await v(base('galleon', { dials: [{ dial: 0, layer: 0, feedback: { facet: 'screen-galleon-dashboard' } }] }));
  assert.ok(codes(screen.warnings).includes('screen_incomplete'));
  assert.ok(codes(screen.warnings).includes('galleon_layers'));
  const infobar = await v(base('plus', { infobar: { facet: 'screen-neo-clock' } }));
  assert.deepEqual(codes(infobar.errors), ['no_infobar']);
  const neo = await v(base('neo', { infobar: { facet: 'screen-neo-clock' } }));
  assert.equal(neo.ok, true);
  const unknown = await v(base('plus', { keys: [{ col: 0, row: 0, look: { facet: 'icon-nope' } }, { col: 1, row: 0, look: { glyph: 'mic', params: { nope: 1 } } }] }));
  assert.ok(codes(unknown.errors).includes('unknown_facet'));
  assert.ok(codes(unknown.warnings).includes('unknown_param'));
  assert.deepEqual(codes((await v({ device: 'nope', pages: [] })).errors), ['unknown_device']);
  assert.equal(off.stats.device.id, 'plus');
});

test('retarget reflows to another device and reports what was dropped', async (t) => {
  const c = await ready(t); if (!c) return;
  const { layoutId } = await c.call('deck_layout_create', { device: 'galleon', template: 'sample' });
  const r = await c.call('deck_layout_update', { layoutId, ops: [{ op: 'retarget', device: 'streamdeck-plus' }] });
  assert.equal(r.layout.device, 'plus');
  assert.ok(r.dropped.some((d) => d.key === '0,3'), 'Galleon row 3 is gone on a 4×2 deck');
  assert.ok(r.dropped.some((d) => d.dial === '0,1'), 'the + has one layer');
  assert.ok(r.layout.pages.every((p) => p.keys.every((k) => k.col < 4 && k.row < 2)));
});

test('DeckLayoutStore persists to disk atomically and reloads; delete', async (t) => {
  const e = await engine();
  if (!e.available) return t.skip('prism-deck engine not found');
  const s = scratch();
  t.after(s.cleanup);
  const file = s.file('deck-layouts.json');
  const a = new DeckLayoutStore({ filePath: file, logger: silent });
  const c = await deckCtx({ layouts: a });
  const { layoutId } = await c.call('deck_layout_create', { device: 'mk2', template: 'sample' });
  assert.ok(fs.existsSync(file) && !fs.existsSync(`${file}.tmp`));
  const b = new DeckLayoutStore({ filePath: file, logger: silent });
  assert.equal(b.get(layoutId).layout.device, 'mk2');
  const del = await c.call('deck_layout_delete', { layoutId });
  assert.equal(del.deleted, true);
  assert.equal(new DeckLayoutStore({ filePath: file, logger: silent }).list().length, 0);
  const miss = await c.callSafe('deck_layout_get', { layoutId });
  assert.equal(miss.error.code, 'not_found');
});

test('deck_render (layout): the whole Galleon panel composited from a sample layout, or one key / dial', async (t) => {
  const c = await ready(t); if (!c) return;
  const { layoutId } = await c.call('deck_layout_create', { device: 'galleon', template: 'sample' });
  const r = await c.call('deck_render', { layoutId, scale: 0.25 });
  assert.equal(r.device, 'galleon');
  assert.deepEqual([r.w, r.h], [720, 1280]);
  assert.equal(r.slots, 16, '12 keys + 4 screen widgets');
  assert.deepEqual([r.png.width, r.png.height], [180, 320]);
  assert.equal(r[MCP_CONTENT][0].mimeType, 'image/png');
  const key = await c.call('deck_render', { layoutId, target: { kind: 'key', col: 1, row: 0 }, format: 'svg' });
  assert.deepEqual([key.w, key.h, key.slots], [160, 160, 1]);
  const dial = await c.call('deck_render', { layoutId, target: { kind: 'dial', dial: 1, layer: 1 }, format: 'svg' });
  assert.deepEqual([dial.w, dial.h], [360, 192]);
  const page2 = await c.call('deck_render', { layoutId, page: 'studio', format: 'svg' });
  assert.equal(page2.page, 'studio');
  const inline = await c.call('deck_render', { layout: { device: 'mcp-deck', pages: [{ id: 'a', keys: [{ col: 0, row: 0, look: { title: 'Hi' } }] }] }, format: 'svg' });
  assert.match(inline.note, /app-defined grid/);
  const nokey = await c.callSafe('deck_render', { layoutId, target: { kind: 'key', col: 5, row: 0 } });
  assert.equal(nokey.error.code, 'out_of_range');
});

test('deck_export_profile: a valid .streamDeckProfile written only where asked; refusals', async (t) => {
  const c = await ready(t); if (!c) return;
  const s = scratch();
  t.after(s.cleanup);
  const e = await engine();
  const { layoutId } = await c.call('deck_layout_create', { device: 'galleon', template: 'sample' });
  await c.call('deck_layout_update', { layoutId, ops: [{ op: 'set_key', col: 0, row: 0, look: { title: 'Only text' }, replace: true }, { op: 'set_key', col: 1, row: 0, look: { glyph: 'mic' }, behavior: { kind: 'native', uuid: 'com.elgato.streamdeck.system.hotkey' } }] });
  const r = await c.call('deck_export_profile', { layoutId, outPath: s.dir, name: 'Prism · Test' });
  assert.equal(r.format, 'streamDeckProfile');
  assert.equal(path.dirname(r.path), s.dir);
  assert.ok(r.path.endsWith('.streamDeckProfile'));
  assert.equal(r.deviceModel, 'GRETSCH');
  assert.deepEqual(r.requiredPlugins, ['com.jeremyfhall.prism']);
  assert.deepEqual(r.problems, []);
  const buf = fs.readFileSync(r.path);
  assert.equal(buf.length, r.bytes);
  assert.deepEqual(e.mods.profile.checkProfile(buf), []);
  assert.ok(r.skipped.some((x) => x.key === '0,0'), 'title-only key is live-only');
  assert.ok(r.review.some((x) => /keystrokes/.test(x.reason)), 'native actions are listed for review');
  assert.match(r.install, /double-click/);
  const again = await c.callSafe('deck_export_profile', { layoutId, outPath: r.path });
  assert.equal(again.error.code, 'exists');
  assert.equal((await c.call('deck_export_profile', { layoutId, outPath: r.path, overwrite: true })).path, r.path);
  const rel = await c.callSafe('deck_export_profile', { layoutId, outPath: 'out/profile.streamDeckProfile' });
  assert.equal(rel.error.code, 'invalid_argument');
  const ext = await c.callSafe('deck_export_profile', { layoutId, outPath: path.join(s.dir, 'x.zip') });
  assert.equal(ext.error.code, 'invalid_argument');
  fs.mkdirSync(path.join(s.dir, 'com.example.thing.sdPlugin'));
  const plug = await c.callSafe('deck_export_profile', { layoutId, outPath: path.join(s.dir, 'com.example.thing.sdPlugin') });
  assert.equal(plug.error.code, 'forbidden_path');
  const app = await c.callSafe('deck_export_profile', { layoutId, outPath: path.join(s.dir, 'Elgato', 'StreamDeck', 'p.streamDeckProfile') });
  assert.equal(app.error.code, 'forbidden_path');
  const noDir = await c.callSafe('deck_export_profile', { layoutId, outPath: path.join(s.dir, 'missing', 'p.streamDeckProfile') });
  assert.equal(noDir.error.code, 'invalid_argument');
  const mobile = await c.callSafe('deck_export_profile', { layout: { device: 'mobile', pages: [{ id: 'a', keys: [{ col: 0, row: 0, look: { glyph: 'mic' } }] }] }, outPath: s.dir });
  assert.equal(mobile.error.code, 'unsupported_device');
  assert.deepEqual(fs.readdirSync(s.dir).sort(), ['Prism · Test.streamDeckProfile', 'com.example.thing.sdPlugin'], 'nothing else was written');
});

test('deck_export_iconpack: a theme pack (subset) passes the icon-pack check; refusals', async (t) => {
  const c = await ready(t); if (!c) return;
  const s = scratch();
  t.after(s.cleanup);
  const e = await engine();
  const svg = await c.call('deck_export_iconpack', { theme: 'paper', glyphs: ['mic', 'clock'], svgOnly: true, outPath: s.dir });
  assert.equal(svg.id, 'com.jeremyfhall.prism.icons.paper');
  assert.ok(svg.path.endsWith('com.jeremyfhall.prism.icons.paper.streamDeckIconPack'));
  assert.equal(svg.stats.gif, 0);
  assert.ok(svg.icons >= 4, 'glyph × states × modes');
  assert.deepEqual(e.mods.iconpack.checkIconPack(fs.readFileSync(svg.path)), []);
  const gif = await c.call('deck_export_iconpack', { theme: 'prism', glyphs: ['mic'], outPath: path.join(s.dir, 'prism-subset.streamDeckIconPack') });
  assert.ok(gif.stats.gif >= 1 && gif.stats.png >= 1, 'animated glyphs become GIF + PNG twin');
  assert.deepEqual(gif.problems, []);
  assert.equal((await c.callSafe('deck_export_iconpack', { theme: 'chartreuse', outPath: s.dir })).error.code, 'unknown_theme');
  assert.equal((await c.callSafe('deck_export_iconpack', { theme: 'prism', glyphs: ['nope'], outPath: s.dir })).error.code, 'unknown_glyph');
});
