// Prism Control source (Node): the PC's real numbers from the sibling plugin Prism Control
// (com.jeremyfhall.prismcontrol, a native Stream Deck plugin) over its read-only loopback HTTP API
// (prism-control docs/api.md, v1). Zero dependencies: node:fs + the built-in fetch.
//
//   const pc = createPrismControl({ under: { system: nodeSystemSource } });
//   for (const s of pc.sources) hub.add(s);          // BEFORE the Node probes: a live Prism Control wins per key
//   audio = pc.wrapAudio(audioSource);               // the plugin's per-frame audio (src/audio): real levels from Prism Control
//
// Sources (hub interface, README.md): one per group of keys, so the hub's reference counting decides
// which endpoints are polled — an endpoint is polled only while a source that uses it is started:
//
//   prism-control.system   cpu mem gpu disk net uptime sys series   /v1/system (1 Hz)
//   prism-control.temp     temp                                     /v1/cooling + /v1/system (1 Hz)
//   prism-control.media    media (+ real album art)                 /v1/now-playing (1 Hz) + /art on etag change, /v1/audio/devices (2 s)
//   prism-control.volume   volume                                   /v1/audio/devices (2 s)
//   prism-control.mic      mic                                      /v1/mic (4 Hz)
//   prism-control.cooling  fans pump coolant                        /v1/cooling (1 Hz)
//   prism-control.audio    audio (levels only; no spectrum)         /v1/audio/levels (30 Hz)
//
// Discovery: %APPDATA%\Prism\control\control.json (PRISM_CONTROL_DIR overrides the folder), re-read on
// every reconnect (port and token rotate per start). Nothing runs until a key is needed; while Prism
// Control is absent the file is re-checked with a 1–5 s backoff (a refused loopback connect costs ~2 s on
// Windows, so a stale file's pid is checked first). Every request is async and off the frame path:
// snapshot() only reads what the pollers stored. Requests carry the bearer token and If-None-Match; the
// Host comes from the IP base URL; no Origin is ever sent; the token is never logged.
//
// Mapping rule: Prism Control fills a key when it reports the thing (the object / list entry exists). A
// null field inside it stays null (the facet shows "—"; nothing is invented). A missing container (not
// ready yet, 503, no GPU stats, a stale or absent server) leaves the key ABSENT, so the Node probes —
// still running underneath — or the simulation serve it, exactly as without Prism Control. Demo-mode
// payloads (`"demo": true`) are marked simulated, so real probes beat them and the plugin tags them DEMO.

import { readFile as fsReadFile } from 'node:fs/promises';
import path from 'node:path';
import { History, stable } from './_source.js?v=b7d3401196';
import { Analyzer } from '../../audio/analyzer.js?v=b7d3401196';
import { toLevel } from '../../audio/dsp.js?v=b7d3401196';

export const PRISM_CONTROL_PLUGIN = 'com.jeremyfhall.prismcontrol';

/** Endpoint → path, poll interval (API.md §6), how long a good answer stays usable, optional stall limit. */
export const ENDPOINTS = Object.freeze({
  system: Object.freeze({ path: '/v1/system', everyMs: 1000, staleMs: 3500, maxAgeMs: 8000 }),
  playing: Object.freeze({ path: '/v1/now-playing', everyMs: 1000, staleMs: 3500 }),
  devices: Object.freeze({ path: '/v1/audio/devices', everyMs: 2000, staleMs: 6500 }),
  mic: Object.freeze({ path: '/v1/mic', everyMs: 250, staleMs: 2000 }),
  cooling: Object.freeze({ path: '/v1/cooling', everyMs: 1000, staleMs: 3500, maxAgeMs: 8000 }),
  levels: Object.freeze({ path: '/v1/audio/levels', everyMs: 33, staleMs: 1000, timeoutMs: 1000 }),
});

/** Hub sources: the ctx.data keys each fills and the endpoints it polls while started. */
export const PRISM_CONTROL_SOURCES = Object.freeze({
  system: Object.freeze({ provides: ['cpu', 'mem', 'gpu', 'disk', 'net', 'uptime', 'sys', 'series'], uses: ['system'], rate: 1 }),
  temp: Object.freeze({ provides: ['temp'], uses: ['cooling', 'system'], rate: 1 }),
  media: Object.freeze({ provides: ['media'], uses: ['playing', 'devices'], rate: 1 }),
  volume: Object.freeze({ provides: ['volume'], uses: ['devices'], rate: 0.5 }),
  mic: Object.freeze({ provides: ['mic'], uses: ['mic'], rate: 4 }),
  cooling: Object.freeze({ provides: ['fans', 'pump', 'coolant'], uses: ['cooling'], rate: 1 }),
  audio: Object.freeze({ provides: ['audio'], uses: ['levels'], rate: 30 }),
});

const SERIES = ['cpu', 'mem', 'gpu', 'down', 'up', 'read', 'write', 'temp'];
const LEVEL_HZ = 30;
const ART_TYPES = /^image\/(jpeg|png)$/;
const MiB = 1024 ** 2, GiB = 1024 ** 3;

// ── discovery ─────────────────────────────────────────────────────────────────
/** Where control.json lives: PRISM_CONTROL_DIR, else %APPDATA%\Prism\control (null off Windows). */
export function controlFilePath(env = process.env) {
  const dir = env?.PRISM_CONTROL_DIR || (env?.APPDATA ? path.join(env.APPDATA, 'Prism', 'control') : null);
  return dir ? path.join(dir, 'control.json') : null;
}

/**
 * control.json text → { baseUrl, token, pid, version, api } or null. Strict: the token only ever goes to
 * http://127.0.0.1:<port> (a file naming any other host is refused), and only a v1 file from Prism Control counts.
 */
export function parseControlFile(text) {
  let j;
  try { j = JSON.parse(String(text).replace(/^﻿/, '')); } catch { return null; }
  if (!j || typeof j !== 'object' || j.v !== 1 || j.plugin !== PRISM_CONTROL_PLUGIN || !(Number(j.api) >= 1)) return null;
  const port = Number(j.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const baseUrl = `http://127.0.0.1:${port}`;
  if (j.baseUrl !== undefined && String(j.baseUrl).replace(/\/+$/, '') !== baseUrl) return null;
  if (typeof j.token !== 'string' || !/^[0-9a-f]{64}$/i.test(j.token)) return null;
  return { baseUrl, token: j.token, pid: Number.isInteger(j.pid) && j.pid > 0 ? j.pid : null, version: typeof j.version === 'string' ? j.version : null, api: Number(j.api) };
}

function defaultPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

// ── payload → ctx.data (pure, exported for tests) ────────────────────────────────
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const pct01 = (x) => { const v = num(x); return v === null ? null : Math.min(1, Math.max(0, v / 100)); };
const lin01 = (x) => { const v = num(x); return v === null ? null : Math.min(1, Math.max(0, v)); };
const bool = (x) => (typeof x === 'boolean' ? x : null);
const sumOf = (xs) => { const v = xs.map(num).filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };

/** The GPU the deck shows: the one with the most dedicated VRAM (the discrete card), else the first. */
export function primaryGpu(gpus) {
  if (!Array.isArray(gpus) || !gpus.length) return null;
  return gpus.reduce((best, g) => ((num(g?.vramTotalMiB) ?? -1) > (num(best?.vramTotalMiB) ?? -1) ? g : best), gpus[0]);
}

/**
 * /v1/system data → { cpu, mem, gpu, disk, net, uptime, sys }. `under` = the Node probes' sys (per-core loads,
 * charging, platform): it fills only the sys details Prism Control leaves null (perCorePct is null unless one
 * of Prism Control's own per-core views is visible).
 */
export function mapSystem(d, { systemDrive = 'C:', under = null } = {}) {
  const out = {};
  if (!d || typeof d !== 'object') return out;
  const cpu = d.cpu || null, mem = d.memory || null, net = d.network || null;
  const gpu = primaryGpu(d.gpus);
  const disks = Array.isArray(d.disks) ? d.disks : [];
  const drive = String(systemDrive || 'C:').toUpperCase().replace(/\\+$/, '');
  const disk = disks.find((x) => String(x?.name || '').toUpperCase().replace(/\\+$/, '') === drive) || disks[0] || null;
  if (cpu) out.cpu = pct01(cpu.usagePct);
  if (mem) out.mem = pct01(mem.usagePct ?? (num(mem.usedMiB) !== null && num(mem.totalMiB) ? (mem.usedMiB / mem.totalMiB) * 100 : null));
  if (gpu) out.gpu = pct01(gpu.usagePct);
  if (disk) out.disk = pct01(disk.usagePct ?? (num(disk.usedGiB) !== null && num(disk.totalGiB) ? (disk.usedGiB / disk.totalGiB) * 100 : null));
  if (net) out.net = num(net.rxBps) !== null && num(net.txBps) !== null ? { down: Math.max(0, net.rxBps), up: Math.max(0, net.txBps) } : null;
  if (d.uptimeSec !== undefined) out.uptime = num(d.uptimeSec);
  const bytes = (x, unit) => (num(x) === null ? null : Math.round(x * unit));
  const memTotal = bytes(mem?.totalMiB, MiB);
  const diskTotal = bytes(disk?.totalGiB, GiB);
  const pc = {
    cores: Array.isArray(cpu?.perCorePct) && cpu.perCorePct.length ? cpu.perCorePct.map((v) => pct01(v) ?? 0) : null,
    cpuModel: typeof cpu?.name === 'string' && cpu.name.trim() ? cpu.name.replace(/\s+/g, ' ').trim() : null,
    cpuGhz: num(cpu?.clockMhz) === null ? null : Math.round(cpu.clockMhz / 100) / 10,
    memTotal,
    memUsed: bytes(mem?.usedMiB, MiB),
    diskTotal,
    diskFree: diskTotal === null || num(disk?.usedGiB) === null ? null : Math.max(0, diskTotal - bytes(disk.usedGiB, GiB)),
    diskRead: sumOf(disks.map((x) => x?.readBps)),
    diskWrite: sumOf(disks.map((x) => x?.writeBps)),
    gpuName: typeof gpu?.name === 'string' && gpu.name ? gpu.name : null,
    gpuTemp: num(gpu?.tempC),
    vramUsed: bytes(gpu?.vramUsedMiB, MiB),
    vramTotal: bytes(gpu?.vramTotalMiB, MiB),
    charging: null,
    platform: 'win32',
  };
  const sys = {};
  for (const [k, v] of Object.entries(pc)) sys[k] = v ?? (under && under[k] !== undefined ? under[k] : null);
  out.sys = sys;
  return out;
}

/** CPU package °C: /v1/cooling's chosen sensor (iCUE / LibreHardwareMonitor), else /v1/system's; null when neither measures it. */
export function mapTemp(system, cooling) {
  const c = cooling && cooling.status !== 'connecting' && cooling.status !== 'idle' ? num(cooling.cpu?.tempC) ?? null : undefined;
  const s = system && system.cpu ? num(system.cpu.tempC) : undefined;
  if (typeof c === 'number') return c;
  if (typeof s === 'number') return s;
  return c === null || s === null ? null : undefined;
}

/** /v1/audio/devices data → volume { level 0–1, muted } of the default output endpoint (null: none). */
export function mapVolume(d) {
  const o = d?.output;
  if (!o) return undefined;
  const list = Array.isArray(o.devices) ? o.devices : [];
  const dev = list.find((x) => x?.id && x.id === o.defaultId) || list.find((x) => x?.isDefault) || null;
  return dev ? { level: pct01(dev.volumePct), muted: bool(dev.muted) } : null;
}

/**
 * /v1/now-playing data → media { title, artist, album, position s, duration s, playing, volume?, muted?, … } or
 * null (nothing loaded). position is extrapolated while playing (API.md §4.4). art = the image as served
 * ({ dataUrl, mime, width, height }) once fetched for the current art etag, else null.
 */
export function mapMedia(d, { nowMs = Date.now(), art = null, volume } = {}) {
  if (!d || typeof d !== 'object') return undefined;
  const tr = d.track;
  if (d.state === 'none' || !tr || typeof tr.title !== 'string') return null;
  const playing = d.state === 'playing';
  const dur = num(tr.durationMs);
  let pos = num(d.positionMs);
  if (pos !== null && playing) { const at = Date.parse(d.positionAt); if (Number.isFinite(at)) pos += Math.max(0, nowMs - at); }
  if (pos !== null && dur !== null) pos = Math.min(pos, dur);
  const m = {
    title: tr.title,
    artist: Array.isArray(tr.artists) ? tr.artists.filter((a) => typeof a === 'string').join(', ') : '',
    album: typeof tr.album === 'string' ? tr.album : null,
    position: pos === null ? null : Math.floor(pos / 100) / 10,
    duration: dur === null ? null : dur / 1000,
    playing,
    state: d.state,
    source: typeof d.source === 'string' ? d.source : null,
    app: typeof d.app === 'string' ? d.app : null,
    url: typeof tr.url === 'string' ? tr.url : null,
    shuffle: bool(d.shuffle), repeat: typeof d.repeat === 'string' ? d.repeat : null, liked: bool(d.liked),
    playerVolume: pct01(d.volumePct),
    art: art && d.art?.etag ? art : null,
  };
  if (volume) { m.volume = volume.level; m.muted = volume.muted; }
  return m;
}

/** /v1/mic data → mic { muted, volume 0–1, peak (linear 0–1), level (dB scale like audio.level), inUse } or null (no mic). */
export function mapMic(d) {
  if (!d || typeof d !== 'object') return undefined;
  if (!d.deviceId && !d.name) return null;
  const peak = lin01(d.peak);
  return { muted: bool(d.muted), volume: pct01(d.volumePct), peak, level: peak === null ? null : toLevel(peak), inUse: bool(d.inUse) };
}

/** /v1/cooling data → { fans, pump, coolant } (absent while sampling starts; null when nothing reports). */
export function mapCooling(d) {
  if (!d || typeof d !== 'object' || d.status === 'connecting' || d.status === 'idle') return {};
  const g = Object.fromEntries((Array.isArray(d.groups) ? d.groups : []).map((x) => [x?.group, x]));
  const grp = (x) => (x && x.count > 0 ? { rpm: num(x.avgRpm), min: num(x.minRpm), max: num(x.maxRpm), count: x.count } : null);
  const all = grp(g.allFans), gpu = grp(g.gpu);
  const list = (Array.isArray(d.sensors) ? d.sensors : []).filter((s) => s?.kind === 'fan').map((s) => ({ id: s.id, name: s.name ?? null, role: s.role ?? null, rpm: num(s.rpm), pct: pct01(s.pct), connected: !!s.connected }));
  const fans = all || gpu ? { ...(all || { rpm: null, min: null, max: null, count: 0 }), radiator: grp(g.radiator), case: grp(g.case), unassigned: grp(g.unassigned), gpu, list } : null;
  return { fans, pump: grp(g.pump), coolant: d.coolant ? num(d.coolant.tempC) : null };
}

// ── the client ────────────────────────────────────────────────────────────────
/**
 * opts: { env, file (control.json path), readFile, fetch, now, setTimer, clearTimer, pidAlive, log(level, msg),
 *         backoffMs [1000, 2000, 3000, 5000], timeoutMs 2500, intervals { endpoint: ms } (tests), systemDrive,
 *         under: { system } (the Node system source: its sys fills details Prism Control lacks), artMaxBytes 1 MiB }
 */
export function createPrismControl(opts = {}) {
  const env = opts.env || process.env;
  const file = opts.file !== undefined ? opts.file : controlFilePath(opts.dir ? { PRISM_CONTROL_DIR: opts.dir } : env);
  const readFile = opts.readFile || ((p) => fsReadFile(p, 'utf8'));
  const doFetch = opts.fetch || globalThis.fetch;
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimer || ((fn, ms) => { const h = setTimeout(fn, ms); h?.unref?.(); return h; });
  const clearTimer = opts.clearTimer || ((h) => clearTimeout(h));
  const pidAlive = opts.pidAlive || defaultPidAlive;
  const log = opts.log || (() => {});
  const backoffMs = opts.backoffMs || [1000, 2000, 3000, 5000];
  const timeoutMs = opts.timeoutMs ?? 2500;
  const artMaxBytes = opts.artMaxBytes ?? 1 << 20;
  const systemDrive = opts.systemDrive || env.SystemDrive || 'C:';
  const under = opts.under || {};

  let conn = null, connecting = false, connectTimer = null, fails = 0, refusedToken = null, gen = 0, idleSince = 0, flaky = 0;
  let state = file && typeof doFetch === 'function' ? 'idle' : 'unsupported', lastError = null, connectedAt = 0, server = null;
  const eps = new Map(Object.entries(ENDPOINTS).map(([key, e]) => [key, {
    key, ...e, everyMs: opts.intervals?.[key] ?? e.everyMs, demand: 0, timer: null, busy: false, etag: null, body: null,
    okAt: 0, producedAt: 0, version: 0, pauseUntil: 0, missing: false, unavailable: false, stats: { requests: 0, ok: 0, notModified: 0, errors: 0 },
  }]));
  const art = { etag: null, value: null, busy: false, retryAt: 0, fetches: 0 };
  const hist = Object.fromEntries(SERIES.map((k) => [k, new History(60)]));
  let analyzer = null, lastHopAt = 0;

  const anyDemand = () => [...eps.values()].some((e) => e.demand > 0);
  const fresh = (key, t = now()) => {
    const e = eps.get(key);
    return !!conn && !!e.body && e.okAt > 0 && !e.unavailable && t - e.okAt <= e.staleMs && (!e.maxAgeMs || t - e.producedAt <= e.maxAgeMs);
  };
  const dataOf = (key, t) => (fresh(key, t) ? eps.get(key).body.data : undefined);
  const demoOf = (key) => eps.get(key).body?.demo === true;

  // ── HTTP ──
  async function request(c, p, { etag, binary = false, ms = timeoutMs } = {}) {
    const headers = { authorization: `Bearer ${c.token}`, accept: binary ? 'image/jpeg, image/png' : 'application/json' };
    if (etag) headers['if-none-match'] = etag;
    const res = await doFetch(c.baseUrl + p, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(ms) });
    const out = { status: res.status, etag: res.headers.get('etag'), type: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), body: null, retryAfterMs: null };
    if (res.status === 200 && binary) {
      const len = Number(res.headers.get('content-length'));
      if (Number.isFinite(len) && len > artMaxBytes) { await res.body?.cancel().catch(() => {}); out.tooBig = true; return out; }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > artMaxBytes) out.tooBig = true; else out.body = buf;
    } else if (res.status === 200) {
      out.body = await res.json().catch(() => null);                // not JSON: a bad answer, not a lost connection
    } else {
      const text = await res.text().catch(() => '');
      let j = null;
      try { j = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
      out.error = j?.error?.code || null;
      const ra = Number(j?.error?.data?.retryAfterMs ?? (Number(res.headers.get('retry-after')) * 1000));
      out.retryAfterMs = Number.isFinite(ra) && ra > 0 ? ra : null;
    }
    return out;
  }

  // ── connection ──
  function wake(delay = 0) {
    if (state === 'unsupported') return;
    if (!anyDemand()) { if (connectTimer !== null) { clearTimer(connectTimer); connectTimer = null; } return; }
    if (conn) { for (const e of eps.values()) ensure(e); return; }
    if (connecting || connectTimer !== null) return;
    connectTimer = setTimer(() => { connectTimer = null; connect(); }, delay);
  }

  async function connect() {
    if (conn || connecting || !anyDemand()) return;
    const g = gen;
    connecting = true;
    if (state !== 'absent') state = 'connecting';
    let ok = false;
    try {
      let text;
      try { text = await readFile(file); } catch (e) { return miss(e?.code === 'ENOENT' ? 'not running (no control.json)' : 'control.json unreadable'); }
      const c = parseControlFile(text);
      if (!c) return miss('control.json not recognized');
      if (c.pid && !pidAlive(c.pid)) return miss('not running (stale control.json)');
      if (c.token === refusedToken) return miss('not running (token refused; waiting for a new control.json)');
      let r;
      try { r = await request(c, '/v1/health'); } catch (e) { return miss(`not reachable (${e?.cause?.code || e?.name || 'error'})`); }
      if (r.status === 401) { refusedToken = c.token; return miss('token refused'); }
      if (r.status !== 200 || !r.body || typeof r.body !== 'object') return miss(`health answered ${r.status}`);
      if (g !== gen) return;
      conn = c; ok = true; fails = 0; flaky = 0; refusedToken = null; lastError = null; connectedAt = now(); state = 'connected';
      server = { version: r.body.version || c.version, api: c.api, status: r.body.status || null, streamDeck: r.body.streamDeck?.connected ?? null };
      log('info', `prism-control: connected (Prism Control ${server.version || '?'}, api ${c.api})`);
      for (const e of eps.values()) ensure(e);
    } finally {
      connecting = false;
      if (!ok && g === gen) { const d = backoffMs[Math.min(fails, backoffMs.length - 1)]; fails++; wake(d); }
    }
  }

  /** Coming back after an idle spell: if control.json changed (a restart) or vanished, reconnect now instead of waiting on a dead port. */
  async function recheck() {
    const c = conn;
    let next = null;
    try { next = parseControlFile(await readFile(file)); } catch { next = null; }
    if (!c || c !== conn) return;
    if (!next || next.token !== c.token || next.baseUrl !== c.baseUrl) lost('control.json changed');
  }

  /**
   * A request failed at the socket. Refused = gone now. A reset or timeout is retried once (keep-alive races),
   * and control.json is re-read meanwhile: a clean exit deletes it, so the fallback is immediate instead of
   * waiting out Windows' ~2 s refused-connect retries.
   */
  function failed(e, err, c) {
    if (c !== conn) return false;
    e.stats.errors++;
    const code = err?.cause?.code || err?.code || err?.name || 'fetch failed';
    if (code !== 'ECONNREFUSED' && ++flaky < 2) { recheck(); return true; }
    lost(err?.name === 'TimeoutError' ? `${e.path} timed out` : code);
    return false;
  }
  function miss(reason) {
    if (state !== 'absent' || lastError !== reason) log('debug', `prism-control: ${reason}`);
    state = 'absent'; lastError = reason;
  }

  /** The connection failed (refused, reset, timed out, 401): drop everything it served; reconnect re-reads control.json. */
  function lost(reason) {
    if (!conn) return;
    log('info', `prism-control: connection lost (${reason}); live probes take over`);
    conn = null; server = null; state = 'connecting'; lastError = reason;
    for (const e of eps.values()) {
      if (e.timer !== null) { clearTimer(e.timer); e.timer = null; }
      e.etag = null; e.body = null; e.okAt = 0; e.missing = false; e.unavailable = false; e.version++;
    }
    clearArt();
    for (const h of Object.values(hist)) h.buf.length = 0;
    fails = 0; flaky = 0;
    wake(0);
  }

  // ── polling ──
  function ensure(e) {
    if (e.demand > 0 && conn && !e.missing) { if (!e.busy && e.timer === null) e.timer = setTimer(() => { e.timer = null; poll(e); }, 0); }
    else if (e.timer !== null) { clearTimer(e.timer); e.timer = null; }
  }
  function again(e, ms) { if (e.demand > 0 && conn && !e.missing && e.timer === null) e.timer = setTimer(() => { e.timer = null; poll(e); }, Math.max(0, ms)); }

  async function poll(e) {
    if (e.busy || !(e.demand > 0) || !conn || e.missing) return;
    const t0 = now();
    if (t0 < e.pauseUntil) return again(e, e.pauseUntil - t0);
    const c = conn;
    e.busy = true; e.stats.requests++;
    let next = e.everyMs;
    try {
      let r;
      try { r = await request(c, e.path, { etag: e.etag, ms: e.timeoutMs ?? timeoutMs }); } catch (err) {
        if (failed(e, err, c)) next = Math.min(next, 100);
        return;
      }
      if (c !== conn) return;
      flaky = 0;
      const t = now();
      if (r.status === 200 && r.body && typeof r.body === 'object') {
        e.stats.ok++; e.body = r.body; e.etag = r.etag; e.okAt = t; e.unavailable = false; e.version++;
        e.producedAt = t - Math.max(0, num(r.body.ageMs) ?? 0);
      } else if (r.status === 200) {
        e.stats.errors++;                                            // not JSON: try again at the usual cadence
      } else if (r.status === 304 && e.body) {
        e.stats.notModified++; e.okAt = t;
      } else if (r.status === 304) {
        e.etag = null; next = 0;                                     // a 304 without a cached body: ask again, fresh
      } else if (r.status === 401) {
        e.stats.errors++; lost('unauthorized'); return;
      } else if (r.status === 429) {
        e.stats.errors++; e.pauseUntil = t + (r.retryAfterMs ?? 1000); next = r.retryAfterMs ?? 1000;
      } else if (r.status === 503) {
        e.stats.errors++; e.unavailable = true; e.version++; next = Math.max(e.everyMs, r.retryAfterMs ?? 1000);
      } else if (r.status === 404) {
        e.stats.errors++; e.missing = true; e.version++; log('debug', `prism-control: ${e.path} not served by this version`);
      } else {
        e.stats.errors++; next = Math.max(e.everyMs, 30000); log('warn', `prism-control: ${e.path} answered ${r.status}${r.error ? ` ${r.error}` : ''}`);
      }
      const good = r.status === 200 || r.status === 304;
      if (e.key === 'system' && good) pushSeries(t);
      if (e.key === 'levels' && good) feedLevels(t);
      if (e.key === 'playing' && good) syncArt();
    } finally {
      e.busy = false;
      if (c === conn) again(e, next - (now() - t0));
    }
  }

  function demand(keys, d) {
    for (const k of keys) {
      const e = eps.get(k);
      const was = e.demand;
      e.demand = Math.max(0, e.demand + d);
      if (k === 'levels' && was === 0 && e.demand > 0) { analyzer?.reset(); lastHopAt = 0; }
      if (k === 'playing' && e.demand === 0) clearArt();          // album art is cached in memory, briefly (Spotify terms)
      ensure(e);
    }
    if (!anyDemand()) idleSince ||= now();
    else if (idleSince) { const was = idleSince; idleSince = 0; if (conn && now() - was > 5000) recheck(); }
    wake(0);
  }

  // ── album art (only when art.etag changes) ──
  function clearArt() { art.etag = null; art.value = null; art.retryAt = 0; }
  async function syncArt() {
    const meta = eps.get('playing').body?.data?.art;
    if (!meta?.etag) { clearArt(); return; }
    if (meta.etag === art.etag || art.busy || now() < art.retryAt || !conn) return;
    const c = conn;
    art.busy = true; art.fetches++;
    try {
      const r = await request(c, '/v1/now-playing/art', { binary: true, etag: art.etag });
      if (c !== conn || !(eps.get('playing').demand > 0)) return;   // released meanwhile: don't keep the image
      if (r.status === 200 && r.body && ART_TYPES.test(r.type)) {
        art.etag = r.etag || meta.etag;
        art.value = { dataUrl: `data:${r.type};base64,${Buffer.from(r.body.buffer, r.body.byteOffset, r.body.byteLength).toString('base64')}`, mime: r.type, width: num(meta.width), height: num(meta.height), bytes: r.body.byteLength };
      } else if (r.status === 304) {
        art.etag = r.etag || meta.etag;
      } else if (r.status === 404 || r.tooBig || r.status === 200) {
        art.etag = meta.etag; art.value = null;                     // no image, too big, or not an image type: no art for this track
      } else if (r.status === 401) {
        lost('unauthorized');
      } else {
        art.retryAt = now() + 5000;
      }
    } catch (err) {
      if (failed(eps.get('playing'), err, c)) art.retryAt = now() + 1000;
    } finally { art.busy = false; }
  }

  // ── series (1 Hz, oldest first; same keys and units as the Node system source) ──
  function pushSeries(t) {
    const d = dataOf('system', t);
    if (!d) return;
    const s = mapSystem(d, { systemDrive });
    const temp = mapTemp(d, dataOf('cooling', t));
    hist.cpu.push(s.cpu ?? 0); hist.mem.push(s.mem ?? 0); hist.gpu.push(s.gpu ?? 0);
    hist.down.push(s.net?.down ?? 0); hist.up.push(s.net?.up ?? 0);
    hist.read.push(s.sys.diskRead ?? 0); hist.write.push(s.sys.diskWrite ?? 0); hist.temp.push(temp ?? 0);
  }

  // ── audio levels → the analyzer the capture path uses (same audio shape, 16 s × 30 Hz) ──
  function feedLevels(t) {
    const out = eps.get('levels').body?.data?.output;
    if (!out) return;
    analyzer ??= new Analyzer({ historySeconds: 16, historyRate: LEVEL_HZ, bands: 0 });
    // one hop per 1/30 s of wall time: a 304 (unchanged meter, e.g. silence) keeps scrolling; a gap > 1 s isn't backfilled
    const hop = 1000 / LEVEL_HZ;
    let n;
    if (!lastHopAt || t - lastHopAt > 1000) { n = 1; lastHopAt = t; }
    else { n = Math.floor((t - lastHopAt) / hop); if (n <= 0) return; lastHopAt += n * hop; }
    const peak = lin01(out.peak) ?? 0;
    for (let i = 0; i < n; i++) analyzer.pushMeter({ peak });
  }
  const levelsLive = (t) => fresh('levels', t) && !!eps.get('levels').body?.data?.output && !!analyzer;
  let audioMemo = { hops: -1, v: null };
  function audioSnap() {
    if (audioMemo.hops === analyzer.hops) return audioMemo.v;
    const { rms: _rms, ...a } = analyzer.snapshot().audio;          // Prism Control meters peaks only: no invented rms
    audioMemo = { hops: analyzer.hops, v: { audio: a } };
    return audioMemo.v;
  }

  // ── hub sources ──
  const memo = (fn) => { let sig = null, val = null; return (s, f) => { if (s !== sig) { sig = s; val = f(); } return val; }; };
  const builders = {
    system(t) {
      const d = dataOf('system', t);
      if (!d) return {};
      const u = under.system && under.system.running !== false ? safeSnap(under.system)?.sys : null;
      const out = mapSystem(d, { systemDrive, under: u });
      const series = { step: 1 };
      for (const k of SERIES) if (hist[k].length >= 2) series[k] = hist[k].values();
      out.series = series;
      return stable(out);
    },
    temp(t) { const v = mapTemp(dataOf('system', t), dataOf('cooling', t)); return v === undefined ? {} : { temp: v }; },
    media(t) {
      const d = dataOf('playing', t);
      if (!d) return {};
      const meta = d.art;
      const vol = mapVolume(dataOf('devices', t));
      return { media: mapMedia(d, { nowMs: t, art: meta?.etag && meta.etag === art.etag ? art.value : null, volume: vol || undefined }) };
    },
    volume(t) { const v = mapVolume(dataOf('devices', t)); return v === undefined ? {} : { volume: v }; },
    mic(t) { const v = mapMic(dataOf('mic', t)); return v === undefined ? {} : { mic: stable(v) }; },
    cooling(t) { const d = dataOf('cooling', t); return d ? stable(mapCooling(d)) : {}; },
    audio(t) { return levelsLive(t) ? audioSnap() : {}; },
  };
  const sigOf = (name, t) => {
    const def = PRISM_CONTROL_SOURCES[name];
    let s = def.uses.map((k) => `${eps.get(k).version}:${fresh(k, t) ? 1 : 0}`).join('|');
    if (name === 'system') s += `|${Math.floor(t / 1000)}`;            // the Node probes' per-core loads move each second
    if (name === 'media') s += `|${art.etag}|${art.value ? 1 : 0}|${eps.get('playing').body?.data?.state === 'playing' ? Math.floor(t / 250) : 0}`;
    if (name === 'audio') s += `|${analyzer?.hops ?? -1}`;
    return s;
  };

  function makeSource(name) {
    const def = PRISM_CONTROL_SOURCES[name];
    const cache = memo();
    let running = false;
    const live = (t) => (name === 'temp' ? ['cooling', 'system'].filter((k) => fresh(k, t)) : name === 'audio' ? (levelsLive(t) ? ['levels'] : []) : fresh(def.uses[0], t) ? [def.uses[0]] : []);
    return {
      id: `prism-control.${name}`, provides: [...def.provides], rate: def.rate,
      /** 'live' while Prism Control serves real data · 'simulated' for its demo mode · 'idle' otherwise (the hub then asks the next source). */
      get mode() { const ks = live(now()); return !ks.length ? 'idle' : ks.every(demoOf) ? 'simulated' : 'live'; },
      get running() { return running; },
      start() { if (!running) { running = true; demand(def.uses, 1); } return this; },
      stop() { if (running) { running = false; demand(def.uses, -1); } return this; },
      snapshot(nowMs) { const t = now(); return cache(sigOf(name, t), () => builders[name](t, nowMs)); },
      status() { return { id: `prism-control.${name}`, mode: this.mode, running, endpoints: def.uses.map((k) => ENDPOINTS[k].path), prismControl: state }; },
    };
  }
  const sources = Object.keys(PRISM_CONTROL_SOURCES).map(makeSource);

  /**
   * Wrap the plugin's AudioSource (src/audio, or null): `audio` comes from Prism Control while it meters real
   * levels (then the capture's, then Prism Control's demo levels, then the synthetic groove); `spectrum` always
   * from the capture (Prism Control has no bands). mode stays the capture's (both keys must be real to be 'live');
   * modeOf(key) is exact per key. retain() also polls /v1/audio/levels at 30 Hz until released.
   */
  function wrapAudio(inner) {
    let held = 0;
    const pcAudio = () => { const t = now(); return levelsLive(t) ? audioSnap() : null; };
    const pcReal = () => levelsLive(now()) && !demoOf('levels');
    const innerLive = () => inner?.mode === 'live';
    return {
      id: 'audio', provides: ['audio', 'spectrum'], inner, prismControl: client,
      get state() { return inner?.state ?? (pcReal() ? 'live' : 'idle'); },
      get running() { return !!inner?.running || held > 0; },
      get rate() { return inner?.rate ?? LEVEL_HZ; },
      get mode() { return innerLive() ? 'live' : 'simulated'; },
      modeOf(key) { return key === 'audio' && pcReal() ? 'live' : innerLive() ? 'live' : 'simulated'; },
      retain() {
        const r = inner?.retain?.();
        held++; demand(['levels'], 1);
        let done = false;
        return () => { if (done) return; done = true; if (held > 0) { held--; demand(['levels'], -1); } if (typeof r === 'function') r(); };
      },
      snapshot() {
        const s = inner?.snapshot?.() || null;
        const pc = pcAudio();
        if (pc && (pcReal() || !innerLive())) return { ...(s || {}), audio: pc.audio };
        return s;
      },
      data() { return this.snapshot(); },
      start() { return inner?.start?.(); },
      async stop() { if (held) { demand(['levels'], -held); held = 0; } return inner?.stop?.(); },
      on(name, fn) { return inner?.on?.(name, fn) || (() => {}); },
      info() { return { ...(inner?.info?.() || { state: pcReal() ? 'live' : 'idle' }), prismControl: { state, levels: pcReal() ? 'live' : levelsLive(now()) ? 'demo' : 'off' } }; },
      status() { return this.info(); },
    };
  }

  const client = {
    sources,
    wrapAudio,
    get state() { return state; },
    get connected() { return !!conn; },
    /** Diagnostics (no token): connection, server version, per-endpoint demand and counters. */
    status() {
      const t = now();
      return {
        state, file, lastError, server: server ? { ...server } : null, connectedForMs: conn ? t - connectedAt : null,
        endpoints: Object.fromEntries([...eps.values()].map((e) => [e.path, { demand: e.demand, fresh: fresh(e.key, t), demo: demoOf(e.key), okAgoMs: e.okAt ? t - e.okAt : null, unavailable: e.unavailable, missing: e.missing, ...e.stats }])),
        art: { cached: !!art.value, bytes: art.value?.bytes ?? 0, fetches: art.fetches },
      };
    },
    /** Stop everything (timers, polling, cached art). Sources can be started again afterwards. */
    stop() {
      gen++;
      for (const e of eps.values()) { e.demand = 0; ensure(e); }
      for (const s of sources) if (s.running) s.stop();
      if (connectTimer !== null) { clearTimer(connectTimer); connectTimer = null; }
      conn = null; server = null; clearArt();
      if (state !== 'unsupported') state = 'idle';
    },
  };
  return client;
}

function safeSnap(src) { try { return src.snapshot(); } catch { return null; } }
