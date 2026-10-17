// Prism Control source (src/apps/sources/prism-control.js) against a fake Prism Control: a real HTTP server
// on 127.0.0.1 that enforces the API's transport rules (exact Host, no Origin, bearer token, ETag / 304) and
// serves fictional payloads. Covers discovery, auth retry, ETag, per-key precedence over the Node probes,
// fallback when absent, demand start/stop, album-art etag caching, audio levels, and the createNodeHub wiring.
//
//   node --test test/prism-control-source.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  createPrismControl, parseControlFile, controlFilePath, mapSystem, mapTemp, mapMedia, mapVolume, mapMic, mapCooling, primaryGpu, ENDPOINTS,
} from '../src/apps/sources/prism-control.js';
import { createHub } from '../src/apps/sources/hub.js';
import { simulatedSystem, simulatedAudio, SYSTEM_KEYS } from '../src/apps/sources/simulated.js';
import { createNodeHub } from '../src/apps/sources/node.js';
import { fakeSystem } from '../src/audio/fake.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MiB = 1024 ** 2, GiB = 1024 ** 3;
const FAST = { system: 30, playing: 30, devices: 40, mic: 30, cooling: 30, levels: 33 };
const BACKOFF = [30, 60, 100];
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'prism-control-'));

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

// ── fictional payloads (API.md §4 examples) ─────────────────────────────────
const SYSTEM = () => ({
  cpu: { name: 'Example CPU 16-Core', usagePct: 23.5, perCorePct: null, clockMhz: 4200, tempC: null, cores: 16, threads: 32 },
  gpus: [
    { index: 0, name: 'Example iGPU', vendor: 'intel', usagePct: 3, tempC: null, powerW: null, powerLimitW: null, vramUsedMiB: 256, vramTotalMiB: 512, clockMhz: null, memClockMhz: null, fanPct: null },
    { index: 1, name: 'Example GPU 24GB', vendor: 'nvidia', usagePct: 41, tempC: 62, powerW: 180.5, powerLimitW: 450, vramUsedMiB: 8123, vramTotalMiB: 24564, clockMhz: 2520, memClockMhz: 10501, fanPct: 35 },
  ],
  memory: { usedMiB: 20480, totalMiB: 65536, usagePct: 31.25, commitUsedMiB: 24000, commitLimitMiB: 75000 },
  disks: [
    { name: 'D:', label: 'Data', usedGiB: 100, totalGiB: 1000, usagePct: 10, readBps: 1000, writeBps: 0, activePct: 1 },
    { name: 'C:', label: 'System', usedGiB: 512, totalGiB: 2048, usagePct: 25, readBps: 1200000, writeBps: 350000, activePct: 3 },
  ],
  network: { rxBps: 1500000, txBps: 120000, adapters: [{ name: 'Ethernet', rxBps: 1500000, txBps: 120000, linkMbps: 1000, up: true }] },
  uptimeSec: 253734,
});
const PLAYING = (art = { url: '/v1/now-playing/art', etag: '"art-1"', mime: 'image/png', width: 300, height: 300, dataUrl: null }) => ({
  source: 'smtc', app: 'Example Player', state: 'playing',
  track: { title: 'Example Song', artists: ['The Example Ensemble', 'Guest'], album: 'Demo Album', durationMs: 215000, uri: null, url: 'https://music.example/track/1' },
  positionMs: 5985, positionAt: new Date(Date.now() - 2000).toISOString(), shuffle: false, repeat: 'off', liked: null, volumePct: 42, contextName: 'Demo Playlist', art,
});
const DEVICES = () => ({
  output: { defaultId: 'demo-out-1', defaultCommunicationsId: 'demo-out-1', devices: [
    { id: 'demo-out-1', name: 'Speakers (Example Audio)', isDefault: true, isDefaultCommunications: true, volumePct: 42, muted: false, state: 'active' },
    { id: 'demo-out-2', name: 'Headphones (Example USB)', isDefault: false, isDefaultCommunications: false, volumePct: 60, muted: true, state: 'active' },
  ] },
  input: { defaultId: 'demo-in-1', defaultCommunicationsId: 'demo-in-1', devices: [{ id: 'demo-in-1', name: 'Microphone (Example USB)', isDefault: true, isDefaultCommunications: true, volumePct: 80, muted: false, state: 'active' }] },
});
const MIC = (muted = true) => ({ deviceId: 'demo-in-1', name: 'Microphone (Example USB)', muted, volumePct: 80, peak: 0.1, inUse: true });
const COOLING = () => ({
  status: 'ok', statusText: 'Example sensors', sampledAt: new Date().toISOString(),
  cpu: { tempC: 62.75, source: 'icue', sensorId: 'icue-3f9a1c2b7d', name: 'CPU package' },
  coolant: { tempC: 39.8, source: 'icue', sensorId: 'icue-8b20e4d119', name: 'Example AIO' },
  groups: [
    { group: 'radiator', count: 3, avgRpm: 1455.7, minRpm: 1451, maxRpm: 1460, sensorIds: ['f1', 'f2', 'f3'] },
    { group: 'case', count: 0, avgRpm: null, minRpm: null, maxRpm: null, sensorIds: [] },
    { group: 'unassigned', count: 1, avgRpm: 1620, minRpm: 1620, maxRpm: 1620, sensorIds: ['f4'] },
    { group: 'allFans', count: 4, avgRpm: 1497, minRpm: 1451, maxRpm: 1620, sensorIds: ['f1', 'f2', 'f3', 'f4'] },
    { group: 'pump', count: 1, avgRpm: 2383, minRpm: 2383, maxRpm: 2383, sensorIds: ['p1'] },
    { group: 'gpu', count: 0, avgRpm: null, minRpm: null, maxRpm: null, sensorIds: [] },
  ],
  sensors: [
    { id: 'f1', kind: 'fan', role: 'radiator', name: 'Rad top', rpm: 1451, pct: null, tempC: null, connected: true },
    { id: 'p1', kind: 'pump', role: 'pump', name: 'Example AIO', rpm: 2383, pct: null, tempC: null, connected: true },
  ],
  providers: [{ name: 'icue', state: 'connected', detail: 'Example', sensorCount: 6 }],
});
const LEVELS = (peak = 0.5) => ({ output: { deviceId: 'demo-out-1', deviceName: 'Speakers (Example Audio)', peak, peakDb: 20 * Math.log10(peak), channels: [peak, peak] }, input: null, intervalMs: 33 });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);   // a signature + fictional bytes (never decoded)
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);

/** A fake Prism Control: a real loopback HTTP server with the API's checks, plus its control.json. */
async function fakePrismControl({ dir, token = 'ab'.repeat(32), pid = process.pid, write = true } = {}) {
  const st = { token, port: 0, gen: 0x10 };
  const topics = new Map();
  const log = [];
  let art = { etag: '"art-1"', type: 'image/png', bytes: PNG };
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const rec = { path: p, host: req.headers.host, origin: req.headers.origin, auth: req.headers.authorization, inm: req.headers['if-none-match'], status: 0 };
    log.push(rec);
    const send = (status, body, headers = {}) => { rec.status = status; res.writeHead(status, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers }); res.end(body); };
    const err = (status, code, data) => send(status, JSON.stringify({ error: { code, message: code, ...(data ? { data } : {}) } }), { 'content-type': 'application/json' });
    if (req.headers.host !== `127.0.0.1:${st.port}`) return err(421, 'bad_host');
    if (req.headers.origin !== undefined) return err(403, 'origin_refused');
    if (req.method !== 'GET' && req.method !== 'HEAD') return err(405, 'method_not_allowed');
    if (req.headers.authorization !== `Bearer ${st.token}`) return err(401, 'unauthorized');
    if (p === '/v1/health') return send(200, JSON.stringify({ status: 'ok', api: 1, plugin: 'com.jeremyfhall.prismcontrol', version: '0.1.0.0', pid }), { 'content-type': 'application/json' });
    if (p === '/v1/now-playing/art') {
      if (!art) return err(404, 'no_art');
      if (req.headers['if-none-match'] === art.etag) return send(304, undefined, { etag: art.etag });
      return send(200, art.bytes, { 'content-type': art.type, etag: art.etag, 'content-length': String(art.bytes.length) });
    }
    const t = topics.get(p);
    if (!t) return err(404, 'not_found');
    if (t.fail) return err(t.fail, t.fail === 429 ? 'rate_limited' : 'unavailable', { retryAfterMs: 50 });
    const tag = `"${t.seq}${p === '/v1/now-playing' ? `-${(art?.etag || 'none').replace(/"/g, '')}` : ''}"`;
    if (req.headers['if-none-match'] === tag) return send(304, undefined, { etag: tag });
    send(200, JSON.stringify({ api: 1, path: p, seq: t.seq, updatedAt: new Date().toISOString(), ageMs: 4, source: t.source, demo: t.demo, data: t.data }), { 'content-type': 'application/json; charset=utf-8', etag: tag });
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  st.port = server.address().port;
  const file = path.join(dir, 'control.json');
  const writeControl = (over = {}) => fs.writeFileSync(file, JSON.stringify({ v: 1, api: 1, plugin: 'com.jeremyfhall.prismcontrol', version: '0.1.0.0', port: st.port, token: st.token, pid, baseUrl: `http://127.0.0.1:${st.port}`, startedAt: new Date().toISOString(), ...over }));
  const fake = {
    get port() { return st.port; }, get token() { return st.token; }, log, file,
    set(p, data, { demo = false, source = 'systeminfo' } = {}) { const t = topics.get(p) || { seq: 0 }; topics.set(p, { seq: t.seq + 1, data, demo, source }); return fake; },
    fail(p, status) { const t = topics.get(p) || { seq: 1, data: null }; topics.set(p, { ...t, fail: status }); return fake; },
    heal(p) { const t = topics.get(p); if (t) delete t.fail; return fake; },
    setArt(a) { art = a; return fake; },
    rotate({ rewrite = true } = {}) { st.token = (++st.gen).toString(16).padStart(2, '0').repeat(32); if (rewrite) writeControl(); return fake; },
    writeControl,
    count: (p, pred = () => true) => log.filter((r) => r.path === p && pred(r)).length,
    paths: () => [...new Set(log.map((r) => r.path))].sort(),
    async close({ removeFile = false } = {}) { for (const s of sockets) s.destroy(); await new Promise((r) => server.close(r)); if (removeFile) fs.rmSync(file, { force: true }); },
  };
  fake.set('/v1/system', SYSTEM()).set('/v1/now-playing', PLAYING(), { source: 'smtc' }).set('/v1/audio/devices', DEVICES(), { source: 'audio' })
    .set('/v1/mic', MIC(), { source: 'audio' }).set('/v1/cooling', COOLING(), { source: 'cooling' }).set('/v1/audio/levels', LEVELS(), { source: 'audio' });
  if (write) writeControl();
  return fake;
}

/** A live "Node probe" stand-in: the Windows system source's shape with its own fictional numbers. */
function probeSource(values = {}) {
  let running = false;
  const v = { cpu: 0.11, mem: 0.5, gpu: 0.5, disk: 0.4, net: { down: 10, up: 20 }, temp: null, battery: 0.66, uptime: 99, sys: { cores: [0.1, 0.2, 0.3, 0.4], cpuModel: 'Probe CPU', charging: true, platform: 'win32' }, series: { step: 1, cpu: [0.1, 0.11] }, ...values };
  return { id: 'system', provides: [...SYSTEM_KEYS], rate: 1, mode: 'live', get running() { return running; }, start() { running = true; return this; }, stop() { running = false; return this; }, snapshot: () => v, status: () => ({ id: 'system' }) };
}

function setup(dir, opts = {}) {
  const logs = [];
  const probe = opts.probe || probeSource();
  const pc = createPrismControl({ dir, intervals: FAST, backoffMs: BACKOFF, timeoutMs: 1500, log: (l, m) => logs.push(`${l}: ${m}`), under: { system: probe }, ...opts });
  const hub = createHub({ sources: [...pc.sources, probe, simulatedSystem()] });
  return { pc, hub, probe, logs };
}

// ── pure: discovery file + mapping table ────────────────────────────────────
test('control.json: path from PRISM_CONTROL_DIR / APPDATA; strict parsing keeps the token on 127.0.0.1', () => {
  assert.equal(controlFilePath({ PRISM_CONTROL_DIR: path.join('X', 'ctl') }), path.join('X', 'ctl', 'control.json'));
  assert.equal(controlFilePath({ APPDATA: path.join('C', 'AppData') }), path.join('C', 'AppData', 'Prism', 'control', 'control.json'));
  assert.equal(controlFilePath({}), null, 'off Windows without an override: nothing to look for');
  const good = { v: 1, api: 1, plugin: 'com.jeremyfhall.prismcontrol', version: '0.1.0.0', port: 56436, token: 'ab'.repeat(32), pid: 4242, baseUrl: 'http://127.0.0.1:56436' };
  assert.deepEqual(parseControlFile(`﻿${JSON.stringify(good)}`), { baseUrl: 'http://127.0.0.1:56436', token: 'ab'.repeat(32), pid: 4242, version: '0.1.0.0', api: 1 });
  assert.equal(parseControlFile(JSON.stringify({ ...good, api: 2 })).api, 2, 'a newer api still serves /v1 (versioning §8)');
  for (const bad of [{ baseUrl: 'http://localhost:56436' }, { baseUrl: 'http://192.0.2.7:56436' }, { token: 'short' }, { plugin: 'com.example.other' }, { v: 2 }, { port: 0 }, { api: 0 }]) {
    assert.equal(parseControlFile(JSON.stringify({ ...good, ...bad })), null, JSON.stringify(bad));
  }
  assert.equal(parseControlFile('{not json'), null);
});

test('mapping: /v1/system → cpu mem gpu disk net uptime + sys (fractions 0–1, bytes, nulls kept)', () => {
  const s = mapSystem(SYSTEM(), { systemDrive: 'C:', under: { cores: [0.25, 0.75], charging: false, platform: 'win32' } });
  assert.equal(s.cpu, 0.235);
  assert.equal(s.mem, 0.3125);
  assert.equal(s.gpu, 0.41, 'the discrete GPU (most VRAM), not the iGPU');
  assert.equal(s.disk, 0.25, 'the system volume (C:), not the first disk');
  assert.deepEqual(s.net, { down: 1500000, up: 120000 }, 'bytes/s as served');
  assert.equal(s.uptime, 253734);
  assert.deepEqual(s.sys.cores, [0.25, 0.75], 'perCorePct null → the Node probes\' per-core loads');
  assert.equal(s.sys.cpuModel, 'Example CPU 16-Core');
  assert.equal(s.sys.cpuGhz, 4.2);
  assert.equal(s.sys.memTotal, 65536 * MiB);
  assert.equal(s.sys.memUsed, 20480 * MiB);
  assert.equal(s.sys.diskTotal, 2048 * GiB);
  assert.equal(s.sys.diskFree, 1536 * GiB);
  assert.equal(s.sys.diskRead, 1201000, 'disk IO summed over volumes');
  assert.equal(s.sys.diskWrite, 350000);
  assert.equal(s.sys.gpuName, 'Example GPU 24GB');
  assert.equal(s.sys.gpuTemp, 62);
  assert.equal(s.sys.vramTotal, 24564 * MiB);
  assert.equal(s.sys.charging, false);
  assert.equal(primaryGpu([]), null);
  // nulls inside a reported object stay null; a missing container leaves the key absent
  const d = SYSTEM();
  d.cpu.usagePct = null; d.gpus = []; d.network = { rxBps: null, txBps: 5, adapters: [] }; d.memory = null;
  const n = mapSystem(d);
  assert.equal(n.cpu, null);
  assert.equal(n.net, null);
  assert.ok(!('gpu' in n) && !('mem' in n), 'no GPU stats / memory not ready → absent (the probes serve it)');
  assert.deepEqual(mapSystem({ cpu: { name: 'x', usagePct: 50, perCorePct: [10, 90] } }).sys.cores, [0.1, 0.9]);
  assert.deepEqual(mapSystem(null), {});
});

test('mapping: temp, media, volume, mic, cooling', () => {
  assert.equal(mapTemp(SYSTEM(), COOLING()), 62.75, 'cooling (iCUE/LHM) first');
  assert.equal(mapTemp({ cpu: { tempC: 55 } }, { status: 'partial', cpu: null }), 55, 'else /v1/system');
  assert.equal(mapTemp(SYSTEM(), { status: 'unavailable', cpu: null }), null, 'live, but nothing measures it: null, never faked');
  assert.equal(mapTemp(undefined, { status: 'connecting', cpu: null }), undefined, 'sampling just started: absent');
  const now = Date.parse('2026-10-16T19:22:51.516Z');
  const m = mapMedia({ ...PLAYING(), positionAt: '2026-10-16T19:22:49.516Z' }, { nowMs: now, art: { dataUrl: 'data:image/png;base64,AA==', mime: 'image/png', width: 300, height: 300 }, volume: { level: 0.42, muted: false } });
  assert.equal(m.title, 'Example Song');
  assert.equal(m.artist, 'The Example Ensemble, Guest');
  assert.equal(m.album, 'Demo Album');
  assert.equal(m.position, 7.9, 'positionMs + (now − positionAt), in s');
  assert.equal(m.duration, 215);
  assert.equal(m.playing, true);
  assert.equal(m.volume, 0.42);
  assert.equal(m.muted, false);
  assert.equal(m.playerVolume, 0.42);
  assert.equal(m.liked, null, 'SMTC has no "liked": null');
  assert.equal(m.url, 'https://music.example/track/1');
  assert.equal(m.art.dataUrl, 'data:image/png;base64,AA==');
  const paused = mapMedia({ ...PLAYING(), state: 'paused', positionAt: '2026-10-16T19:22:49.516Z' }, { nowMs: now + 60000 });
  assert.equal(paused.position, 5.9, 'paused: no extrapolation');
  assert.equal(paused.playing, false);
  assert.ok(!('volume' in paused), 'no devices answer: volume omitted');
  assert.equal(mapMedia({ ...PLAYING(), positionMs: 214000 }, { nowMs: Date.now() + 999999 }).position, 215, 'capped at the duration');
  assert.equal(mapMedia({ state: 'none', track: null }), null, 'nothing loaded: null');
  assert.deepEqual(mapVolume(DEVICES()), { level: 0.42, muted: false });
  assert.equal(mapVolume({ output: { defaultId: null, devices: [] } }), null);
  assert.deepEqual(mapMic(MIC(true)), { muted: true, volume: 0.8, peak: 0.1, level: 1 + (20 * Math.log10(0.1)) / 60, inUse: true });
  assert.equal(mapMic({ deviceId: null, name: null, muted: false, volumePct: null, peak: null, inUse: null }), null, 'no capture device');
  const c = mapCooling(COOLING());
  assert.deepEqual([c.fans.rpm, c.fans.min, c.fans.max, c.fans.count], [1497, 1451, 1620, 4]);
  assert.deepEqual(c.fans.radiator, { rpm: 1455.7, min: 1451, max: 1460, count: 3 });
  assert.equal(c.fans.case, null);
  assert.deepEqual(c.fans.list, [{ id: 'f1', name: 'Rad top', role: 'radiator', rpm: 1451, pct: null, connected: true }]);
  assert.deepEqual(c.pump, { rpm: 2383, min: 2383, max: 2383, count: 1 });
  assert.equal(c.coolant, 39.8);
  const none = mapCooling({ status: 'unavailable', cpu: null, coolant: null, groups: COOLING().groups.map((g) => ({ ...g, count: 0, avgRpm: null, minRpm: null, maxRpm: null })), sensors: [] });
  assert.deepEqual(none, { fans: null, pump: null, coolant: null });
  assert.deepEqual(mapCooling({ status: 'connecting' }), {}, 'connecting: absent');
});

// ── discovery, transport rules, ETag ────────────────────────────────────────
test('discovery: absent → probes serve; control.json appears → Prism Control wins; Host/Origin rules; ETag 304s', async () => {
  const dir = tmpdir();
  const { pc, hub, logs } = setup(dir);
  let fake = null;
  const release = hub.need(['cpu', 'sys']);
  try {
    await waitFor(() => pc.status().state === 'absent', { what: 'absent' });
    const t0 = performance.now();
    assert.equal(hub.pick(['cpu']).cpu, 0.11, 'absent: the Node probe serves cpu');
    assert.ok(performance.now() - t0 < 20, 'pick never waits on the network');
    fake = await fakePrismControl({ dir });
    await waitFor(() => hub.pick(['cpu']).cpu === 0.235, { what: 'Prism Control cpu' });
    assert.equal(hub.sourceOf(['cpu']).cpu, 'live');
    assert.equal(pc.status().state, 'connected');
    assert.equal(pc.status().server.version, '0.1.0.0');
    await waitFor(() => fake.count('/v1/system', (r) => r.status === 304) >= 3, { what: '304s' });
    assert.equal(hub.pick(['cpu']).cpu, 0.235, 'a 304 keeps the cached value');
    assert.ok(fake.log.filter((r) => r.path === '/v1/system').slice(1).every((r) => r.inm), 'every poll after the first sends If-None-Match');
    fake.set('/v1/system', { ...SYSTEM(), cpu: { ...SYSTEM().cpu, usagePct: 50 } });
    await waitFor(() => hub.pick(['cpu']).cpu === 0.5, { what: 'a changed payload' });
    for (const r of fake.log) {
      assert.equal(r.host, `127.0.0.1:${fake.port}`, 'Host is exactly 127.0.0.1:<port>');
      assert.equal(r.origin, undefined, 'no Origin header, ever');
      assert.equal(r.auth, `Bearer ${fake.token}`);
    }
    assert.ok(!fake.log.some((r) => [400, 403, 405, 421].includes(r.status)));
    assert.ok(!logs.join('\n').includes(fake.token), 'the token is never logged');
    assert.ok(!JSON.stringify(pc.status()).includes(fake.token), 'nor in status()');
  } finally { release(); hub.stop(); pc.stop(); await fake?.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('auth: a 401 re-reads control.json (restart → new token); a stale file is not hammered', async () => {
  const dir = tmpdir();
  const fake = await fakePrismControl({ dir });
  const { pc, hub } = setup(dir);
  const release = hub.need(['mem']);
  try {
    await waitFor(() => hub.pick(['mem']).mem === 0.3125, { what: 'connected' });
    fake.rotate();                                  // Prism Control restarted: new token, new control.json
    await waitFor(() => fake.count('/v1/system', (r) => r.status === 401) >= 1, { what: 'a 401' });
    await waitFor(() => fake.count('/v1/health', (r) => r.auth === `Bearer ${fake.token}` && r.status === 200) >= 1, { what: 'reconnected with the new token' });
    await waitFor(() => hub.pick(['mem']).mem === 0.3125, { what: 'data again' });
    // a stale file: the server's token changes but control.json still holds the old one
    fake.rotate({ rewrite: false });
    await waitFor(() => pc.status().state === 'absent', { what: 'stale token detected' });
    assert.equal(hub.pick(['mem']).mem, 0.5, 'meanwhile the Node probe serves mem');
    const n = fake.log.length;
    await sleep(400);
    assert.ok(fake.log.length - n <= 1, `a refused token is not retried until control.json changes (${fake.log.length - n} requests)`);
    fake.writeControl();
    await waitFor(() => hub.pick(['mem']).mem === 0.3125, { what: 'back after the file changed' });
  } finally { release(); pc.stop(); await fake.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('fallback: Prism Control stops → the probes take over at once; a stale control.json (dead pid) costs no connect', async () => {
  const dir = tmpdir();
  const fake = await fakePrismControl({ dir });
  const { pc, hub } = setup(dir);
  const release = hub.need(['cpu', 'net']);
  try {
    await waitFor(() => hub.pick(['cpu']).cpu === 0.235, { what: 'connected' });
    await fake.close({ removeFile: true });          // a clean exit deletes control.json
    await waitFor(() => hub.pick(['cpu']).cpu === 0.11, { what: 'probe fallback' });
    assert.deepEqual(hub.pick(['net']).net, { down: 10, up: 20 });
    assert.equal(hub.sourceOf(['cpu']).cpu, 'live', 'the probe is live too');
    let worst = 0;
    for (let i = 0; i < 200; i++) { const t = performance.now(); hub.pick(['cpu', 'net', 'sys', 'series']); worst = Math.max(worst, performance.now() - t); }
    assert.ok(worst < 20, `pick stays cheap while absent (worst ${worst.toFixed(2)} ms)`);
    // a crash leaves control.json behind with a dead pid: no connection attempt at all
    const dead = await fakePrismControl({ dir, pid: 0x3ffffff0 });
    await sleep(300);
    assert.equal(dead.log.length, 0, 'a dead pid → treated as not running, nothing sent');
    assert.equal(pc.status().state, 'absent');
    assert.match(pc.status().lastError, /stale/);
    await dead.close();
  } finally { release(); pc.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── precedence per key, nulls, demo mode ────────────────────────────────────
test('precedence: per key, a live Prism Control beats the probes; keys it lacks stay with them', async () => {
  const dir = tmpdir();
  const fake = await fakePrismControl({ dir });
  const { pc, hub } = setup(dir);
  const keys = ['cpu', 'gpu', 'battery', 'temp', 'net', 'sys', 'series'];
  const release = hub.need(keys);
  try {
    await waitFor(() => hub.pick(['temp']).temp === 62.75 && hub.pick(['cpu']).cpu === 0.235, { what: 'Prism Control data' });
    const d = hub.pick(keys);
    assert.equal(d.cpu, 0.235);
    assert.equal(d.gpu, 0.41);
    assert.equal(d.battery, 0.66, 'battery: Prism Control has none → the probe');
    assert.equal(d.temp, 62.75, 'CPU package from /v1/cooling');
    assert.deepEqual(d.net, { down: 1500000, up: 120000 });
    assert.deepEqual(d.sys.cores, [0.1, 0.2, 0.3, 0.4], 'per-core: the probe fills what Prism Control leaves null');
    assert.equal(d.sys.cpuModel, 'Example CPU 16-Core');
    assert.equal(d.sys.charging, true);
    await waitFor(() => (hub.pick(['series']).series.cpu || []).length >= 3, { what: 'series history' });
    const s = hub.pick(['series']).series;
    assert.equal(s.step, 1);
    assert.ok(s.cpu.every((v) => v === 0.235) && s.down.every((v) => v === 1500000) && s.temp.at(-1) === 62.75);
    // a null Prism Control reports stays null; a missing container falls through
    fake.set('/v1/system', { ...SYSTEM(), cpu: { ...SYSTEM().cpu, usagePct: null }, gpus: [] });
    await waitFor(() => hub.pick(['cpu']).cpu === null, { what: 'null cpu' });
    assert.equal(hub.pick(['gpu']).gpu, 0.5, 'no GPU stats → the probe');
    fake.fail('/v1/cooling', 503);
    await waitFor(() => hub.pick(['temp']).temp === null, { what: 'temp from /v1/system (null)' });
    fake.fail('/v1/system', 503);
    await waitFor(() => hub.pick(['cpu']).cpu === 0.11, { what: '503 → probe' });
    assert.equal(hub.pick(['temp']).temp, null, 'the probe\'s own temp (null on Windows)');
  } finally { release(); pc.stop(); await fake.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('demo mode: Prism Control\'s fictional data is simulated, so real probes beat it and DEMO tags stay', async () => {
  const dir = tmpdir();
  const fake = await fakePrismControl({ dir });
  fake.set('/v1/system', SYSTEM(), { demo: true, source: 'demo' }).set('/v1/now-playing', PLAYING(), { demo: true, source: 'demo' });
  const { pc, hub } = setup(dir);
  const sim = createHub({ sources: [...pc.sources.filter((s) => s.id === 'prism-control.media'), simulatedSystem()] });
  const r1 = hub.need(['cpu']), r2 = sim.need(['media']);
  try {
    await waitFor(() => pc.status().endpoints['/v1/system'].fresh, { what: 'polled' });
    assert.equal(pc.sources[0].mode, 'simulated');
    assert.equal(hub.pick(['cpu']).cpu, 0.11, 'a real probe beats demo data');
    await waitFor(() => sim.pick(['media']).media?.title === 'Example Song', { what: 'demo media' });
    assert.equal(sim.sourceOf(['media']).media, 'simulated', 'demo media is tagged DEMO by the plugin');
  } finally { r1(); r2(); pc.stop(); await fake.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── demand ──────────────────────────────────────────────────────────────────
test('demand: nothing is polled until a key is needed; each key polls only its endpoints; release stops it', async () => {
  const dir = tmpdir();
  const fake = await fakePrismControl({ dir });
  const { pc, hub } = setup(dir);
  try {
    await sleep(200);
    assert.equal(fake.log.length, 0, 'no visible data facet → no requests, not even discovery');
    let rel = hub.need(['cpu']);
    await waitFor(() => hub.pick(['cpu']).cpu === 0.235, { what: 'cpu' });
    await sleep(120);
    assert.deepEqual(fake.paths(), ['/v1/health', '/v1/system'], 'cpu → /v1/system only');
    rel();
    await sleep(60);
    let n = fake.log.length;
    await sleep(200);
    assert.equal(fake.log.length, n, 'released → polling stops');
    rel = hub.need(['media']);
    await waitFor(() => hub.pick(['media']).media?.volume === 0.42, { what: 'media + volume' });
    rel();
    rel = hub.need(['mic', 'fans', 'pump', 'coolant', 'volume']);
    await waitFor(() => hub.pick(['mic']).mic?.muted === true && hub.pick(['fans']).fans?.rpm === 1497, { what: 'mic + cooling' });
    const d = hub.pick(['pump', 'coolant', 'volume']);
    assert.deepEqual(d.pump, { rpm: 2383, min: 2383, max: 2383, count: 1 });
    assert.equal(d.coolant, 39.8);
    assert.deepEqual(d.volume, { level: 0.42, muted: false });
    assert.deepEqual(fake.paths(), ['/v1/audio/devices', '/v1/cooling', '/v1/health', '/v1/mic', '/v1/now-playing', '/v1/now-playing/art', '/v1/system']);
    assert.equal(fake.count('/v1/audio/levels'), 0, 'audio levels only while an audio facet is visible');
    rel();
    await sleep(60);
    n = fake.log.length;
    await sleep(200);
    assert.equal(fake.log.length, n, 'all released → silence');
    const st = pc.status();
    assert.ok(Object.values(st.endpoints).every((e) => e.demand === 0));
    // a 429 pauses the endpoint for retryAfterMs; polling resumes after
    rel = hub.need(['mic']);
    await waitFor(() => hub.pick(['mic']).mic, { what: 'mic' });
    fake.fail('/v1/mic', 429);
    await waitFor(() => fake.count('/v1/mic', (r) => r.status === 429) >= 1, { what: '429' });
    fake.heal('/v1/mic');
    await waitFor(() => fake.log.at(-1).path === '/v1/mic' && fake.log.at(-1).status !== 429, { what: 'resumed' });
    rel();
  } finally { pc.stop(); await fake.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── album art ───────────────────────────────────────────────────────────────
test('album art: fetched only when art.etag changes, handed over as served (bytes untouched), dropped with the media keys', async () => {
  const dir = tmpdir();
  const fake = await fakePrismControl({ dir });
  const { pc, hub } = setup(dir);
  const release = hub.need(['media']);
  try {
    const m = await waitFor(() => hub.pick(['media']).media?.art, { what: 'art' });
    assert.equal(m.dataUrl, `data:image/png;base64,${PNG.toString('base64')}`, 'the exact bytes, as a data URL');
    assert.equal(Buffer.from(m.dataUrl.split(',')[1], 'base64').compare(PNG), 0);
    assert.deepEqual([m.mime, m.width, m.height], ['image/png', 300, 300]);
    const media = hub.pick(['media']).media;
    assert.equal(media.title, 'Example Song');
    assert.ok(media.position > 7 && media.position < 9, `position extrapolated (${media.position})`);
    await waitFor(() => fake.count('/v1/now-playing') >= 8, { what: 'several polls' });
    assert.equal(fake.count('/v1/now-playing/art'), 1, 'one art fetch for one etag');
    // a new track: new art etag → one more fetch
    fake.setArt({ etag: '"art-2"', type: 'image/jpeg', bytes: JPEG });
    fake.set('/v1/now-playing', { ...PLAYING({ url: '/v1/now-playing/art', etag: '"art-2"', mime: 'image/jpeg', width: 640, height: 640, dataUrl: null }), track: { ...PLAYING().track, title: 'Second Example' } });
    await waitFor(() => hub.pick(['media']).media?.art?.mime === 'image/jpeg', { what: 'new art' });
    assert.equal(hub.pick(['media']).media.art.dataUrl, `data:image/jpeg;base64,${JPEG.toString('base64')}`);
    assert.equal(hub.pick(['media']).media.art.width, 640);
    await sleep(150);
    assert.equal(fake.count('/v1/now-playing/art'), 2);
    assert.equal(fake.log.filter((r) => r.path === '/v1/now-playing/art').at(-1).inm, '"art-1"', 'If-None-Match carries the art we hold');
    // the art is gone (no image): art null, no more fetches
    fake.setArt(null);
    fake.set('/v1/now-playing', PLAYING(null));
    await waitFor(() => hub.pick(['media']).media && hub.pick(['media']).media.art === null, { what: 'no art' });
    await sleep(150);
    assert.equal(fake.count('/v1/now-playing/art'), 2);
    assert.equal(pc.status().art.cached, false);
    // a track with art again, then the media keys disappear: the cached image is dropped
    fake.setArt({ etag: '"art-3"', type: 'image/png', bytes: PNG });
    fake.set('/v1/now-playing', PLAYING({ url: '/v1/now-playing/art', etag: '"art-3"', mime: 'image/png', width: 300, height: 300, dataUrl: null }));
    await waitFor(() => pc.status().art.cached, { what: 'art 3' });
    release();
    assert.equal(pc.status().art.cached, false, 'released → art no longer held');
    // not an image type → no art (never hand arbitrary content to facets)
    fake.setArt({ etag: '"art-4"', type: 'text/html', bytes: Buffer.from('<b>x</b>') });
    fake.set('/v1/now-playing', PLAYING({ url: '/v1/now-playing/art', etag: '"art-4"', mime: 'image/png', width: 1, height: 1, dataUrl: null }));
    const r2 = hub.need(['media']);
    await waitFor(() => fake.count('/v1/now-playing/art') >= 4, { what: 'art 4 fetched' });
    await sleep(80);
    assert.equal(hub.pick(['media']).media.art, null);
    r2();
  } finally { release(); pc.stop(); await fake.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── audio levels ────────────────────────────────────────────────────────────
function fakeCapture() {
  let refs = 0;
  const snap = simulatedAudio().snapshot(Date.UTC(2026, 9, 16, 12));   // one fixed frame: comparisons can't race the 30 Hz cache
  return {
    get refs() { return refs; }, mode: 'simulated', state: 'simulated', running: true, rate: 30,
    retain() { refs++; let done = false; return () => { if (!done) { done = true; refs--; } }; },
    snapshot: () => snap,
    info: () => ({ state: 'simulated', backend: 'synthetic' }),
    stop: async () => {},
  };
}

test('audio: /v1/audio/levels feeds the waveform (≤ 30 Hz, only while retained); spectrum stays with the capture', async () => {
  const dir = tmpdir();
  const fake = await fakePrismControl({ dir });
  const { pc, hub } = setup(dir);
  const cap = fakeCapture();
  const audio = pc.wrapAudio(cap);
  try {
    await sleep(100);
    assert.equal(fake.count('/v1/audio/levels'), 0);
    const release = audio.retain();
    assert.equal(cap.refs, 1, 'the capture is retained too (spectrum, fallback)');
    await waitFor(() => audio.modeOf('audio') === 'live', { what: 'levels live' });
    const n0 = fake.count('/v1/audio/levels');
    await sleep(600);
    const per = (fake.count('/v1/audio/levels') - n0) / 0.6;
    assert.ok(per >= 8 && per <= 31, `≤ 30 Hz polling (${per.toFixed(1)}/s)`);
    const s = audio.snapshot();
    assert.equal(s.audio.levels.length, 16 * 30);
    assert.equal(s.audio.rate, 30);
    assert.ok(!('rms' in s.audio), 'Prism Control meters peaks only: no invented rms');
    assert.ok(s.audio.peak > 0.85 && s.audio.peak < 0.9, `peak on the dB meter scale (0.5 linear ≈ −6 dBFS → ${s.audio.peak})`);
    assert.ok(s.audio.levels.slice(-5).every((v) => v > 0.4), 'recent levels carry the real peak');
    assert.deepEqual(s.spectrum, cap.snapshot().spectrum, 'spectrum: the capture\'s (Prism Control has no bands)');
    assert.equal(audio.mode, 'simulated', 'both keys must be real for mode live (the spectrum here is synthetic)');
    assert.equal(audio.modeOf('spectrum'), 'simulated');
    assert.equal(audio.info().prismControl.levels, 'live');
    fake.set('/v1/audio/levels', LEVELS(0.02));
    await waitFor(() => audio.snapshot().audio.levels.at(-1) < 0.2 || audio.snapshot().audio.peak < 0.5, { what: 'quiet' });
    // the hub path (hidraw apps / CLI): the same analyzer behind prism-control.audio
    const r = hub.need(['audio']);
    assert.equal(hub.pick(['audio']).audio.rate, 30);
    r();
    release();
    assert.equal(cap.refs, 0);
    await sleep(80);
    const n1 = fake.count('/v1/audio/levels');
    await sleep(250);
    assert.equal(fake.count('/v1/audio/levels'), n1, 'released → no more level polls');
    await waitFor(() => audio.modeOf('audio') === 'simulated', { what: 'levels stale' });
    assert.equal(audio.snapshot().audio, cap.snapshot().audio, 'falls back to the capture');
    // without a capture at all (PRISM_DECK_AUDIO=off): levels still come through
    const bare = pc.wrapAudio(null);
    const rb = bare.retain();
    await waitFor(() => bare.snapshot()?.audio?.levels?.length === 480, { what: 'bare levels' });
    assert.equal(bare.snapshot().spectrum, undefined);
    rb();
  } finally { pc.stop(); await fake.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── createNodeHub wiring ────────────────────────────────────────────────────
function fakeOs() {
  let busy = 0;
  const core = () => ({ model: 'Fictional 4-core', speed: 3200, times: { user: (busy += 7), nice: 0, sys: 0, irq: 0, idle: 1000 + busy } });
  return { cpus: () => [core(), core(), core(), core()], totalmem: () => 8 * GiB, freemem: () => 2 * GiB, uptime: () => 3600 };
}
function fakeFs(files) {
  return {
    readFile: async (p) => { if (files[p] === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return files[p]; },
    readdir: async (p) => { const pre = `${p}/`; const names = [...new Set(Object.keys(files).filter((f) => f.startsWith(pre)).map((f) => f.slice(pre.length).split('/')[0]))]; if (!names.length) throw new Error('ENOENT'); return names; },
    statfs: async () => ({ bsize: 4096, blocks: 1000, bfree: 250, bavail: 200 }),
  };
}
const nodeHubOpts = (dir, extra = {}) => ({
  sys: fakeSystem({ platform: 'linux', env: { PATH: '/usr/bin', ...(extra.env || {}) } }), os: fakeOs(),
  fs: fakeFs({ '/proc/meminfo': 'MemTotal: 8000000 kB\nMemAvailable: 6000000 kB\n', '/sys/class/power_supply/BAT0/capacity': '77', '/sys/class/power_supply/BAT0/status': 'Charging' }),
  audio: false, media: 'simulated', calendar: false, prismControl: { dir, intervals: FAST, backoffMs: BACKOFF }, ...extra,
});

test('createNodeHub: Prism Control sources come first; per key it beats the real Node system source; off switch', async () => {
  const dir = tmpdir();
  const fake = await fakePrismControl({ dir });
  const hub = await createNodeHub(nodeHubOpts(dir));
  const release = hub.need(['cpu', 'mem', 'battery', 'media']);
  try {
    const ids = hub.sources.map((s) => s.id);
    assert.ok(ids.indexOf('prism-control.system') < ids.indexOf('system'), `order: ${ids.join(', ')}`);
    assert.ok(!ids.includes('prism-control.audio'), 'audio: false → no Prism Control audio source in the hub');
    await waitFor(() => hub.pick(['battery']).battery === 0.77, { what: 'Node battery probe' });
    await waitFor(() => hub.pick(['cpu']).cpu === 0.235, { what: 'Prism Control cpu' });
    assert.equal(hub.pick(['mem']).mem, 0.3125, 'mem from Prism Control (the probe says 0.25)');
    assert.equal(hub.pick(['battery']).battery, 0.77, 'battery from the Node probe');
    assert.equal(hub.pick(['media']).media.title, 'Example Song', 'media beats the simulated playlist');
    assert.match(hub.status().keys.cpu, /^prism-control\.system:live > system:live/);
    assert.equal(hub.sourceOf(['media']).media, 'live');
    assert.equal(typeof hub.prismControl.wrapAudio, 'function');
    await fake.close({ removeFile: true });
    await waitFor(() => hub.pick(['mem']).mem === 0.25, { what: 'Node mem after Prism Control left' });
    assert.notEqual(hub.pick(['media']).media.title, 'Example Song', 'media back to the simulated playlist');
    assert.equal(hub.sourceOf(['media']).media, 'simulated');
  } finally { release(); hub.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(hub.prismControl.status().state, 'idle', 'hub.stop() stops the client');
  const off = await createNodeHub(nodeHubOpts(dir, { env: { PRISM_DECK_PRISM_CONTROL: 'off' } }));
  assert.ok(!off.sources.some((s) => s.id.startsWith('prism-control')) && !off.prismControl, 'PRISM_DECK_PRISM_CONTROL=off');
  const bare = await createNodeHub({ ...nodeHubOpts(dir), system: false, prismControl: { dir } });
  assert.ok(!bare.sources.some((s) => s.id === 'prism-control.system' || s.id === 'prism-control.temp'), 'system: false skips its Prism Control twin');
  off.stop(); bare.stop();
});

// ── through the plugin runtime ──────────────────────────────────────────────
test('plugin: a cpu ring, now playing and a waveform on a fake Galleon show Prism Control\'s numbers, untagged', async () => {
  const { main } = await import('../src/plugin/index.js');
  const { startFakeStreamDeck } = await import('../src/plugin/dev/fake-streamdeck.js');
  const { decodeSvgDataUrl } = await import('../src/plugin/system-facets.js');
  const dir = tmpdir();
  const fake = await fakePrismControl({ dir });
  const data = await createNodeHub(nodeHubOpts(dir));
  const audio = data.prismControl.wrapAudio(fakeCapture());
  const sd = await startFakeStreamDeck({ globals: { boot: false } });
  const p = await main({ argv: sd.argv(), exit: () => {}, handleProcess: false, log: () => {}, controlFile: path.join(dir, 'deck-control.json'), audio, data });
  try {
    await sd.whenRegistered();
    sd.connectDevices();
    const g = sd.devices.find((d) => d.type === 12).id;
    const cpu = sd.appear({ device: g, col: 0, row: 0, settings: { facet: 'app-cpu-ring' } });
    const song = sd.appear({ device: g, col: 1, row: 0, settings: { facet: 'app-now-playing' } });
    const wave = sd.appear({ device: g, col: 2, row: 0, settings: { facet: 'app-waveform' } });
    const rt = p.runtime;
    const opts = (ctx) => rt.frameOpts(rt.unitOf(rt.instances.get(ctx)));
    await waitFor(() => opts(cpu).data.cpu === 0.235 && opts(song).data.media?.title === 'Example Song' && opts(wave).data.audio?.levels?.length === 480 && audio.modeOf('audio') === 'live', { timeoutMs: 6000, what: 'live data in frames' });
    assert.equal(opts(song).data.media.art.mime, 'image/png', 'real art reaches the facet (it decides how to show it)');
    const tagged = (ctx) => { const f = sd.received.filter((m) => m.event === 'setImage' && m.context === ctx).at(-1); return /id="prism-demo-tag"/.test(decodeSvgDataUrl(f.payload.image)); };
    // the runtime re-decides DEMO tags once a second: wait for the frames after Prism Control's data arrived
    await waitFor(() => !tagged(cpu) && !tagged(song), { timeoutMs: 5000, what: 'untagged frames (real CPU, real now playing)' });
    assert.equal(rt.sourcesStatus().media, 'live');
  } finally { await p.stop(); await sd.close(); data.stop(); await fake.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('endpoints table matches API.md §6 cadences', () => {
  assert.equal(ENDPOINTS.system.everyMs, 1000);
  assert.equal(ENDPOINTS.playing.everyMs, 1000);
  assert.ok(ENDPOINTS.devices.everyMs >= 2000 && ENDPOINTS.devices.everyMs <= 5000);
  assert.ok(ENDPOINTS.mic.everyMs >= 250 && ENDPOINTS.mic.everyMs <= 500, '2–4 Hz');
  assert.equal(ENDPOINTS.cooling.everyMs, 1000);
  assert.ok(ENDPOINTS.levels.everyMs >= 33, '≤ 30 Hz');
});
