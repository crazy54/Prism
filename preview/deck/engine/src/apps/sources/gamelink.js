import { __m as __bm } from '../../../facets.bundle.js';
// Game Link: the plugin's loopback listener and the `gamelink` hub source. Node only (node:http, node:fs);
// never re-exported from ./index.js (browser-safe). The pure halves are ./gamelink-cs2.js and ./gamelink-companion.js.
//
//   const gl = createGameLink({ dir, log });       // nothing binds, reads or writes here
//   hub.add(gl.source);                             // ctx.data.gamelink: {} while off · null while waiting · state while live
//   await gl.configure({ enabled: true, port });    // the global gamelink.enabled (the user clicked "Connect CS2")
//   gl.on('change', (keys, { urgent }) => runtime.dataChanged(keys, { urgent }));   gl.on('status', fn): the CS2 check was refreshed
//   await gl.connectCs2();  await gl.disconnectCs2();  gl.status();  await gl.cs2Status();  await gl.stop();
//
// Listener (lead/DECISIONS.md, Game Link + CS2):
//   - one per plugin process, bound to 127.0.0.1 only while enabled; disabled = no socket at all
//   - port 38140; if that fails (EADDRINUSE / EACCES) 38141–38149; the port that worked is persisted, and a cfg
//     written for another port reads "out of date" until the user clicks Connect CS2 again
//   - per-client tokens { cs2, companion } (64 hex) in gamelink.json beside control.json
//     (%APPDATA%\Prism\deck\gamelink.json; PRISM_DECK_GAMELINK_DIR overrides the folder), written atomically,
//     dir 0700 / file 0600 on POSIX (on Windows %APPDATA% is already the user's own); a rename that a reader blocks
//     (Windows EPERM / EACCES / EBUSY) is retried, and a write that still fails leaves no .tmp behind
//   - clearing a custom port goes back to 38140; a persisted port is honored only inside 38140–38149 (a fallback);
//     binding a fallback re-checks the CS2 cfg once (read-only), so "out of date" shows by itself
//   - keep-alive outlives CS2's 5 s heartbeat (keepAliveTimeout 30 s: Node 20 closes exactly at the timeout)
//   - Listen off → on never serves the old state as live: it waits for a new post (the old state is only the
//     baseline the next post is compared with)
//   - every request: exact Host 127.0.0.1:<port> (421), no Origin header (403: no browsers), known route (404)
//   - POST /v1/cs2: ALWAYS 204, answered before parsing; bad input (type, size > 64 KiB, JSON, token in
//     auth.token, appid, rate) is dropped silently and counted — an error reply makes CS2 resend in a hot loop
//   - POST /v1/companion: Bearer tokens.companion (401), ≤ 50 requests/s (429), JSON (415 / 400), ≤ 256 KiB (413), 200;
//     its push is urgent only for effect events (URGENT_EVENTS), so a chatty companion can't pin the shared budget
//   - GET /v1/health: Bearer tokens.companion → { ok, api, game, lastAt } (never the state)
//   - payloads, Steam ids, names and tokens are never logged and never in status(); identities are dropped at the edge
// Writes to a game folder happen only in connectCs2() / disconnectCs2(), i.e. on the user's click, and touch only
// <cs2>/game/csgo/cfg/gamestate_integration_prism.cfg (plus its .tmp while writing).
//
// ── MOBAs (prism-play, lead/CONTRACT-moba.md) ──
//   - POST /v1/dota2: the same rules as /v1/cs2 (ALWAYS 204 before parsing; type, size ≤ 128 KiB, JSON, token =
//     tokens.dota2 in auth.token, appid 570, rate; identities dropped at the edge by sanitizeDota2). tokens.dota2 is
//     created on the first Connect Dota 2 (a file without it is still valid) and rotated by Disconnect.
//     connectDota2() / disconnectDota2() write / remove only
//     <dota>/game/dota/cfg/gamestate_integration/gamestate_integration_prism.cfg (creating that folder if Dota hasn't),
//     on the user's click. Dota 2 also needs the -gamestateintegration launch option: the PI tells the user; we never
//     touch Steam's own files.
//   - gl.attachPoller({ game, start }) → detach(): a local poller (the LoL Live Client poller) feeding the hub.
//       start({ push, log, now }) → stop | Promise<stop>   called while the listener is up (Listen on); stop() on Listen
//                                                          off, detach() and gl.stop(). Never called while off.
//       push({ state, events } | state | null)              a normalized Game Link v1 state for `game` (v: 1, game);
//                                                          push it on every poll (it's the heartbeat: no push for
//                                                          staleMs = waiting); null = the game is gone. ≤ 20 pushes/s.
//                                                          Pushes from a stopped generation are ignored.
//       log(level, msg)                                     prefixed with the game; never log payloads or names
//       now()                                               the listener's clock (ms): use it for normalize nowMs
//   - which game the key serves: the freshest live game, in-match (status live / paused / loading / spectating /
//     between) before menu / watching; a game that is serving keeps the key until it has been without a change for
//     holdMs (1.5 s) while another changes (no flapping between two posting games); a stale game (no post for
//     staleMs) gives way at once.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
const { normalizeCs2, tickCs2, cs2NextTick, gameLinkView, findCs2, cs2Cfg, cfgState, isPrismCfg, CFG_NAME, URGENT_EVENTS, EVENT_TTL_MS } = __bm(627);
import { normalizeCompanion } from './gamelink-companion.js';
const { normalizeDota2, findDota2, dota2Cfg, dota2CfgState, isPrismDota2Cfg, DOTA2_CFG_NAME, DOTA2_CFG_DIR, DOTA2_LAUNCH_OPTION, MOBA_URGENT } = __bm(635);
import { stable } from './_source.js';
import { controlPath } from '../../plugin/paths.js';

export const GAMELINK_API = 1;
export const GAMELINK_PLUGIN = 'com.jeremyfhall.prism';
export const DEFAULT_PORT = 38140;
export const PORT_TRIES = 10;                 // 38140 … 38149
export const GAMELINK_LIMITS = Object.freeze({ cs2Bytes: 64 * 1024, dota2Bytes: 128 * 1024, companionBytes: 256 * 1024, requestsPerSec: 50, requestBurst: 100, staleMs: 15_000, discoverMs: 5000, holdMs: 1500, pollerPerSec: 20 });
const HEX64 = /^[0-9a-f]{64}$/;
const REFUSALS = ['host', 'origin', 'route', 'type', 'size', 'json', 'token', 'appid', 'rate', 'body'];
/** A poller's game id (the same rule as a companion's). */
const GAME_ID = /^[a-z][a-z0-9]{1,23}$/;
/** Statuses that mean "in a match": they win the key over a game that sits in its menu. */
const IN_MATCH = new Set(['live', 'paused', 'loading', 'spectating', 'between']);
/** Games with a feed of their own (a route or a poller): never a companion's id. */
const MOBA_GAMES = new Set(['dota2', 'lol']);
/** A poller's default urgent event types (attachPoller's `urgent` overrides them per game). */
const POLLER_URGENT = new Set([...URGENT_EVENTS, ...MOBA_URGENT]);

/** Where gamelink.json lives: PRISM_DECK_GAMELINK_DIR, else beside the live channel's control.json. */
export function gameLinkDir({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env?.PRISM_DECK_GAMELINK_DIR) return path.resolve(env.PRISM_DECK_GAMELINK_DIR);
  return path.dirname(controlPath({ env: { ...env, PRISM_DECK_CONTROL: '' }, platform, home }));
}

/** Constant-time token comparison (the same as src/plugin/control.js tokensEqual). */
export function tokensEqual(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  if (x.length !== y.length) { crypto.timingSafeEqual(x, x); return false; }
  return crypto.timingSafeEqual(x, y);
}

/**
 * Strict parse of gamelink.json (what the companion reads too). → { port, tokens } or null. tokens.dota2 (Game Link
 * for Dota 2) is optional: it exists once the user has clicked Connect Dota 2, and a malformed one is left out.
 */
export function parseGameLinkFile(text) {
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || j.v !== 1 || j.plugin !== GAMELINK_PLUGIN || !j.tokens || !HEX64.test(j.tokens.cs2 || '') || !HEX64.test(j.tokens.companion || '')) return null;
  const port = Number.isInteger(j.port) && j.port >= 1024 && j.port <= 65535 ? j.port : null;
  const tokens = { cs2: j.tokens.cs2, companion: j.tokens.companion };
  if (HEX64.test(j.tokens.dota2 || '')) tokens.dota2 = j.tokens.dota2;
  return { port, tokens };
}

const validPort = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;
const newToken = () => crypto.randomBytes(32).toString('hex');
/** CS2 holds its socket open between posts and heartbeats every 5 s: keep it well past that (Node 20 has no keep-alive buffer). */
export const KEEP_ALIVE_MS = 30_000;
const RENAME_RETRY = new Set(['EPERM', 'EACCES', 'EBUSY']);
export const WRITE_TRIES = 10;
export const WRITE_RETRY_MS = 50;
let tmpSeq = 0;

/**
 * Write a JSON file readable only by this user (dir 0700, file 0600 on POSIX), atomically: a temp file, then a rename.
 * On Windows a reader that opened the file without FILE_SHARE_DELETE (.NET's File.ReadAllText: Prism Sight reading
 * the companion token) makes the rename fail with EPERM while it holds it: retry, and if it still fails, remove the
 * temp file (it holds the tokens) and throw. rename is a test seam.
 */
export async function writeJsonAtomic(file, obj, { rename = fsp.rename, tries = WRITE_TRIES, retryMs = WRITE_RETRY_MS } = {}) {
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
  try {
    await fsp.writeFile(tmp, `${JSON.stringify(obj, null, 2)}\n`, { mode: 0o600 });
    if (process.platform !== 'win32') await fsp.chmod(tmp, 0o600);
    for (let i = 1; ; i++) {
      try { await rename(tmp, file); return; } catch (e) {
        if (i >= tries || !RENAME_RETRY.has(e.code)) throw e;
        await new Promise((r) => setTimeout(r, retryMs));
      }
    }
  } catch (e) {
    try { await fsp.unlink(tmp); } catch { /* not there */ }
    throw e;
  }
}

/** Read one registry value without changing anything (`reg query`). → string | null */
export function regQuery(key, value, { timeoutMs = 3000 } = {}) {
  return new Promise((resolve) => {
    execFile('reg', ['query', key, '/v', value], { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const line = String(stdout).split(/\r?\n/).find((l) => l.trim().toLowerCase().startsWith(value.toLowerCase() + ' '));
      const m = line && /\sREG_(?:EXPAND_)?SZ\s+(.+)$/.exec(line);
      resolve(m ? m[1].trim() : null);
    });
  });
}

function nodeSteamIo({ platform, env, home }) {
  return {
    platform, env, home,
    readText: async (f) => { try { return await fsp.readFile(f, 'utf8'); } catch { return null; } },
    isFile: async (f) => { try { return (await fsp.stat(f)).isFile(); } catch { return false; } },
    isDir: async (f) => { try { return (await fsp.stat(f)).isDirectory(); } catch { return false; } },
    readRegistry: platform === 'win32' ? regQuery : null,
  };
}

class Bucket {
  constructor(rate, cap, now) { this.rate = rate; this.cap = cap; this.tokens = cap; this.now = now; this.t = now(); }
  take() { const t = this.now(); this.tokens = Math.min(this.cap, this.tokens + ((t - this.t) / 1000) * this.rate); this.t = t; if (this.tokens < 1) return false; this.tokens -= 1; return true; }
}

/**
 * opts: { dir, env, platform, home, port (a fixed port: tests use 0), tokens ({ cs2, companion }: tests), now, setTimer,
 *         clearTimer, staleMs, flashHoldMs, flashStuckMs, steam (findCs2 io overrides: a temp Steam tree in tests), log,
 *         version, limits, defaultPort (tests: a free block instead of 38140), rename (tests: a rename that fails) }
 */
export function createGameLink(opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const home = opts.home ?? os.homedir();
  const dir = opts.dir || gameLinkDir({ env, platform, home });
  const file = path.join(dir, 'gamelink.json');
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer || ((h) => clearTimeout(h));
  const L = { ...GAMELINK_LIMITS, ...(opts.limits || {}), ...(opts.staleMs ? { staleMs: opts.staleMs } : {}) };
  const tickOpts = { ...(opts.flashHoldMs ? { flashHoldMs: opts.flashHoldMs } : {}), ...(opts.flashStuckMs ? { flashStuckMs: opts.flashStuckMs } : {}) };
  const basePort = validPort(opts.defaultPort) ? opts.defaultPort : DEFAULT_PORT;
  const inFallbackRange = (p) => validPort(p) && p >= basePort && p < basePort + PORT_TRIES;
  const rename = opts.rename || fsp.rename;
  let writes = Promise.resolve();
  const log = opts.log || (() => {});
  const version = opts.version || '0.0.0';
  const fixedPort = Number.isInteger(opts.port) ? opts.port : null;
  const steamIo = { ...nodeSteamIo({ platform, env, home }), ...(opts.steam || {}) };
  const ee = new EventEmitter();

  let enabled = false, wantPort = null, server = null, port = null, host = '', error = null;
  let tokens = opts.tokens && HEX64.test(opts.tokens.cs2 || '') && HEX64.test(opts.tokens.companion || '') ? { cs2: opts.tokens.cs2, companion: opts.tokens.companion, ...(HEX64.test(opts.tokens.dota2 || '') ? { dota2: opts.tokens.dota2 } : {}) } : null;
  let persistedPort = null, loaded = !!tokens, startedAt = null;
  let consumers = 0, chain = Promise.resolve(), stopped = false;
  const games = new Map();   // game id → { state, lastPostAt, changedAt }
  const stats = { requests: 0, accepted: 0, companion: 0, dota2: 0, polled: 0, refused: Object.fromEntries(REFUSALS.map((k) => [k, 0])) };
  let lastPostAt = null;
  let cs2Info = null, cs2InfoAt = -Infinity, discovering = null;
  let dota2Info = null, dota2InfoAt = -Infinity, discoveringDota = null;
  let memo = { key: null, value: null };
  let flashTimer = null, staleTimer = null, holdTimer = null;
  let serving = null, servingSince = -Infinity;   // the game the key serves (the hold: see current())
  const cs2Bucket = new Bucket(L.requestsPerSec, L.requestBurst, now);
  const dota2Bucket = new Bucket(L.requestsPerSec, L.requestBurst, now);
  const companionBucket = new Bucket(L.requestsPerSec, L.requestBurst, now);
  const pollers = new Map();   // game id → { game, start, stop, gen, bucket, pushes, error }

  // ── gamelink.json ─────────────────────────────────────────────────────────
  function load() {
    if (loaded) return;
    loaded = true;
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch { text = null; }
    const j = text ? parseGameLinkFile(text) : null;
    if (j) { tokens = tokens || j.tokens; persistedPort = j.port; }
  }
  function ensureTokens() { load(); if (!tokens) tokens = { cs2: newToken(), companion: newToken() }; return tokens; }
  /** Persist { port, tokens, … } (one write at a time). → Promise<true | false> (a failure is logged; never the contents). */
  function writeFile(running) {
    ensureTokens();
    const p = port ?? persistedPort ?? null;
    const body = { v: 1, plugin: GAMELINK_PLUGIN, api: GAMELINK_API, port: p, baseUrl: p ? `http://127.0.0.1:${p}` : null, tokens: { ...tokens }, pid: running ? process.pid : null, version, startedAt: running ? startedAt : null };
    const job = writes.then(() => writeJsonAtomic(file, body, { rename })).then(() => { if (running && validPort(p)) persistedPort = p; return true; }, (e) => { log('warn', `game link: can't write gamelink.json (${e.code || e.message})`); return false; });
    writes = job;
    return job;
  }

  // ── the listener ──────────────────────────────────────────────────────────
  function candidates() {
    if (fixedPort !== null) return [fixedPort];
    const base = validPort(wantPort) ? wantPort : basePort;
    // a persisted port is a fallback that worked last time (an installed cfg points at it): honored only inside the
    // fallback range, so a custom port the user has since cleared never comes back
    const first = validPort(wantPort) ? wantPort : inFallbackRange(persistedPort) ? persistedPort : basePort;
    return [...new Set([first, ...Array.from({ length: PORT_TRIES }, (_, i) => base + i)])].filter((p) => p === 0 || validPort(p));
  }
  function bind(p) {
    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => { try { handle(req, res); } catch (e) { log('error', `game link: ${e.message}`); try { res.writeHead(500); res.end(); } catch { /* gone */ } } });
      s.headersTimeout = 40_000; s.requestTimeout = 15_000; s.keepAliveTimeout = KEEP_ALIVE_MS;   // > CS2's 5 s heartbeat (headersTimeout must exceed it)
      const fail = (e) => { s.close(); reject(e); };
      s.once('error', fail);
      s.listen(p, '127.0.0.1', () => { s.off('error', fail); s.on('error', (e) => log('warn', `game link: ${e.code || e.message}`)); s.unref?.(); resolve(s); });
    });
  }
  async function open() {
    ensureTokens();
    let last = null;
    const cands = candidates();
    for (const p of cands) {
      try { server = await bind(p); break; } catch (e) { last = e.code || e.message; if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') break; }
    }
    if (!server) { error = last || 'unavailable'; port = null; log('warn', `game link: no port to listen on (${error})`); return; }
    error = null;
    port = server.address().port;
    host = `127.0.0.1:${port}`;
    startedAt = new Date(now()).toISOString();
    emit(false);              // the face switches at once (the push must not wait for the disk: a frame in between would draw stale tags)
    await writeFile(true);
    const fellBack = fixedPort === null && port !== cands[0];
    log(fellBack ? 'warn' : 'info', fellBack ? `game link: port ${cands[0]} is taken; listening on ${host} (Connect CS2 again)` : `game link listening on ${host}`);
    cs2InfoAt = -Infinity;    // the cfg's "out of date" depends on the port: re-check (read-only) if we've looked before,
    if (cs2Info || fellBack) discover(true).catch(() => {});   // or once now if we fell back (the PI then offers Reconnect)
    dota2InfoAt = -Infinity;  // … and the same for Dota 2's cfg
    if (dota2Info || (fellBack && tokens?.dota2)) discoverDota2(true).catch(() => {});
    for (const p of pollers.values()) startPoller(p);
  }
  async function close() {
    const s = server;
    server = null;
    host = '';
    clearTimers();
    for (const p of pollers.values()) stopPoller(p);
    // what each game last said stays only as the baseline the next post is compared with (no phantom events after
    // Listen off → on); it is never served as live again until a new post arrives
    for (const [id, g] of games) games.set(id, { ...g, lastPostAt: null });
    lastPostAt = null;
    serving = null; servingSince = -Infinity;
    if (!s) return;
    await new Promise((r) => { s.close(() => r()); s.closeAllConnections?.(); });
    emit(false);
    await writeFile(false);
  }
  function configure({ enabled: e = enabled, port: p = wantPort } = {}) {
    const next = chain.then(async () => {
      if (stopped) return status();
      const nextPort = validPort(p) ? p : null;
      const portChanged = nextPort !== wantPort;
      if (portChanged && nextPort === null) persistedPort = null;   // the user cleared a custom port: back to 38140 (+ fallbacks)
      enabled = !!e; wantPort = nextPort;
      if (!enabled) { if (server) await close(); return status(); }
      if (server && portChanged && fixedPort === null) await close();
      if (!server) await open();
      return status();
    });
    chain = next.catch(() => {});
    return next;
  }

  // ── requests ──────────────────────────────────────────────────────────────
  function json(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(body));
  }
  const fail = (res, status, code) => json(res, status, { error: { code } });
  const isJson = (req) => String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json');

  /** Read a body up to `cap` bytes: onDone(buffer) | onTooBig() (the rest is drained). */
  function readBody(req, cap, onDone, onTooBig) {
    const declared = Number(req.headers['content-length']);
    if (declared > cap) { req.resume(); return onTooBig(); }
    const chunks = [];
    let size = 0, over = false;
    req.on('data', (c) => { if (over) return; size += c.length; if (size > cap) { over = true; chunks.length = 0; onTooBig(); return; } chunks.push(c); });
    req.on('end', () => { if (!over) onDone(Buffer.concat(chunks)); });
    req.on('error', () => {});
  }

  function handle(req, res) {
    stats.requests++;
    // 1. DNS-rebinding defence: Host must be exactly our loopback address (CS2 sends the cfg uri's host).
    if (!server || req.headers.host !== host) { stats.refused.host++; req.resume(); return fail(res, 421, 'bad_host'); }
    // 2. No browsers: any Origin header means a web page is calling.
    if (req.headers.origin !== undefined) { stats.refused.origin++; req.resume(); return fail(res, 403, 'origin_refused'); }
    const pathname = String(req.url || '').split('?')[0];
    const route = `${req.method} ${pathname}`;
    if (route === 'POST /v1/cs2') return cs2(req, res);
    if (route === 'POST /v1/dota2') return dota2(req, res);
    if (route === 'POST /v1/companion') return companion(req, res);
    if (route === 'GET /v1/health') return health(req, res);
    stats.refused.route++;
    req.resume();
    return fail(res, 404, 'not_found');
  }

  function cs2(req, res) {
    // Always 204, at once: CS2 waits for each reply and resends hot on errors (research/cs2-gsi.md §2).
    let replied = false;
    const reply = () => { if (replied) return; replied = true; res.writeHead(204, { 'cache-control': 'no-store' }); res.end(); };
    if (!isJson(req)) { stats.refused.type++; req.resume(); return reply(); }
    readBody(req, L.cs2Bytes, (buf) => { reply(); setImmediate(() => ingestCs2(buf)); }, () => { stats.refused.size++; reply(); });
  }

  function ingestCs2(buf) {
    if (!server) return;
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { stats.refused.json++; return; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { stats.refused.json++; return; }
    if (!tokens || !tokensEqual(body.auth?.token, tokens.cs2)) { stats.refused.token++; return; }
    if (!cs2Bucket.take()) { stats.refused.rate++; return; }
    const t = now();
    const g = games.get('cs2') || { state: null, lastPostAt: null };
    const wasLive = isLive(g, t);
    const r = normalizeCs2(body, g.state, { nowMs: t });
    if (r.rejected) { stats.refused.appid++; return; }
    stats.accepted++;
    const changed = r.state?.rev !== g.state?.rev;
    games.set('cs2', { state: r.state, lastPostAt: t, changedAt: changed || !wasLive ? t : g.changedAt ?? t });
    lastPostAt = t;
    armTimers();
    if (changed || !wasLive) emit(r.events.some((e) => URGENT_EVENTS.has(e.type)));
  }

  function dota2(req, res) {
    // the same contract as CS2's: always 204 at once (a Valve GSI client resends hot on errors)
    let replied = false;
    const reply = () => { if (replied) return; replied = true; res.writeHead(204, { 'cache-control': 'no-store' }); res.end(); };
    if (!isJson(req)) { stats.refused.type++; req.resume(); return reply(); }
    readBody(req, L.dota2Bytes, (buf) => { reply(); setImmediate(() => ingestDota2(buf)); }, () => { stats.refused.size++; reply(); });
  }

  function ingestDota2(buf) {
    if (!server) return;
    let body;
    try { body = JSON.parse(buf.toString('utf8')); } catch { stats.refused.json++; return; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { stats.refused.json++; return; }
    if (!tokens?.dota2 || !tokensEqual(body.auth?.token, tokens.dota2)) { stats.refused.token++; return; }
    if (!dota2Bucket.take()) { stats.refused.rate++; return; }
    const t = now();
    const g = games.get('dota2') || { state: null, lastPostAt: null };
    const wasLive = isLive(g, t);
    const r = normalizeDota2(body, g.state, { nowMs: t });
    if (r.rejected) { stats.refused.appid++; return; }
    stats.dota2++;
    const changed = r.state?.rev !== g.state?.rev;
    games.set('dota2', { state: r.state, lastPostAt: t, changedAt: changed || !wasLive ? t : g.changedAt ?? t });
    lastPostAt = t;
    armTimers();
    if (changed || !wasLive) emit(r.events.some((e) => MOBA_URGENT.has(e.type)));
  }

  // ── pollers (the LoL Live Client poller …) ────────────────────────────────
  /**
   * attachPoller({ game, start }) → detach(). start({ push, log, now }) → stop | Promise<stop>: called while the
   * listener is up (now, if it already is), stopped when it closes; detach() stops it for good and forgets its game.
   */
  function attachPoller({ game, start, urgent } = {}) {
    if (typeof game !== 'string' || !GAME_ID.test(game) || game === 'cs2' || game === 'dota2') throw new Error('attachPoller: game must be a game id (/^[a-z][a-z0-9]{1,23}$/, not cs2 / dota2)');
    if (typeof start !== 'function') throw new Error('attachPoller: start({ push, log, now }) must be a function');
    if (pollers.has(game)) throw new Error(`attachPoller: a poller for ${game} is already attached`);
    // urgent: the poller's own effect event types (a push carrying one jumps the queue); default: the CS2 + MOBA ones
    const hot = urgent instanceof Set || Array.isArray(urgent) ? new Set([...urgent].filter((x) => typeof x === 'string')) : POLLER_URGENT;
    const p = { game, start, stop: null, gen: 0, running: false, bucket: new Bucket(L.pollerPerSec, L.pollerPerSec, now), pushes: 0, error: null, urgent: hot };
    pollers.set(game, p);
    if (server && !stopped) startPoller(p);
    let detached = false;
    return function detach() {
      if (detached) return;
      detached = true;
      stopPoller(p);
      pollers.delete(game);
      if (games.delete(game) && server) emit(false);
    };
  }
  function startPoller(p) {
    if (p.running) return;
    p.running = true;
    const gen = ++p.gen;
    const push = (r) => ingestPoll(p, gen, r);
    const plog = (level, msg) => log(level === 'error' || level === 'warn' || level === 'debug' ? level : 'info', `game link (${p.game}): ${String(msg ?? '').slice(0, 200)}`);
    const adopt = (s) => { if (p.gen === gen && p.running) p.stop = typeof s === 'function' ? s : null; else if (typeof s === 'function') { try { s(); } catch { /* best effort */ } } };
    const failed = (e) => { if (p.gen !== gen) return; p.error = e?.message || 'failed'; p.running = false; log('warn', `game link: the ${p.game} poller couldn't start (${String(p.error).slice(0, 120)})`); };
    try {
      const s = p.start({ push, log: plog, now });
      if (s && typeof s.then === 'function') s.then(adopt, failed); else adopt(s);
      p.error = null;
    } catch (e) { failed(e); }
  }
  function stopPoller(p) {
    if (!p.running) return;
    p.running = false;
    p.gen++;   // pushes from the stopped generation are ignored
    const s = p.stop;
    p.stop = null;
    if (s) { try { const r = s(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (e) { log('warn', `game link: the ${p.game} poller's stop failed (${String(e?.message || e).slice(0, 120)})`); } }
  }
  function ingestPoll(p, gen, r) {
    if (gen !== p.gen || !p.running || !server) return false;
    const t = now();
    if (r === null || r === undefined) {   // the game is gone (no client running): the key moves on at once
      const had = games.get(p.game);
      if (had && had.lastPostAt !== null) { games.set(p.game, { ...had, lastPostAt: null }); emit(false); }
      return true;
    }
    const state = r && typeof r === 'object' && 'state' in r && !('v' in r) ? r.state : r;
    const events = Array.isArray(r?.events) && r !== state ? r.events : [];
    if (!state || typeof state !== 'object' || Array.isArray(state) || state.v !== 1 || state.game !== p.game) { stats.refused.body++; return false; }
    if (!p.bucket.take()) { stats.refused.rate++; return false; }
    p.pushes++; stats.polled++;
    const g = games.get(p.game) || { state: null, lastPostAt: null };
    const wasLive = isLive(g, t);
    const changed = !g.state || state.rev !== g.state.rev || state.at !== g.state.at;
    games.set(p.game, { state, lastPostAt: t, changedAt: changed || !wasLive ? t : g.changedAt ?? t });
    lastPostAt = t;
    armTimers();
    if (changed || !wasLive) emit(!wasLive || events.some((e) => e && p.urgent.has(e.type)));
    return true;
  }

  function bearer(req) { const a = String(req.headers.authorization || ''); return a.startsWith('Bearer ') && !!tokens && tokensEqual(a.slice(7), tokens.companion); }

  function companion(req, res) {
    if (!bearer(req)) { stats.refused.token++; req.resume(); return fail(res, 401, 'unauthorized'); }
    if (!companionBucket.take()) { stats.refused.rate++; req.resume(); return fail(res, 429, 'rate_limited'); }
    if (!isJson(req)) { stats.refused.type++; req.resume(); return fail(res, 415, 'unsupported_media_type'); }
    readBody(req, L.companionBytes, (buf) => {
      let body;
      try { body = JSON.parse(buf.toString('utf8')); } catch { stats.refused.json++; return fail(res, 400, 'bad_json'); }
      const t = now();
      // the games with a feed of their own (Dota 2's GSI route, a poller) are never a companion's to post
      if (MOBA_GAMES.has(body?.game) || pollers.has(body?.game)) { stats.refused.body++; return fail(res, 400, 'bad_game'); }
      const prev = games.get(body?.game)?.state || null;
      const r = normalizeCompanion(body, typeof body?.game === 'string' ? prev : null, { nowMs: t });
      if (r.error) { stats.refused.body++; return fail(res, 400, r.error); }
      json(res, 200, r.duplicate ? { duplicate: true } : {});
      if (r.duplicate) return;
      stats.companion++;
      const wasLive = isLive(games.get(body.game), t);
      games.set(body.game, { state: r.state, lastPostAt: t, changedAt: t });
      lastPostAt = t;
      armTimers();
      // urgent only for an effect (URGENT_EVENTS) or the first post: a companion that tags every post with a readout
      // event must not jump the queue 40 times a second (the update budget is shared by every device)
      setImmediate(() => emit(!wasLive || r.events.some((e) => URGENT_EVENTS.has(e.type))));
    }, () => { stats.refused.size++; fail(res, 413, 'too_large'); });
  }

  function health(req, res) {
    if (!bearer(req)) { stats.refused.token++; req.resume(); return fail(res, 401, 'unauthorized'); }
    req.resume();
    const c = current(now());
    json(res, 200, { ok: true, api: GAMELINK_API, game: c?.game || null, lastAt: lastPostAt ? new Date(lastPostAt).toISOString() : null });
  }

  // ── state ─────────────────────────────────────────────────────────────────
  const isLive = (g, t) => !!g && g.lastPostAt !== null && t - g.lastPostAt <= L.staleMs;
  const rankOf = (g) => (IN_MATCH.has(g.state?.status) ? 1 : 0);
  const changedOf = (g) => g.changedAt ?? g.lastPostAt ?? 0;
  /**
   * The game the key serves: the most recently changed live game, in-match before menu / watching. The one serving
   * keeps the key until it has been without a change for holdMs while another changes (two posting games never flap);
   * stale, or out-ranked, it gives way at once. A held-back switch re-checks (a push) when the hold runs out.
   */
  function current(t) {
    let best = null, held = null;
    for (const [game, g] of games) {
      if (!isLive(g, t) || !g.state) continue;
      const c = { game, ...g };
      if (game === serving) held = c;
      if (!best || rankOf(c) > rankOf(best) || (rankOf(c) === rankOf(best) && changedOf(c) > changedOf(best))) best = c;
    }
    if (!best) { serving = null; return null; }
    if (held && best.game !== held.game && rankOf(best) <= rankOf(held)) {
      const until = changedOf(held) + L.holdMs;
      if (t < until) { armHold(until - t); return held; }
    }
    if (best.game !== serving) { serving = best.game; servingSince = t; }
    return best;
  }
  function armHold(ms) {
    if (holdTimer) return;
    holdTimer = setTimer(() => { holdTimer = null; if (server) emit(false); }, Math.max(1, Math.ceil(ms) + 1));
    holdTimer?.unref?.();
  }
  function view(t) {
    const c = current(t);
    if (!c) { memo = { key: null, value: null }; return null; }
    const expired = (c.state.events || []).filter((e) => t - e.at > EVENT_TTL_MS).length;
    const key = `${c.game}|${c.state.rev}|${c.state.at}|${expired}`;
    if (memo.key !== key) memo = { key, value: stable(gameLinkView(c.state, t)) };
    return memo.value;
  }
  function emit(urgent) { ee.emit('change', ['gamelink'], { urgent: !!urgent }); }

  function clearTimers() {
    if (flashTimer) clearTimer(flashTimer);
    if (staleTimer) clearTimer(staleTimer);
    if (holdTimer) clearTimer(holdTimer);
    flashTimer = staleTimer = holdTimer = null;
  }
  function armTimers() {
    if (staleTimer) clearTimer(staleTimer);
    // the "waiting" face must appear even under Still (no frames without a push)
    staleTimer = setTimer(() => { staleTimer = null; if (server) emit(false); }, L.staleMs + 50);
    staleTimer?.unref?.();
    armFlash();
  }
  /** The flash model's timer (tickCs2): the safety clear and a deferred strike happen even when no post or frame is due. */
  function armFlash() {
    if (flashTimer) { clearTimer(flashTimer); flashTimer = null; }
    const due = cs2NextTick(games.get('cs2')?.state, tickOpts);
    if (due === null) return;
    flashTimer = setTimer(() => {
      flashTimer = null;
      const g = games.get('cs2');
      if (!server || !g) return;
      const r = tickCs2(g.state, now(), tickOpts);
      if (r.state !== g.state) games.set('cs2', { ...g, state: r.state });   // the deriver may move on without an event
      if (r.events.length) emit(true);
      armFlash();
    }, Math.max(1, due - now() + 1));
    flashTimer?.unref?.();
  }

  // ── CS2 install (read-only discovery; writes only on the user's click) ───────
  async function discover(force = false) {
    if (!force && cs2Info && now() - cs2InfoAt < L.discoverMs) return cs2Info;
    if (discovering) return discovering;
    discovering = (async () => {
      let info;
      try { info = await findCs2(steamIo); } catch { info = { found: false, reason: 'not-installed', leftover: false }; }
      let cfg = 'absent';
      if (info.found) {
        const text = await steamIo.readText(info.cfgPath);
        load();
        const p = port ?? persistedPort;
        cfg = text === null ? 'absent' : tokens && validPort(p) ? cfgState(text, { port: p, token: tokens.cs2 }) : isPrismCfg(text) ? 'outdated' : 'foreign';
      }
      cs2Info = { found: !!info.found, reason: info.found ? null : info.reason, leftover: !!info.leftover, path: info.found ? info.cfgPath : null, cfg };
      cs2InfoAt = now();
      ee.emit('status');
      return cs2Info;
    })();
    try { return await discovering; } finally { discovering = null; }
  }

  async function connectCs2() {
    if (!server) return { ok: false, reason: 'not-listening' };
    const info = await discover(true);
    if (!info.found) return { ok: false, reason: info.reason, leftover: info.leftover };
    const target = info.path;
    if (path.basename(target) !== CFG_NAME) return { ok: false, reason: 'bad-path' };
    if (info.cfg === 'foreign') return { ok: false, reason: 'foreign-file', path: target };   // someone else's file under our name: leave it
    const text = cs2Cfg({ port, token: tokens.cs2, eol: platform === 'win32' ? '\r\n' : '\n' });
    const tmp = `${target}.${process.pid}.tmp`;
    try {
      await fsp.writeFile(tmp, text, { encoding: 'ascii', flag: 'w' });
      await fsp.rename(tmp, target);
    } catch (e) {
      try { await fsp.unlink(tmp); } catch { /* not there */ }
      log('warn', `game link: can't write the CS2 config (${e.code || e.message})`);
      return { ok: false, reason: 'write-failed', code: e.code || null };
    }
    log('info', 'game link: CS2 config installed');
    await discover(true);
    return { ok: true, path: target, restartNeeded: true };
  }

  async function disconnectCs2() {
    const info = await discover(true);
    let removed = false;
    if (info.found && (info.cfg === 'current' || info.cfg === 'outdated')) {
      try { await fsp.unlink(info.path); removed = true; } catch (e) { if (e.code !== 'ENOENT') return { ok: false, reason: 'remove-failed', code: e.code || null }; }
    }
    // a new CS2 token: any copy of the old cfg stops working — once it is on disk (else the next start would bring the
    // old one back): a failed write keeps the old token and says so (the user can click Disconnect again)
    load();
    let rotated = true;
    if (tokens || fs.existsSync(file)) {
      ensureTokens();
      const old = tokens;
      tokens = { ...tokens, cs2: newToken() };
      rotated = await writeFile(!!server);
      if (!rotated) tokens = old;
    }
    if (removed) log('info', 'game link: CS2 config removed');
    await discover(true);
    return rotated ? { ok: true, removed } : { ok: false, removed, reason: 'state-write-failed' };
  }

  // ── Dota 2 install (read-only discovery; writes only on the user's click) ────
  async function discoverDota2(force = false) {
    if (!force && dota2Info && now() - dota2InfoAt < L.discoverMs) return dota2Info;
    if (discoveringDota) return discoveringDota;
    discoveringDota = (async () => {
      let info;
      try { info = await findDota2(steamIo); } catch { info = { found: false, reason: 'not-installed', leftover: false }; }
      let cfg = 'absent';
      if (info.found) {
        const text = await steamIo.readText(info.cfgPath);
        load();
        const p = port ?? persistedPort;
        cfg = text === null ? 'absent' : tokens?.dota2 && validPort(p) ? dota2CfgState(text, { port: p, token: tokens.dota2 }) : isPrismDota2Cfg(text) ? 'outdated' : 'foreign';
      }
      dota2Info = { found: !!info.found, reason: info.found ? null : info.reason, leftover: !!info.leftover, path: info.found ? info.cfgPath : null, cfg, folder: info.found ? !!info.folder : false };
      dota2InfoAt = now();
      ee.emit('status');
      return dota2Info;
    })();
    try { return await discoveringDota; } finally { discoveringDota = null; }
  }

  /**
   * Connect Dota 2 (the user's click): our cfg into <dota>/game/dota/cfg/gamestate_integration/ (the folder is created
   * there if Dota hasn't made it; only inside a verified cfg/ folder). Dota 2 reads it at launch, and only with the
   * -gamestateintegration launch option: { launchOption: '-gamestateintegration' } tells the PI to say so.
   */
  async function connectDota2() {
    if (!server) return { ok: false, reason: 'not-listening' };
    const info = await discoverDota2(true);
    if (!info.found) return { ok: false, reason: info.reason, leftover: info.leftover };
    const target = info.path;
    if (path.basename(target) !== DOTA2_CFG_NAME || path.basename(path.dirname(target)) !== DOTA2_CFG_DIR) return { ok: false, reason: 'bad-path' };
    if (info.cfg === 'foreign') return { ok: false, reason: 'foreign-file', path: target };
    ensureTokens();
    let fresh = false;
    if (!tokens.dota2) { tokens = { ...tokens, dota2: newToken() }; fresh = true; }
    if (fresh && !(await writeFile(true))) { const { dota2: _drop, ...rest } = tokens; tokens = rest; return { ok: false, reason: 'state-write-failed' }; }
    const text = dota2Cfg({ port, token: tokens.dota2, eol: platform === 'win32' ? '\r\n' : '\n' });
    const tmp = `${target}.${process.pid}.tmp`;
    try {
      await fsp.mkdir(path.dirname(target), { recursive: false }).catch((e) => { if (e.code !== 'EEXIST') throw e; });
      await fsp.writeFile(tmp, text, { encoding: 'ascii', flag: 'w' });
      await fsp.rename(tmp, target);
    } catch (e) {
      try { await fsp.unlink(tmp); } catch { /* not there */ }
      log('warn', `game link: can't write the Dota 2 config (${e.code || e.message})`);
      return { ok: false, reason: 'write-failed', code: e.code || null };
    }
    log('info', 'game link: Dota 2 config installed');
    await discoverDota2(true);
    return { ok: true, path: target, restartNeeded: true, launchOption: DOTA2_LAUNCH_OPTION };
  }

  async function disconnectDota2() {
    const info = await discoverDota2(true);
    let removed = false;
    if (info.found && (info.cfg === 'current' || info.cfg === 'outdated')) {
      try { await fsp.unlink(info.path); removed = true; } catch (e) { if (e.code !== 'ENOENT') return { ok: false, reason: 'remove-failed', code: e.code || null }; }
    }
    // a new Dota 2 token: any copy of the old cfg stops working (once it is on disk; a failed write keeps the old one)
    load();
    let rotated = true;
    if (tokens?.dota2) {
      const old = tokens;
      tokens = { ...tokens, dota2: newToken() };
      rotated = await writeFile(!!server);
      if (!rotated) tokens = old;
    }
    if (removed) log('info', 'game link: Dota 2 config removed');
    await discoverDota2(true);
    return rotated ? { ok: true, removed } : { ok: false, removed, reason: 'state-write-failed' };
  }

  function status() {
    const t = now();
    const c = current(t);
    return {
      enabled, listening: !!server, port: server ? port : null, wantPort, error,
      game: c?.game || null, live: !!c, waiting: !!server && !c, lastAt: lastPostAt, lastAgoMs: lastPostAt === null ? null : t - lastPostAt,
      requests: stats.requests, accepted: stats.accepted, companion: stats.companion, refused: { ...stats.refused },
      cs2: cs2Info ? { ...cs2Info } : null,
      // seen: a Dota 2 post was accepted since the plugin started (the cfg and the launch option work)
      dota2: dota2Info ? { ...dota2Info, seen: stats.dota2 > 0 } : null,
      dota2Posts: stats.dota2, polled: stats.polled,
      pollers: Object.fromEntries([...pollers.values()].map((p) => [p.game, { running: p.running, pushes: p.pushes, error: p.error }])),
    };
  }

  async function stop() {
    stopped = true;
    enabled = false;
    await chain.catch(() => {});
    await close();
    for (const p of pollers.values()) stopPoller(p);
    clearTimers();
    await writes;
  }

  const source = {
    id: 'gamelink', provides: ['gamelink'], rate: 20,
    get mode() { return server ? 'live' : 'idle'; },
    get running() { return consumers > 0; },
    start() { consumers++; return this; },
    stop() { consumers = Math.max(0, consumers - 1); return this; },
    /** {} while off (the facet / simulated source demos it, tagged DEMO) · { gamelink: null } while waiting · { gamelink: state } */
    snapshot(nowMs = now()) { if (!server) return {}; return { gamelink: view(nowMs) }; },
    status() { const s = status(); return { id: 'gamelink', mode: this.mode, running: this.running, listening: s.listening, port: s.port, game: s.game, live: s.live, requests: s.requests, accepted: s.accepted, refused: s.refused }; },
  };

  return {
    source, configure, connectCs2, disconnectCs2, connectDota2, disconnectDota2, attachPoller, status, stop,
    cs2Status: (force = false) => discover(force),
    dota2Status: (force = false) => discoverDota2(force),
    on: (ev, fn) => { ee.on(ev, fn); return () => ee.off(ev, fn); },
    off: (ev, fn) => ee.off(ev, fn),
    get file() { return file; },
    get port() { return server ? port : null; },
  };
}
