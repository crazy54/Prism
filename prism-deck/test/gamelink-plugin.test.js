// Game Link through the plugin runtime, against the fake Stream Deck app (src/plugin/dev/fake-streamdeck.js) and a
// fake CS2 (raw HTTP on a port-0 listener). A test-only probe facet (registered in this process only, never shipped)
// draws the three faces — DEMO round / "Waiting for CS2" / live — and a whiteout quantized to 8 levels per key, like
// the real Game Link facets will. Covers: the 16-member Galleon deck unit, DEMO vs waiting vs live (tag included),
// runtime.dataChanged latency (a frame within one tick, also under Still, where pushes are the only frames),
// the send count of a whole-deck flash burst (≤ Q × surfaces), ctx.motion, and the PI's Connect CS2 / Disconnect
// on a temporary fake Steam tree (never the real one).
//
//   node --test test/gamelink-plugin.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { main } from '../src/plugin/index.js';
import { startFakeStreamDeck } from '../src/plugin/dev/fake-streamdeck.js';
import { decodeSvgDataUrl } from '../src/plugin/system-facets.js';
import { allFacets, findFacet } from '../src/facets/index.js';
import { normalizeFacet, validateFacet } from '../src/facets/schema.js';
import { createHub } from '../src/apps/sources/hub.js';
import { createGameLink } from '../src/apps/sources/gamelink.js';
import { simulatedGameLink } from '../src/apps/sources/gamelink-sim.js';
import { simGameLink } from '../src/facets/gamelink/_gl-sim.js';
import { CFG_NAME } from '../src/apps/sources/gamelink-cs2.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gamelink', 'cs2');
const frame = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'prism-gamelink-plugin-'));
const CS2 = 'ab'.repeat(32), COMP = 'cd'.repeat(32);
const GALLEON = [{ id: 'gal', name: 'Galleon 100 SD', size: { columns: 3, rows: 4 }, type: 12 }];
const Q = 8;   // the probe's (and the real facets') whiteout levels

// ── the probe facet (test-only) ─────────────────────────────────────────────
const FACE = { demo: '#3355aa', waiting: '#808080', live: '#22aa55', spectating: '#555577', between: '#555577', menu: '#aa8822', loading: '#aa8822', watching: '#aa22aa' };
const MOTION_W = { full: 10, calm: 20, still: 30 };
const PROBE = normalizeFacet({
  id: 'gamelink-test-probe', title: 'Game Link test probe', category: 'Whole Deck', tags: ['test'],
  description: 'Test-only facet: the demo / waiting / live faces of Game Link and a whiteout quantized per key.',
  surface: 'deck', data: ['gamelink'], animated: true, fps: 10, loop: 4,
  render(ctx) {
    const g = ctx.data?.gamelink;
    const s = g === undefined ? simGameLink(ctx.t) : g;
    const face = g === undefined ? 'demo' : g === null ? 'waiting' : s.status;
    const fresh = !!s?.player?.fresh;
    const level = fresh && ctx.motion !== 'still' ? Math.round((s.player.flashed || 0) * Q) / Q : 0;
    const hp = fresh ? Math.round(s.player.health ?? 0) : 0;
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${ctx.w}" height="${ctx.h}" viewBox="0 0 ${ctx.w} ${ctx.h}">`;
    for (const c of ctx.deck.keys) {
      out += `<rect id="${ctx.id(`k${c.i}`)}" x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="${FACE[face] || '#000000'}"/>`;
      if (c.i === 0) out += `<rect x="${c.x}" y="${c.y}" width="${(c.w * hp) / 100}" height="8" fill="#ff3344"/>`;
      if (c.i === 1) out += `<rect x="${c.x}" y="${c.y}" width="${MOTION_W[ctx.motion] || 1}" height="8" fill="#ffffff"/>`;
      if (level > 0) out += `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="#ffffff" fill-opacity="${level}"/>`;
    }
    return `${out}</svg>`;
  },
}, 'gamelink/probe.js');
assert.deepEqual(validateFacet(PROBE), []);
if (!findFacet(PROBE.id)) allFacets().push(PROBE);   // this test process only

// ── harness ─────────────────────────────────────────────────────────────────
function req(port, body, { token = CS2 } = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ ...body, auth: { token } });
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/cs2', agent: false, headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject);
    r.end(data);
  });
}

async function plugin({ globals = {}, steam = null, portPolicy = false } = {}) {
  const dir = tmpdir();
  // port 0 unless a test drives the port policy (then always with explicit free ports, never the real 38140);
  // no Steam at all unless a temp tree is given: never even read the real Steam folders
  const gl = createGameLink({ dir: path.join(dir, 'state'), ...(portPolicy ? {} : { port: 0 }), tokens: { cs2: CS2, companion: COMP }, steam: steam || { platform: 'linux', home: path.join(dir, 'nohome'), env: {}, readRegistry: null }, ...(steam ? { platform: steam.platform } : {}) });
  const data = createHub({ sources: [gl.source, simulatedGameLink()] });
  const sd = await startFakeStreamDeck({ devices: GALLEON, globals: { boot: false, ...globals } });
  const p = await main({ argv: sd.argv(), exit: () => {}, handleProcess: false, log: () => {}, controlFile: path.join(dir, 'control.json'), audio: null, data, gamelink: gl });
  await sd.whenRegistered();
  sd.connectDevices();
  return { sd, p, gl, dir, close: async () => { await p.stop(); await sd.close(); await gl.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
async function freePort() { const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise((r) => s.close(r)); return p; }
const imageOf = (m) => decodeSvgDataUrl(m.event === 'setImage' ? m.payload.image : m.payload.canvas);
const framesTo = (sd, ctx) => sd.received.filter((m) => (m.event === 'setImage' || m.event === 'setFeedback') && m.context === ctx);
const lastSvg = (sd, ctx) => { const f = framesTo(sd, ctx).at(-1); return f ? imageOf(f) : ''; };
const tagged = (sd, ctx) => /id="prism-demo-tag"/.test(lastSvg(sd, ctx));
const faceOf = (svg) => Object.entries(FACE).find(([, c]) => svg.includes(`fill="${c}"`))?.[0] || null;

/** The whole Galleon as one deck unit: 12 keys + both dials × both layers. → { keys: [ctx] (row-major), dials: [ctx] } */
function deckPage(t, facet = PROBE.id) {
  const keys = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) keys.push(t.sd.appear({ device: 'gal', col: c, row: r, settings: { facet } }));
  const dials = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([c, r]) => t.sd.appear({ device: 'gal', controller: 'Encoder', col: c, row: r, settings: { facet } }));
  return { keys, dials, all: [...keys, ...dials] };
}

async function waitFor(fn, { timeoutMs = 4000, what = 'condition' } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) { let v; try { v = fn(); } catch { v = undefined; } if (v) return v; if (Date.now() > end) throw new Error(`timed out waiting for ${what}`); await sleep(5); }
}

/**
 * Record what every push paints inside runtime.dataChanged itself (gamelink-fix L10: structure, not milliseconds):
 * [{ urgent, offered (frames submitted to the device budget during the call), priority (… of them with priority) }]
 */
function spyPushes(rt, device) {
  const calls = [];
  const budget = rt.devices.get(device).budget;
  let prio = 0;
  const submit = budget.submit.bind(budget);
  budget.submit = (ctx, kind, payload, o = {}) => { if (o.priority) prio++; return submit(ctx, kind, payload, o); };
  const dataChanged = rt.dataChanged.bind(rt);
  rt.dataChanged = (keys, o = {}) => { const s0 = budget.stats.submitted, p0 = prio; const n = dataChanged(keys, o); calls.push({ urgent: !!o.urgent, offered: budget.stats.submitted - s0, priority: prio - p0 }); return n; };
  return calls;
}

// ── tests ───────────────────────────────────────────────────────────────────
test('plugin: a Galleon deck page is one 16-member unit; DEMO round while off → "Waiting for CS2" → live, the tag follows', async () => {
  const t = await plugin();
  try {
    const page = deckPage(t);
    await t.sd.settle(200);
    const rt = t.p.runtime;
    const u = rt.unitOf(rt.instances.get(page.keys[0]));
    assert.equal(u.mode, 'deck'); assert.equal(u.members.length, 16);
    const topRight = page.keys[2];
    // off: the simulated demo round, tagged DEMO on the top-right key only
    await waitFor(() => ['live', 'spectating', 'between'].includes(faceOf(lastSvg(t.sd, page.keys[0]))), { what: 'the demo round (wherever the wall clock is in its loop)' });
    assert.equal(rt.frameOpts(u).data.gamelink.game, 'cs2');
    assert.deepEqual(rt.frameOpts(u).data.demo, ['gamelink'], '…flagged as demo data');
    assert.equal(tagged(t.sd, topRight), true, 'DEMO on the top-right key');
    assert.equal(page.keys.filter((k) => tagged(t.sd, k)).length, 1, 'one tag per unit');
    assert.equal(rt.sourcesStatus().gamelink, 'off');
    // on, nothing from CS2 yet: the honest waiting face, no tag
    t.sd.piSetGlobals({ boot: false, gamelink: { enabled: true } });
    await waitFor(() => t.gl.status().listening, { what: 'listening' });
    await waitFor(() => faceOf(lastSvg(t.sd, page.keys[0])) === 'waiting', { what: 'waiting face' });
    assert.equal(rt.frameOpts(u).data.gamelink, null);
    assert.equal(tagged(t.sd, topRight), false, 'waiting is not demo');
    assert.equal(rt.sourcesStatus().gamelink, 'waiting');
    // CS2 posts: live
    assert.equal(await req(t.gl.port, frame('07-hurt.json')), 204);
    await waitFor(() => faceOf(lastSvg(t.sd, page.keys[0])) === 'live' && lastSvg(t.sd, page.keys[0]).includes(`width="${(160 * 73) / 100}"`), { what: 'live face with our health' });
    assert.equal(rt.frameOpts(u).data.gamelink.player.health, 73);
    assert.equal(tagged(t.sd, topRight), false);
    assert.equal(rt.sourcesStatus().gamelink, 'live');
    // spectating: the dimmed face, never the teammate's numbers
    for (const f of ['26-death.json', '27-spectating-teammate.json']) await req(t.gl.port, frame(f));
    await waitFor(() => faceOf(lastSvg(t.sd, page.keys[0])) === 'spectating', { what: 'spectating face' });
    // off again: back to the tagged demo
    t.sd.piSetGlobals({ boot: false, gamelink: { enabled: false } });
    await waitFor(() => !t.gl.status().listening && tagged(t.sd, topRight), { what: 'demo again' });
  } finally { await t.close(); }
});

test('plugin: dataChanged lands a frame within one tick — idle at 2 fps, under Calm (≤ 4 fps, no burst) and Still (pushes are its only frames)', async (tc) => {
  for (const motion of ['full', 'calm', 'still']) {
    const t = await plugin({ globals: { motion, gamelink: { enabled: true } } });
    try {
      const page = deckPage(t);
      await waitFor(() => t.gl.status().listening, { what: 'listening' });
      await req(t.gl.port, frame('07-hurt.json'));
      await waitFor(() => lastSvg(t.sd, page.keys[0]).includes(`width="${(160 * 73) / 100}"`), { what: `${motion}: live` });
      const rt = t.p.runtime, u = rt.unitOf(rt.instances.get(page.keys[0]));
      if (motion === 'full') await waitFor(() => u.idle && u.slot.fps <= 2, { timeoutMs: 6000, what: 'the unit idles at the 2 fps probe' });
      else if (motion === 'calm') await waitFor(() => u.slot.fps > 0 && u.slot.fps <= 4, { timeoutMs: 6000, what: 'Calm: ≤ 4 fps' });
      else {
        assert.equal(u.slot.fps, 0, 'Still renders nothing on its own');
        const n = framesTo(t.sd, page.keys[0]).length;
        await sleep(600);
        assert.equal(framesTo(t.sd, page.keys[0]).length, n, 'no frames without a push');
      }
      assert.equal(rt.frameOpts(u).motion, motion);
      assert.ok(lastSvg(t.sd, page.keys[1]).includes(`width="${MOTION_W[motion]}"`), 'ctx.motion reaches the facet');
      // the flashbang: POST → dataChanged → the frame on the device, painted by the push itself (not a later tick)
      await sleep(150);   // past the urgent gap since the previous push (one queue-jumping paint per unit per 100 ms)
      const pushes = spyPushes(rt, 'gal');
      const n0 = framesTo(t.sd, page.keys[5]).length;
      const t0 = performance.now();
      await req(t.gl.port, frame('25-hurt-heavy.json'));
      await waitFor(() => framesTo(t.sd, page.keys[0]).length && lastSvg(t.sd, page.keys[0]).includes(`width="${(160 * 38) / 100}"`), { what: `${motion}: pushed frame` });
      tc.diagnostic(`${motion}: POST → frame on the device in ${(performance.now() - t0).toFixed(1)} ms (HTTP + WebSocket included; informational)`);
      const hit = pushes.find((p) => p.urgent);
      assert.ok(hit, `${motion}: the hurt post pushed urgently`);
      assert.deepEqual([hit.offered, hit.priority], [16, 16], `${motion}: every member painted inside the push, with priority (one frame, no tick needed)`);
      if (motion === 'calm') assert.ok(u.slot.fps <= 4, `Calm: no 15 fps burst after a game event (fps ${u.slot.fps})`);
      if (motion === 'full') assert.ok(u.slot.fps > 4, 'Full: the effect plays at the burst rate');
      assert.equal(framesTo(t.sd, page.keys[5]).length, n0, 'keys whose pixels did not change are not resent');
      // zero ticks: dataChanged paints synchronously — all 16 surfaces are offered to the budget before it returns
      const budget = () => rt.stats().devices.gal.budget.submitted;
      await sleep(150);   // past the urgent gap (≤ 1 queue-jumping data paint per unit per 100 ms)
      const b0 = budget();
      assert.equal(rt.dataChanged(['gamelink'], { urgent: true }), 1, 'one unit reads gamelink');
      assert.equal(budget() - b0, 16, 'a priority frame for every member, inside the call');
      // a second urgent push right after: it trails (no queue-jumping stream of events: M3), it isn't dropped
      const b9 = budget(), p9 = pushes.length;
      rt.dataChanged(['gamelink'], { urgent: true });
      assert.deepEqual([budget() - b9, pushes.at(-1).priority], [0, 0], 'too soon for another priority frame: it trails');
      assert.equal(pushes.length, p9 + 1);
      assert.ok(u.dataTimer, 'a trailing paint is scheduled');
      await waitFor(() => !u.dataTimer && budget() - b9 >= 16, { what: 'the trailing paint' });
      assert.equal(rt.dataChanged(['cpu']), 0, 'units that do not read the key are left alone');
      // non-urgent pushes coalesce: one paint now, one trailing paint ≤ 100 ms later, however many pushes came between
      await sleep(120);
      const b1 = budget();
      for (let i = 0; i < 5; i++) rt.dataChanged(['gamelink']);
      assert.equal(budget() - b1, 16, 'the first push paints at once');
      await waitFor(() => budget() - b1 >= 32, { timeoutMs: 1000, what: 'the trailing paint' });
      await sleep(150);
      // under Still nothing else paints, so this counts exactly the pushes' paints (Full also has its own burst ticks)
      if (motion === 'still') assert.equal(budget() - b1, 32, `coalesced: ${budget() - b1} offers for 5 pushes`);
    } finally { await t.close(); }
  }
});

test('plugin: a whole-deck whiteout burst on the Galleon costs ≤ Q × 16 sends and stays inside the budget', async (tc) => {
  const t = await plugin({ globals: { gamelink: { enabled: true } } });
  try {
    const page = deckPage(t);
    await waitFor(() => t.gl.status().listening, { what: 'listening' });
    for (const f of ['06-round-live.json', '07-hurt.json']) await req(t.gl.port, frame(f));
    await waitFor(() => lastSvg(t.sd, page.keys[0]).includes(`width="${(160 * 73) / 100}"`), { what: 'live' });
    await t.sd.settle(300);
    const ctxs = new Set(page.all);
    const sends = () => t.sd.received.filter((m) => (m.event === 'setImage' || m.event === 'setFeedback') && ctxs.has(m.context)).length;
    const before = sends();
    const stats0 = { ...t.p.runtime.stats().devices.gal.budget };
    // onset, then the decimated fade at CS2 speed (one post every 50 ms), then clear
    const fade = ['08-flash-onset.json', '09-flash-fade-1.json', '10-flash-fade-2.json', '11-flash-fade-3.json', '12-flash-fade-4.json', '13-flash-fade-5.json', '14-flash-clear.json'];
    const pushes = spyPushes(t.p.runtime, 'gal');
    const firstAfter = new Map(page.keys.map((k) => [k, framesTo(t.sd, k).length]));
    const t0 = performance.now();
    await req(t.gl.port, frame(fade[0]));
    await waitFor(() => page.keys.every((k) => lastSvg(t.sd, k).includes('fill-opacity="1"')), { what: 'every key white' });
    const onsetMs = performance.now() - t0;
    // one priority frame does it: the onset push painted every member itself, and each key's very next frame is white
    assert.deepEqual([pushes[0].urgent, pushes[0].offered, pushes[0].priority], [true, 16, 16], 'the onset push: all 16 surfaces, with priority');
    for (const k of page.keys) assert.ok(imageOf(framesTo(t.sd, k)[firstAfter.get(k)]).includes('fill-opacity="1"'), 'the first frame after the post is the whiteout');
    for (const f of fade.slice(1)) { await sleep(50); await req(t.gl.port, frame(f)); }
    await waitFor(() => page.keys.every((k) => !lastSvg(t.sd, k).includes('fill-opacity')), { timeoutMs: 2000, what: 'cleared' });
    await t.sd.settle(400);
    const n = sends() - before;
    const levels = new Set(page.keys.flatMap((k) => framesTo(t.sd, k).map(imageOf).map((s) => /fill-opacity="([\d.]+)"/.exec(s)?.[1] || '0')));
    tc.diagnostic(`onset on all 12 keys in ${onsetMs.toFixed(1)} ms (informational) · ${n} sends for the burst (cap ${Q * 16}) · levels ${[...levels].join(' ')}`);
    assert.ok(n >= 12, `every key whitened (${n} sends)`);
    assert.ok(n <= Q * 16, `${n} sends for the whole burst ≤ ${Q} levels × 16 surfaces`);
    assert.ok(levels.size <= Q + 1, `quantized: ${[...levels].join(', ')}`);
    const b = t.p.runtime.stats().devices.gal.budget;
    assert.ok(b.deduped > stats0.deduped, 'identical slices deduped (the widgets never changed)');
    assert.equal(b.failed, 0);
  } finally { await t.close(); }
});

function steamTree() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-gamelink-pi-steam-'));
  const root = path.join(tmp, 'home', '.local', 'share', 'Steam');
  const game = path.join(root, 'steamapps', 'common', 'Counter-Strike Global Offensive');
  const cfgDir = path.join(game, 'game', 'csgo', 'cfg');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { "0" { "path" "${root.replace(/\\/g, '\\\\')}" "apps" { "730" "1" } } }`);
  fs.writeFileSync(path.join(root, 'steamapps', 'appmanifest_730.acf'), '"AppState" { "appid" "730" "installdir" "Counter-Strike Global Offensive" }');
  fs.mkdirSync(path.join(game, 'game', 'bin', 'linuxsteamrt64'), { recursive: true });
  fs.writeFileSync(path.join(game, 'game', 'bin', 'linuxsteamrt64', 'cs2'), 'fictional');
  fs.writeFileSync(path.join(cfgDir, 'gamestate_integration_steelseries.cfg'), '"SteelSeries (fictional)" {}\n');
  return { tmp, cfgDir, steam: { platform: 'linux', env: {}, home: path.join(tmp, 'home'), readRegistry: null }, close: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

test('plugin: the PI\'s listen toggle and Connect CS2 / Disconnect on a temp Steam tree; "CS2 not found" never blocks listening; never a token', async () => {
  const tree = steamTree();
  const t = await plugin({ steam: tree.steam, portPolicy: true, globals: { gamelink: { enabled: false, port: await freePort() } } });
  try {
    const page = deckPage(t);
    await t.sd.settle(150);
    t.sd.piAppear(page.keys[0]);
    const piStates = () => t.sd.received.filter((m) => m.event === 'sendToPropertyInspector' && m.payload?.type === 'state').map((m) => m.payload);
    await waitFor(() => piStates().length, { what: 'PI state' });
    assert.equal(piStates().at(-1).gameLink.available, true);
    assert.equal(piStates().at(-1).gameLink.state, 'off');
    t.sd.piSend(page.keys[0], { cmd: 'gamelink', action: 'status' });
    await waitFor(() => piStates().at(-1).gameLink.cs2?.found === true, { what: 'found (read-only check)' });
    assert.equal(piStates().at(-1).gameLink.cs2.cfg, 'absent');
    assert.ok(!fs.existsSync(path.join(tree.cfgDir, CFG_NAME)), 'looking never writes');
    // the click
    t.sd.piSend(page.keys[0], { cmd: 'gamelink', action: 'connect-cs2' });
    await waitFor(() => piStates().at(-1).gameLink.last?.ok === true, { what: 'connected' });
    const g = piStates().at(-1).gameLink;
    assert.equal(g.state, 'waiting'); assert.equal(g.cs2.cfg, 'current'); assert.equal(g.last.restartNeeded, true);
    assert.ok(fs.existsSync(path.join(tree.cfgDir, CFG_NAME)));
    assert.equal(t.p.runtime.globals.gamelink.enabled, true);
    assert.ok(t.sd.received.some((m) => m.event === 'setGlobalSettings' && m.payload?.gamelink?.enabled === true), 'persisted with the app');
    // a port change → "out of date" → Reconnect
    const q = await freePort();
    t.sd.piSend(page.keys[0], { cmd: 'gamelink', action: 'port', port: q });
    await waitFor(() => t.gl.status().port === q, { what: 'rebound' });
    await waitFor(() => piStates().at(-1).gameLink.outOfDate === true, { what: 'out of date (re-checked on rebind, pushed to the PI)' });
    assert.equal(piStates().at(-1).gameLink.port, q);
    t.sd.piSend(page.keys[0], { cmd: 'gamelink', action: 'connect-cs2' });
    await waitFor(() => piStates().at(-1).gameLink.outOfDate === false && piStates().at(-1).gameLink.cs2.cfg === 'current', { what: 'reconnected' });
    // Disconnect: our file goes, SteelSeries stays; listening is the toggle's business (companions may use it)
    t.sd.piSend(page.keys[0], { cmd: 'gamelink', action: 'disconnect-cs2' });
    await waitFor(() => piStates().at(-1).gameLink.last?.action === 'disconnect' && piStates().at(-1).gameLink.cs2?.cfg === 'absent', { what: 'disconnected' });
    assert.ok(!fs.existsSync(path.join(tree.cfgDir, CFG_NAME)));
    assert.ok(fs.existsSync(path.join(tree.cfgDir, 'gamestate_integration_steelseries.cfg')));
    assert.equal(t.p.runtime.globals.gamelink.enabled, true);
    assert.equal(piStates().at(-1).gameLink.state, 'waiting');
    // the listen toggle off: no socket at all
    t.sd.piSend(page.keys[0], { cmd: 'gamelink', action: 'listen', on: false });
    await waitFor(() => piStates().at(-1).gameLink.state === 'off' && !t.gl.status().listening, { what: 'listening off' });
    assert.equal(t.p.runtime.globals.gamelink.enabled, false);
    assert.ok(t.sd.received.some((m) => m.event === 'setGlobalSettings' && m.payload?.gamelink?.enabled === false));
    const everything = JSON.stringify(t.sd.received);
    assert.ok(!everything.includes(CS2) && !everything.includes(COMP), 'no token ever reaches the app or the PI');
  } finally { await t.close(); tree.close(); }
  // no install: "CS2 not found", the listener stays off, nothing is written
  const t2 = await plugin();
  try {
    const page = deckPage(t2);
    await t2.sd.settle(100);
    t2.sd.piAppear(page.keys[0]);
    t2.sd.piSend(page.keys[0], { cmd: 'gamelink', action: 'connect-cs2' });
    const piStates = () => t2.sd.received.filter((m) => m.event === 'sendToPropertyInspector' && m.payload?.type === 'state').map((m) => m.payload);
    await waitFor(() => piStates().at(-1)?.gameLink?.last?.reason, { what: 'not found' });
    const g = piStates().at(-1).gameLink;
    assert.equal(g.last.ok, false); assert.equal(g.state, 'off');
    assert.ok(['not-installed', 'no-steam'].includes(g.last.reason), g.last.reason);
    assert.equal(t2.gl.status().listening, false);
    assert.equal(t2.p.runtime.globals.gamelink.enabled, false);
    // "CS2 not found" never blocks the listen toggle: companions (Prism Sight) work without CS2
    t2.sd.piSend(page.keys[0], { cmd: 'gamelink', action: 'listen', on: true });
    await waitFor(() => t2.gl.status().listening && piStates().at(-1).gameLink.state === 'waiting', { what: 'listening without CS2' });
    assert.equal(t2.p.runtime.globals.gamelink.enabled, true);
    assert.equal(piStates().at(-1).gameLink.enabled, true);
    const disc = JSON.parse(fs.readFileSync(t2.gl.file, 'utf8'));
    const body = JSON.stringify({ v: 1, source: 'prism-sight', game: 'nms', session: 'run-1', seq: 1, state: { status: 'live', player: { health: 64 } } });
    const code = await new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port: disc.port, method: 'POST', path: '/v1/companion', agent: false, headers: { host: `127.0.0.1:${disc.port}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), authorization: `Bearer ${disc.tokens.companion}` } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      r.on('error', reject); r.end(body);
    });
    assert.equal(code, 200, 'a companion posts with the token from gamelink.json');
    const rt = t2.p.runtime, u = rt.unitOf(rt.instances.get(page.keys[0]));
    await waitFor(() => rt.frameOpts(u).data.gamelink?.game === 'nms', { what: 'companion data on the deck' });
    assert.equal(rt.gameLinkStatus().state, 'live');
    t2.sd.piSend(page.keys[0], { cmd: 'gamelink', action: 'listen', on: false });
    await waitFor(() => !t2.gl.status().listening, { what: 'closed' });
  } finally { await t2.close(); }
});
