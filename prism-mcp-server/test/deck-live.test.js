// Prism Deck LIVE tools against a fake control channel: the plugin's REAL control
// channel code (prism-deck/src/plugin/control.js, LiveController) driven by a fake
// plugin runtime (three devices: Galleon 100 SD, Stream Deck +, MCP Deck), plus a raw
// fake HTTP server for header and timeout checks. Every discovery file lives in a
// scratch dir: these tests never read the user's real control.json and never talk to
// the Stream Deck app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DeckControlClient, defaultControlPath, readControl } from '../utils/deck-control-client.js';
import { classifyBehavior } from '../tools/deck-live.js';
import { PrismMCPServer, INSTRUCTIONS } from '../index.js';
import { DeckCatalogStore, DECK_ISLAND_OPEN } from '../utils/deck-catalog.js';
import { spawn } from 'node:child_process';
import { FIXTURE } from './fixture.js';
import { deckCtx, scratch, engine, DECK_FIXTURE } from './deck-helper.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(HERE, '..');
const CONTROL_JS = path.resolve(SERVER, '..', 'prism-deck', 'src', 'plugin', 'control.js');
const TOKEN = 'ab'.repeat(32);

/** A stand-in for the plugin runtime (src/plugin/runtime.js) with the hooks LiveController uses. */
class FakeRuntime extends EventEmitter {
  constructor(core, { physical = true } = {}) {
    super();
    const dev = (id, model, name, type, virtual = false) => ({ id, name, type, model: core.getDevice(model), connected: true, virtual });
    this.globals = { aiEditing: false };
    this.devices = new Map([['dev-galleon', dev('dev-galleon', 'galleon', 'Galleon 100 SD', 12)], ['dev-plus', dev('dev-plus', 'plus', 'Stream Deck +', 7)], ['dev-mcp', dev('dev-mcp', 'mcp', 'MCP Deck', 14, true)]]);
    this.overlays = new Map();
    this.prompts = [];
    this.physical = physical;
  }
  liveDevices() {
    return [...this.devices.values()].map((d) => {
      const m = d.model, keys = [], dials = [];
      for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) keys.push({ col: c, row: r });
      for (let i = 0; i < (m.dials?.count || 0); i++) for (let l = 0; l < (m.dials?.layers || 1); l++) dials.push({ dial: i, layer: l });
      return { id: d.id, type: d.type, name: d.name, model: m.id, size: { columns: m.cols, rows: m.rows }, dials: m.dials?.count || 0, layers: m.dials?.layers || (m.dials?.count ? 1 : 0), virtual: d.virtual, connected: true, prismKeys: keys, prismDials: dials };
    });
  }
  setOverlays(id, { keys, dials }) { this.overlays.set(id, { keys: new Map(keys), dials: new Map(dials) }); }
  clearAllOverlays() { this.overlays.clear(); }
  currentSvg() { return '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'; }
  setPrompt(p) { this.prompts.push(p); return p ? (this.physical ? 1 : 0) : 0; }
  sendPiState() {}
  /** The user presses the glowing approval key on a physical deck. */
  press() { this.emit('pair-press', { context: 'k', device: 'dev-galleon' }); }
}

async function harness(t, { limits, physical = true } = {}) {
  const e = await engine();
  if (!e.available || !fs.existsSync(CONTROL_JS)) { t.skip('prism-deck plugin control channel not found'); return null; }
  const { LiveController } = await import(pathToFileURL(CONTROL_JS).href);
  const s = scratch('prism-mcp-live-');
  const controlPath = s.file('control.json');
  const rt = new FakeRuntime(e.mods.core, { physical });
  const ctrl = new LiveController({ runtime: rt, controlFile: controlPath, version: '0.3.0-test', limits, log: () => {} });
  const c = await deckCtx({ controlPath, clientName: 'test-client' });
  t.after(async () => { await ctrl.stop('test end'); s.cleanup(); });
  return {
    e, rt, ctrl, c, s, controlPath,
    async on() { rt.globals = { ...rt.globals, aiEditing: true }; await ctrl.start(); },
    async off() { rt.globals = { ...rt.globals, aiEditing: false }; await ctrl.stop('switched off'); },
    async pair() { const p = await c.call('deck_live_pair', {}); rt.press(); return p; },
  };
}

// ---------------------------------------------------------------- unreachable

test('channel off (no control.json): status says unreachable, never throws; writes say unreachable with the hint', async (t) => {
  const s = scratch('prism-mcp-live-');
  t.after(s.cleanup);
  const c = await deckCtx({ controlPath: s.file('control.json') });
  const st = await c.call('deck_live_status');
  assert.equal(st.reachable, false);
  assert.match(st.reason, /Allow AI editing/);
  assert.match(st.hint, /Do not try to enable it/);
  assert.equal(st.controlPath, s.file('control.json'));
  for (const [name, args] of [['deck_live_pair', {}], ['deck_live_set_key', { deviceId: 'd', col: 0, row: 0, look: { glyph: 'mic' } }], ['deck_live_undo', { deviceId: 'd' }], ['deck_live_snapshot', { deviceId: 'd' }]]) {
    const r = await c.callSafe(name, args);
    assert.equal(r.error.code, 'unreachable', name);
    assert.match(r.error.data.hint, /Allow AI editing/, name);
  }
  assert.deepEqual(fs.readdirSync(s.dir), [], 'the server never creates the control file');
});

test('control.json shape checks: malformed, wrong API, wrong plugin, stale port → unreachable (token never surfaces)', async (t) => {
  const s = scratch('prism-mcp-live-');
  t.after(s.cleanup);
  const file = s.file('control.json');
  const c = await deckCtx({ controlPath: file, timeoutMs: 1500 });
  const status = async () => c.call('deck_live_status');
  fs.writeFileSync(file, '{nope');
  assert.match((await status()).reason, /not valid JSON/);
  fs.writeFileSync(file, JSON.stringify({ v: 2, port: 1234, token: TOKEN }));
  assert.match((await status()).reason, /unsupported shape/);
  fs.writeFileSync(file, JSON.stringify({ v: 1, port: 1234, token: 'short' }));
  assert.match((await status()).reason, /unsupported shape/);
  fs.writeFileSync(file, JSON.stringify({ v: 1, port: 1234, token: TOKEN, plugin: 'com.example.other' }));
  assert.match((await status()).reason, /not com\.jeremyfhall\.prism/);
  // a port nobody listens on (a stale file from a crashed plugin)
  const srv = http.createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  await new Promise((r) => srv.close(r));
  fs.writeFileSync(file, JSON.stringify({ v: 1, port, token: TOKEN, plugin: 'com.jeremyfhall.prism' }));
  const stale = await status();
  assert.equal(stale.reachable, false);
  assert.equal(stale.code, 'unreachable');
  assert.ok(!JSON.stringify(stale).includes(TOKEN), 'the token is never echoed');
  assert.equal(readControl(file).port, port);
});

test('defaultControlPath follows the plugin (per user, never in the plugin folder; PRISM_DECK_CONTROL overrides)', () => {
  assert.equal(defaultControlPath({ env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, platform: 'win32', home: 'C:\\Users\\u' }), path.join('C:\\Users\\u\\AppData\\Roaming', 'Prism', 'deck', 'control.json'));
  assert.equal(defaultControlPath({ env: {}, platform: 'darwin', home: '/Users/u' }), path.join('/Users/u', 'Library', 'Application Support', 'Prism', 'deck', 'control.json'));
  assert.equal(defaultControlPath({ env: { XDG_STATE_HOME: '/s' }, platform: 'linux', home: '/home/u' }), path.join('/s', 'prism', 'deck', 'control.json'));
  assert.equal(defaultControlPath({ env: { PRISM_DECK_CONTROL: 'x/c.json' } }), path.resolve('x/c.json'));
});

test('the client speaks the channel rules: 127.0.0.1, exact Host, Bearer token, no Origin, JSON bodies; timeouts → unreachable', async (t) => {
  const s = scratch('prism-mcp-live-');
  const seen = [];
  let hang = false;
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body, remote: req.socket.remoteAddress });
      if (hang) return; // never answer
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, applied: 1, revision: 1, warnings: [] }));
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(async () => { srv.closeAllConnections?.(); await new Promise((r) => srv.close(r)); s.cleanup(); });
  const port = srv.address().port;
  fs.writeFileSync(s.file('control.json'), JSON.stringify({ v: 1, port, token: TOKEN, plugin: 'com.jeremyfhall.prism', version: '0.3.0' }));
  const client = new DeckControlClient({ controlPath: s.file('control.json'), timeoutMs: 300 });
  await client.ops('dev-1', [{ op: 'clear_key', col: 0, row: 0 }], true);
  await client.snapshot('dev 1', true);
  const [post, get] = seen;
  assert.equal(post.headers.host, `127.0.0.1:${port}`);
  assert.equal(post.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(post.headers.origin, undefined);
  assert.match(post.headers['content-type'], /^application\/json/);
  assert.deepEqual(JSON.parse(post.body), { deviceId: 'dev-1', ops: [{ op: 'clear_key', col: 0, row: 0 }], dryRun: true });
  assert.match(post.remote, /127\.0\.0\.1$/);
  assert.equal(get.url, '/v1/snapshot?deviceId=dev%201&render=1');
  assert.equal(get.headers['content-type'], undefined);
  hang = true;
  const c = await deckCtx({ controlPath: s.file('control.json'), timeoutMs: 300 });
  const r = await c.callSafe('deck_live_undo', { deviceId: 'dev-1' });
  assert.equal(r.error.code, 'unreachable');
  const huge = await client.request('POST', '/v1/ops', { pad: 'x'.repeat(2 * 1024 * 1024 + 10) }).catch((e) => e);
  assert.equal(huge.code, 'too_large', 'bodies over 2 MB are refused before sending');
});

// ---------------------------------------------------------------- against the plugin's real channel code

test('live flow: status → pairing by a physical key press (pairing rate limit) → key / dial / batch edits → safety → apply → snapshot → undo → off', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { c, rt, ctrl } = h;
  await h.on();
  assert.ok(fs.existsSync(h.controlPath), 'the plugin wrote the discovery file');
  let st = await c.call('deck_live_status');
  assert.equal(st.reachable, true);
  assert.equal(st.plugin, 'com.jeremyfhall.prism');
  assert.equal(st.aiEditing, true);
  assert.equal(st.paired, false);
  assert.deepEqual(st.devices.map((d) => [d.id, d.type, d.model]), [['dev-galleon', 12, 'galleon'], ['dev-plus', 7, 'plus'], ['dev-mcp', 14, 'mcp']]);
  assert.equal(st.devices[0].layers, 2);
  assert.ok(st.devices[0].prismDials.includes('1,1'));
  assert.equal(st.next, 'deck_live_pair');
  // writes are refused until the user approves on the deck
  let r = await c.callSafe('deck_live_set_key', { deviceId: 'dev-plus', col: 0, row: 0, look: { glyph: 'mic' } });
  assert.equal(r.error.code, 'not_paired');
  assert.match(r.error.data.hint, /deck_live_pair/);
  // pairing
  const p = await c.call('deck_live_pair', {});
  assert.equal(p.status, 'pending');
  assert.match(p.code, /^\d{4}$/);
  assert.match(p.tellUser, new RegExp(p.code));
  assert.equal(rt.prompts.at(-1).client, 'test-client via Prism MCP', 'the deck shows the MCP client name');
  const again = await c.callSafe('deck_live_pair', {});
  assert.equal(again.error.code, 'rate_limited', 'one pairing request every few seconds');
  assert.ok(again.error.data.retryAfterMs > 0);
  assert.equal((await c.call('deck_live_pair', { pairingId: p.pairingId })).status, 'pending', 'the AI cannot approve itself');
  rt.press();
  assert.equal((await c.call('deck_live_pair', { pairingId: p.pairingId })).status, 'approved');
  st = await c.call('deck_live_status');
  assert.equal(st.paired, true);
  // one key: facet/glyph + params, fg/bg ignored with a warning
  r = await c.call('deck_live_set_key', { deviceId: 'dev-plus', col: 0, row: 0, look: { glyph: 'mic', title: 'Mic', fg: '#ffffff' }, behavior: { kind: 'prism.toggle' } });
  assert.equal(r.applied, 1);
  assert.ok(r.warnings.some((w) => w.code === 'ignored_field'));
  assert.equal(rt.overlays.get('dev-plus').keys.get('0,0').facet, 'icon-mic');
  // safety: native and deep links never leave the server
  const auditBefore = ctrl.audit.length;
  r = await c.callSafe('deck_live_set_key', { deviceId: 'dev-plus', col: 1, row: 0, look: { title: 'Mute' }, behavior: { kind: 'native', uuid: 'com.elgato.streamdeck.system.hotkey', settings: {} } });
  assert.equal(r.error.code, 'requires_export');
  assert.match(r.error.data.hint, /deck_export_profile/);
  r = await c.callSafe('deck_live_set_key', { deviceId: 'dev-plus', col: 1, row: 0, look: { title: 'x' }, behavior: { kind: 'prism.app', app: 'clock', params: { u: 'streamdeck://plugins/install/x' } } });
  assert.equal(r.error.code, 'forbidden_behavior');
  assert.equal(ctrl.audit.length, auditBefore, 'nothing reached the plugin');
  // the plugin validates too: unknown glyphs, geometry, the MCP Deck has no dials
  r = await c.callSafe('deck_live_set_key', { deviceId: 'dev-plus', col: 0, row: 0, look: { glyph: 'nope' } });
  assert.equal(r.error.code, 'invalid_ops');
  assert.equal(r.error.data.errors[0].code, 'unknown_glyph');
  r = await c.callSafe('deck_live_set_key', { deviceId: 'dev-plus', col: 4, row: 0, look: { glyph: 'mic' } });
  assert.equal(r.error.data.errors[0].code, 'out_of_range');
  r = await c.callSafe('deck_live_set_dial', { deviceId: 'dev-mcp', dial: 0, feedback: { title: 'x' } });
  assert.equal(r.error.data.errors[0].code, 'no_dials');
  r = await c.callSafe('deck_live_set_key', { deviceId: 'dev-ghost', col: 0, row: 0, look: { glyph: 'mic' } });
  assert.equal(r.error.code, 'unknown_device');
  // a knob: Galleon dial 1, layer 1 — feedback, press and rotate
  r = await c.call('deck_live_set_dial', { deviceId: 'dev-galleon', dial: 1, layer: 1, feedback: { facet: 'dial-volume', params: { label: 'Mix' } }, rotate: { step: 0.04, value: 0.5 }, press: { kind: 'prism.toggle' } });
  assert.equal(r.applied, 1);
  const dv = rt.overlays.get('dev-galleon').dials.get('1,1');
  assert.deepEqual([dv.facet, dv.params.step, dv.params.label, dv.value, dv.behavior.kind], ['dial-volume', 0.04, 'Mix', 0.5, 'prism.toggle']);
  // batch (dry run first)
  const ops = [{ op: 'set_key', col: 1, row: 0, look: { facet: 'app-cpu-ring' }, behavior: { kind: 'prism.app', app: 'sysmon' } }, { op: 'set_key', col: 2, row: 0, look: { glyph: 'clock' } }, { op: 'set_dial', dial: 0, feedback: { title: 'Gain', value: 75 } }];
  r = await c.call('deck_live_batch', { deviceId: 'dev-plus', ops, dryRun: true });
  assert.deepEqual([r.dryRun, r.wouldApply], [true, 3]);
  assert.equal(rt.overlays.get('dev-plus').keys.size, 1, 'dry run changes nothing');
  r = await c.call('deck_live_batch', { deviceId: 'dev-plus', ops });
  assert.equal(r.applied, 3);
  // a whole layout page (stored), dry run → apply → second apply rate-limited → wrong device refused
  const { layoutId } = await c.call('deck_layout_create', { device: 'galleon-100-sd', template: 'sample' });
  r = await c.call('deck_live_apply_layout', { deviceId: 'dev-galleon', layoutId, dryRun: true });
  assert.equal(r.dryRun, true);
  assert.equal(r.diff.keysSet, 12);
  assert.equal(r.diff.dialsSet, 4, 'the 4 Galleon widgets (incl. the knob edited above)');
  r = await c.call('deck_live_apply_layout', { deviceId: 'dev-galleon', layoutId });
  assert.equal(r.applied, true);
  assert.equal(rt.overlays.get('dev-galleon').keys.size, 12);
  assert.equal(rt.overlays.get('dev-galleon').dials.get('0,1').facet, 'screen-galleon-dashboard');
  r = await c.callSafe('deck_live_apply_layout', { deviceId: 'dev-galleon', layoutId });
  assert.equal(r.error.code, 'rate_limited');
  assert.ok(r.error.data.retryAfterMs > 0);
  r = await c.callSafe('deck_live_apply_layout', { deviceId: 'dev-plus', layoutId });
  assert.equal(r.error.code, 'device_mismatch');
  const nativeLayout = { device: 'plus', pages: [{ id: 'a', keys: [{ col: 0, row: 0, look: { glyph: 'mic' }, behavior: { kind: 'native', uuid: 'com.elgato.streamdeck.system.website' } }] }] };
  r = await c.callSafe('deck_live_apply_layout', { deviceId: 'dev-plus', layout: nativeLayout });
  assert.equal(r.error.code, 'requires_export');
  // snapshot
  const snap = await c.call('deck_live_snapshot', { deviceId: 'dev-galleon' });
  assert.equal(snap.keys.filter((k) => k.live).length, 12);
  assert.equal(snap.page, 'home');
  const withSvg = await c.call('deck_live_snapshot', { deviceId: 'dev-plus', render: true });
  assert.match(withSvg.keys[0].svg, /^<svg/);
  // undo: the apply, then the dial edit, then nothing
  r = await c.call('deck_live_undo', { deviceId: 'dev-galleon' });
  assert.deepEqual([r.undone, r.remaining], [1, 1]);
  assert.equal(rt.overlays.get('dev-galleon').dials.get('1,1').facet, 'dial-volume', 'back to the knob edit');
  r = await c.call('deck_live_undo', { deviceId: 'dev-galleon', steps: 5 });
  assert.equal(r.undone, 1);
  r = await c.callSafe('deck_live_undo', { deviceId: 'dev-galleon' });
  assert.equal(r.error.code, 'nothing_to_undo');
  assert.ok(ctrl.audit.some((x) => x.kind === 'apply') && ctrl.audit.every((x) => !JSON.stringify(x).includes(ctrl.token || TOKEN)), 'audited, never the token');
  // switching AI editing off removes the file, revokes the pairing and every live edit
  await h.off();
  assert.equal(fs.existsSync(h.controlPath), false);
  assert.equal(rt.overlays.size, 0);
  st = await c.call('deck_live_status');
  assert.equal(st.reachable, false);
  await h.on();
  st = await c.call('deck_live_status');
  assert.equal(st.paired, false, 'a restart needs a new approval');
});

test('rate limits: the per-key bucket surfaces as rate_limited with retryAfterMs; other keys are unaffected', async (t) => {
  const h = await harness(t, { limits: { perKeyPerSec: 2, perDevicePerSec: 1000, requestsPerSec: 1000, requestBurst: 1000 } });
  if (!h) return;
  await h.on();
  await h.pair();
  const set = (col, i) => h.c.callSafe('deck_live_set_key', { deviceId: 'dev-plus', col, row: 1, look: { glyph: 'mic', title: `n${i}` } });
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await set(2, i));
  const limited = results.filter((x) => !x.ok && x.error.code === 'rate_limited');
  assert.ok(limited.length >= 2, `expected throttling, got ${limited.length}`);
  assert.ok(limited[0].error.data.retryAfterMs > 0);
  assert.match(limited[0].error.data.hint, /never animate by calling tools in a loop/);
  assert.equal((await set(3, 0)).ok, true);
});

test('pairing needs a Prism key on a PHYSICAL deck (409 no_physical_key); AI editing off → ai_editing_off', async (t) => {
  const h = await harness(t, { physical: false });
  if (!h) return;
  await h.on();
  const r = await h.c.callSafe('deck_live_pair', {});
  assert.equal(r.error.code, 'no_physical_key');
  assert.equal(r.error.data.status, 409);
  assert.match(r.error.data.hint, /physical/);
  h.rt.globals = { ...h.rt.globals, aiEditing: false }; // switched off but the listener not yet closed
  const off = await h.c.callSafe('deck_live_pair', {});
  assert.equal(off.error.code, 'ai_editing_off');
  assert.match(off.error.data.hint, /never try to enable it yourself/);
});

test('a stale token (plugin restarted elsewhere) → unauthorized; the token is re-read on every call', async (t) => {
  const h = await harness(t);
  if (!h) return;
  await h.on();
  const good = fs.readFileSync(h.controlPath, 'utf8');
  fs.writeFileSync(h.controlPath, JSON.stringify({ ...JSON.parse(good), token: TOKEN }));
  const r = await h.c.callSafe('deck_live_pair', {});
  assert.equal(r.error.code, 'unauthorized');
  assert.equal(r.error.data.status, 401);
  const st = await h.c.call('deck_live_status');
  assert.equal(st.reachable, false);
  assert.equal(st.code, 'unauthorized');
  fs.writeFileSync(h.controlPath, good);
  assert.equal((await h.c.call('deck_live_status')).reachable, true);
});

test('classifyBehavior mirrors the plugin: safe kinds live, native export-only, deep links / unknown forbidden', async (t) => {
  const cases = [
    [null, 'safe'], [{ kind: 'none' }, 'safe'], [{ kind: 'prism.toggle' }, 'safe'], [{ kind: 'prism.page', page: 'b' }, 'safe'], [{ kind: 'prism.app', app: 'spectrum' }, 'safe'],
    [{ kind: 'prism.page' }, 'forbidden'], [{ kind: 'prism.app', app: 'shell' }, 'forbidden'], [{ kind: 'exec' }, 'forbidden'], ['x', 'forbidden'],
    [{ kind: 'native', uuid: 'com.elgato.streamdeck.system.openapp' }, 'export-only'], [{ kind: 'native' }, 'forbidden'],
    [{ kind: 'native', uuid: 'com.x.y', settings: { nested: ['streamdeck://plugins/uninstall'] } }, 'forbidden'],
  ];
  for (const [b, want] of cases) assert.equal(classifyBehavior(b).class, want, JSON.stringify(b));
  const e = await engine();
  if (!e.available) return;
  for (const [b] of cases) assert.equal(classifyBehavior(b).class, e.mods.live.classifyBehavior(b).class, `same as live-validate: ${JSON.stringify(b)}`);
});

// ---------------------------------------------------------------- server level

test('server: instructions carry the Elgato coexistence rules; clientInfo names the pairing prompt', async (t) => {
  assert.match(INSTRUCTIONS, /streamdeck__get_executable_actions/);
  assert.match(INSTRUCTIONS, /streamdeck__execute_action/);
  assert.match(INSTRUCTIONS, /ALWAYS ask the user first/);
  assert.match(INSTRUCTIONS, /never try to enable it/);
  assert.match(INSTRUCTIONS, /never animate by calling tools in a loop/);
  const h = await harness(t);
  if (!h) return;
  await h.on();
  const s = new PrismMCPServer('(fixture)', { watch: false, logLevel: 'silent', collectionsInMemory: true, deck: new DeckCatalogStore({ raw: DECK_FIXTURE }), deckEngine: h.e, deckControlPath: h.controlPath });
  const init = await s.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'Claude Desktop', version: '1' } } });
  assert.match(init.result.instructions, /deck_live_pair/);
  const res = await s.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'deck_live_pair', arguments: {} } });
  assert.equal(res.result.isError, false, res.result.content[0].text);
  assert.equal(h.rt.prompts.at(-1).client, 'Claude Desktop via Prism MCP');
  const st = await s.handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'deck_live_status', arguments: {} } });
  assert.ok(JSON.parse(st.result.content[0].text).pendingPrompt.code);
});

test('the deck tools never reach the Stream Deck app, its WebSocket ports or Elgato\'s MCP pipe', () => {
  const files = ['index.js', 'tools/deck.js', 'tools/deck-live.js', 'utils/deck-control-client.js', 'utils/deck-catalog.js', 'utils/deck-engine.js', 'utils/deck-layouts.js', 'utils/deck-render.js'];
  for (const f of files) {
    const code = fs.readFileSync(path.join(SERVER, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    assert.ok(!/elgato-mcp-streamdeck|\\\\\.\\pipe|net\.(createConnection|connect)\(|ws:\/\/|new WebSocket|28196|23654|:9090/.test(code), `${f} must not reach the Stream Deck app`);
    assert.ok(!/child_process|\bspawn\(|\bexecFile\(|\bexecSync\(/.test(code), `${f} must not start processes`);
  }
  const client = fs.readFileSync(path.join(SERVER, 'utils/deck-control-client.js'), 'utf8');
  assert.match(client, /host: '127\.0\.0\.1'/, 'loopback only');
});

// ---------------------------------------------------------------- end to end over real stdio

/** Spawn `node cli.js start …` as a real stdio MCP child process. */
function spawnServer(args) {
  const child = spawn(process.execPath, [path.join(SERVER, 'cli.js'), 'start', ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PRISM_DECK_CONTROL: '' } });
  let buf = '', nextId = 1, stderr = '';
  const pending = new Map();
  child.stderr.on('data', (d) => { stderr += d; });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); p(msg); }
    }
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout waiting for ${method}; stderr: ${stderr}`)); }, 30_000);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const call = async (name, args = {}) => {
    const res = await rpc('tools/call', { name, arguments: args });
    return { isError: res.result.isError, body: JSON.parse(res.result.content[0].text), content: res.result.content };
  };
  const close = () => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    child.once('exit', (code) => resolve(code));
    child.stdin.end();
    setTimeout(() => { if (child.exitCode === null) child.kill(); }, 2000).unref();
  });
  return { child, rpc, call, close };
}

test('end to end over stdio: cli.js start → render a PNG → create a layout → pair (user press) → apply it live (dry run)', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const html = h.s.file('Prism.html');
  fs.writeFileSync(html, `<!doctype html><html><head><script type="application/json" id="prism-catalog">${JSON.stringify(FIXTURE)}</script>\n${DECK_ISLAND_OPEN}${JSON.stringify(DECK_FIXTURE)}</script></head><body></body></html>`);
  const srv = spawnServer(['--catalog', html, '--no-watch', '--log-level', 'silent', '--deck-control', h.controlPath, '--deck-layouts', h.s.file('layouts.json')]);
  t.after(() => srv.close());
  const init = await srv.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  assert.match(init.result.instructions, /streamdeck__execute_action/);
  const list = await srv.rpc('tools/list', {});
  assert.equal(list.result.tools.length, 58);
  let r = await srv.call('deck_live_status');
  assert.equal(r.body.reachable, false, 'AI editing still off');
  r = await srv.call('deck_render', { facet: 'icon-mic', device: 'plus' });
  assert.equal(r.isError, false, JSON.stringify(r.body));
  assert.equal(r.content[1].type, 'image');
  r = await srv.call('deck_layout_create', { device: 'galleon-100-sd', template: 'sample' });
  const { layoutId } = r.body;
  assert.ok(fs.existsSync(h.s.file('layouts.json')), 'stored where --deck-layouts says');
  await h.on();
  r = await srv.call('deck_live_pair', {});
  assert.equal(r.body.status, 'pending');
  assert.equal(h.rt.prompts.at(-1).client, 'e2e via Prism MCP');
  h.rt.press();
  r = await srv.call('deck_live_pair', { pairingId: r.body.pairingId });
  assert.equal(r.body.status, 'approved');
  r = await srv.call('deck_live_apply_layout', { deviceId: 'dev-galleon', layoutId, dryRun: true });
  assert.equal(r.isError, false, JSON.stringify(r.body));
  assert.equal(r.body.diff.keysSet, 12);
  assert.equal(await srv.close(), 0, 'the server exits when stdin closes');
});
