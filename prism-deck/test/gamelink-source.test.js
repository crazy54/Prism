// Game Link listener + hub source (src/apps/sources/gamelink.js) against a fake CS2 and a fake companion: real HTTP on
// 127.0.0.1, port 0 everywhere (files run in parallel), gamelink.json in a temp folder. Covers: nothing binds or
// touches the disk at construction; tokens; Host / Origin / route / size / type checks; POST /v1/cs2 is ALWAYS 204 and
// drops bad input silently (counted); the companion route's status codes; stale → null (waiting); the hub's
// absent / simulated / live / null answers; port fallback and persistence; the createNodeHub wiring.
//
//   node --test test/gamelink-source.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createGameLink, parseGameLinkFile, gameLinkDir, tokensEqual, DEFAULT_PORT } from '../src/apps/sources/gamelink.js';
import { FLASH_HOLD_MS, FLASH_STUCK_MS } from '../src/apps/sources/gamelink-cs2.js';
import { createHub } from '../src/apps/sources/hub.js';
import { simulatedGameLink } from '../src/apps/sources/gamelink-sim.js';
import { createNodeHub } from '../src/apps/sources/node.js';
import { fakeSystem } from '../src/audio/fake.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gamelink', 'cs2');
const SEQ = JSON.parse(fs.readFileSync(path.join(FIX, 'sequence.json'), 'utf8'));
const frame = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'prism-gamelink-'));
const CS2 = 'ab'.repeat(32), COMP = 'cd'.repeat(32);   // fictional tokens
const withToken = (p, token = CS2) => ({ ...p, auth: { token } });

async function waitFor(fn, { timeoutMs = 4000, what = 'condition' } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    let v;
    try { v = fn(); } catch { v = undefined; }
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

/** Raw HTTP, so the tests control every header (Host, Origin, Content-Type, Authorization). */
function req(port, method, p, { body, raw, host = `127.0.0.1:${port}`, origin, type = 'application/json', token, ua = 'Valve/Steam HTTP Client 1.0 (730)' } = {}) {
  return new Promise((resolve, reject) => {
    const data = raw ?? (body !== undefined ? JSON.stringify(body) : undefined);
    const headers = { host, 'user-agent': ua, ...(origin ? { origin } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { 'content-type': type, 'content-length': Buffer.byteLength(data) } : {}) };
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers, agent: false }, (res) => { let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch { /* empty */ } resolve({ status: res.statusCode, body: j, text: s }); }); });
    r.on('error', reject);
    if (data !== undefined) r.write(data);
    r.end();
  });
}

function setup(extra = {}) {
  const dir = tmpdir();
  const gl = createGameLink({ dir, port: 0, tokens: { cs2: CS2, companion: COMP }, ...extra });
  const changes = [];
  gl.on('change', (keys, o) => changes.push({ keys, ...o }));
  const hub = createHub({ sources: [gl.source, simulatedGameLink()] });
  return { dir, gl, hub, changes, close: async () => { hub.stop(); await gl.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('gamelink: nothing binds, reads or writes until enabled; disabled = the demo round (simulated)', async () => {
  const t = setup();
  const release = t.hub.need(['gamelink']);
  try {
    assert.equal(t.gl.status().listening, false);
    assert.equal(t.gl.port, null);
    assert.deepEqual(fs.readdirSync(t.dir), [], 'no gamelink.json before the user turns Game Link on');
    assert.deepEqual(t.gl.source.snapshot(), {});
    assert.equal(t.hub.sourceOf(['gamelink']).gamelink, 'simulated', 'the demo round serves the key (the plugin tags it DEMO)');
    assert.equal(t.hub.pick(['gamelink']).gamelink.game, 'cs2');
    await t.gl.configure({ enabled: true });
    const port = t.gl.port;
    assert.ok(port > 0);
    assert.equal(t.hub.pick(['gamelink']).gamelink, null, 'listening, no game yet: null → the "Waiting for CS2" face');
    assert.equal(t.hub.sourceOf(['gamelink']).gamelink, 'live', 'waiting is honest, not DEMO');
    assert.ok(t.changes.length >= 1, 'binding pushes (the face switches at once)');
    const disc = parseGameLinkFile(fs.readFileSync(t.gl.file, 'utf8'));
    assert.deepEqual(disc, { port, tokens: { cs2: CS2, companion: COMP } });
    const raw = JSON.parse(fs.readFileSync(t.gl.file, 'utf8'));
    assert.equal(raw.pid, process.pid); assert.equal(raw.baseUrl, `http://127.0.0.1:${port}`); assert.equal(raw.plugin, 'com.jeremyfhall.prism');
    if (process.platform !== 'win32') assert.equal(fs.statSync(t.gl.file).mode & 0o777, 0o600);
    await t.gl.configure({ enabled: false });
    assert.equal(t.gl.status().listening, false);
    await assert.rejects(req(port, 'GET', '/v1/health', { token: COMP }), 'the socket is closed');
    assert.equal(JSON.parse(fs.readFileSync(t.gl.file, 'utf8')).pid, null, 'the file stays (tokens persist), marked not running');
    assert.equal(t.hub.sourceOf(['gamelink']).gamelink, 'simulated');
  } finally { release(); await t.close(); }
});

test('gamelink: POST /v1/cs2 is always 204; bad input is dropped silently and counted; Host / Origin / route answer 421 / 403 / 404', async () => {
  const t = setup();
  const release = t.hub.need(['gamelink']);
  try {
    await t.gl.configure({ enabled: true });
    const port = t.gl.port;
    const good = withToken(frame('07-hurt.json'));
    const ok = await req(port, 'POST', '/v1/cs2', { body: good });
    assert.equal(ok.status, 204); assert.equal(ok.text, '');
    await waitFor(() => t.hub.pick(['gamelink']).gamelink?.player?.health === 73, { what: 'live state' });
    assert.equal(t.hub.sourceOf(['gamelink']).gamelink, 'live');
    const before = t.gl.status().refused;
    const cases = [
      [{ body: withToken(frame('25-hurt-heavy.json'), 'f'.repeat(64)) }, 'token'],
      [{ body: frame('25-hurt-heavy.json') }, 'token'],
      [{ raw: 'x=1', type: 'text/plain' }, 'type'],
      [{ raw: '{"auth":' }, 'json'],
      [{ raw: '[1,2,3]' }, 'json'],
      [{ raw: `{"x":"${'a'.repeat(70 * 1024)}"}` }, 'size'],
      [{ body: withToken({ ...frame('25-hurt-heavy.json'), provider: { appid: 570 } }) }, 'appid'],
    ];
    for (const [opts, why] of cases) {
      const r = await req(port, 'POST', '/v1/cs2', opts);
      assert.equal(r.status, 204, `${why}: still 204 (an error reply makes CS2 resend in a hot loop)`);
    }
    await sleep(30);
    const after = t.gl.status().refused;
    for (const k of ['token', 'type', 'json', 'size', 'appid']) assert.ok(after[k] > before[k], `${k} counted`);
    assert.equal(t.hub.pick(['gamelink']).gamelink.player.health, 73, 'refused posts change nothing');
    assert.equal((await req(port, 'POST', '/v1/cs2', { body: good, host: `localhost:${port}` })).status, 421);
    assert.equal((await req(port, 'POST', '/v1/cs2', { body: good, host: `evil.example:${port}` })).status, 421);
    assert.equal((await req(port, 'POST', '/v1/cs2', { body: good, origin: 'https://evil.example' })).status, 403);
    assert.equal((await req(port, 'GET', '/v1/cs2')).status, 404);
    assert.equal((await req(port, 'POST', '/v1/nope', { body: {} })).status, 404);
    assert.equal((await req(port, 'OPTIONS', '/v1/cs2', { origin: 'https://evil.example' })).status, 403, 'a CORS preflight is refused');
    // nothing secret or personal anywhere observable
    const seen = JSON.stringify([t.gl.status(), t.gl.source.status(), t.hub.pick(['gamelink']), t.hub.status()]);
    for (const s of [CS2, COMP, '76561198000000001', 'PrismPilot']) assert.ok(!seen.includes(s), `never exposes ${s.slice(0, 12)}…`);
  } finally { release(); await t.close(); }
});

test('gamelink: replaying the fixture round over HTTP gives the same states; changes push, urgent on events', async () => {
  const t = setup();
  const release = t.hub.need(['gamelink']);
  try {
    await t.gl.configure({ enabled: true });
    const port = t.gl.port;
    const statuses = [];
    for (const fr of SEQ.frames.slice(0, 31)) {
      const n = t.gl.status().accepted;
      assert.equal((await req(port, 'POST', '/v1/cs2', { body: withToken(frame(fr.file)) })).status, 204);
      await waitFor(() => t.gl.status().accepted > n, { what: fr.file });
      statuses.push(t.hub.pick(['gamelink']).gamelink.status);
    }
    assert.deepEqual([...new Set(statuses)], ['menu', 'loading', 'live', 'spectating', 'between']);
    const urgent = t.changes.filter((c) => c.urgent).length, calm = t.changes.filter((c) => !c.urgent).length;
    assert.ok(urgent >= 10 && calm >= 1, `urgent ${urgent}, calm ${calm}`);
    assert.ok(t.changes.every((c) => c.keys.length === 1 && c.keys[0] === 'gamelink'));
    // a heartbeat with nothing new: no push, the same snapshot object (frames dedupe)
    const s1 = t.hub.pick(['gamelink']).gamelink, pushes = t.changes.length, n = t.gl.status().accepted;
    await req(port, 'POST', '/v1/cs2', { body: withToken(frame('30-round-over-no-player.json')) });
    await waitFor(() => t.gl.status().accepted > n);
    assert.equal(t.changes.length, pushes);
    assert.equal(t.hub.pick(['gamelink']).gamelink, s1);
  } finally { release(); await t.close(); }
});

test('gamelink: no posts for staleMs → null ("Waiting for CS2"), pushed even with no frame due; posts again → live', async () => {
  const t = setup({ staleMs: 600 });
  const release = t.hub.need(['gamelink']);
  try {
    await t.gl.configure({ enabled: true });
    const port = t.gl.port;
    await req(port, 'POST', '/v1/cs2', { body: withToken(frame('07-hurt.json')) });
    await waitFor(() => t.hub.pick(['gamelink']).gamelink?.status === 'live');
    const n = t.changes.length;
    await waitFor(() => t.hub.pick(['gamelink']).gamelink === null, { what: 'stale' });
    await waitFor(() => t.changes.length > n, { what: 'the stale push' });
    assert.equal(t.gl.status().waiting, true);
    await req(port, 'POST', '/v1/cs2', { body: withToken(frame('07-hurt.json')) });
    await waitFor(() => t.hub.pick(['gamelink']).gamelink?.player?.health === 73, { what: 'live again (same state, new posts)' });
  } finally { release(); await t.close(); }
});

test('gamelink: the companion route — Bearer, rate, type, size, JSON, body checks; health never echoes state', async () => {
  const t = setup();
  const release = t.hub.need(['gamelink']);
  try {
    await t.gl.configure({ enabled: true });
    const port = t.gl.port;
    const batch = { v: 1, source: 'prism-sight', game: 'nms', session: 'run-1', seq: 1, sentAt: Date.now(), state: { status: 'live', player: { health: 64 }, detail: { system: 'Example System' } }, events: [{ type: 'hurt', damage: 5 }] };
    assert.equal((await req(port, 'POST', '/v1/companion', { body: batch })).status, 401);
    assert.equal((await req(port, 'POST', '/v1/companion', { body: batch, token: CS2 })).status, 401, 'the CS2 token can\'t drive the companion route');
    assert.equal((await req(port, 'POST', '/v1/companion', { raw: 'hello', type: 'text/plain', token: COMP })).status, 415);
    assert.equal((await req(port, 'POST', '/v1/companion', { raw: `{"x":"${'a'.repeat(300 * 1024)}"}`, token: COMP })).status, 413);
    assert.equal((await req(port, 'POST', '/v1/companion', { raw: '{', token: COMP })).status, 400);
    assert.equal((await req(port, 'POST', '/v1/companion', { body: { ...batch, game: 'Bad Id' }, token: COMP })).status, 400);
    const ok = await req(port, 'POST', '/v1/companion', { body: batch, token: COMP });
    assert.equal(ok.status, 200); assert.deepEqual(ok.body, {});
    await waitFor(() => t.hub.pick(['gamelink']).gamelink?.game === 'nms', { what: 'companion state' });
    const g = t.hub.pick(['gamelink']).gamelink;
    assert.equal(g.player.health, 64); assert.deepEqual(g.nms, { system: 'Example System' }); assert.equal(g.events[0].type, 'hurt');
    assert.deepEqual((await req(port, 'POST', '/v1/companion', { body: batch, token: COMP })).body, { duplicate: true });
    const h = await req(port, 'GET', '/v1/health', { token: COMP });
    assert.equal(h.status, 200); assert.equal(h.body.ok, true); assert.equal(h.body.api, 1); assert.equal(h.body.game, 'nms');
    assert.deepEqual(Object.keys(h.body).sort(), ['api', 'game', 'lastAt', 'ok']);
    assert.equal((await req(port, 'GET', '/v1/health')).status, 401);
  } finally { release(); await t.close(); }
  // the rate limit (a separate client with a tiny bucket)
  const r = setup({ limits: { requestsPerSec: 1, requestBurst: 3 } });
  try {
    await r.gl.configure({ enabled: true });
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await req(r.gl.port, 'POST', '/v1/companion', { body: { v: 1, game: 'nms', session: 's', seq: i, state: { status: 'live' } }, token: COMP })).status);
    assert.ok(codes.filter((c) => c === 429).length >= 2, `rate limited: ${codes.join(' ')}`);
    for (let i = 0; i < 6; i++) assert.equal((await req(r.gl.port, 'GET', '/v1/health', { token: COMP })).status, 200, 'health shares no bucket with posts');
  } finally { await r.close(); }
});

test('gamelink: CS2 and a companion share one key; the latest live game wins', async () => {
  const t = setup();
  const release = t.hub.need(['gamelink']);
  try {
    await t.gl.configure({ enabled: true });
    const port = t.gl.port;
    await req(port, 'POST', '/v1/cs2', { body: withToken(frame('07-hurt.json')) });
    await waitFor(() => t.hub.pick(['gamelink']).gamelink?.game === 'cs2');
    await req(port, 'POST', '/v1/companion', { token: COMP, body: { v: 1, game: 'pc2', session: 's', seq: 1, state: { status: 'live', player: { money: 25000 } } } });
    await waitFor(() => t.hub.pick(['gamelink']).gamelink?.game === 'pc2');
    await req(port, 'POST', '/v1/cs2', { body: withToken(frame('25-hurt-heavy.json')) });
    await waitFor(() => t.hub.pick(['gamelink']).gamelink?.game === 'cs2');
  } finally { release(); await t.close(); }
});

test('gamelink: port policy — the wanted port, else the next nine; the port that worked is persisted; a change rebinds', async () => {
  // find a free block of ports (probed: every one of the ten), take its first port, and let the client fall back
  const taken = await freeBlock(10);
  assert.ok(taken, 'a free block of 10 ports');
  const blocker = http.createServer();
  await new Promise((r) => blocker.listen(taken, '127.0.0.1', r));
  const dir = tmpdir();
  const gl = createGameLink({ dir, tokens: { cs2: CS2, companion: COMP } });
  try {
    await gl.configure({ enabled: true, port: taken });
    const s = gl.status();
    assert.equal(s.listening, true);
    assert.ok(s.port > taken && s.port <= taken + 9, `fell back to ${s.port}`);
    assert.equal(JSON.parse(fs.readFileSync(gl.file, 'utf8')).port, s.port, 'persisted');
    assert.equal((await req(s.port, 'GET', '/v1/health', { token: COMP })).status, 200);
    // a port change rebinds (never the real 38140 in tests: a port the OS just handed out and freed)
    const probe = http.createServer();
    await new Promise((r) => probe.listen(0, '127.0.0.1', r));
    const q = probe.address().port;
    await new Promise((r) => probe.close(r));
    await gl.configure({ enabled: true, port: q });
    assert.equal(gl.status().port, q);
    assert.equal(JSON.parse(fs.readFileSync(gl.file, 'utf8')).port, q);
    await assert.rejects(req(s.port, 'GET', '/v1/health', { token: COMP }), 'the old port is closed');
    assert.equal(DEFAULT_PORT, 38140);
  } finally { await gl.stop(); blocker.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  // a fresh client reads the persisted port + tokens (the CS2 cfg keeps working across restarts)
  const dir2 = tmpdir();
  try {
    fs.writeFileSync(path.join(dir2, 'gamelink.json'), JSON.stringify({ v: 1, plugin: 'com.jeremyfhall.prism', api: 1, port: 40123, tokens: { cs2: CS2, companion: COMP } }));
    const gl2 = createGameLink({ dir: dir2, port: 0 });
    await gl2.configure({ enabled: true });
    assert.equal((await req(gl2.port, 'GET', '/v1/health', { token: COMP })).status, 200, 'the persisted companion token');
    await gl2.stop();
    // a corrupt file → fresh tokens, never a crash
    fs.writeFileSync(path.join(dir2, 'gamelink.json'), '{nope');
    const gl3 = createGameLink({ dir: dir2, port: 0 });
    await gl3.configure({ enabled: true });
    const j = parseGameLinkFile(fs.readFileSync(path.join(dir2, 'gamelink.json'), 'utf8'));
    assert.ok(j && j.tokens.cs2 !== CS2 && /^[0-9a-f]{64}$/.test(j.tokens.companion));
    await gl3.stop();
  } finally { fs.rmSync(dir2, { recursive: true, force: true }); }
  assert.equal(parseGameLinkFile('{"v":1,"plugin":"x","tokens":{}}'), null);
  assert.equal(gameLinkDir({ env: { PRISM_DECK_GAMELINK_DIR: 'x/y' } }), path.resolve('x/y'));
  assert.equal(gameLinkDir({ env: { APPDATA: 'C:\\Users\\example\\AppData\\Roaming' }, platform: 'win32' }), path.join('C:\\Users\\example\\AppData\\Roaming', 'Prism', 'deck'));
  assert.ok(tokensEqual('ab', 'ab') && !tokensEqual('ab', 'abc') && !tokensEqual(undefined, 'x'));
});

test('createNodeHub: the gamelink source and the demo round are wired; PRISM_DECK_GAMELINK=off; hub.stop() closes the socket', async () => {
  const dir = tmpdir();
  const opts = (env = {}) => ({ sys: fakeSystem({ platform: 'linux', env: { PATH: '/usr/bin', ...env } }), system: false, audio: false, media: false, calendar: false, prismControl: false, gamelink: { dir, port: 0, tokens: { cs2: CS2, companion: COMP } } });
  const hub = await createNodeHub(opts());
  const release = hub.need(['gamelink']);
  try {
    assert.equal(typeof hub.gameLink?.configure, 'function');
    assert.match(hub.status().keys.gamelink, /^gamelink:idle > gamelink:simulated$/);
    assert.equal(hub.sourceOf(['gamelink']).gamelink, 'simulated');
    await hub.gameLink.configure({ enabled: true });
    assert.match(hub.status().keys.gamelink, /^gamelink:live > gamelink:simulated$/);
    const port = hub.gameLink.port;
    assert.equal((await req(port, 'GET', '/v1/health', { token: COMP })).status, 200);
    release();
    hub.stop();
    await waitFor(() => !hub.gameLink.status().listening, { what: 'closed by hub.stop()' });
    await assert.rejects(req(port, 'GET', '/v1/health', { token: COMP }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const off = await createNodeHub(opts({ PRISM_DECK_GAMELINK: 'off' }));
  assert.ok(!off.gameLink && !off.sources.some((s) => s.id === 'gamelink' && s.mode !== 'simulated'), 'PRISM_DECK_GAMELINK=off');
  const none = await createNodeHub({ ...opts(), gamelink: false, simulate: false });
  assert.ok(!none.sources.some((s) => s.id === 'gamelink'));
  off.stop(); none.stop();
});

// ── gamelink-fix: the review's findings (H1, M2, M3, L2, L3, L4, L10, L11) ────────────────────────────────────
/** A manual clock for createGameLink({ now, setTimer, clearTimer }): timer-driven behavior without wall-clock races. */
function fakeClock(t0 = Date.UTC(2026, 9, 10, 19, 0, 0)) {
  let t = t0;
  const timers = new Set();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const h = { at: t + Math.max(0, ms), fn, unref() { return h; } }; timers.add(h); return h; },
    clearTimer: (h) => { timers.delete(h); },
    /** Move time forward, firing every timer that falls due on the way, in order. */
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers].filter((h) => h.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.delete(due); t = due.at; due.fn();
      }
      t = end;
    },
  };
}
/** A free port outside [avoid, avoid + n). */
async function freePort(avoid = -1, n = 0) { for (;;) { const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise((r) => s.close(r)); if (p < avoid || p >= avoid + n) return p; } }
const NO_STEAM = { platform: 'linux', env: {}, home: path.join(os.tmpdir(), 'prism-gamelink-no-home-example'), readRegistry: null };   // never the real Steam folders
const heartbeatOf = (f) => { const b = frame(f); delete b.previously; delete b.added; return b; };
/** Ports [p, p + n) all free on 127.0.0.1 right now (probed by binding each), or null. */
async function freeBlock(n = 10) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const s = http.createServer();
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const base = s.address().port;
    await new Promise((r) => s.close(r));
    if (base + n > 65535) continue;
    const held = [];
    let ok = true;
    for (let p = base; p < base + n; p++) {
      const x = http.createServer();
      const bound = await new Promise((r) => { x.once('error', () => r(false)); x.listen(p, '127.0.0.1', () => r(true)); });
      if (!bound) { ok = false; break; }
      held.push(x);
    }
    await Promise.all(held.map((x) => new Promise((r) => x.close(r))));
    if (ok) return base;
  }
  return null;
}

test('gamelink: the flash hold runs on the listener\'s timer — silence holds, a heartbeat refreshes, one safety clear, never a re-onset (H1, L11)', async () => {
  const clock = fakeClock();
  const t = setup({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const release = t.hub.need(['gamelink']);
  try {
    await t.gl.configure({ enabled: true });
    const port = t.gl.port;
    const post = async (body) => { const n = t.gl.status().accepted; await req(port, 'POST', '/v1/cs2', { body: withToken(body) }); await waitFor(() => t.gl.status().accepted > n, { what: 'ingested' }); };
    const flashed = () => t.gl.source.snapshot(clock.now()).gamelink?.player?.flashed;
    await post(frame('07-hurt.json'));
    await post(frame('08-flash-onset.json'));
    const t0 = clock.now();
    assert.equal(flashed(), 1);
    clock.advance(FLASH_HOLD_MS - 10);
    assert.equal(flashed(), 1, 'silence holds the whiteout (no post for 6.49 s)');
    await post(heartbeatOf('08-flash-onset.json'));   // CS2's heartbeat, still 255
    const n = t.changes.length;
    clock.advance(FLASH_STUCK_MS - (clock.now() - t0) - 10);
    assert.equal(flashed(), 1, 'the heartbeat refreshed the hold');
    assert.equal(t.changes.length, n, 'no push while holding');
    clock.advance(20);   // FLASH_STUCK_MS after the last change: a stuck stream
    assert.equal(flashed(), 0, 'the safety clear');
    const ev = t.gl.source.snapshot(clock.now()).gamelink.events.at(-1);
    assert.deepEqual([ev.type, ev.timeout], ['flashClear', true]);
    assert.ok(t.changes.at(-1).urgent, 'pushed at once (urgent)');
    // the stream keeps saying 255 (heartbeats) and then fades: no second whiteout
    for (const b of [heartbeatOf('08-flash-onset.json'), frame('09-flash-fade-1.json'), frame('10-flash-fade-2.json')]) { clock.advance(500); await post(b); }
    const g = t.gl.source.snapshot(clock.now()).gamelink;
    assert.equal(g.player.flashed, 0);
    assert.deepEqual(g.events.filter((e) => (e.type === 'flashOnset' || e.type === 'flashFull') && e.at > ev.at), [], 'no strike after the safety clear');
    assert.equal(g.events.filter((e) => e.type === 'flashOnset').length, 1, 'one onset, ever');
  } finally { release(); await t.close(); }
});

test('gamelink: one CS2 socket is reused after 5.0 s idle, even with Node 20\'s missing keep-alive buffer (M2)', async () => {
  const orig = http.createServer;
  http.createServer = (...a) => { const s = orig(...a); s.keepAliveTimeoutBuffer = 0; return s; };   // Node 20: closed at exactly keepAliveTimeout
  let t;
  try { t = setup(); await t.gl.configure({ enabled: true }); } finally { http.createServer = orig; }
  const net = await import('node:net');
  const s = net.connect(t.gl.port, '127.0.0.1');
  try {
    await new Promise((r, j) => { s.once('connect', r); s.once('error', j); });
    let buf = '';
    const replies = [];
    let closed = null;
    s.on('data', (d) => { buf += d; for (let i; (i = buf.indexOf('\r\n\r\n')) >= 0;) { replies.push(buf.slice(0, i)); buf = buf.slice(i + 4); } });
    s.on('close', () => { closed = closed || 'closed'; }); s.on('error', (e) => { closed = e.code; });
    const send = (body) => { const data = JSON.stringify(withToken(body)); s.write(`POST /v1/cs2 HTTP/1.1\r\nUser-Agent: Valve/Steam HTTP Client 1.0 (730)\r\nContent-Type: application/json\r\nHost: 127.0.0.1:${t.gl.port}\r\nContent-Length: ${Buffer.byteLength(data)}\r\n\r\n${data}`); };
    send(frame('07-hurt.json'));
    await waitFor(() => replies.length === 1, { what: 'first 204' });
    assert.match(replies[0], /^HTTP\/1\.1 204/);
    assert.match(replies[0], /keep-alive: timeout=30/i, 'the server keeps the socket 30 s');
    await sleep(5000);   // CS2's heartbeat: 5.0 s after our last 2XX
    assert.equal(closed, null, 'still open at the heartbeat');
    send(frame('07-hurt.json'));
    await waitFor(() => replies.length === 2 || closed, { what: 'second reply' });
    assert.equal(closed, null);
    assert.match(replies[1], /^HTTP\/1\.1 204/, 'the heartbeat is answered on the same socket');
  } finally { s.destroy(); await t.close(); }
});

test('gamelink: Listen off → on never serves the old CS2 state as live; it stays the baseline for the next post (L4)', async () => {
  const t = setup();
  const release = t.hub.need(['gamelink']);
  try {
    await t.gl.configure({ enabled: true });
    await req(t.gl.port, 'POST', '/v1/cs2', { body: withToken(frame('07-hurt.json')) });
    await waitFor(() => t.hub.pick(['gamelink']).gamelink?.player?.health === 73, { what: 'live' });
    const before = t.hub.pick(['gamelink']).gamelink;
    await t.gl.configure({ enabled: false });
    await t.gl.configure({ enabled: true });
    assert.equal(t.gl.source.snapshot().gamelink, null, 'waiting, not the old state');
    assert.deepEqual([t.gl.status().live, t.gl.status().waiting, t.gl.status().lastAt], [false, true, null]);
    // the next post is compared with the old state: the same frame again changes nothing (no phantom events)
    const n = t.gl.status().accepted;
    await req(t.gl.port, 'POST', '/v1/cs2', { body: withToken(frame('07-hurt.json')) });
    await waitFor(() => t.gl.status().accepted > n);
    const g = t.hub.pick(['gamelink']).gamelink;
    assert.equal(g.player.health, 73);
    assert.equal(g.rev, before.rev, 'the same state: compared with the kept baseline, nothing happened');
    assert.deepEqual(g.events, before.events, 'no phantom events');
  } finally { release(); await t.close(); }
});

test('gamelink: gamelink.json survives a reader that blocks the rename (Windows EPERM): retried; a write that still fails leaves no .tmp and Disconnect says so (L2)', async () => {
  let fails = 2, calls = 0;
  const flaky = async (a, b) => { calls++; if (fails > 0) { fails--; const e = new Error('EPERM: operation not permitted, rename'); e.code = 'EPERM'; throw e; } return fs.promises.rename(a, b); };
  const t = setup({ rename: flaky, steam: NO_STEAM, platform: 'linux' });
  try {
    await t.gl.configure({ enabled: true });
    assert.equal(calls, 3, 'two refusals, then the rename went through');
    assert.ok(parseGameLinkFile(fs.readFileSync(t.gl.file, 'utf8')));
    assert.deepEqual(fs.readdirSync(t.dir).filter((f) => f.endsWith('.tmp')), []);
  } finally { await t.close(); }
  // a reader that never lets go: Disconnect reports it, keeps the old token (disk and memory agree), leaves no .tmp
  const logs = [];
  let block = false;
  const t2 = setup({ steam: NO_STEAM, platform: 'linux', rename: async (a, b) => { if (block) { const e = new Error('EPERM'); e.code = 'EPERM'; throw e; } return fs.promises.rename(a, b); }, log: (lvl, msg) => logs.push(`${lvl} ${msg}`) });
  try {
    await t2.gl.configure({ enabled: true });
    const before = JSON.parse(fs.readFileSync(t2.gl.file, 'utf8')).tokens.cs2;
    block = true;
    const r = await t2.gl.disconnectCs2();
    assert.deepEqual([r.ok, r.reason], [false, 'state-write-failed']);
    assert.deepEqual(fs.readdirSync(t2.dir).filter((f) => f.endsWith('.tmp')), [], 'the temp file (it holds both tokens) is gone');
    assert.equal(JSON.parse(fs.readFileSync(t2.gl.file, 'utf8')).tokens.cs2, before, 'the file is untouched');
    // the old token still works (memory = disk): a cfg written before still posts
    const n = t2.gl.status().accepted;
    await req(t2.gl.port, 'POST', '/v1/cs2', { body: withToken(frame('07-hurt.json'), before) });
    await waitFor(() => t2.gl.status().accepted > n, { what: 'the old token still accepted' });
    assert.ok(logs.some((l) => /can't write gamelink\.json \(EPERM\)/.test(l)));
    assert.ok(!logs.join('\n').includes(before), 'never logs a token');
    block = false;
    assert.equal((await t2.gl.disconnectCs2()).ok, true, 'once the reader lets go, Disconnect works');
  } finally { await t2.close(); }
});

test('gamelink: a companion push is urgent only for effect events; a readout event each post is not (M3)', async () => {
  const t = setup();
  const release = t.hub.need(['gamelink']);
  try {
    await t.gl.configure({ enabled: true });
    const port = t.gl.port;
    let seq = 0;
    const send = async (events) => { const n = t.changes.length; assert.equal((await req(port, 'POST', '/v1/companion', { token: COMP, body: { v: 1, game: 'pc2', session: 's', seq: ++seq, state: { status: 'live', player: { health: 50 + seq } }, events } })).status, 200); await waitFor(() => t.changes.length > n, { what: 'push' }); return t.changes.at(-1); };
    assert.equal((await send([])).urgent, true, 'the first post (the face switches to live)');
    assert.equal((await send([{ type: 'readout', value: 1 }])).urgent, false, 'an ordinary event: coalesced like any data change');
    assert.equal((await send([{ type: 'hurt', damage: 4 }])).urgent, true, 'an effect event: urgent');
  } finally { release(); await t.close(); }
});

test('gamelink: the persisted port — a fallback that worked is reused, a cleared custom port goes back to the default, a startup fallback re-checks the cfg (L3, L10, L11)', async () => {
  const base = await freeBlock(10);
  assert.ok(base, 'a free block of 10 ports');
  const dir = tmpdir();
  const statuses = [];
  // the "default" port is taken (by another app): the client falls back inside the block and persists that
  const blocker = http.createServer();
  await new Promise((r) => blocker.listen(base, '127.0.0.1', r));
  const steam = NO_STEAM;
  const gl = createGameLink({ dir, defaultPort: base, tokens: { cs2: CS2, companion: COMP }, steam, platform: 'linux' });
  gl.on('status', () => statuses.push(gl.status().cs2));
  try {
    await gl.configure({ enabled: true });
    assert.equal(gl.status().port, base + 1, 'the next free port');
    await waitFor(() => statuses.length >= 1, { what: 'the read-only cfg check after a fallback' });
    assert.equal(statuses[0].found, false, 'checked (no CS2 in this temp home), without the PI asking');
    assert.equal(JSON.parse(fs.readFileSync(gl.file, 'utf8')).port, base + 1, 'persisted');
    // a custom port, then cleared: back to the default block, not the custom port
    const custom = await freePort(base, 10);
    await gl.configure({ enabled: true, port: custom });
    assert.equal(gl.status().port, custom);
    await gl.configure({ enabled: true, port: null });
    assert.ok(gl.status().port >= base && gl.status().port < base + 10, `cleared → the default block (${gl.status().port})`);
  } finally { await gl.stop(); }
  await new Promise((r) => blocker.close(r));
  try {
    // a fresh client (a plugin restart) starts on the persisted fallback, so an installed cfg keeps working
    fs.writeFileSync(path.join(dir, 'gamelink.json'), JSON.stringify({ v: 1, plugin: 'com.jeremyfhall.prism', api: 1, port: base + 3, tokens: { cs2: CS2, companion: COMP } }));
    const g2 = createGameLink({ dir, defaultPort: base, steam, platform: 'linux' });
    await g2.configure({ enabled: true });
    assert.equal(g2.status().port, base + 3, 'the persisted port, first');
    assert.equal((await req(base + 3, 'GET', '/v1/health', { token: COMP })).status, 200);
    await g2.stop();
    // a persisted port outside the fallback range (an old custom port) is not reused
    fs.writeFileSync(path.join(dir, 'gamelink.json'), JSON.stringify({ v: 1, plugin: 'com.jeremyfhall.prism', api: 1, port: base + 40 > 65535 ? base - 40 : base + 40, tokens: { cs2: CS2, companion: COMP } }));
    const g3 = createGameLink({ dir, defaultPort: base, steam, platform: 'linux' });
    await g3.configure({ enabled: true });
    assert.equal(g3.status().port, base, 'the default port');
    await g3.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
