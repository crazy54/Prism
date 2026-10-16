// Prism Deck plugin: WebSocket transport, Stream Deck protocol, frame budget, runtime
// (keys, spans, dials, Galleon widgets, Neo, PI), and the live control channel —
// all against a fake Stream Deck app (src/plugin/dev/fake-streamdeck.js). Nothing
// here talks to the real Stream Deck app or writes to %APPDATA%.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { connectWebSocket, acceptWebSocket, encodeFrame, FrameDecoder, OP } from '../src/plugin/ws.js';
import { parseLaunchArgs, detectHost, StreamDeckConnection } from '../src/plugin/connection.js';
import { DeviceBudget, TokenBucket, allocateFps, createUpdateBucket, elementCount, updateCost, DEFAULT_LIMITS } from '../src/plugin/budget.js';
import { createDataHub } from '../src/plugin/data.js';
import { widgetCanvas, galleonWidgetRects } from '../src/plugin/feedback.js';
import { normalizeSettings, normalizeGlobals, facetMode, defaultFacetId } from '../src/plugin/settings.js';
import { PrismRuntime } from '../src/plugin/runtime.js';
import { classifyBehavior, resolveLook, planOps } from '../src/plugin/live-validate.js';
import { tokensEqual } from '../src/plugin/control.js';
import { controlPath } from '../src/plugin/paths.js';
import { main } from '../src/plugin/index.js';
import { startFakeStreamDeck } from '../src/plugin/dev/fake-streamdeck.js';
import { decodeSvgDataUrl } from '../src/plugin/system-facets.js';
import { validateSvg } from '../src/scene/validate.js';
import { getDevice, deviceFromInfo } from '../src/devices.js';
import { findFacet } from '../src/facets/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'prism-deck-plugin-'));

// ── WebSocket ────────────────────────────────────────────────────────────────
async function wsPair() {
  const server = http.createServer();
  let serverWs;
  const got = new Promise((r) => server.on('upgrade', (req, sock, head) => { serverWs = acceptWebSocket(req, sock, head); r(serverWs); }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const client = await connectWebSocket(`ws://127.0.0.1:${server.address().port}`);
  await got;
  return { client, server: serverWs, close: async () => { client.terminate(); serverWs.terminate(); await new Promise((r) => server.close(r)); } };
}

test('ws: handshake, text both ways, 16- and 64-bit lengths, masking roles', async () => {
  const p = await wsPair();
  try {
    const big = 'x'.repeat(70_000), mid = 'y'.repeat(300);
    const fromClient = new Promise((r) => { const got = []; p.server.on('message', (m) => { got.push(m); if (got.length === 3) r(got); }); });
    p.client.send('hello'); p.client.send(mid); p.client.send(big);
    const got = await fromClient;
    assert.deepEqual(got.map((s) => s.length), [5, 300, 70_000]);
    const back = new Promise((r) => p.client.once('message', r));
    p.server.send(big);
    assert.equal((await back).length, 70_000);
  } finally { await p.close(); }
});

test('ws: fragmented messages, ping → pong, close handshake', async () => {
  const p = await wsPair();
  try {
    const msg = new Promise((r) => p.client.once('message', r));
    p.server.socket.write(Buffer.concat([encodeFrame(OP.TEXT, Buffer.from('Pri'), { fin: false }), encodeFrame(OP.PING, Buffer.from('p')), encodeFrame(OP.CONT, Buffer.from('sm'), { fin: true })]));
    assert.equal(await msg, 'Prism');
    const pong = new Promise((r) => p.server.on('pong', (d) => { if (d.toString() === 'hi') r(d); }));
    p.server.ping(Buffer.from('hi'));
    assert.equal((await pong).toString(), 'hi');
    const closed = new Promise((r) => p.client.once('close', r));
    p.server.close(1000, 'bye');
    assert.equal((await closed).code, 1000);
  } finally { await p.close(); }
});

test('ws: decoder handles split chunks and rejects protocol errors', () => {
  const d = new FrameDecoder();
  const f = encodeFrame(OP.TEXT, Buffer.from('chunked'), { mask: true });
  assert.equal(d.push(f.subarray(0, 3)).length, 0);
  const [frame] = d.push(f.subarray(3));
  assert.equal(frame.payload.toString(), 'chunked');
  assert.equal(frame.masked, true);
  const bad = encodeFrame(OP.TEXT, Buffer.from('x')); bad[0] |= 0x40;
  assert.throws(() => new FrameDecoder().push(bad), /reserved/);
  assert.throws(() => new FrameDecoder().push(encodeFrame(OP.PING, Buffer.alloc(126))), /control/);
  assert.throws(() => new FrameDecoder({ maxFrame: 10 }).push(encodeFrame(OP.TEXT, Buffer.alloc(20))), /too large/);
});

test('ws: a server rejects unmasked client frames', async () => {
  const p = await wsPair();
  try {
    const err = new Promise((r) => p.server.once('error', r));
    p.client.socket.write(encodeFrame(OP.TEXT, Buffer.from('naked'), { mask: false }));
    assert.match((await err).message, /masked/);
  } finally { await p.close(); }
});

// ── protocol ─────────────────────────────────────────────────────────────────
test('protocol: launch args, host detection (OpenDeck reports "windows" — detect via process.platform)', () => {
  const a = parseLaunchArgs(['-port', '28196', '-pluginUUID', 'abc', '-registerEvent', 'registerPlugin', '-info', '{"application":{"version":"7.6.0.23012","platform":"windows"}}']);
  assert.equal(a.port, 28196); assert.equal(a.pluginUUID, 'abc'); assert.equal(a.info.application.version, '7.6.0.23012');
  assert.equal(detectHost(a.info, 'win32'), 'elgato');
  assert.equal(detectHost({ application: { version: '7.1.0', platform: 'windows' } }, 'linux'), 'opendeck');
  const c = new StreamDeckConnection({ port: 1, pluginUUID: 'x', info: a.info, platform: 'linux' });
  assert.equal(c.features.triggerDescription, false);
  assert.equal(c.setTriggerDescription('ctx', {}), false);
});

test('protocol: registers with the app and asks for global settings', async () => {
  const sd = await startFakeStreamDeck();
  const p = await main({ argv: sd.argv(), exit: () => {}, handleProcess: false, log: () => {}, controlFile: path.join(tmpdir(), 'control.json'), audio: null, data: createDataHub() });
  try {
    await sd.whenRegistered();
    await sd.waitFor((m) => m.event === 'getGlobalSettings' && m.context === sd.pluginUUID);
  } finally { await p.stop(); await sd.close(); }
});

// ── budget ───────────────────────────────────────────────────────────────────
function fakeClock() {
  let t = 0; const timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => { const h = { at: t + ms, fn }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    advance(ms) { const end = t + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const h = timers[0]; if (!h || h.at > end) break; timers.shift(); t = h.at; h.fn(); } t = end; },
  };
}

test('budget: dedupe identical frames, per-key cap, latest-wins coalescing', () => {
  const c = fakeClock(); const sent = [];
  const b = new DeviceBudget({ ...c, send: (ctx, kind, p) => { sent.push([ctx, p]); return true; }, limits: { perKeyPerSec: 10, updatesPerSec: 1000 } });
  assert.equal(b.submit('k1', 'image', 'A'), 'sent');
  assert.equal(b.submit('k1', 'image', 'A'), 'deduped');
  assert.equal(b.submit('k1', 'image', 'B'), 'queued');   // < 100 ms since the last send
  assert.equal(b.submit('k1', 'image', 'C'), 'queued');   // replaces B
  c.advance(120);
  assert.deepEqual(sent.map((s) => s[1]), ['A', 'C']);
  for (let i = 0; i < 50; i++) { b.submit('k2', 'image', `f${i}`); c.advance(20); }
  c.advance(200);
  const k2 = sent.filter((s) => s[0] === 'k2');
  assert.ok(k2.length >= 9 && k2.length <= 12, `k2 got ${k2.length} frames in ~1.2 s at 10/s`);
  assert.equal(k2.at(-1)[1], 'f49', 'the latest frame always lands');
});

test('budget: one shared updates/s budget across devices (the lab watchdog case: 12 keys × 60 fps)', () => {
  const c = fakeClock(); let sent = 0;
  const shared = createUpdateBucket({ updatesPerSec: 200 }, c.now);
  const devs = [0, 1].map(() => new DeviceBudget({ ...c, updates: shared, limits: { updatesPerSec: 200, perKeyPerSec: 60 }, send: () => { sent++; return true; } }));
  assert.equal(devs[0].updates, devs[1].updates);
  // both devices offer 12 keys × 60 fps (1,440/s): the app must see ~200/s in total, never a backlog
  for (let f = 0; f < 120; f++) { for (const d of devs) for (let k = 0; k < 12; k++) d.submit(`k${k}`, 'image', `${f}`); c.advance(1000 / 60); }
  assert.ok(sent >= 350 && sent <= 460, `~200/s for 2 s → ${sent}`);
  assert.ok(devs.every((d) => d.pending.size <= 12), 'latest-wins: at most one pending frame per key');
  // presses still go first, borrowing from the bucket
  assert.equal(devs[0].submit('press', 'image', 'down', { priority: true }), 'sent');
});

test('budget: heavy frames cost more (element budget), so they slow down', () => {
  assert.equal(updateCost(120), 1);
  assert.equal(updateCost(1200), 4);
  assert.equal(elementCount('<svg><g><rect/><path d="M0 0"/></g><!-- x --></svg>'), 4);
  const c = fakeClock(); const sent = { light: 0, heavy: 0 };
  const b = new DeviceBudget({ ...c, limits: { updatesPerSec: 100, perKeyPerSec: 60 }, send: (ctx) => { sent[ctx]++; return true; } });
  for (let f = 0; f < 120; f++) { b.submit('light', 'image', `l${f}`, { cost: 1 }); b.submit('heavy', 'image', `h${f}`, { cost: 4 }); c.advance(1000 / 60); }
  assert.ok(sent.light + 4 * sent.heavy <= 100 * 2 + 30, `cost-weighted total ${sent.light} + 4×${sent.heavy}`);
});

test('budget: priority frames skip the per-key interval; backpressure holds animation until the socket drains', () => {
  const c = fakeClock(); const sent = []; let buffered = 1e6;
  const b = new DeviceBudget({ ...c, buffered: () => buffered, send: (ctx, k, p) => { sent.push(p); return true; } });
  assert.equal(b.submit('k', 'image', 'anim'), 'queued');
  assert.equal(b.submit('k2', 'image', 'press', { priority: true }), 'sent');
  c.advance(100); assert.deepEqual(sent, ['press']);
  buffered = 0; c.advance(100);
  assert.deepEqual(sent, ['press', 'anim']);
  assert.ok(b.stats.backpressure > 0);
  b.submit('k3', 'image', 'x'); assert.equal(b.submit('k3', 'image', 'y', { priority: true }), 'sent', 'a press is not held by the per-key interval');
});

test('budget: fair shares (water-filling fps)', () => {
  const a = allocateFps(30, [{ id: 'a', fps: 12, images: 1 }, { id: 'b', fps: 15, images: 12 }, { id: 'c', fps: 0, images: 4 }], { perKeyPerSec: 15 });
  assert.equal(a.get('c'), 0);
  assert.ok(a.get('a') * 1 + a.get('b') * 12 <= 30.5);
  assert.ok(Math.abs(a.get('a') - a.get('b')) < 0.01, 'equal per-update rate when both are over budget');
  assert.equal(DEFAULT_LIMITS.updatesPerSec, 200); assert.ok(DEFAULT_LIMITS.perKeyPerSec >= 30);
  const tb = new TokenBucket(10, 5, () => 0); tb.take(5); assert.equal(tb.has(1), false); assert.equal(tb.waitMs(1), 100);
});

// ── settings ─────────────────────────────────────────────────────────────────
test('settings: untrusted input is normalized, facets fit their controller and device', () => {
  const galleon = getDevice('galleon'), plus = getDevice('plus');
  const s = normalizeSettings({ facet: 'icon-mic', params: { label: 'Room', bogus: 1 }, state: 9, group: 'Z', theme: '<x>', value: 3 }, { controller: 'Keypad', device: galleon });
  assert.equal(s.facet, 'icon-mic'); assert.deepEqual(s.params, { label: 'Room' }); assert.equal(s.state, 1); assert.equal(s.group, 'A'); assert.equal(s.theme, ''); assert.equal(s.value, 1);
  assert.equal(normalizeSettings({ facet: 'icon-mic' }, { controller: 'Encoder', device: plus }).facet, defaultFacetId('Encoder', plus));
  assert.equal(normalizeSettings({ facet: 'mic' }, { controller: 'Keypad', device: plus }).facet, defaultFacetId('Keypad', plus), 'prefix matches are not accepted');
  assert.equal(facetMode(findFacet('span-waveform'), 'Keypad', galleon), 'span');
  assert.equal(facetMode(findFacet('screen-galleon-dashboard'), 'Encoder', galleon), 'screen-galleon');
  assert.equal(facetMode(findFacet('screen-galleon-dashboard'), 'Encoder', plus), null);
  assert.equal(facetMode(findFacet('dial-volume'), 'Encoder', galleon), 'strip-1');
  assert.equal(facetMode(findFacet('screen-neo-clock'), 'Neo', getDevice('neo')), 'screen-infobar');
  assert.equal(defaultFacetId('Encoder', galleon), 'screen-galleon-dashboard');
});

// ── runtime against the fake app ─────────────────────────────────────────────
async function plugin(opts = {}) {
  // tests run without the boot sequence unless they ask for it (opts.globals)
  const sd = await startFakeStreamDeck({ ...(opts.devices ? { devices: opts.devices } : {}), globals: { boot: false, ...(opts.globals || {}) } });
  const dir = tmpdir();
  const p = await main({ argv: sd.argv(), exit: () => {}, handleProcess: false, log: () => {}, controlFile: path.join(dir, 'control.json'), audio: opts.audio ?? null, data: opts.data ?? createDataHub() });
  await sd.whenRegistered();
  sd.connectDevices();
  const [plus, galleon, mcp] = sd.devices;
  return { sd, p, plus, galleon, mcp, dir, close: async () => { await p.stop(); await sd.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const imageOf = (m) => decodeSvgDataUrl(m.event === 'setImage' ? m.payload.image : m.payload.canvas);
const framesTo = (sd, ctx) => sd.received.filter((m) => (m.event === 'setImage' || m.event === 'setFeedback') && m.context === ctx);

test('runtime: a key draws its facet as a deck-subset SVG data URL; a press toggles and persists state', async () => {
  const t = await plugin();
  try {
    const k = t.sd.appear({ device: t.galleon.id, col: 0, row: 0, settings: { facet: 'icon-mic' } });
    const m = await t.sd.waitFor((x) => x.event === 'setImage' && x.context === k);
    assert.match(m.payload.image, /^data:image\/svg\+xml;base64,/);
    const svg = imageOf(m);
    assert.deepEqual(validateSvg(svg, { maxBytes: 32768, profile: 'device' }), []);
    assert.ok(!/<clipPath|preserveAspectRatio/.test(svg), 'Qt output stage: no clipPath, no preserveAspectRatio');
    assert.match(svg, /width="160" height="160"/, 'Galleon keys render at their native 160 px');
    t.sd.keyDown(k); await sleep(30); t.sd.keyUp(k);
    const set = await t.sd.waitFor((x) => x.event === 'setSettings' && x.context === k);
    assert.equal(set.payload.state, 1);
    assert.equal(set.payload.facet, 'icon-mic');
  } finally { await t.close(); }
});

test('runtime: a span facet on three keys renders one block sliced per key; a look change spreads to the block', async () => {
  const t = await plugin();
  try {
    const ks = [0, 1, 2].map((c) => t.sd.appear({ device: t.galleon.id, col: c, row: 1, settings: { facet: 'span-waveform' } }));
    await t.sd.settle(120);
    const last = ks.map((k) => framesTo(t.sd, k).at(-1));
    assert.ok(last.every(Boolean), 'every key of the span got a frame');
    const svgs = last.map(imageOf);
    assert.equal(new Set(svgs).size, 3, 'three different slices');
    for (const s of svgs) { assert.deepEqual(validateSvg(s, { maxBytes: 98304, profile: 'device' }), []); assert.ok(!/<clipPath/.test(s)); }
    const unit = t.p.runtime.stats().devices[t.galleon.id].units.find((u) => u.facet === 'span-waveform');
    assert.equal(unit.members, 3); assert.equal(unit.mode, 'span');
    t.sd.piSetSettings(ks[0], { facet: 'span-waveform', params: { speed: 2 } });
    const spread = await t.sd.waitFor((x) => x.event === 'setSettings' && x.context === ks[2]);
    assert.equal(spread.payload.params.speed, 2);
  } finally { await t.close(); }
});

test('runtime: dials use the canvas layout; turning persists the value; the + strip slices a panorama per dial', async () => {
  const t = await plugin();
  try {
    const d0 = t.sd.appear({ device: t.plus.id, controller: 'Encoder', col: 0, row: 0, settings: { facet: 'dial-volume' } });
    const layout = await t.sd.waitFor((x) => x.event === 'setFeedbackLayout' && x.context === d0);
    assert.equal(layout.payload.layout, 'layouts/prism-canvas.json');
    const fb = await t.sd.waitFor((x) => x.event === 'setFeedback' && x.context === d0);
    assert.match(fb.payload.canvas, /^data:image\/svg\+xml;base64,/);
    assert.match(imageOf(fb), /width="200" height="100"/);
    await t.sd.waitFor((x) => x.event === 'setTriggerDescription' && x.context === d0);
    t.sd.rotate(d0, 5);
    const set = await t.sd.waitFor((x) => x.event === 'setSettings' && x.context === d0, { timeoutMs: 3000 });
    assert.ok(set.payload.value > 0.5, `value went up: ${set.payload.value}`);
    const strip = [0, 1, 2, 3].map((c) => t.sd.appear({ device: t.plus.id, controller: 'Encoder', col: c, row: 0, settings: { facet: 'strip-refraction', group: 'B' } }));
    await t.sd.settle(120);
    const segs = strip.map((c) => framesTo(t.sd, c).at(-1)).map(imageOf);
    assert.equal(new Set(segs).size, 4, 'four different 200×100 segments');
  } finally { await t.close(); }
});

test('runtime: the Galleon screen spans its 4 widgets (dial, layer); the Neo info bar gets its own layout', async () => {
  const t = await plugin({ devices: [{ id: 'g', name: 'Galleon 100 SD', size: { columns: 3, rows: 4 }, type: 12 }, { id: 'n', name: 'Stream Deck Neo', size: { columns: 4, rows: 2 }, type: 9 }] });
  try {
    const ws = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([c, r]) => t.sd.appear({ device: 'g', controller: 'Encoder', col: c, row: r, settings: {} }));
    await t.sd.settle(150);
    assert.ok(ws.every((c) => framesTo(t.sd, c).length), 'all four widgets drawn');
    const unit = t.p.runtime.stats().devices.g.units[0];
    assert.equal(unit.mode, 'screen-galleon'); assert.equal(unit.members, 4);
    const neo = t.sd.appear({ device: 'n', controller: 'Neo', col: 1, row: 0, settings: { facet: 'screen-neo-clock' } });
    const lay = await t.sd.waitFor((x) => x.event === 'setFeedbackLayout' && x.context === neo);
    assert.equal(lay.payload.layout, 'layouts/prism-infobar.json');
    const fb = await t.sd.waitFor((x) => x.event === 'setFeedback' && x.context === neo);
    assert.match(imageOf(fb), /width="232" height="50"/);
  } finally { await t.close(); }
});

test('runtime: disappearing keys stop; disconnected devices pause; wake repaints', async () => {
  const t = await plugin();
  try {
    const k = t.sd.appear({ device: t.galleon.id, col: 0, row: 0, settings: { facet: 'icon-mic' } });
    await t.sd.waitFor((x) => x.event === 'setImage' && x.context === k);
    t.sd.disconnect(t.galleon.id);
    await sleep(80); const n0 = framesTo(t.sd, k).length; await sleep(400);
    assert.equal(framesTo(t.sd, k).length, n0, 'no frames while the device is disconnected');
    t.sd.wake();
    t.sd.connectDevices();
    await t.sd.waitFor((x) => x.event === 'setImage' && x.context === k, { from: t.sd.received.length });
    t.sd.disappear(k);
    await sleep(80); const n1 = framesTo(t.sd, k).length; await sleep(300);
    assert.equal(framesTo(t.sd, k).length, n1, 'no frames after willDisappear');
  } finally { await t.close(); }
});

test('runtime: the property inspector gets state (fitting facets, unit) and live previews', async () => {
  const t = await plugin();
  try {
    const k = t.sd.appear({ device: t.galleon.id, col: 2, row: 3, settings: { facet: 'icon-power' } });
    await t.sd.waitFor((x) => x.event === 'setImage' && x.context === k);
    t.sd.piAppear(k);
    const st = await t.sd.waitFor((x) => x.event === 'sendToPropertyInspector' && x.payload?.type === 'state');
    assert.equal(st.context, k);
    assert.ok(st.payload.choices.includes('span-waveform') && st.payload.choices.includes('icon-mic'));
    assert.ok(!st.payload.choices.includes('dial-volume'), 'dial facets are not offered on keys');
    assert.equal(st.payload.device.model, 'galleon');
    assert.equal(st.payload.live.running, false);
    const pv = await t.sd.waitFor((x) => x.event === 'sendToPropertyInspector' && x.payload?.type === 'preview');
    assert.match(pv.payload.image, /^data:image\/svg\+xml/);
    t.sd.piSend(k, { cmd: 'stats' });
    const stats = await t.sd.waitFor((x) => x.payload?.type === 'stats');
    assert.ok(stats.payload.stats.devices[t.galleon.id]);
  } finally { await t.close(); }
});

test('runtime: render inputs — pressedFor while held, pressKey for spans, turnAge, touch', () => {
  const sent = [];
  const conn = { on() {}, setImage: (c, i) => sent.push(i), setFeedback: () => true, setFeedbackLayout() {}, setTriggerDescription() {}, setSettings() {}, getGlobalSettings() {}, bufferedAmount: 0, info: {} };
  let t = 1000;
  const rt = new PrismRuntime({ conn, now: () => t, log: () => {} });
  rt.upsertDevice('g', { name: 'Galleon 100 SD', type: 12, size: { columns: 3, rows: 4 } });
  rt.onWillAppear({ action: 'com.jeremyfhall.prism.facet', context: 'a', device: 'g', payload: { controller: 'Keypad', coordinates: { column: 1, row: 1 }, settings: { facet: 'span-waveform' } } });
  rt.onWillAppear({ action: 'com.jeremyfhall.prism.facet', context: 'b', device: 'g', payload: { controller: 'Keypad', coordinates: { column: 2, row: 1 }, settings: { facet: 'span-waveform' } } });
  rt.onPress({ context: 'b' }, true);
  t += 500;
  const u = rt.unitOf(rt.instances.get('b'));
  const o = rt.frameOpts(u);
  assert.equal(o.pressed, true); assert.ok(Math.abs(o.pressedFor - 0.5) < 0.1, `pressedFor ${o.pressedFor}`);
  assert.equal(o.pressKey, 1 * 3 + 2, 'device key index of the pressed key');
  assert.equal(o.turnAge, Infinity); assert.equal(o.touch, null);
  rt.onPress({ context: 'b' }, false);
  assert.equal(rt.frameOpts(u).pressedFor, 0);
  rt.upsertDevice('p', { name: 'Stream Deck +', type: 7, size: { columns: 4, rows: 2 } });
  rt.onWillAppear({ action: 'x.facet', context: 'd', device: 'p', payload: { controller: 'Encoder', coordinates: { column: 2, row: 0 }, settings: { facet: 'strip-refraction' } } });
  rt.onDialRotate({ context: 'd', payload: { ticks: 1 } });
  rt.onTouchTap({ context: 'd', payload: { tapPos: [50, 40], hold: false } });
  t += 250;
  const du = rt.unitOf(rt.instances.get('d'));
  const od = rt.frameOpts(du);
  assert.ok(od.turnAge >= 0.2 && od.turnAge <= 0.3, `turnAge ${od.turnAge}`);
  assert.deepEqual({ x: od.touch.x, y: od.touch.y, hold: od.touch.hold, segment: od.touch.segment }, { x: 450, y: 40, hold: false, segment: 2 }, 'strip-wide x for a panorama');
  rt.stop();
});

test('runtime: OpenDeck (Linux) never gets setTriggerDescription', async () => {
  if (process.platform === 'linux') return; // the host is detected from process.platform; covered by the protocol test there
  const conn = new StreamDeckConnection({ port: 1, pluginUUID: 'x', platform: 'linux', info: {} });
  const out = []; conn._raw = (o) => { out.push(o.event); return true; };
  conn.setTriggerDescription('c', { rotate: 'x' }); conn.setImage('c', 'data:');
  assert.deepEqual(out, ['setImage']);
});

test('hardware: Galleon widgets map onto the 200×100 canvas uniformly (2:1, nothing squashed); 1.4 rects', () => {
  const win = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="360 198 360 180"><rect x="360" y="198" width="360" height="180" fill="#123456"/></svg>';
  const c = widgetCanvas(win);
  assert.match(c, /width="200" height="100" viewBox="0 0 200 100"/);
  assert.match(c, /translate\(0 0\) scale\(0.55556 0.55556\) translate\(-360 -198\)/, 'exactly 5/9 on both axes');
  const old = widgetCanvas(win.replace(/360 198 360 180/, '0 0 360 192').replace('height="180"', 'height="192"'));
  assert.match(old, /scale\(0.52083 0.52083\)/, 'a 360×192 window is letterboxed, not stretched');
  const rects = galleonWidgetRects({ x: 0, y: 0, w: 720, h: 384 }, getDevice('galleon').screen.widgets);
  assert.deepEqual(rects.map((r) => [r.dial, r.layer, r.x, r.y, r.w, r.h]), [[0, 0, 0, 6, 360, 180], [1, 0, 360, 6, 360, 180], [0, 1, 0, 198, 360, 180], [1, 1, 360, 198, 360, 180]]);
});

test('hardware: fast Galleon spins (±12 ticks per event) move the value in one step; no long-press is needed', async () => {
  const t = await plugin();
  try {
    const d = t.sd.appear({ device: t.galleon.id, controller: 'Encoder', col: 1, row: 1, settings: { facet: 'dial-volume', value: 0.5 } });
    await t.sd.waitFor((x) => x.event === 'setFeedback' && x.context === d);
    t.sd.rotate(d, 12);
    const up = await t.sd.waitFor((x) => x.event === 'setSettings' && x.context === d, { timeoutMs: 3000 });
    assert.ok(Math.abs(up.payload.value - (0.5 + 12 * (findFacet('dial-volume').params.step?.default || 0.02))) < 1e-6 || up.payload.value === 1, `value ${up.payload.value}`);
    const mark = t.sd.received.length;
    t.sd.rotate(d, -48); t.sd.rotate(d, -48);
    const down = await t.sd.waitFor((x) => x.event === 'setSettings' && x.context === d, { timeoutMs: 3000, from: mark });
    assert.equal(down.payload.value, 0, 'clamped at 0');
    assert.ok(!t.sd.received.some((x) => x.event === 'setTriggerDescription' && x.context === d && x.payload.longTouch), 'the Galleon has no touch: no long-touch trigger');
  } finally { await t.close(); }
});

test('hardware: a stopwatch key keeps its own timer (a stopped watch keeps its time); countdowns get their target', async () => {
  let wall = 1_000_000;
  const conn = { on() {}, setImage() { return true; }, setFeedback() { return true; }, setFeedbackLayout() {}, setTriggerDescription() {}, setSettings() {}, getGlobalSettings() {}, bufferedAmount: 0, info: {} };
  const rt = new PrismRuntime({ conn, wallNow: () => wall, log: () => {} });
  rt.upsertDevice('g', { name: 'Galleon 100 SD', type: 12, size: { columns: 3, rows: 4 } });
  rt.onWillAppear({ action: 'com.jeremyfhall.prism.facet', context: 'sw', device: 'g', payload: { controller: 'Keypad', coordinates: { column: 0, row: 0 }, settings: { facet: 'app-stopwatch' } } });
  rt.onWillAppear({ action: 'com.jeremyfhall.prism.facet', context: 'cd', device: 'g', payload: { controller: 'Keypad', coordinates: { column: 1, row: 0 }, settings: { facet: 'app-countdown', params: { minutes: 2, seconds: 30 } } } });
  const timer = (ctx) => rt.frameOpts(rt.unitOf(rt.instances.get(ctx))).data.timer;
  assert.equal(timer('sw').elapsed, 0); assert.equal(timer('sw').running, false);
  rt.onPress({ context: 'sw' }, true); rt.onPress({ context: 'sw' }, false);     // ready → running
  wall += 4200;
  assert.ok(Math.abs(timer('sw').elapsed - 4.2) < 0.01 && timer('sw').running);
  rt.onPress({ context: 'sw' }, true); rt.onPress({ context: 'sw' }, false);     // running → stopped
  wall += 60_000;
  assert.ok(Math.abs(timer('sw').elapsed - 4.2) < 0.01 && !timer('sw').running, 'stopped watch keeps its time');
  rt.onWillDisappear({ context: 'sw' });                                         // page switch…
  rt.onWillAppear({ action: 'com.jeremyfhall.prism.facet', context: 'sw', device: 'g', payload: { controller: 'Keypad', coordinates: { column: 0, row: 0 }, settings: { facet: 'app-stopwatch', state: 2 } } });
  assert.ok(Math.abs(timer('sw').elapsed - 4.2) < 0.01, '…and back: still there');
  rt.onPress({ context: 'sw' }, true); rt.onPress({ context: 'sw' }, false);     // stopped → ready
  assert.equal(timer('sw').elapsed, 0, 'reset');
  assert.equal(timer('cd').target, 150);
  rt.onPress({ context: 'cd' }, true); wall += 10_000;
  assert.ok(Math.abs(timer('cd').remaining - 140) < 0.01);
  rt.stop();
});

test('hardware: touch x is in surface px — strip-wide for a panorama, segment-local for one dial', () => {
  const conn = { on() {}, setImage() { return true; }, setFeedback() { return true; }, setFeedbackLayout() {}, setTriggerDescription() {}, setSettings() {}, getGlobalSettings() {}, bufferedAmount: 0, info: {} };
  const rt = new PrismRuntime({ conn, log: () => {} });
  rt.upsertDevice('p', { name: 'Stream Deck +', type: 7, size: { columns: 4, rows: 2 } });
  rt.onWillAppear({ action: 'x.facet', context: 'one', device: 'p', payload: { controller: 'Encoder', coordinates: { column: 3, row: 0 }, settings: { facet: 'dial-volume' } } });
  rt.onTouchTap({ context: 'one', payload: { tapPos: [80, 79], hold: true } });
  const o = rt.frameOpts(rt.unitOf(rt.instances.get('one')));
  assert.deepEqual([o.touch.x, o.touch.y, o.touch.hold, o.touch.segment], [80, 79, true, 3]);
  rt.stop();
});

test('hardware: the node data hub (src/apps/sources) feeds facets through the plugin', async () => {
  const { createNodeHub } = await import('../src/apps/sources/node.js');
  const hub = await createNodeHub({ system: false, audio: false, media: 'simulated', calendar: 'simulated' });
  const t = await plugin({ data: hub });
  try {
    const ws = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([c, r]) => t.sd.appear({ device: t.galleon.id, controller: 'Encoder', col: c, row: r, settings: { facet: 'screen-galleon-media' } }));
    await t.sd.settle(150);
    assert.ok(ws.every((c) => framesTo(t.sd, c).length));
    const u = t.p.runtime.unitOf(t.p.runtime.instances.get(ws[0]));
    assert.ok(t.p.runtime.frameOpts(u).data.media, 'simulated media from the hub');
  } finally { await t.close(); }
});

// ── games (API 1.5) ───────────────────────────────────────────────────────────
const MK2 = [{ id: 'mk2', name: 'Stream Deck MK.2', size: { columns: 5, rows: 3 }, type: 0 }];
const GALLEON = [{ id: 'gal', name: 'Galleon 100 SD', size: { columns: 3, rows: 4 }, type: 12 }];
const lightsOut = (t, device, cols, rows, settings = {}) => {
  const ctx = new Map();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ctx.set(`${c},${r}`, t.sd.appear({ device, col: c, row: r, settings: { facet: 'game-lights-out', ...settings } }));
  return ctx;
};
const unitOfCtx = (t, ctx) => t.p.runtime.unitOf(t.p.runtime.instances.get(ctx));

test('games: a Lights Out press on a 5×3 span sends setImage only for the toggled keys', async () => {
  const t = await plugin({ devices: MK2 });
  try {
    const keys = lightsOut(t, 'mk2', 5, 3);
    await sleep(900); await t.sd.settle(150);
    const u = unitOfCtx(t, keys.get('2,1'));
    assert.ok(u.game, 'one game host for the block'); assert.equal(u.members.length, 15); assert.equal(u.slot.fps, 0, 'idle after the deal');
    const board0 = JSON.stringify(u.game.state);
    const mark = t.sd.received.length;
    t.sd.keyDown(keys.get('2,1')); await sleep(40); t.sd.keyUp(keys.get('2,1'));
    await sleep(900); await t.sd.settle(150);
    assert.notEqual(JSON.stringify(u.game.state), board0, 'the press changed the board');
    const touched = new Set(t.sd.received.slice(mark).filter((m) => m.event === 'setImage').map((m) => m.context));
    const expect = new Set(['2,1', '1,1', '3,1', '2,0', '2,2'].map((k) => keys.get(k)));
    assert.deepEqual([...touched].sort(), [...expect].sort(), 'only the pressed key and its four neighbours were redrawn');
    assert.equal(u.slot.fps, 0, 'static again once the transition settled');
  } finally { await t.close(); }
});

test('games: the snapshot is persisted on the anchor and a new plugin resumes the same board', async () => {
  let saved;
  {
    const t = await plugin({ devices: MK2 });
    try {
      const keys = lightsOut(t, 'mk2', 5, 3);
      await t.sd.settle(150);
      t.sd.keyDown(keys.get('0,0')); t.sd.keyUp(keys.get('0,0'));
      const set = await t.sd.waitFor((m) => m.event === 'setSettings' && m.context === keys.get('0,0') && m.payload.game?.n >= 1, { timeoutMs: 3000 });
      saved = { settings: set.payload, state: unitOfCtx(t, keys.get('0,0')).game.state };
      assert.equal(set.payload.game.facet, 'game-lights-out'); assert.equal(set.payload.game.grid, '5x3'); assert.ok(Number.isInteger(set.payload.gameSeed));
      assert.ok(JSON.stringify(set.payload.game).length < 4096 + 1024);
    } finally { await t.close(); }
  }
  const t2 = await plugin({ devices: MK2 });
  try {
    const ctx = new Map();
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) ctx.set(`${c},${r}`, t2.sd.appear({ device: 'mk2', col: c, row: r, settings: c === 0 && r === 0 ? saved.settings : { facet: 'game-lights-out' } }));
    await t2.sd.settle(150);
    assert.deepEqual(unitOfCtx(t2, ctx.get('0,0')).game.state, saved.state, 'resumed, not re-dealt');
    // a stale copy echoed by the PI never overwrites the plugin's own state
    t2.sd.piSetSettings(ctx.get('0,0'), { ...saved.settings, theme: 'neon', game: { ...saved.settings.game, n: 0, state: null } });
    await t2.sd.settle(100);
    assert.deepEqual(unitOfCtx(t2, ctx.get('0,0')).game.state, saved.state);
  } finally { await t2.close(); }
});

test('games: holding a key 1.5 s deals a new game (not on the Galleon); the PI "New game" works everywhere', async () => {
  const t = await plugin({ devices: [...MK2, ...GALLEON] });
  try {
    const keys = lightsOut(t, 'mk2', 5, 3);
    const gal = lightsOut(t, 'gal', 3, 4);
    await t.sd.settle(150);
    const u = unitOfCtx(t, keys.get('4,2')), g = unitOfCtx(t, gal.get('1,1'));
    t.sd.keyDown(keys.get('4,2')); t.sd.keyDown(gal.get('1,1'));
    await sleep(1650);
    assert.equal(u.game.last.type, 'reset', 'held 1.5 s on the MK.2: new game');
    assert.notEqual(g.game.last.type, 'reset', 'no hold-to-reset on the Galleon');
    t.sd.keyUp(keys.get('4,2')); t.sd.keyUp(gal.get('1,1'));
    t.sd.piAppear(gal.get('1,1'));
    const st = await t.sd.waitFor((m) => m.event === 'sendToPropertyInspector' && m.payload?.type === 'state' && m.context === gal.get('1,1'));
    assert.equal(st.payload.unit.game.holdReset, false);
    t.sd.piSend(gal.get('1,1'), { event: 'game-reset' });
    await sleep(80);
    assert.equal(g.game.last.type, 'reset', 'PI New game');
  } finally { await t.close(); }
});

test('games: a dice roll re-renders about 12 times, then stops', async () => {
  const t = await plugin({ devices: MK2 });
  try {
    const d = t.sd.appear({ device: 'mk2', col: 0, row: 0, settings: { facet: 'game-dice' } });
    await sleep(900); await t.sd.settle(150);
    const u = unitOfCtx(t, d);
    assert.equal(u.mode, 'key'); assert.ok(u.game); assert.equal(u.slot.fps, 0);
    const mark = t.sd.received.length;
    t.sd.keyDown(d); t.sd.keyUp(d);
    await sleep(1300);
    const frames = t.sd.received.slice(mark).filter((m) => m.event === 'setImage' && m.context === d).length;
    assert.ok(frames >= 4 && frames <= 16, `${frames} frames for one roll`);
    const after = t.sd.received.length; await sleep(400);
    assert.equal(t.sd.received.slice(after).filter((m) => m.context === d).length, 0, 'nothing more once settled');
    assert.equal(u.slot.fps, 0);
  } finally { await t.close(); }
});

test('games: ticking games run at tickHz (≤ 4) only while ticking; still motion keeps ticks, drops transitions', async () => {
  const { createGameHost } = await import('../src/scene/game.js');
  const { normalizeFacet } = await import('../src/facets/schema.js');
  const facet = normalizeFacet({ id: 'game-test-clock', title: 'T', category: 'x', description: 'a ticking test game for the runtime', tags: ['t'], surface: 'key', animated: false, fps: 12,
    game: { init: () => ({ on: false, n: 0 }), reduce: (st, ev) => (ev.type === 'press' ? { ...st, on: !st.on } : ev.type === 'tick' ? { ...st, n: st.n + 1 } : st), tickHz: 9, ticking: (st) => st.on, animate: 0.3 },
    render: () => '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"/>' }, 'games/test-clock.js');
  let now = 0;
  const conn = { on() {}, setImage() { return true; }, setFeedback() { return true; }, setFeedbackLayout() {}, setTriggerDescription() {}, setSettings() {}, getGlobalSettings() {}, bufferedAmount: 0, info: {} };
  const rt = new PrismRuntime({ conn, now: () => now, log: () => {} });
  const host = createGameHost(facet, { clock: () => now / 1000 });
  const u = { game: host, cfg: {} };
  assert.equal(rt.gameFps(u), 0, 'idle, not ticking: 0 fps');
  host.dispatch({ type: 'press', t: 0 });
  assert.equal(rt.gameFps(u), 12, 'transition');
  now = 1000;
  assert.equal(rt.gameFps(u), 4, 'ticking: tickHz clamped to 4');
  u.cfg.motion = 'still';
  now = 1100; host.dispatch({ type: 'tick', t: 1.1 });
  assert.equal(rt.gameFps(u), 4, 'still motion: ticks continue');
  host.dispatch({ type: 'press', t: 1.2 }); now = 1200;
  u.cfg.motion = '';
  assert.equal(rt.gameFps(u), 12); now = 2000;
  assert.equal(rt.gameFps(u), 0, 'stopped ticking: back to 0');
  rt.stop();
});

test('dials: ctx.ticks is the accumulated detent count (dial-selector), persisted per dial', async () => {
  const t = await plugin();
  try {
    const d = t.sd.appear({ device: t.plus.id, controller: 'Encoder', col: 1, row: 0, settings: { facet: 'dial-selector' } });
    await t.sd.waitFor((m) => m.event === 'setFeedback' && m.context === d);
    t.sd.rotate(d, 3); t.sd.rotate(d, -1);
    await sleep(60);
    const u = unitOfCtx(t, d);
    assert.equal(t.p.runtime.frameOpts(u).ticks, 2);
    const set = await t.sd.waitFor((m) => m.event === 'setSettings' && m.context === d && m.payload.ticks === 2, { timeoutMs: 3000 });
    assert.equal(set.payload.ticks, 2);
  } finally { await t.close(); }
});

test('dials: a strip panorama sees every dial\'s own value in ctx.values', async () => {
  const t = await plugin();
  try {
    const ds = [0, 1, 2, 3].map((c) => t.sd.appear({ device: t.plus.id, controller: 'Encoder', col: c, row: 0, settings: { facet: 'strip-eq', ...(c === 0 ? { value: 0.9 } : {}) } }));
    await t.sd.settle(120);
    t.sd.rotate(ds[2], -10);
    await sleep(60);
    const v = t.p.runtime.frameOpts(unitOfCtx(t, ds[0])).values;
    assert.equal(v.length, 4);
    assert.equal(v[0], 0.9, 'dial 0 keeps its own value');
    assert.ok(v[2] < v[1], `dial 2 turned down on its own: ${v}`);
    assert.ok(Math.abs(v[2] - (v[1] - 10 * (findFacet('strip-eq').params.step?.default || 0.02))) < 1e-6, 'from its own value, not dial 0\'s');
  } finally { await t.close(); }
});

test('keys: a held key keeps rendering (hold gestures), then settles after release', async () => {
  const t = await plugin({ devices: MK2 });
  try {
    const k = t.sd.appear({ device: 'mk2', col: 0, row: 0, settings: { facet: 'press-hold-confirm' } });
    await sleep(1000); await t.sd.settle(150);
    t.sd.keyDown(k);
    await sleep(1000);
    const mark = t.sd.received.length;
    await sleep(400);
    const during = t.sd.received.slice(mark).filter((m) => m.event === 'setImage' && m.context === k).length;
    assert.ok(during >= 2, `frames 1.0–1.4 s into the hold: ${during}`);
    assert.ok(t.p.runtime.frameOpts(unitOfCtx(t, k)).pressedFor > 1);
    t.sd.keyUp(k);
    await sleep(60);
    assert.equal(t.p.runtime.frameOpts(unitOfCtx(t, k)).pressedFor, 0);
  } finally { await t.close(); }
});

test('games: D7\'s app-counter (key, ticking) and span-scoreboard (span) are hosted', async () => {
  const t = await plugin({ devices: MK2 });
  try {
    const c = t.sd.appear({ device: 'mk2', col: 0, row: 0, settings: { facet: 'app-counter' } });
    const sb = [1, 2].map((col) => t.sd.appear({ device: 'mk2', col, row: 1, settings: { facet: 'span-scoreboard' } }));
    await t.sd.settle(150);
    const uc = unitOfCtx(t, c), us = unitOfCtx(t, sb[0]);
    assert.ok(uc.game && uc.mode === 'key'); assert.ok(us.game && us.mode === 'span' && us.members.length === 2);
    const n0 = uc.game.n, s0 = us.game.n;
    t.sd.keyDown(c); t.sd.keyUp(c); t.sd.keyDown(sb[1]); t.sd.keyUp(sb[1]);
    await sleep(80);
    assert.ok(uc.game.n > n0 && us.game.n > s0, 'presses reached both games');
    assert.equal(us.game.last.key, 1 * 5 + 2, 'the scoreboard got the device key index');
    assert.ok(t.p.runtime.gameFps(uc) <= 12);
  } finally { await t.close(); }
});

// ── API 1.5.1 ────────────────────────────────────────────────────────────────
test('boot: span-power-on plays once on physical decks (changed keys only, never the MCP Deck); a press skips it', async () => {
  const t = await plugin({ devices: [...MK2, { id: 'mcp', name: 'MCP Deck 2', size: { columns: 8, rows: 4 }, type: 14 }], globals: { boot: true } });
  try {
    const keys = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) keys.push(t.sd.appear({ device: 'mk2', col: c, row: r, settings: { facet: 'icon-power' } }));
    const v = t.sd.appear({ device: 'mcp', col: 0, row: 0, settings: { facet: 'icon-power' } });
    await sleep(1500);
    const rt = t.p.runtime;
    assert.ok(rt.boot?.devices.has('mk2') && !rt.boot.devices.has('mcp'));
    const u = unitOfCtx(t, keys[7]);
    assert.equal(u.mode, 'boot'); assert.equal(u.members.length, 15); assert.equal(u.facet.id, 'span-power-on');
    assert.equal(unitOfCtx(t, v).mode, 'key', 'the MCP Deck shows its own facet');
    assert.ok(Math.abs((rt.boot.endAt - rt.bootAt) / 1000 - (u.facet.loop - 1.4)) < 0.01, 'hands back at loop − 1.4 s');
    const h = u.gov.history;
    assert.ok(h.length >= 3 && h.reduce((a, b) => a + b, 0) / h.length < 15, `only changed keys are sent (avg ${h})`);
    t.sd.keyDown(keys[3]); t.sd.keyUp(keys[3]);
    await sleep(120);
    assert.equal(rt.boot, null, 'a key press skipped it');
    assert.equal(unitOfCtx(t, keys[3]).mode, 'key');
    assert.equal(t.sd.contexts.get(keys[3]).settings.state, undefined, 'the skipping press was swallowed (no toggle)');
  } finally { await t.close(); }
});

test('boot: skipped under Still motion and when switched off', async () => {
  for (const globals of [{ motion: 'still' }, { boot: false }]) {
    const t = await plugin({ devices: MK2, globals: { boot: true, ...globals } });
    try {
      const k = t.sd.appear({ device: 'mk2', col: 0, row: 0, settings: { facet: 'icon-power' } });
      await sleep(800);
      assert.equal(t.p.runtime.boot, null, JSON.stringify(globals));
      assert.equal(unitOfCtx(t, k).mode, 'key');
    } finally { await t.close(); }
  }
});

test('heldFor: the last finished press duration reaches the render and game release events', async () => {
  const t = await plugin({ devices: MK2 });
  try {
    const k = t.sd.appear({ device: 'mk2', col: 4, row: 2, settings: { facet: 'press-hold-confirm' } });
    const lo = []; for (let c = 0; c < 3; c++) lo.push(t.sd.appear({ device: 'mk2', col: c, row: 0, settings: { facet: 'game-lights-out' } }));
    await t.sd.settle(150);
    t.sd.keyDown(k); await sleep(350); t.sd.keyUp(k);
    t.sd.keyDown(lo[1]); await sleep(250); t.sd.keyUp(lo[1]);
    await sleep(80);
    const h = t.p.runtime.frameOpts(unitOfCtx(t, k)).heldFor;
    assert.ok(h >= 0.3 && h < 0.6, `heldFor ${h}`);
    const g = unitOfCtx(t, lo[0]).game;
    assert.equal(g.last.type, 'release'); assert.ok(g.last.heldFor >= 0.2 && g.last.heldFor < 0.5, `release heldFor ${g.last.heldFor}`);
  } finally { await t.close(); }
});

test('deck games on the Galleon keep score on the 4 widgets (2:1 windows, 5/9 onto 200×100)', async () => {
  const deckGame = findFacet('game-memory') ? 'game-memory' : 'game-catch';
  const t = await plugin({ devices: GALLEON });
  try {
    const ks = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ks.push(t.sd.appear({ device: 'gal', col: c, row: r, settings: { facet: deckGame } }));
    const ds = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([c, r]) => t.sd.appear({ device: 'gal', controller: 'Encoder', col: c, row: r, settings: { facet: deckGame } }));
    await t.sd.settle(200);
    const u = unitOfCtx(t, ds[0]);
    assert.equal(u.mode, 'deck'); assert.equal(u.members.length, 16); assert.ok(u.game);
    for (const d of ds) {
      const fb = framesTo(t.sd, d).at(-1);
      assert.ok(fb, 'every widget drawn');
      const svg = imageOf(fb);
      assert.match(svg, /width="200" height="100"/); assert.match(svg, /scale\(0.55556 0.55556\)/);
    }
  } finally { await t.close(); }
});

/** A stand-in for src/audio's AudioSource: ref-counted retain(), per-frame snapshot(), info() with a bridge. */
function fakeAudio(state = 'standby') {
  const a = {
    refs: 0, retains: 0, snaps: 0, stopped: 0, state,
    retain() { a.refs++; a.retains++; let done = false; return () => { if (!done) { done = true; a.refs--; } }; },
    snapshot() { a.snaps++; return { audio: { level: 0.8, levels: Array.from({ length: 64 }, (_, i) => (i % 8) / 8), rate: 16 }, spectrum: { bands: Array(16).fill(0.5) } }; },
    info() { return { state: a.state, kind: a.state === 'live' ? 'live' : 'simulated', title: a.state === 'live' ? 'ffmpeg' : null, bridge: a.state === 'live' ? null : { url: 'http://127.0.0.1:43210/prism-audio?t=abc', connected: false } }; },
    async stop() { a.stopped++; },
  };
  return a;
}

test('runtime: audio facets read the source every frame and hold it only while visible on a connected deck', async () => {
  const audio = fakeAudio();
  const t = await plugin({ audio });
  try {
    const ks = [0, 1, 2].map((c) => t.sd.appear({ device: t.galleon.id, col: c, row: 1, settings: { facet: 'span-waveform' } }));
    t.sd.appear({ device: t.galleon.id, col: 0, row: 0, settings: { facet: 'icon-mic' } });
    await t.sd.settle(120);
    assert.equal(audio.refs, 1, 'one retain for the one audio unit; icons do not retain');
    const u = t.p.runtime.unitOf(t.p.runtime.instances.get(ks[0]));
    const snaps = audio.snaps;
    const o = t.p.runtime.frameOpts(u);
    assert.equal(o.data.audio.level, 0.8);
    assert.ok(audio.snaps > snaps, 'snapshot() is read per frame, not from the 1 s hub');
    // the PI offers the bridge only while no native backend is live
    t.sd.piAppear(ks[0]);
    const st = await t.sd.waitFor((x) => x.payload?.type === 'state' && x.payload.unit?.audio);
    assert.equal(st.payload.audio.bridgeUrl, 'http://127.0.0.1:43210/prism-audio?t=abc');
    t.sd.piSend(ks[0], { cmd: 'audio-bridge' });
    const open = await t.sd.waitFor((x) => x.event === 'openUrl');
    assert.equal(open.payload.url, 'http://127.0.0.1:43210/prism-audio?t=abc');
    audio.state = 'live';
    const n = t.sd.sent((x) => x.event === 'openUrl').length;
    t.sd.piSend(ks[0], { cmd: 'audio-bridge' });
    await t.sd.settle(80);
    assert.equal(t.sd.sent((x) => x.event === 'openUrl').length, n, 'no bridge page while capture is live');
    // released while the deck is gone, retained again when it's back, released when the keys leave
    t.sd.disconnect(t.galleon.id); await sleep(60);
    assert.equal(audio.refs, 0);
    t.sd.connectDevices(); await sleep(80);
    assert.equal(audio.refs, 1);
    for (const k of ks) t.sd.disappear(k);
    await sleep(80);
    assert.equal(audio.refs, 0);
  } finally { await t.close(); }
  assert.equal(audio.stopped, 1, 'the source is stopped with the plugin');
});

// ── live channel ─────────────────────────────────────────────────────────────
test('live: validation and safety classes (never trust the caller)', () => {
  assert.equal(classifyBehavior({ kind: 'prism.toggle' }).class, 'safe');
  assert.equal(classifyBehavior({ kind: 'native', uuid: 'com.elgato.streamdeck.system.hotkey' }).class, 'export-only');
  assert.equal(classifyBehavior({ kind: 'native', uuid: 'x.y', settings: { path: 'STREAMDECK://plugins/install/evil' } }).class, 'forbidden');
  assert.equal(classifyBehavior({ kind: 'shell' }).class, 'forbidden');
  const e = [], w = [];
  const ov = resolveLook({ glyph: 'audio/mic', title: 'Room 2', accent: '#b8a2f2', bg: '#000000' }, '$', e, w);
  assert.deepEqual(e, []); assert.equal(ov.facet, 'icon-mic'); assert.equal(ov.params.label, 'Room 2'); assert.ok(ov.params.hue > 280 && ov.params.hue < 310);
  assert.ok(w.some((x) => x.code === 'ignored_field'));
  const e2 = [];
  resolveLook({ image: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><image href="http://evil.example/x.png"/></svg>').toString('base64')}` }, '$', e2, []);
  assert.equal(e2[0]?.code, 'invalid_svg', 'external references in AI images are refused');
  const plan = planOps({ model: getDevice('galleon') }, [{ op: 'set_key', col: 3, row: 0, look: { glyph: 'mic' } }, { op: 'set_dial', dial: 1, layer: 1, feedback: { title: 'CPU', value: 40 } }]);
  assert.equal(plan.errors[0].code, 'out_of_range');
  assert.equal(planOps({ model: getDevice('galleon') }, [{ op: 'set_dial', dial: 1, layer: 1, feedback: { title: 'CPU', value: 40 } }]).errors.length, 0);
  assert.equal(planOps({ model: getDevice('plus') }, [{ op: 'set_dial', dial: 0, layer: 1, feedback: {} }]).errors[0].code, 'invalid_layer');
  assert.equal(tokensEqual('abc', 'abc'), true); assert.equal(tokensEqual('abc', 'abd'), false); assert.equal(tokensEqual('abc', 'ab'), false);
});

test('live: control file paths per OS (never inside the plugin folder)', () => {
  assert.equal(controlPath({ env: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, platform: 'win32', home: 'C:\\Users\\u' }), path.join('C:\\Users\\u\\AppData\\Roaming', 'Prism', 'deck', 'control.json'));
  assert.equal(controlPath({ env: {}, platform: 'darwin', home: '/Users/u' }), path.join('/Users/u', 'Library', 'Application Support', 'Prism', 'deck', 'control.json'));
  assert.equal(controlPath({ env: { XDG_STATE_HOME: '/s' }, platform: 'linux', home: '/home/u' }), path.join('/s', 'prism', 'deck', 'control.json'));
  assert.equal(controlPath({ env: { PRISM_DECK_CONTROL: 'x/c.json' }, platform: 'win32' }), path.resolve('x/c.json'));
});

/** Raw HTTP to the channel (so tests control every header). */
function req(port, method, p, { token, body, host = `127.0.0.1:${port}`, origin, type = 'application/json', raw } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw ?? (body !== undefined ? JSON.stringify(body) : undefined);
    const headers = { host, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(origin ? { origin } : {}), ...(data !== undefined ? { 'content-type': type, 'content-length': Buffer.byteLength(data) } : {}) };
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => { let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* not json */ } resolve({ status: res.statusCode, body: j, headers: res.headers }); }); });
    r.on('error', reject);
    if (data !== undefined) r.write(data);
    r.end();
  });
}
const waitFile = async (f, ms = 3000) => { const t0 = Date.now(); while (!fs.existsSync(f)) { if (Date.now() - t0 > ms) throw new Error(`no ${f}`); await sleep(20); } return JSON.parse(fs.readFileSync(f, 'utf8')); };

test('live: off by default; "Allow AI editing" starts a loopback channel with a private discovery file', async () => {
  const t = await plugin();
  const file = path.join(t.dir, 'control.json');
  try {
    await sleep(100);
    assert.equal(fs.existsSync(file), false, 'no channel, no file while AI editing is off');
    t.sd.piSetGlobals({ aiEditing: true });
    const c = await waitFile(file);
    assert.equal(c.v, 1); assert.equal(c.plugin, 'com.jeremyfhall.prism'); assert.match(c.token, /^[0-9a-f]{64}$/); assert.ok(c.port > 0);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const ok = await req(c.port, 'GET', '/v1/status', { token: c.token });
    assert.equal(ok.status, 200); assert.equal(ok.body.aiEditing, true); assert.equal(ok.body.paired, false);
    assert.ok(ok.body.devices.some((d) => d.type === 12 && !d.virtual) && ok.body.devices.some((d) => d.type === 14 && d.virtual));
    assert.ok(!JSON.stringify(ok.body).includes(c.token), 'the token is never echoed');
    // transport rules
    assert.equal((await req(c.port, 'GET', '/v1/status')).status, 401);
    assert.equal((await req(c.port, 'GET', '/v1/status', { token: 'f'.repeat(64) })).status, 401);
    assert.equal((await req(c.port, 'GET', '/v1/status', { token: c.token, host: `localhost:${c.port}` })).body.error.code, 'bad_host');
    assert.equal((await req(c.port, 'GET', '/v1/status', { token: c.token, origin: 'https://evil.example' })).body.error.code, 'origin_refused');
    assert.equal((await req(c.port, 'POST', '/v1/pair', { token: c.token, raw: 'client=x', type: 'application/x-www-form-urlencoded' })).status, 415);
    assert.equal((await req(c.port, 'POST', '/v1/ops', { token: c.token, raw: `{"x":"${'a'.repeat(2.1 * 1024 * 1024)}"}` })).status, 413);
    assert.equal((await req(c.port, 'GET', '/v1/nope', { token: c.token })).status, 404);
    assert.equal(ok.headers['access-control-allow-origin'], undefined, 'no CORS');
    const w = await req(c.port, 'POST', '/v1/ops', { token: c.token, body: { deviceId: t.galleon.id, ops: [{ op: 'clear_key', col: 0, row: 0 }] } });
    assert.equal(w.status, 403); assert.equal(w.body.error.code, 'not_paired');
    // off again: listener closed, file removed
    t.sd.piSetGlobals({ aiEditing: false });
    const t0 = Date.now(); while (fs.existsSync(file) && Date.now() - t0 < 3000) await sleep(20);
    assert.equal(fs.existsSync(file), false);
    await assert.rejects(req(c.port, 'GET', '/v1/status', { token: c.token }));
  } finally { await t.close(); }
});

test('live: pairing needs a 1.5 s hold on a physical deck (never a tap, never the MCP Deck); then edits, limits, apply, undo', async () => {
  const t = await plugin();
  const file = path.join(t.dir, 'control.json');
  try {
    const gk = t.sd.appear({ device: t.galleon.id, col: 0, row: 0, settings: { facet: 'icon-mic' } });
    const gk2 = t.sd.appear({ device: t.galleon.id, col: 1, row: 0, settings: { facet: 'icon-power' } });
    const mk = t.sd.appear({ device: t.mcp.id, col: 0, row: 0, settings: { facet: 'icon-mic' } });
    await t.sd.waitFor((x) => x.context === gk2 && x.event === 'setImage');
    t.sd.piSetGlobals({ aiEditing: true });
    const c = await waitFile(file);
    const pr = await req(c.port, 'POST', '/v1/pair', { token: c.token, body: { client: 'Claude' } });
    assert.equal(pr.status, 202); assert.match(pr.body.code, /^\d{4}$/);
    const from = t.sd.received.length;
    const prompt = await t.sd.waitFor((x) => x.event === 'setImage' && x.context === gk, { from });
    assert.match(imageOf(prompt), /<path/, 'the top-left Galleon key shows the prompt');
    assert.ok(t.p.runtime.prompt.contexts.has(gk) && !t.p.runtime.prompt.contexts.has(mk), 'the prompt is on the physical Galleon, never the MCP Deck');
    t.sd.keyDown(mk); t.sd.keyUp(mk);           // an AI can press MCP Deck keys: must not approve
    t.sd.keyDown(gk); t.sd.keyUp(gk);           // a press already under way when the prompt appeared: ignored
    await sleep(50);
    assert.equal((await req(c.port, 'POST', '/v1/pair', { token: c.token, body: { pairingId: pr.body.pairingId } })).body.status, 'pending');
    await sleep(420);
    assert.doesNotMatch(imageOf(framesTo(t.sd, gk).at(-1)), /Claude/, 'the key never shows the name the assistant gave itself');
    t.sd.keyDown(mk); await sleep(1700); t.sd.keyUp(mk);   // holding an MCP Deck key never approves either
    t.sd.keyDown(gk); await sleep(500); t.sd.keyUp(gk);     // a tap / short press never approves: it's hold-to-approve
    await sleep(60);
    assert.equal((await req(c.port, 'POST', '/v1/pair', { token: c.token, body: { pairingId: pr.body.pairingId } })).body.status, 'pending');
    const held = t.sd.received.length;
    t.sd.keyDown(gk);
    await sleep(800);
    assert.ok(t.sd.received.slice(held).some((x) => x.event === 'setImage' && x.context === gk && /stroke-dasharray/.test(imageOf(x))), 'a progress ring fills while the key is held');
    assert.equal((await req(c.port, 'POST', '/v1/pair', { token: c.token, body: { pairingId: pr.body.pairingId } })).body.status, 'pending', 'not before 1.5 s');
    await sleep(900);
    t.sd.keyUp(gk);
    await sleep(60);
    assert.equal((await req(c.port, 'POST', '/v1/pair', { token: c.token, body: { pairingId: pr.body.pairingId } })).body.status, 'approved');
    assert.ok(t.sd.received.slice(held).some((x) => x.event === 'showOk' && x.context === gk), 'the app confirms with its check mark');
    // a live edit re-skins the key
    const before = framesTo(t.sd, gk2).at(-1).payload.image;
    const mark = t.sd.received.length;
    const op = await req(c.port, 'POST', '/v1/ops', { token: c.token, body: { deviceId: t.galleon.id, ops: [{ op: 'set_key', col: 1, row: 0, look: { glyph: 'camera', title: 'Cam' }, behavior: { kind: 'prism.toggle' } }] } });
    assert.equal(op.status, 200, JSON.stringify(op.body)); assert.equal(op.body.applied, 1);
    await t.sd.waitFor((x) => x.event === 'setImage' && x.context === gk2 && x.payload.image !== before, { from: mark });
    // safety
    const nat = await req(c.port, 'POST', '/v1/ops', { token: c.token, body: { deviceId: t.galleon.id, ops: [{ op: 'set_key', col: 2, row: 0, look: { glyph: 'mic' }, behavior: { kind: 'native', uuid: 'com.elgato.streamdeck.system.hotkey' } }] } });
    assert.equal(nat.status, 403); assert.equal(nat.body.error.code, 'behavior_not_allowed'); assert.equal(nat.body.error.data.errors[0].code, 'requires_export');
    const bad = await req(c.port, 'POST', '/v1/ops', { token: c.token, body: { deviceId: t.galleon.id, ops: [{ op: 'set_key', col: 9, row: 0, look: { glyph: 'mic' } }] } });
    assert.equal(bad.body.error.code, 'invalid_ops');
    assert.equal((await req(c.port, 'POST', '/v1/ops', { token: c.token, body: { deviceId: 'nope', ops: [] } })).status, 404);
    // per-key rate limit
    let limited = null;
    for (let i = 0; i < 14 && !limited; i++) { const r = await req(c.port, 'POST', '/v1/ops', { token: c.token, body: { deviceId: t.galleon.id, ops: [{ op: 'set_key', col: 2, row: 1, look: { title: `n${i}` } }] } }); if (r.status === 429) limited = r; }
    assert.ok(limited, 'per-key bucket trips'); assert.ok(limited.body.error.data.retryAfterMs > 0); assert.ok(limited.headers['retry-after']);
    // apply: dry run diff, device mismatch, then real, then undo
    const layout = { schema: 'prism-deck-layout/0.1', device: 'galleon-100-sd', pages: [{ id: 'home', keys: [{ col: 0, row: 1, look: { glyph: 'clock' } }], dials: [{ dial: 0, layer: 1, feedback: { title: 'CPU', value: 30 } }] }] };
    const dry = await req(c.port, 'POST', '/v1/apply', { token: c.token, body: { deviceId: t.galleon.id, layout, dryRun: true } });
    assert.equal(dry.status, 200); assert.equal(dry.body.diff.keysSet, 1); assert.equal(dry.body.diff.keysCleared, 2); assert.equal(dry.body.diff.dialsSet, 1);
    assert.equal((await req(c.port, 'POST', '/v1/apply', { token: c.token, body: { deviceId: t.galleon.id, layout: { ...layout, device: 'streamdeck-plus' } } })).body.error.code, 'device_mismatch');
    const ap = await req(c.port, 'POST', '/v1/apply', { token: c.token, body: { deviceId: t.galleon.id, layout } });
    assert.equal(ap.status, 200); assert.equal(ap.body.applied, true);
    assert.equal((await req(c.port, 'POST', '/v1/apply', { token: c.token, body: { deviceId: t.galleon.id, layout } })).status, 429, 'one full apply per second');
    const snap = await req(c.port, 'GET', `/v1/snapshot?deviceId=${t.galleon.id}&render=1`, { token: c.token });
    assert.equal(snap.status, 200); assert.ok(snap.body.keys.some((k) => k.col === 0 && k.row === 0 && k.svg));
    const un = await req(c.port, 'POST', '/v1/undo', { token: c.token, body: { deviceId: t.galleon.id, steps: 1 } });
    assert.equal(un.status, 200); assert.equal(un.body.undone, 1);
    // audit, never the token
    const audit = fs.readFileSync(path.join(t.dir, 'audit.jsonl'), 'utf8');
    assert.match(audit, /"approved"/); assert.match(audit, /"kind":"apply"/); assert.ok(!audit.includes(c.token));
    // switching off removes every AI edit: the key goes back to its own facet
    const live = framesTo(t.sd, gk2).at(-1).payload.image;
    const mark2 = t.sd.received.length;
    t.sd.piSetGlobals({ aiEditing: false });
    await t.sd.waitFor((x) => x.event === 'setImage' && x.context === gk2 && x.payload.image !== live, { from: mark2 });
    assert.equal(fs.existsSync(file), false);
  } finally { await t.close(); }
});

test('live: no physical Prism key → pairing is refused (409), pairing requests are rate limited', async () => {
  const t = await plugin();
  const file = path.join(t.dir, 'control.json');
  try {
    t.sd.appear({ device: t.mcp.id, col: 0, row: 0, settings: { facet: 'icon-mic' } });
    t.sd.piSetGlobals({ aiEditing: true });
    const c = await waitFile(file);
    const r = await req(c.port, 'POST', '/v1/pair', { token: c.token, body: { client: 'x' } });
    assert.equal(r.status, 409); assert.equal(r.body.error.code, 'no_physical_key');
    t.sd.appear({ device: t.plus.id, col: 0, row: 0, settings: { facet: 'icon-mic' } });
    await sleep(50);
    assert.equal((await req(c.port, 'POST', '/v1/pair', { token: c.token, body: { client: 'x' } })).status, 202);
    assert.equal((await req(c.port, 'POST', '/v1/pair', { token: c.token, body: { client: 'y' } })).status, 429);
  } finally { await t.close(); }
});

// ── Deck-Product fix pass (judge J4): honest actions, DEMO data, boot, budget ────────────────
test('honest: Prism Display is visual unless given a press behavior (open URL, switch profile / page, back)', async () => {
  const t = await plugin();
  try {
    const g = t.galleon.id;
    const plain = t.sd.appear({ device: g, col: 0, row: 0, settings: { facet: 'icon-mic' } });
    const url = t.sd.appear({ device: g, col: 1, row: 0, settings: { facet: 'icon-power', press: { kind: 'url', url: 'https://example.com/deck' } } });
    const evil = t.sd.appear({ device: g, col: 2, row: 0, settings: { facet: 'icon-power', press: { kind: 'url', url: 'javascript:alert(1)' } } });
    const prof = t.sd.appear({ device: g, col: 0, row: 1, settings: { facet: 'icon-home', press: { kind: 'profile', page: 2 } } });
    const back = t.sd.appear({ device: g, col: 1, row: 1, settings: { facet: 'icon-back', press: { kind: 'back' } } });
    const dial = t.sd.appear({ device: t.plus.id, controller: 'Encoder', col: 0, row: 0, settings: { facet: 'dial-gauge', press: { kind: 'url', url: 'https://example.com/dial' } } });
    await t.sd.settle(100);
    const acts = () => t.sd.received.filter((m) => m.event === 'openUrl' || m.event === 'switchToProfile');
    for (const k of [plain, evil]) { t.sd.keyDown(k); t.sd.keyUp(k); }
    await sleep(60);
    assert.deepEqual(acts(), [], 'no behavior: visual only; an unsafe URL is dropped by normalizeSettings');
    t.sd.keyDown(url); t.sd.keyUp(url);
    t.sd.keyDown(prof); t.sd.keyUp(prof);
    t.sd.keyDown(back); t.sd.keyUp(back);
    t.sd.keyDown(dial); t.sd.keyUp(dial);
    await sleep(80);
    const a = acts();
    assert.deepEqual(a.map((m) => m.event), ['openUrl', 'switchToProfile', 'switchToProfile', 'openUrl']);
    assert.equal(a[0].payload.url, 'https://example.com/deck');
    assert.deepEqual([a[1].device, a[1].payload], [g, { profile: 'profiles/prism-galleon', page: 1 }], 'page 2 of the bundled Galleon profile (0-based on the wire)');
    assert.deepEqual(a[2].payload, {}, 'no profile name = back to the previous profile');
    assert.equal(a[3].payload.url, 'https://example.com/dial', 'a dial push runs it too');
    assert.equal(normalizeSettings({ facet: 'game-dice', press: { kind: 'url', url: 'https://example.com' } }, { device: getDevice('mk2') }).press, null, 'games: every press is a move');
  } finally { await t.close(); }
});

test('demo: simulated data wears a DEMO tag on the device; live data and a real .ics calendar do not', async () => {
  const dir = tmpdir();
  const ics = path.join(dir, 'agenda.ics');
  const at = new Date(Date.now() + 40 * 60000), z = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  fs.writeFileSync(ics, `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Design review\r\nDTSTART:${z(at)}\r\nDTEND:${z(new Date(+at + 1800000))}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`);
  const { createNodeHub } = await import('../src/apps/sources/node.js');
  const data = await createNodeHub({ audio: false, media: false });
  const t = await plugin({ data });
  const tagged = (ctx) => /id="prism-demo-tag"/.test(imageOf(framesTo(t.sd, ctx).at(-1)));
  try {
    const g = t.galleon.id;
    const cpu = t.sd.appear({ device: g, col: 0, row: 0, settings: { facet: 'app-cpu-ring' } });
    const meet = t.sd.appear({ device: g, col: 1, row: 0, settings: { facet: 'app-next-meeting' } });
    const icon = t.sd.appear({ device: g, col: 2, row: 0, settings: { facet: 'icon-mic' } });
    const wave = [0, 1, 2].map((c) => t.sd.appear({ device: g, col: c, row: 1, settings: { facet: 'span-waveform' } }));
    const widget = t.sd.appear({ device: g, controller: 'Encoder', col: 1, row: 0, settings: { facet: 'app-widget-next' } });
    await sleep(1300); 
    assert.equal(tagged(cpu), false, 'CPU is measured: no tag');
    assert.equal(tagged(icon), false, 'no data, no tag');
    assert.equal(tagged(meet), true, 'the demo calendar is tagged');
    assert.equal(tagged(widget), true, 'on a Galleon widget too');
    assert.deepEqual(wave.map(tagged), [false, false, true], 'a span carries one tag, on its top-right key');
    const svg = imageOf(framesTo(t.sd, meet).at(-1));
    assert.deepEqual(validateSvg(svg, { maxBytes: 98304, profile: 'device' }), [], 'the tag stays in the device SVG subset');
    // point the plugin at a real calendar: the tag goes, the PI says so
    t.sd.piAppear?.(meet);
    t.sd.piSetGlobals({ boot: false, calendarFile: ics });
    await sleep(1600); 
    assert.equal(tagged(meet), false, 'a real .ics: no tag');
    assert.equal(t.p.runtime.sourcesStatus().calendar, 'live');
    assert.equal(t.p.runtime.sourcesStatus().calendarCheck.events, 1);
    assert.equal(t.p.runtime.sourcesStatus().weather, 'demo', 'weather has no source: always demo');
    t.sd.piSetGlobals({ boot: false, calendarFile: path.join(dir, 'missing.ics') });
    await sleep(1600); 
    assert.equal(tagged(meet), true, 'a missing file falls back to the demo day, tagged');
    assert.equal(t.p.runtime.sourcesStatus().calendarCheck.error, 'not found');
  } finally { await t.close(); data.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('boot: the power-on sequence is off by default; the update budget tops out at 250/s', async () => {
  assert.equal(normalizeGlobals({}).boot, false);
  assert.equal(normalizeGlobals({ boot: true }).boot, true);
  assert.equal(normalizeGlobals({ limits: { updatesPerSec: 400 } }).limits.updatesPerSec, 250, 'the lab saw the app queue above ~250/s');
  assert.equal(normalizeGlobals({}).limits.updatesPerSec, 200);
  const t = await plugin({ devices: MK2, globals: { boot: undefined } });
  try {
    const k = t.sd.appear({ device: 'mk2', col: 0, row: 0, settings: { facet: 'icon-power' } });
    await sleep(800);
    assert.equal(t.p.runtime.boot, null, 'no boot sequence unless switched on');
    assert.equal(unitOfCtx(t, k).mode, 'key');
  } finally { await t.close(); }
});

test('plugin: devices from registration info map to models (Galleon, +, MCP Deck grid)', () => {
  assert.equal(deviceFromInfo({ type: 12, size: { columns: 3, rows: 4 } }).id, 'galleon');
  assert.equal(deviceFromInfo({ type: 7, size: { columns: 4, rows: 2 } }).id, 'plus');
  const mcp = deviceFromInfo({ type: 14, size: { columns: 8, rows: 4 }, name: 'MCP Deck 2' });
  assert.equal(mcp.cols, 8); assert.equal(mcp.display, 'software');
});

test('plugin: the built .sdPlugin runs on node (and the Stream Deck app\'s Node 20 when present)', { timeout: 120000 }, async () => {
  const { buildPluginFolder } = await import('../src/export/plugin.js');
  const { smokeTest, findNode20 } = await import('../scripts/build-plugin.mjs');
  const dir = tmpdir();
  try {
    const built = buildPluginFolder({ root: ROOT, outDir: path.join(dir, 'com.jeremyfhall.prism.sdPlugin') });
    for (const node of [...new Set([process.execPath, findNode20()].filter(Boolean))]) {
      const r = await smokeTest(built.dir, { node });
      assert.ok(r.ok, `${node}: ${r.error}\n${r.stderr}`);
      assert.equal(r.feedbackKeys.join(), 'canvas');
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
