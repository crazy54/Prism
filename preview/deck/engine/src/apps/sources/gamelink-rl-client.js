import { __m as __bm } from '../../../facets.bundle.js';
// Game Link · Rocket League: the client of the game's Stats API socket, and the ini switch. Node only (node:net,
// node:fs, node:crypto); never re-exported from ./index.js (browser-safe). The pure half is ./gamelink-rl.js.
//
//   const client = createRlClient();                                         // nothing connects here
//   const detach = gl.attachPoller({ game: 'rl', start: client.start, urgent: RL_URGENT });   // the hub runs it while Listen is on
//   client.status();                                                         // { phase, transport, … } — never a name, never a payload
//   await connectRl({ io, dir });  await disconnectRl({ io, dir });  await rlStatus({ io, dir });   // the ini, on the user's click
//
// What the client does (aaa-prism-play/lead/CONTRACT-moba.md, addendum: Rocket League):
//   - connects to 127.0.0.1 only: the WebSocket (WebPort, 49124, since v2.72) first, the TCP stream (Port, 49123)
//     when nothing answers there. Read-only: on TCP it never writes a byte; on the WebSocket it writes only the
//     protocol itself (the upgrade request, pong replies, the close handshake) — never a message, never a command
//     (the API accepts commands since v2.72: we never send one)
//   - framing: TCP and WebSocket text both carry JSON objects back to back; the splitter cuts them by brace depth
//     (strings and escapes respected), so newline-delimited or bare concatenation both work. A message over
//     RL_MAX_MESSAGE drops the connection (the next one starts clean)
//   - pushes are coalesced: the game sends up to 120 packets a second; the hub takes ≤ 20 pushes a second, so the
//     newest state wins and every event is kept (≤ 1 push per RL_PUSH_MS, events flushed with it)
//   - connected and quiet (the game runs, no match): the 'menu' state, re-pushed every RL_HEARTBEAT_MS (the hub's
//     heartbeat: no push for 15 s reads "waiting")
//   - nothing listening (the game isn't running, or the Stats API is off): one quiet probe every 5 s, backing off
//     to 15 s; the socket closing after a session → pushed as null once ("gone"), then probes again
//   - logs: transitions only, at most once per kind until it changes; never a payload, a name or an id
//
// The ini (connectRl / disconnectRl): PacketSendRate 30, Port 49123 and WebPort 49124 in section
// [TAGame.MatchStatsExporter_TA] of every Stats API ini the game may read that exists (rlIniFiles: Psyonix says
// "<Install Dir>\TAGame\Config\TAStatsAPI.ini (or DefaultStatsAPI.ini if it doesn't exist)"; community setups find the
// TAStatsAPI.ini it reads under Documents\My Games\Rocket League\TAGame\Config). On the user's click only. Connect
// backs each file up first (byte for byte, into Prism's own folder, %APPDATA%\Prism\deck\rl\, never into the game
// folder) with a record of our keys' old values; Disconnect restores exactly those values (a key the user changed since
// is theirs and stays). The game reads the file at launch: the PI says a restart is needed. A game update can reset
// PacketSendRate to 0 (v2.72 did): the PI then reads "off" and Connect sets it again. UTF-16 files are kept UTF-16.

import net from 'node:net';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { gameLinkDir } from './gamelink.js';
const { normalizeRl, rlIdle, findRl, rlIniApply, rlIniRestore, rlIniState, RL_TCP_PORT, RL_WS_PORT, RL_RATE } = __bm(644);

export const RL_HOST = '127.0.0.1';
export const RL_PROBE_MS = 5000;           // nothing listening: one probe every 5 s …
export const RL_PROBE_MAX_MS = 15000;      // … backing off to one every 15 s
export const RL_BACKOFF = 1.5;
export const RL_CONNECT_MS = 2000;         // a connect slower than this is abandoned
export const RL_PUSH_MS = 100;             // ≤ 10 pushes a second (the hub's cap is 20)
export const RL_HEARTBEAT_MS = 2000;       // connected and quiet: re-push the latest state this often
export const RL_MAX_MESSAGE = 256 * 1024;  // one JSON message (an UpdateState with 8 players is ~3 KB)
export const RL_WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const RL_TRANSPORTS = Object.freeze(['ws', 'tcp']);

// ── framing ─────────────────────────────────────────────────────────────────

/**
 * Cuts a text stream into top-level JSON objects by brace depth (strings and escapes respected; anything between
 * objects — whitespace, newlines, NULs — is skipped). push(text) → [objectText]; throws 'too-big' past maxBytes.
 */
export function createJsonSplitter({ maxBytes = RL_MAX_MESSAGE } = {}) {
  let buf = '', depth = 0, inStr = false, esc = false, start = -1, i = 0;
  return {
    push(text) {
      buf += text;
      const out = [];
      for (; i < buf.length; i++) {
        const c = buf.charCodeAt(i);
        if (depth === 0) {
          if (c === 123) { start = i; depth = 1; inStr = false; esc = false; }   // '{'
          continue;
        }
        if (inStr) { if (esc) esc = false; else if (c === 92) esc = true; else if (c === 34) inStr = false; continue; }
        if (c === 34) inStr = true;
        else if (c === 123) depth++;
        else if (c === 125 && --depth === 0) { out.push(buf.slice(start, i + 1)); start = -1; }
      }
      if (depth === 0) { buf = ''; i = 0; }
      else if (start > 0) { buf = buf.slice(start); i -= start; start = 0; }
      if (buf.length > maxBytes) { buf = ''; i = 0; depth = 0; start = -1; throw new Error('too-big'); }
      return out;
    },
    reset() { buf = ''; depth = 0; inStr = false; esc = false; start = -1; i = 0; },
  };
}

/** A WebSocket frame from the client (always masked, RFC 6455 §5.3). */
export function wsFrame(opcode, payload = Buffer.alloc(0)) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, 0x80 | len]) : Buffer.from([0x80 | opcode, 0x80 | 126, len >> 8, len & 255]);
  const mask = crypto.randomBytes(4);
  const body = Buffer.alloc(len);
  for (let i = 0; i < len; i++) body[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([head, mask, body]);
}

/**
 * Parses server → client WebSocket frames. push(buffer) → [{ op: 'text' | 'binary' | 'ping' | 'pong' | 'close', data: Buffer }];
 * throws on a protocol error (a masked server frame, a control frame over 125 bytes, a message over maxBytes).
 */
export function createWsParser({ maxBytes = RL_MAX_MESSAGE } = {}) {
  let buf = Buffer.alloc(0), parts = [], partOp = 0, partLen = 0;
  return {
    push(chunk) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const out = [];
      for (;;) {
        if (buf.length < 2) break;
        const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f, off = 2;
        if (masked) throw new Error('masked-server-frame');
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) break; const hi = buf.readUInt32BE(2); if (hi !== 0) throw new Error('too-big'); len = buf.readUInt32BE(6); off = 10; }
        if (op >= 8 && (len > 125 || !fin)) throw new Error('bad-control-frame');
        if (len > maxBytes || partLen + len > maxBytes) throw new Error('too-big');
        if (buf.length < off + len) break;
        const data = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        if (op === 8) out.push({ op: 'close', data: Buffer.from(data) });
        else if (op === 9) out.push({ op: 'ping', data: Buffer.from(data) });
        else if (op === 10) out.push({ op: 'pong', data: Buffer.from(data) });
        else if (op === 1 || op === 2 || op === 0) {
          if (op !== 0) { parts = []; partLen = 0; partOp = op; }
          parts.push(Buffer.from(data)); partLen += len;
          if (fin) { out.push({ op: partOp === 2 ? 'binary' : 'text', data: Buffer.concat(parts) }); parts = []; partLen = 0; }
        } else throw new Error('bad-opcode');
      }
      return out;
    },
  };
}

// ── the client ──────────────────────────────────────────────────────────────

/** A socket error → 'refused' | 'timeout' | 'reset' | 'error'. */
export function classifyRlError(e) {
  const code = String(e?.code || ''), msg = String(e?.message || '');
  if (code === 'ECONNREFUSED') return 'refused';
  if (code === 'ETIMEDOUT' || msg === 'timeout') return 'timeout';
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED') return 'reset';
  return 'error';
}

/**
 * The client. opts (tests): { host (always loopback: anything else is refused), tcpPort, wsPort, transports
 * (['ws', 'tcp']), probeMs, probeMaxMs, connectMs, pushMs, heartbeatMs, maxBytes, setTimer, clearTimer, normalize, connect
 * (({ host, port }) → a net.Socket-like: tests) }. The connect timeout runs on the real clock (a refused loopback
 * connect takes ~2 s on Windows); probes, the push throttle and the heartbeat use setTimer.
 * start() is the attachPoller start function.
 */
export function createRlClient(opts = {}) {
  const host = opts.host || RL_HOST;
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') throw new Error('createRlClient: the Stats API is read on the loopback interface only');
  const ports = { tcp: opts.tcpPort || RL_TCP_PORT, ws: opts.wsPort || RL_WS_PORT };
  const order = (opts.transports || RL_TRANSPORTS).filter((t) => RL_TRANSPORTS.includes(t));
  const probeMs = opts.probeMs ?? RL_PROBE_MS, probeMaxMs = opts.probeMaxMs ?? RL_PROBE_MAX_MS;
  const connectMs = opts.connectMs ?? RL_CONNECT_MS, pushMs = Math.max(RL_PUSH_MS, opts.pushMs ?? RL_PUSH_MS), heartbeatMs = opts.heartbeatMs ?? RL_HEARTBEAT_MS;
  const maxBytes = opts.maxBytes ?? RL_MAX_MESSAGE;
  const setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer || ((h) => clearTimeout(h));
  const normalize = opts.normalize || normalizeRl;
  const connect = opts.connect || ((o) => net.connect(o));
  let run = null;
  const st = { phase: 'off', transport: null, reason: null, connects: 0, messages: 0, rejected: 0, pushes: 0, lastMsgAt: null, nextMs: null, starts: 0 };

  function start({ push, log = () => {}, now = () => Date.now() } = {}) {
    if (typeof push !== 'function') throw new Error('createRlClient: start({ push }) needs a push function');
    stopRun();
    const r = { timer: null, pushTimer: null, beat: null, sock: null, state: null, pending: [], lastPush: -Infinity, dirty: false, had: false, backoff: probeMs, said: new Set(), push, log, now, which: 0 };
    run = r;
    st.starts++;
    Object.assign(st, { phase: 'probing', transport: null, reason: null, nextMs: 0 });
    schedule(r, 0);
    return function stop() { if (run === r) stopRun(); };
  }

  function stopRun() {
    const r = run;
    run = null;
    if (!r) return;
    for (const k of ['timer', 'pushTimer', 'beat']) if (r[k]) { clearTimer(r[k]); r[k] = null; }
    if (r.sock) { const s = r.sock; r.sock = null; try { s.destroy(); } catch { /* gone */ } }
    Object.assign(st, { phase: 'off', transport: null, nextMs: null });
  }

  function schedule(r, ms) {
    if (run !== r) return;
    st.nextMs = ms;
    r.timer = setTimer(() => { r.timer = null; attempt(r); }, ms);
    r.timer?.unref?.();
  }

  /** Say something once until it changes (no log spam); never a payload or a name. */
  function say(r, key, level, msg) { if (r.said.has(key)) return; r.said.add(key); try { r.log(level, msg); } catch { /* the hub's logger */ } }

  /** One probe: the transports in order on this attempt, the first that connects wins. */
  function attempt(r, idx = 0) {
    if (run !== r) return;
    const transport = order[idx];
    if (!transport) return idle(r, 'refused');
    const sock = connect({ host, port: ports[transport] });
    let opened = false, done = false;
    r.sock = sock;
    sock.setNoDelay?.(true);
    const t = setTimeout(() => { if (!opened && !done) { done = true; try { sock.destroy(); } catch { /* gone */ } r.sock = null; attempt(r, idx + 1); } }, connectMs);
    t?.unref?.();
    sock.once('connect', () => {
      if (run !== r || done) { try { sock.destroy(); } catch { /* gone */ } return; }
      if (transport === 'tcp') { clearTimeout(t); opened = true; session(r, sock, transport, null); return; }
      // (the WebSocket keeps the timeout running until the upgrade answers)
      // the WebSocket upgrade: the only bytes we ever write before the protocol's own pongs / close
      const key = crypto.randomBytes(16).toString('base64');
      const want = crypto.createHash('sha1').update(key + RL_WS_GUID).digest('base64');
      let head = Buffer.alloc(0);
      const onData = (c) => {
        head = Buffer.concat([head, c]);
        const end = head.indexOf('\r\n\r\n');
        if (end < 0) { if (head.length > 8192) fail('bad-handshake'); return; }
        sock.off('data', onData);
        const text = head.subarray(0, end).toString('latin1');
        const ok = /^HTTP\/1\.1 101/.test(text) && new RegExp(`\\r\\nsec-websocket-accept:\\s*${want.replace(/[+/=]/g, (ch) => `\\${ch}`)}\\s*(\\r\\n|$)`, 'i').test(`${text}\r\n`);
        if (!ok) return fail('bad-handshake');
        clearTimeout(t);
        opened = true;
        session(r, sock, transport, head.subarray(end + 4));
      };
      const fail = (why) => { if (done) return; done = true; clearTimeout(t); sock.off('data', onData); try { sock.destroy(); } catch { /* gone */ } r.sock = null; if (why !== 'refused') say(r, `ws:${why}`, 'info', 'something on the Stats API WebSocket port isn\'t Rocket League (no WebSocket upgrade); trying the TCP port'); attempt(r, idx + 1); };
      sock.on('data', onData);
      sock.once('close', () => { if (!opened) fail('closed'); });
      sock.write(`GET / HTTP/1.1\r\nHost: ${host}:${ports.ws}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    sock.once('error', (e) => {
      if (opened || done) return;
      done = true; clearTimeout(t);
      r.sock = null;
      const why = classifyRlError(e);
      if (why !== 'refused' && why !== 'timeout') say(r, `err:${why}`, 'info', `the Stats API port didn't answer cleanly (${why})`);
      attempt(r, idx + 1);
    });
  }

  /** Nothing answered: back off quietly. */
  function idle(r, why) {
    if (run !== r) return;
    Object.assign(st, { phase: 'probing', transport: null, reason: why === 'refused' ? null : why });
    if (!r.said.has('probing')) say(r, 'probing', 'info', 'waiting for Rocket League (no Stats API on 127.0.0.1; turn it on with "Connect Rocket League", then restart the game)');
    const wait = r.backoff;
    r.backoff = Math.min(probeMaxMs, Math.round(r.backoff * RL_BACKOFF));
    schedule(r, wait);
  }

  /** A connected socket: read messages until it closes. */
  function session(r, sock, transport, rest) {
    if (run !== r) { try { sock.destroy(); } catch { /* gone */ } return; }
    st.connects++;
    r.backoff = probeMs;
    r.said.delete('probing'); r.said.delete('gone');
    Object.assign(st, { phase: 'connected', transport, reason: null });
    say(r, `open:${transport}`, 'info', `reading Rocket League's Stats API (${transport === 'ws' ? 'WebSocket' : 'TCP'}, 127.0.0.1)`);
    r.had = true;
    // the game is running: until a match message arrives, it's in the menus
    feed(r, null);
    const decoder = new StringDecoder('utf8');
    const split = createJsonSplitter({ maxBytes });
    const ws = transport === 'ws' ? createWsParser({ maxBytes }) : null;
    let closed = false;
    const end = (why) => {
      if (closed) return;
      closed = true;
      try { sock.destroy(); } catch { /* gone */ }
      if (r.sock === sock) r.sock = null;
      if (run !== r) return;
      gone(r, why);
    };
    const text = (s) => { let objs; try { objs = split.push(s); } catch { say(r, 'too-big', 'warn', 'Rocket League sent a message over the size limit; reconnecting'); return end('too-big'); } for (const o of objs) message(r, o); };
    const bytes = (c) => {
      if (!ws) return text(decoder.write(c));
      let frames;
      try { frames = ws.push(c); } catch (e) { say(r, `ws:${e.message}`, 'warn', `the Stats API WebSocket broke protocol (${e.message}); reconnecting`); return end('protocol'); }
      for (const f of frames) {
        if (f.op === 'text' || f.op === 'binary') text(f.data.toString('utf8'));
        else if (f.op === 'ping') { try { sock.write(wsFrame(10, f.data)); } catch { /* closing */ } }
        else if (f.op === 'close') { try { sock.write(wsFrame(8, f.data.subarray(0, 2))); } catch { /* closing */ } return end('closed'); }
      }
    };
    sock.on('data', bytes);
    sock.on('error', () => end('reset'));
    sock.on('close', () => end('closed'));
    sock.on('end', () => end('closed'));
    if (rest && rest.length) bytes(rest);
  }

  function message(r, text) {
    if (run !== r) return;
    let msg;
    try { msg = JSON.parse(text); } catch { st.rejected++; say(r, 'bad-json', 'info', 'Rocket League sent an unreadable message; skipped'); return; }
    st.messages++;
    feed(r, msg);
  }

  /** One message (or null: "connected, in the menus") through the normalizer; the push is coalesced. */
  function feed(r, msg) {
    const t = r.now();
    const out = msg === null ? rlIdle(r.state, t) : normalize(msg, r.state, { nowMs: t });
    if (out.rejected) { st.rejected++; return; }
    if (msg !== null) st.lastMsgAt = t;
    if (out.state) {
      if (out.state.status !== (r.state?.status ?? null)) say(r, `status:${out.state.status}`, 'info', out.state.status === 'watching' ? 'Rocket League is showing a match that isn\'t yours (spectating, a replay)' : out.state.status === 'live' ? 'reading your Rocket League match' : `Rocket League: ${out.state.status}`);
      r.state = out.state;
      if (out.events.length) r.pending.push(...out.events);
      r.dirty = true;
      flush(r);
    }
  }

  /** Push the newest state with the events since the last push, at most once per pushMs. */
  function flush(r, force = false) {
    if (run !== r || !r.dirty || !r.state) return;
    const t = r.now();
    const wait = r.lastPush + pushMs - t;
    if (!force && wait > 0) {
      if (!r.pushTimer) { r.pushTimer = setTimer(() => { r.pushTimer = null; flush(r, true); }, wait); r.pushTimer?.unref?.(); }
      return;
    }
    if (r.pushTimer) { clearTimer(r.pushTimer); r.pushTimer = null; }
    const events = r.pending.splice(0);
    r.dirty = false;
    r.lastPush = t;
    emit(r, { state: r.state, events });
    armBeat(r);
  }

  /** The heartbeat: connected and quiet, the latest state again (no events) so the hub doesn't go "waiting". */
  function armBeat(r) {
    if (r.beat) clearTimer(r.beat);
    r.beat = setTimer(() => { r.beat = null; if (run !== r || !r.sock || !r.state) return; r.dirty = true; flush(r, true); }, heartbeatMs);
    r.beat?.unref?.();
  }

  function emit(r, value) {
    st.pushes++;
    try { r.push(value); } catch (e) { say(r, 'push', 'warn', `push failed (${String(e?.message || e).slice(0, 80)})`); }
  }

  /** The socket closed after a session: null once ("gone"), memory dropped, probing again. */
  function gone(r, why) {
    for (const k of ['pushTimer', 'beat']) if (r[k]) { clearTimer(r[k]); r[k] = null; }
    r.pending = []; r.dirty = false;
    if (r.had) {
      r.had = false;
      r.state = normalize(null, r.state, { nowMs: r.now() }).state;
      say(r, 'gone', 'info', 'Rocket League closed the Stats API connection (the game quit or restarted)');
      for (const k of [...r.said]) if (k.startsWith('status:') || k.startsWith('open:')) r.said.delete(k);
      emit(r, null);
    }
    Object.assign(st, { phase: 'probing', transport: null, reason: why === 'closed' || why === 'reset' ? null : why });
    schedule(r, probeMs);
  }

  return {
    start,
    stop: stopRun,
    /** { running, phase: 'off' | 'probing' | 'connected', transport: 'ws' | 'tcp' | null, reason, connects, messages, rejected, pushes, lastMsgAt, nextMs } */
    status: () => ({ running: !!run, ...st }),
    get running() { return !!run; },
  };
}

// ── the ini switch (on the user's click only) ───────────────────────────────

/** Where Prism keeps the ini backup: <gamelink dir>/rl/ (beside gamelink.json: %APPDATA%\Prism\deck\rl; PRISM_DECK_GAMELINK_DIR overrides). */
export function rlBackupDir(o = {}) {
  return path.join(gameLinkDir(o), 'rl');
}
export const RL_RECORD = 'statsapi-backup.json';

/** Node file io for findRl (read-only). */
export function nodeRlIo({ platform = process.platform, env = process.env, home = os.homedir(), readRegistry } = {}) {
  return {
    platform, env, home, readRegistry,
    readText: async (f) => { try { return await fsp.readFile(f, 'utf8'); } catch { return null; } },
    isFile: async (f) => { try { return (await fsp.stat(f)).isFile(); } catch { return false; } },
    isDir: async (f) => { try { return (await fsp.stat(f)).isDirectory(); } catch { return false; } },
    listDir: async (f) => { try { return await fsp.readdir(f); } catch { return []; } },
  };
}

/** Bytes → { text, enc: 'utf16le' | 'utf8' | 'utf8bom' } (UE3 ini files may be UTF-16 LE with a BOM). */
export function decodeIni(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString('utf16le'), enc: 'utf16le' };
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.subarray(3).toString('utf8'), enc: 'utf8bom' };
  return { text: buf.toString('utf8'), enc: 'utf8' };
}
export function encodeIni(text, enc) {
  if (enc === 'utf16le') return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  if (enc === 'utf8bom') return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
  return Buffer.from(text, 'utf8');
}

async function writeAtomic(file, bytes) {
  const tmp = `${file}.prism-tmp`;
  try {
    await fsp.writeFile(tmp, bytes);
    await fsp.rename(tmp, file);
  } catch (e) { try { await fsp.rm(tmp, { force: true }); } catch { /* best effort */ } throw e; }
}

async function readRecord(dir) {
  try {
    const j = JSON.parse(await fsp.readFile(path.join(dir, RL_RECORD), 'utf8'));
    return j && j.v === 1 && Array.isArray(j.files) && j.files.every((x) => x && typeof x.path === 'string' && x.record) ? j : null;
  } catch { return null; }
}

/**
 * The install and the ini's state, read-only. → { found, reason, store, iniPath (the file the game reads first),
 * ini: 'absent' | 'off' | 'current' | 'on' (that file), rate, port, webPort, files: [{ kind, state }], connected (our backup record exists) }
 */
export async function rlStatus({ io = nodeRlIo(), dir = rlBackupDir(), find = findRl } = {}) {
  const info = await find(io);
  const rec = await readRecord(dir);
  if (!info.found) return { found: false, reason: info.reason, store: null, iniPath: rec?.files?.[0]?.path || null, ini: null, rate: null, files: [], connected: !!rec };
  const files = [];
  for (const f of info.inis || [{ path: info.iniPath, kind: 'install-default' }]) {
    let text = null;
    try { text = decodeIni(await fsp.readFile(f.path)).text; } catch { text = null; }
    files.push({ kind: f.kind, path: f.path, ...rlIniState(text) });
  }
  const top = files[0] || { state: 'absent', rate: null, port: null, webPort: null };
  return { found: true, reason: null, store: info.store, iniPath: info.iniPath, ini: top.state, rate: top.rate, port: top.port, webPort: top.webPort, files: files.map((x) => ({ kind: x.kind, state: x.state })), connected: !!rec };
}

/**
 * Connect: turn the Stats API on in every Stats API ini the game may read (rlIniFiles: Documents\…\TAStatsAPI.ini,
 * the install's TAStatsAPI.ini, its DefaultStatsAPI.ini — the ones that exist; we never create one). The backup comes
 * first: each file's original bytes and the record of our keys' old values go into `dir` (once per file: a second
 * Connect keeps the first, true original), written before any game file is touched. Then only our keys change (each
 * file atomically, its encoding kept). → { ok, reason?, path (the file the game reads first), paths, restartNeeded, already? }
 */
export async function connectRl({ io = nodeRlIo(), dir = rlBackupDir(), find = findRl, rate = RL_RATE, port = RL_TCP_PORT, webPort = RL_WS_PORT } = {}) {
  const info = await find(io);
  if (!info.found) return { ok: false, reason: info.reason || 'not-installed', path: null, paths: [], restartNeeded: false };
  const targets = info.inis || [];
  if (!targets.length) return { ok: false, reason: 'no-ini', path: info.iniPath || null, paths: [], restartNeeded: false };
  const prior = await readRecord(dir);
  const files = prior ? prior.files.map((x) => ({ ...x })) : [];
  const writes = [];
  for (const t of targets) {
    let buf;
    try { buf = await fsp.readFile(t.path); } catch { return { ok: false, reason: 'read-failed', path: t.path, paths: [], restartNeeded: false }; }
    const { text, enc } = decodeIni(buf);
    if (rlIniState(text, { rate, port, webPort }).state === 'current') continue;   // already as we'd set it
    const { text: next, record } = rlIniApply(text, { rate, port, webPort });
    const had = files.find((x) => x.path === t.path);
    if (had) had.record = { ...had.record, wrote: record.wrote };   // over our own earlier change: keep the first old values
    else files.push({ path: t.path, kind: t.kind, enc, backup: `statsapi-${files.length}.ini`, original: buf, record });
    writes.push({ path: t.path, bytes: encodeIni(next, enc) });
  }
  if (!writes.length) return { ok: true, already: true, path: info.iniPath, paths: targets.map((t) => t.path), restartNeeded: false };
  try {
    await fsp.mkdir(dir, { recursive: true });
    for (const x of files) if (x.original) { await writeAtomic(path.join(dir, x.backup), x.original); delete x.original; }
    await writeAtomic(path.join(dir, RL_RECORD), Buffer.from(JSON.stringify({ v: 1, at: prior?.at || new Date().toISOString(), files }, null, 2)));
  } catch { return { ok: false, reason: 'backup-failed', path: info.iniPath, paths: [], restartNeeded: false }; }
  for (const w of writes) {
    try { await writeAtomic(w.path, w.bytes); } catch { return { ok: false, reason: 'write-failed', path: w.path, paths: writes.map((x) => x.path), restartNeeded: false }; }
  }
  return { ok: true, path: info.iniPath, paths: writes.map((x) => x.path), restartNeeded: true };
}

/**
 * Disconnect: in every file Connect changed, put back what our keys held before (a key the user changed since stays
 * theirs: listed in `kept`). The backups and the record go once every file is restored (a failure keeps them, so
 * Disconnect can be clicked again). → { ok, reason?, path, paths, restored: [key], kept: [key], restartNeeded }
 */
export async function disconnectRl({ dir = rlBackupDir() } = {}) {
  const rec = await readRecord(dir);
  if (!rec) return { ok: true, path: null, paths: [], restored: [], kept: [], restartNeeded: false, nothing: true };
  const restored = new Set(), kept = new Set(), paths = [];
  for (const f of rec.files) {
    let buf = null;
    try { buf = await fsp.readFile(f.path); } catch (e) { if (e?.code === 'ENOENT') continue; return { ok: false, reason: 'read-failed', path: f.path, paths, restored: [...restored], kept: [...kept], restartNeeded: false }; }
    const { text, enc } = decodeIni(buf);
    let r;
    try { r = rlIniRestore(text, f.record); } catch { return { ok: false, reason: 'bad-record', path: f.path, paths, restored: [...restored], kept: [...kept], restartNeeded: false }; }
    r.restored.forEach((k) => restored.add(k)); r.kept.forEach((k) => kept.add(k));
    if (r.text !== text) {
      try { await writeAtomic(f.path, encodeIni(r.text, enc)); } catch { return { ok: false, reason: 'write-failed', path: f.path, paths, restored: [...restored], kept: [...kept], restartNeeded: false }; }
      paths.push(f.path);
    }
  }
  try {
    for (const f of rec.files) if (f.backup) await fsp.rm(path.join(dir, f.backup), { force: true });
    await fsp.rm(path.join(dir, RL_RECORD), { force: true });
  } catch { /* best effort: the files are restored */ }
  return { ok: true, path: rec.files[0]?.path || null, paths, restored: [...restored], kept: [...kept], restartNeeded: paths.length > 0 };
}
