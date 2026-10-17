// Prism Control SMART DECK tools against a fake "smart" pipe: a real Windows named-pipe server (node:net) that speaks
// Prism Control's wire format (u32 LE length + UTF-8 JSON; hello { v, token, client } then { id, op, args }), checks
// the token like PipeEndpoint does (a wrong one is dropped unseen), and keeps a small in-memory model of the
// preferences, pins, overrides, pairing and undo stack. The discovery file lives in a scratch dir: these tests never
// read the user's real ingress.json and never talk to Prism Control or the Stream Deck app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { buildTools, ToolError } from '../tools/index.js';
import { SmartPipeClient, defaultIngressPath, readIngress } from '../utils/smart-pipe-client.js';
import { PrismMCPServer } from '../index.js';
import { createLogger } from '../utils/logger.js';

const IS_WIN = process.platform === 'win32';
const silent = createLogger('silent');

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-mcp-smart-'));
  return { dir, file: (n) => path.join(dir, n), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const frame = (o) => { const b = Buffer.from(JSON.stringify(o)); const h = Buffer.alloc(4); h.writeUInt32LE(b.length); return Buffer.concat([h, b]); };

/** A fake Prism Control smart pipe with the real operations' rules (gating, validation, undo, audit). */
async function fakeSmart(t, { pipeName, token = crypto.randomBytes(32).toString('hex'), allowAi = true, silentOps = [] } = {}) {
  const pipe = pipeName || `prism-control-smart-${crypto.randomBytes(16).toString('hex')}`;
  const state = {
    allowAi, paired: false, client: null, pending: null, requests: [], sessions: 0, rejected: 0, hellos: [], secret: null, secretsSeen: [],
    prefs: { enabled: true, labelSize: 'normal', bigIcons: false, streamerSafe: false, paging: 'more-key', dialCategories: {}, appDebounceMs: 150, apps: {} },
    overrides: {}, undo: [], audit: [],
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fail = (code, message, data) => { const e = new Error(message); e.code = code; e.data = data; throw e; };
  const PACKS = { vscode: { verbs: ['edit.undo', 'general.commandPalette'], controls: ['editorScroll'], contexts: ['editor'] } };
  // Like Prism Control (smart-fix B3): unpaired callers get a minimal status; the approval creates a secret that the first
  // poll hands out once and every gated call must carry.
  const holds = (a) => state.paired && state.secret && a.pairingSecret === state.secret;
  const ops = {
    status: (a) => holds(a)
      ? { api: 1, allowAi: state.allowAi, paired: true, pairingPending: !!state.pending, client: state.client,
        engine: { app: 'Code.exe', pack: 'vscode', context: 'editor' }, devices: [{ id: 'dev-galleon', kind: 'galleon-100-sd', physical: true, canApprove: true, smartKeys: 11, smartDials: 3 }, { id: 'dev-mcp', kind: 'generic-8x4', physical: false, canApprove: false, smartKeys: 32, smartDials: 0 }], undoDepth: state.undo.length,
        pendingApprovals: Object.entries(state.overrides).flatMap(([pack, items]) => items.filter((i) => i.set.binding && !i.approved).map((i) => ({ pack, verb: i.id, chord: i.set.binding.chord, status: 'pending your approval on the deck' }))) }
      : { api: 1, allowAi: state.allowAi, paired: false, pairingPending: !!state.pending, operations: ['status', 'pair'], safeMode: false },
    pair: (a, client) => {
      if (!state.allowAi) fail('ai_off', '"Allow AI preferences" is off.');
      if (a.pairingId) {
        const r = state.requests.find((x) => x.id === a.pairingId) || fail('unknown_pairing', 'No such pairing.');
        const out = { pairingId: r.id, status: r.status, code: r.code };
        if (r.status === 'approved' && !r.secretDelivered) { r.secretDelivered = true; out.pairingSecret = state.secret; }
        return out;
      }
      if (holds(a)) return { status: 'approved', note: 'already paired' };
      state.pending = { id: crypto.randomUUID(), code: '4821', status: 'pending', client: a.client || client };
      state.requests.push(state.pending);
      return { pairingId: state.pending.id, status: 'pending', code: '4821', expiresAt: '2026-10-17T14:04:00.000Z', instructions: 'hold the key' };
    },
    'prefs.get': () => ({ prefs: clone(state.prefs), labelSizes: ['none', 'small', 'normal', 'large'] }),
    'prefs.set': (a, client) => {
      const before = clone(state.prefs), next = clone(state.prefs), ignored = [];
      for (const [k, v] of Object.entries(a.patch || {})) {
        if (k === 'dialCategories') { for (const [c, w] of Object.entries(v)) { if (w == null || w === 'auto') delete next.dialCategories[c]; else next.dialCategories[c] = w; } continue; }
        if (!(k in next)) { ignored.push(k); continue; }
        if (k === 'labelSize' && !['none', 'small', 'normal', 'large'].includes(v)) { ignored.push(k); continue; }
        next[k] = v;
      }
      if (a.hidden) {
        if (!PACKS[a.hidden.app]) fail('unknown_pack', 'No pack.');
        const app = (next.apps[a.hidden.app] ||= { pins: [], hidden: [] });
        for (const id of a.hidden.hide || []) if (!app.hidden.includes(id)) app.hidden.push(id);
        app.hidden = app.hidden.filter((h) => !(a.hidden.unhide || []).includes(h));
      }
      const changed = Object.keys(next).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
      if (!changed.length) fail('invalid_argument', 'Nothing valid to change.', { ignored });
      if (a.dryRun) return { dryRun: true, changed, ignored, prefs: next };
      state.prefs = next;
      state.undo.push({ kind: 'prefs', before, after: clone(next) });
      state.audit.push({ kind: 'prefs.set', client, changed });
      return { changed, ignored, prefs: next, undoDepth: state.undo.length };
    },
    pin: (a, client) => {
      if (!PACKS[a.app]) fail('unknown_pack', `No pack "${a.app}".`);
      if (a.device !== 'galleon-100-sd') fail('unknown_device', 'Unknown device.');
      if (a.kind !== 'dial' && (a.x > 2 || (a.y ?? 0) > 3)) fail('invalid_slot', 'Not on a Galleon.');
      if (!a.unpin && !PACKS[a.app].verbs.includes(a.item)) fail('unknown_item', 'No such verb.');
      const before = clone(state.prefs);
      const app = (state.prefs.apps[a.app] ||= { pins: [], hidden: [] });
      app.pins = app.pins.filter((p) => !(p.x === a.x && p.y === (a.y ?? 0)));
      if (!a.unpin) app.pins.push({ device: a.device, kind: a.kind || 'key', x: a.x, y: a.y ?? 0, item: a.item });
      state.undo.push({ kind: 'prefs', before, after: clone(state.prefs) });
      state.audit.push({ kind: a.unpin ? 'unpin' : 'pin', client });
      return { pins: app.pins, undoDepth: state.undo.length };
    },
    explain: (a) => (a.kind === 'dial' && a.x === 0 ? { smart: false, why: 'There is no Smart Dial at dial:0,0: it holds one of the user\'s fixed (pinned) profile actions.' }
      : { smart: true, slot: `key ${a.x},${a.y ?? 0} on Galleon 100 SD`, pack: { id: 'vscode' }, context: { id: 'editor' }, item: { kind: 'verb', id: 'general.commandPalette', why: 'pack proposal', pinned: false } }),
    list: (a) => {
      if (a.what === 'packs' || !a.what) return { packs: [{ id: 'vscode', name: 'Visual Studio Code' }] };
      if (a.what === 'verbs') { if (!PACKS[a.pack]) fail('unknown_pack', 'No pack.'); return { pack: a.pack, verbs: PACKS[a.pack].verbs.map((id) => ({ id })) }; }
      if (a.what === 'history') return { undo: state.undo.map((u) => ({ kind: u.kind })) };
      fail('invalid_argument', 'what must be one of: packs, verbs, history.');
    },
    override: (a, client) => {
      if (!PACKS[a.pack]) fail('unknown_pack', 'No pack.');
      for (const it of a.items) {
        if (it.set.binding && it.set.binding.kind !== 'chord') fail('not_allowed', 'only chord bindings');
        if (it.set.label && it.set.label.length > 12) fail('invalid_argument', 'label too long');
        if (it.set.binding && /^(Alt\+F4|Win\+.*|Ctrl\+Alt\+Delete|Ctrl\+Shift\+Esc)$/.test(it.set.binding.chord)) fail('not_allowed', `${it.set.binding.chord} can never be set by an assistant`, { denylisted: true });
      }
      // Binding changes are proposals: pending the user's approval on the deck.
      const pending = a.items.filter((it) => it.set.binding).map((it) => ({ id: it.id, chord: it.set.binding.chord, status: 'pending your approval on the deck' }));
      if (a.dryRun) return { dryRun: true, valid: true, file: `%APPDATA%\\Prism\\control\\packs\\${a.pack}.ai.json`, pending };
      const before = state.overrides[a.pack] ?? null;
      state.overrides[a.pack] = [...(before || []), ...a.items];
      state.undo.push({ kind: 'file', pack: a.pack, before, after: state.overrides[a.pack] });
      state.audit.push({ kind: 'override', client });
      return { written: true, file: `%APPDATA%\\Prism\\control\\packs\\${a.pack}.ai.json`, undoDepth: state.undo.length, pending };
    },
    undo: (a, client) => {
      const undone = [];
      for (let i = 0; i < (a.steps || 1); i++) {
        const u = state.undo.at(-1);
        if (!u) break;
        if (u.kind === 'prefs') {
          if (!a.force && JSON.stringify(state.prefs) !== JSON.stringify(u.after)) fail('changed_since', 'The preferences changed since.', { undone });
          state.prefs = u.before;
        } else if (u.before == null) delete state.overrides[u.pack]; else state.overrides[u.pack] = u.before;
        state.undo.pop();
        undone.push(u.kind);
      }
      if (!undone.length) fail('nothing_to_undo', 'There are no AI changes left to undo.');
      state.audit.push({ kind: 'undo', client });
      return { undone, remaining: state.undo.length };
    },
  };

  const server = net.createServer((sock) => {
    state.sessions++;
    let buf = Buffer.alloc(0), hello = null;
    sock.on('error', () => {});
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4) {
        const len = buf.readUInt32LE(0);
        if (buf.length < 4 + len) return;
        const msg = JSON.parse(buf.subarray(4, 4 + len).toString('utf8'));
        buf = buf.subarray(4 + len);
        if (!hello) {
          if (msg.token !== token) { state.rejected++; sock.destroy(); return; }      // dropped unseen, like PipeEndpoint
          hello = msg;
          state.hellos.push({ v: msg.v, client: msg.client });
          if (msg.v !== 1) { sock.write(frame({ id: null, ok: false, error: { code: 'bad_version', message: 'API v1' } })); sock.end(); return; }
          continue;
        }
        if (silentOps.includes(msg.op)) continue;                                      // never answers (timeout test)
        let out;
        try {
          const gated = !['status', 'pair'].includes(msg.op);
          if (gated && !state.allowAi) { const e = new Error('off'); e.code = 'ai_off'; throw e; }
          if (msg.args && msg.args.pairingSecret) state.secretsSeen.push({ op: msg.op, secret: msg.args.pairingSecret });
          if (gated && !holds(msg.args || {})) { const e = new Error('Not paired.'); e.code = 'not_paired'; throw e; }
          if (!ops[msg.op]) { const e = new Error('Unknown operation.'); e.code = 'unknown_op'; throw e; }
          out = { id: msg.id, ok: true, result: ops[msg.op](msg.args || {}, hello.client) };
        } catch (e) { out = { id: msg.id, ok: false, error: { code: e.code || 'internal', message: e.message, ...(e.data ? { data: e.data } : {}) } }; }
        sock.write(frame(out));
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(`\\\\.\\pipe\\${pipe}`, resolve); });
  const s = scratch();
  const ingress = s.file('ingress.json');
  fs.writeFileSync(ingress, JSON.stringify({ v: 1, pipe, token, pid: 4242, startedAt: '2026-10-17T14:00:00.000Z' }));
  t.after(async () => { await new Promise((r) => server.close(r)); s.cleanup(); });
  /** The user holds the glowing key on the deck (the approval creates the per-pairing secret). */
  const approve = () => { state.pending.status = 'approved'; state.paired = true; state.client = state.pending.client; state.pending = null; state.secret = crypto.randomBytes(32).toString('hex'); };
  return { pipe, token, ingress, state, approve, s, server };
}

function smartCtx(ingressPath, { timeoutMs = 3000, clientName = 'test-client' } = {}) {
  const map = new Map(buildTools().map((x) => [x.name, x]));
  const ctx = { smartControl: new SmartPipeClient({ ingressPath, timeoutMs }), clientName, logger: silent };
  return {
    ctx,
    async call(name, args = {}) { const tool = map.get(name); if (!tool) throw new Error(`no such tool ${name}`); return tool.handler(args, ctx); },
    async callSafe(name, args = {}) { try { return { ok: true, result: await this.call(name, args) }; } catch (e) { return { ok: false, error: e, isToolError: e instanceof ToolError }; } },
  };
}

const SMART_TOOLS = ['smart_status', 'smart_pair', 'smart_get_prefs', 'smart_set_pref', 'smart_pin', 'smart_explain_slot', 'smart_list', 'smart_override', 'smart_undo'];

// ---------------------------------------------------------------- shape, discovery

test('the 9 smart tools are registered with object schemas and annotations', () => {
  const tools = buildTools().filter((x) => x.name.startsWith('smart_'));
  assert.deepEqual(tools.map((x) => x.name), SMART_TOOLS);
  for (const x of tools) {
    assert.equal(x.inputSchema.type, 'object', x.name);
    assert.equal(x.inputSchema.additionalProperties, false, x.name);
    assert.equal(typeof x.annotations.readOnlyHint, 'boolean', x.name);
    assert.ok(x.description.length > 80, x.name + ' explains itself');
  }
  assert.equal(tools.find((x) => x.name === 'smart_status').annotations.readOnlyHint, true);
  assert.equal(tools.find((x) => x.name === 'smart_set_pref').annotations.readOnlyHint, false);
});

test('the default ingress path follows Prism Control (APPDATA, PRISM_CONTROL_DIR, PRISM_SMART_INGRESS)', () => {
  assert.equal(defaultIngressPath({ env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, home: 'C:\\Users\\u' }), path.join('C:\\Users\\u\\AppData\\Roaming', 'Prism', 'control', 'modules', 'smart', 'ingress.json'));
  assert.equal(defaultIngressPath({ env: { PRISM_CONTROL_DIR: 'D:\\x' } }), path.join(path.resolve('D:\\x'), 'modules', 'smart', 'ingress.json'));
  assert.equal(defaultIngressPath({ env: { PRISM_SMART_INGRESS: 'D:\\y\\i.json', PRISM_CONTROL_DIR: 'D:\\x' } }), path.resolve('D:\\y\\i.json'));
});

test('channel off (no ingress.json): smart_status says unreachable and never throws; every other tool says unreachable with the hint', async (t) => {
  const s = scratch();
  t.after(s.cleanup);
  const c = smartCtx(s.file('ingress.json'));
  const st = await c.call('smart_status');
  assert.equal(st.reachable, false);
  assert.match(st.hint, /Allow AI preferences/);
  assert.match(st.hint, /Do not try to enable it/);
  for (const name of SMART_TOOLS.slice(1)) {
    const args = { smart_set_pref: { bigIcons: true }, smart_pin: { app: 'vscode', device: 'galleon-100-sd', x: 0, item: 'edit.undo' }, smart_explain_slot: { x: 0 }, smart_override: { pack: 'vscode', items: [{ id: 'edit.undo', set: { label: 'X' } }] } }[name] || {};
    const r = await c.callSafe(name, args);
    assert.equal(r.ok, false, name);
    assert.equal(r.error.code, 'unreachable', name);
    assert.match(r.error.data.hint, /Allow AI preferences/, name);
  }
  assert.deepEqual(fs.readdirSync(s.dir), [], 'the server never creates the discovery file');
});

test('ingress.json shape checks: malformed, wrong API, bad pipe name or token → unreachable; the token never surfaces', async (t) => {
  const s = scratch();
  t.after(s.cleanup);
  const file = s.file('ingress.json');
  const c = smartCtx(file, { timeoutMs: 1500 });
  const status = () => c.call('smart_status');
  const token = 'ab'.repeat(32);
  fs.writeFileSync(file, '{nope');
  assert.match((await status()).reason, /not valid JSON/);
  fs.writeFileSync(file, JSON.stringify({ v: 2, pipe: `prism-control-smart-${'0'.repeat(32)}`, token }));
  assert.match((await status()).reason, /unsupported shape/);
  fs.writeFileSync(file, JSON.stringify({ v: 1, pipe: 'evil-pipe', token }));
  assert.match((await status()).reason, /unsupported shape/);
  fs.writeFileSync(file, JSON.stringify({ v: 1, pipe: `prism-control-smart-${'0'.repeat(32)}`, token: 'short' }));
  assert.match((await status()).reason, /unsupported shape/);
  if (IS_WIN) {
    // A stale file: nobody listens on that pipe.
    fs.writeFileSync(file, JSON.stringify({ v: 1, pipe: `prism-control-smart-${crypto.randomBytes(16).toString('hex')}`, token }));
    const stale = await status();
    assert.equal(stale.reachable, false);
    assert.equal(stale.code, 'unreachable');
    assert.ok(!JSON.stringify(stale).includes(token), 'the token is never echoed');
  }
  assert.equal(readIngress(file).token.length, 64);
});

// ---------------------------------------------------------------- against the fake pipe

test('a wrong token is dropped unseen and reported as unreachable; a wrong API version is refused', { skip: !IS_WIN }, async (t) => {
  const f = await fakeSmart(t);
  fs.writeFileSync(f.ingress, JSON.stringify({ v: 1, pipe: f.pipe, token: 'cd'.repeat(32) }));
  const c = smartCtx(f.ingress);
  const st = await c.call('smart_status');
  assert.equal(st.reachable, false);
  assert.equal(f.state.rejected, 1);
  const raw = new SmartPipeClient({ ingressPath: f.ingress });
  fs.writeFileSync(f.ingress, JSON.stringify({ v: 1, pipe: f.pipe, token: f.token }));
  // An old client speaking v2 gets bad_version (the fake mirrors SmartControlChannel).
  const old = net.connect(`\\\\.\\pipe\\${f.pipe}`);
  const answer = await new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    old.on('connect', () => old.write(frame({ v: 2, token: f.token, client: 'old' })));
    old.on('data', (d) => { buf = Buffer.concat([buf, d]); if (buf.length >= 4 + buf.readUInt32LE(0)) resolve(JSON.parse(buf.subarray(4).toString())); });
  });
  old.destroy();
  assert.equal(answer.error.code, 'bad_version');
  assert.equal((await raw.call('status')).api, 1);
});

test('status → pair (the user holds the key) → poll approved; the client name comes from the MCP client', { skip: !IS_WIN }, async (t) => {
  const f = await fakeSmart(t);
  const c = smartCtx(f.ingress, { clientName: 'Example Desktop' });
  let st = await c.call('smart_status');
  assert.equal(st.reachable, true);
  assert.equal(st.paired, false);
  assert.equal(st.next, 'smart_pair');
  assert.equal(st.devices, undefined, 'an unpaired status shows no devices, app or pack');
  const before = await c.callSafe('smart_get_prefs');
  assert.equal(before.error.code, 'not_paired');
  assert.match(before.error.data.hint, /hold the glowing top-left Smart Key/);
  const p = await c.call('smart_pair');
  assert.equal(p.status, 'pending');
  assert.equal(p.code, '4821');
  assert.match(p.tellUser, /press and hold the glowing Smart Key that shows 4821/);
  assert.equal(f.state.hellos.at(-1).client, 'Example Desktop via Prism MCP');
  const waiting = await c.call('smart_status');
  assert.equal(waiting.pairingPending, true);
  assert.ok(!JSON.stringify(waiting).includes('4821'), 'the code is never in a status');
  assert.equal((await c.call('smart_pair', { pairingId: p.pairingId })).status, 'pending');
  f.approve();
  const done = await c.call('smart_pair', { pairingId: p.pairingId });
  assert.equal(done.status, 'approved');
  assert.match(done.next, /Paired/);
  assert.equal(done.pairingSecret, undefined, 'the secret is kept by the server, never shown to the assistant');
  st = await c.call('smart_status');
  assert.equal(st.paired, true);
  assert.match(st.next, /smart_set_pref/);
  assert.equal(st.devices.find((d) => d.id === 'dev-mcp').canApprove, false, 'virtual decks are reported as unable to approve');
  assert.equal((await c.call('smart_pair')).status, 'approved');
  f.state.allowAi = false;
  const off = await c.callSafe('smart_pair');
  assert.equal(off.error.code, 'ai_off');
  assert.match(off.error.data.hint, /never try to enable it yourself/);
});

async function paired(t) {
  const f = await fakeSmart(t);
  const c = smartCtx(f.ingress);
  const p = await c.call('smart_pair');
  f.approve();
  await c.call('smart_pair', { pairingId: p.pairingId });   // the approved poll: the server keeps the secret
  return { f, c };
}

test('smart_get_prefs and smart_set_pref: plain-language preferences, hidden verbs, dry run, ignored keys', { skip: !IS_WIN }, async (t) => {
  const { f, c } = await paired(t);
  assert.equal((await c.call('smart_get_prefs')).prefs.labelSize, 'normal');
  const r = await c.call('smart_set_pref', { bigIcons: true, labelSize: 'large', streamerSafe: true, dialCategories: { camera: 'left' } });
  assert.deepEqual(r.changed.sort(), ['bigIcons', 'dialCategories', 'labelSize', 'streamerSafe']);
  assert.equal(f.state.prefs.dialCategories.camera, 'left');
  const dry = await c.call('smart_set_pref', { paging: 'none', dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(f.state.prefs.paging, 'more-key', 'dry run changes nothing');
  await c.call('smart_set_pref', { hidden: { app: 'vscode', hide: ['edit.undo'] } });
  assert.deepEqual(f.state.prefs.apps.vscode.hidden, ['edit.undo']);
  await c.call('smart_set_pref', { dialCategories: { camera: null } });
  assert.equal(f.state.prefs.dialCategories.camera, undefined, 'null unsets a category');
  const none = await c.callSafe('smart_set_pref', {});
  assert.equal(none.error.code, 'invalid_argument');
  const bad = await c.callSafe('smart_set_pref', { hidden: { app: 'no-such-app', hide: ['x'] } });
  assert.equal(bad.error.code, 'unknown_pack');
});

test('smart_pin pins and unpins with validation; smart_explain_slot explains smart and fixed slots', { skip: !IS_WIN }, async (t) => {
  const { f, c } = await paired(t);
  const r = await c.call('smart_pin', { app: 'vscode', device: 'galleon-100-sd', kind: 'key', x: 2, y: 0, item: 'edit.undo' });
  assert.equal(r.pins[0].item, 'edit.undo');
  for (const [args, code] of [
    [{ app: 'nope', device: 'galleon-100-sd', x: 0, item: 'edit.undo' }, 'unknown_pack'],
    [{ app: 'vscode', device: 'galleon-100-sd', x: 7, item: 'edit.undo' }, 'invalid_slot'],
    [{ app: 'vscode', device: 'toaster', x: 0, item: 'edit.undo' }, 'unknown_device'],
    [{ app: 'vscode', device: 'galleon-100-sd', x: 0, item: 'rm.rf' }, 'unknown_item'],
  ]) assert.equal((await c.callSafe('smart_pin', args)).error.code, code, JSON.stringify(args));
  const noItem = await c.callSafe('smart_pin', { app: 'vscode', device: 'galleon-100-sd', x: 0 });
  assert.equal(noItem.error.code, 'invalid_argument');
  await c.call('smart_pin', { app: 'vscode', device: 'galleon-100-sd', x: 2, y: 0, unpin: true });
  assert.equal(f.state.prefs.apps.vscode.pins.length, 0);
  const why = await c.call('smart_explain_slot', { kind: 'key', x: 1, y: 0 });
  assert.equal(why.smart, true);
  assert.equal(why.item.id, 'general.commandPalette');
  const fixed = await c.call('smart_explain_slot', { kind: 'dial', x: 0, y: 0 });
  assert.equal(fixed.smart, false);
  assert.match(fixed.why, /pinned/);
});

test('smart_list, smart_override (chord bindings only, dry run first) and smart_undo (changed_since needs force)', { skip: !IS_WIN }, async (t) => {
  const { f, c } = await paired(t);
  assert.equal((await c.call('smart_list')).packs[0].id, 'vscode');
  assert.deepEqual((await c.call('smart_list', { what: 'verbs', pack: 'vscode' })).verbs.map((v) => v.id), ['edit.undo', 'general.commandPalette']);
  assert.equal((await c.callSafe('smart_list', { what: 'verbs', pack: 'nope' })).error.code, 'unknown_pack');

  const items = [{ type: 'verb', id: 'edit.undo', set: { label: 'UNDO!', binding: { kind: 'chord', chord: 'Ctrl+Alt+Z' } } }];
  const dry = await c.call('smart_override', { pack: 'vscode', items, dryRun: true });
  assert.equal(dry.valid, true);
  assert.equal(f.state.overrides.vscode, undefined);
  const w = await c.call('smart_override', { pack: 'vscode', items });
  assert.equal(w.written, true);
  assert.match(w.file, /vscode\.ai\.json$/);
  const text = await c.callSafe('smart_override', { pack: 'vscode', items: [{ id: 'edit.undo', set: { binding: { kind: 'text', text: 'hello' } } }] });
  assert.equal(text.error.code, 'not_allowed');
  assert.match(text.error.data.hint, /keyboard-chord/);

  await c.call('smart_set_pref', { bigIcons: true });
  assert.equal((await c.call('smart_list', { what: 'history' })).undo.length, 2);
  // The user edits the same preferences in the Stream Deck app afterwards.
  f.state.prefs.labelSize = 'small';
  const refused = await c.callSafe('smart_undo');
  assert.equal(refused.error.code, 'changed_since');
  assert.match(refused.error.data.hint, /Ask them before/);
  const u = await c.call('smart_undo', { force: true });
  assert.deepEqual(u.undone, ['prefs']);
  assert.equal(f.state.prefs.bigIcons, false);
  assert.equal((await c.call('smart_undo')).remaining, 0);
  assert.equal(f.state.overrides.vscode, undefined, 'the override was undone too');
  assert.equal((await c.callSafe('smart_undo')).error.code, 'nothing_to_undo');
  assert.deepEqual(f.state.audit.map((a) => a.kind), ['override', 'prefs.set', 'undo', 'undo']);
});

test('a silent channel times out as unreachable, and the token never appears in any tool output', { skip: !IS_WIN }, async (t) => {
  const f = await fakeSmart(t, { silentOps: ['prefs.get'] });
  const c = smartCtx(f.ingress, { timeoutMs: 400 });
  const p = await c.call('smart_pair');
  f.approve();
  await c.call('smart_pair', { pairingId: p.pairingId });
  const r = await c.callSafe('smart_get_prefs');
  assert.equal(r.error.code, 'unreachable');
  assert.match(r.error.data.hint, /off/);
  for (const name of ['smart_status', 'smart_list', 'smart_explain_slot']) {
    const out = await c.callSafe(name, name === 'smart_explain_slot' ? { x: 1 } : {});
    assert.ok(!JSON.stringify(out.ok ? out.result : { m: out.error.message, d: out.error.data }).includes(f.token), name);
  }
});

test('through PrismMCPServer: tools/call smart_status uses the server\'s smart client (smartIngressPath)', { skip: !IS_WIN }, async (t) => {
  const f = await fakeSmart(t);
  const server = new PrismMCPServer('(fixture)', { watch: false, logLevel: 'silent', collectionsInMemory: true, smartIngressPath: f.ingress });
  await server.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } } });
  const res = await server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'smart_status', arguments: {} } });
  assert.equal(res.result.isError, false);
  const body = JSON.parse(res.result.content[0].text);
  assert.equal(body.reachable, true);
  assert.equal(body.paired, false);
  assert.equal(body.engine, undefined, 'unpaired: no app, pack or devices');
  const pair = await server.handleMessage({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'smart_pair', arguments: {} } });
  assert.equal(JSON.parse(pair.result.content[0].text).status, 'pending');
  assert.equal(f.state.hellos.at(-1).client, 'e2e via Prism MCP');
  const gated = await server.handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'smart_set_pref', arguments: { bigIcons: true } } });
  assert.equal(gated.result.isError, true);
  assert.equal(JSON.parse(gated.result.content[0].text).code, 'not_paired');
});

// ---------------------------------------------------------------- smart-fix: the pairing secret and pending approvals

test('the pairing secret: kept by the server, sent with every call, never in any tool output; a revoked one is dropped', { skip: !IS_WIN }, async (t) => {
  const { f, c } = await paired(t);
  const outputs = [];
  for (const [name, args] of [['smart_status', {}], ['smart_get_prefs', {}], ['smart_set_pref', { bigIcons: true }], ['smart_list', {}], ['smart_explain_slot', { x: 1 }], ['smart_undo', {}]]) {
    outputs.push(JSON.stringify(await c.call(name, args)));
  }
  assert.ok(f.state.secretsSeen.length >= 6, 'every call carried the secret');
  assert.ok(f.state.secretsSeen.every((s) => s.secret === f.state.secret), 'always the current one');
  for (const out of outputs) assert.ok(!out.includes(f.state.secret), 'never in a tool result');
  // The user revokes in the PI (a new secret will be needed): the server drops the old one and reports not_paired.
  f.state.paired = false;
  f.state.secret = null;
  const gone = await c.callSafe('smart_get_prefs');
  assert.equal(gone.error.code, 'not_paired');
  const seen = f.state.secretsSeen.length;
  await c.callSafe('smart_get_prefs');
  assert.equal(f.state.secretsSeen.length, seen, 'the stale secret is not sent again');
});

test('a binding change is a proposal "pending your approval on the deck"; status lists it; denylisted chords are refused', { skip: !IS_WIN }, async (t) => {
  const { c } = await paired(t);
  const r = await c.call('smart_override', { pack: 'vscode', items: [{ id: 'edit.undo', set: { binding: { kind: 'chord', chord: 'Ctrl+Alt+F12' } } }] });
  assert.equal(r.written, true);
  assert.equal(r.pending[0].status, 'pending your approval on the deck');
  assert.match(r.tellUser, /Ctrl\+Alt\+F12 for edit\.undo/);
  assert.match(r.tellUser, /pending your approval on the deck/);
  assert.match(r.tellUser, /REVIEW/);
  assert.match(r.next, /approves or rejects it on their deck/);
  const st = await c.call('smart_status');
  assert.equal(st.pendingApprovals[0].verb, 'edit.undo');
  assert.match(st.tellUser, /pending your approval on the deck/);
  const labelOnly = await c.call('smart_override', { pack: 'vscode', items: [{ id: 'edit.undo', set: { label: 'UNDO!' } }] });
  assert.equal(labelOnly.tellUser, undefined, 'no proposal, nothing to approve');
  for (const chord of ['Alt+F4', 'Win+R', 'Ctrl+Shift+Esc']) {
    const no = await c.callSafe('smart_override', { pack: 'vscode', items: [{ id: 'edit.undo', set: { binding: { kind: 'chord', chord } } }] });
    assert.equal(no.error.code, 'not_allowed', chord);
    assert.match(no.error.data.hint, /never Alt\+F4/, chord);
  }
});
