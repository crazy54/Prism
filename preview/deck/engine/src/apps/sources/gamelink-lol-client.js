// Game Link · League of Legends: the poller for Riot's Live Client Data API. Node only (node:https, node:tls,
// node:fs); never re-exported from ./index.js (browser-safe). The pure half is ./gamelink-lol.js.
//
//   const poller = createLolPoller();                         // nothing connects here
//   const detach = gl.attachPoller({ game: 'lol', start: poller.start });   // the hub starts it while Listen is on
//   poller.status();                                          // { phase, reason, … } — never a name, never a payload
//
// What it does (aaa-prism-play/lead/CONTRACT-moba.md; Riot: https://developer.riotgames.com/docs/lol#game-client-api):
//   - GET https://127.0.0.1:2999/liveclientdata/allgamedata — one request per poll: its `events` IS the /eventdata
//     response, so nothing is fetched twice. Read-only: nothing is ever sent to the game, no other endpoint is called
//   - TLS that trusts ONLY Riot's published root (./riotgames.pem, from
//     https://static.developer.riotgames.com/docs/lol/riotgames.pem, fingerprint checked at load), on a dedicated agent
//     for this one connection. Verification is never turned off, globally or locally; NODE_TLS_REJECT_UNAUTHORIZED is
//     never touched. The game's certificate is issued to CN=rclient with no name for 127.0.0.1, so the name check
//     accepts that CN — Node runs it only after the chain has verified against Riot's root
//   - if the game's certificate turns out SHA-1 signed (OpenSSL 3 refuses that at its default security level:
//     "CA signature digest algorithm too weak"), this one loopback connection retries at security level 0 — the chain
//     is still verified against Riot's root, nothing else changes (logged once)
//   - an expired or foreign certificate (Riot let theirs expire in January 2026: developer-relations #1124) is
//     refused, never bypassed: the deck says "Waiting for a game" and status().reason tells why
//   - in a game: ≤ 2 reads a second (single-flight; start to start ≥ liveMs). The loading screen (the game answers
//     without data): 1 a second. Nothing listening: one quiet probe every 5 s, backing off to 10 s
//   - every read that answered is pushed (the hub's heartbeat); a game that stops answering for failsGone reads in a
//     row, or closes, is pushed as null once ("gone")
//   - logs: transitions only, at most once per kind until it changes; never a payload, a name or a Riot id

import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeLol } from './gamelink-lol.js?v=a917677388';

export const LOL_HOST = '127.0.0.1';
export const LOL_PORT = 2999;
export const LOL_PATH = '/liveclientdata/allgamedata';
export const LOL_LIVE_MS = 500;            // in a game: at most 2 reads a second
export const LOL_LOADING_MS = 1000;        // the loading screen: the game answers, no data yet
export const LOL_PROBE_MS = 5000;          // nothing listens on 2999: one probe every 5 s …
export const LOL_PROBE_MAX_MS = 10000;     // … backing off to one every 10 s
export const LOL_BACKOFF = 1.5;
export const LOL_TIMEOUT_MS = 2000;        // a read slower than this is abandoned
export const LOL_MAX_BYTES = 1024 * 1024;  // allgamedata is ~35–50 KB with ten players
export const LOL_FAILS_GONE = 6;           // reads in a row that fail while a game was answering → it's gone (3 s at 2/s)
export const LOL_CERT_NAMES = Object.freeze(['rclient', 'localhost', '127.0.0.1']);
export const RIOT_ROOT_FINGERPRINT256 = 'CA:8C:9D:32:5B:4C:DC:46:4C:6C:94:A5:85:C8:5E:91:EC:23:D4:0B:A5:BF:3A:E2:82:2B:95:1A:4A:50:4E:A3';
export const RIOT_ROOT_FILE = fileURLToPath(new URL('./riotgames.pem', import.meta.url));
export const LOL_COMPAT_CIPHERS = 'DEFAULT:@SECLEVEL=0';

/** Riot's root certificate, from the bundled file, checked against its published fingerprint. → PEM text */
export function riotRootPem({ file = RIOT_ROOT_FILE } = {}) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\s]+-----END CERTIFICATE-----/.exec(text);
  if (!m) throw new Error('riotgames.pem holds no certificate');
  const pem = `${m[0].replace(/\r\n/g, '\n')}\n`;
  if (new crypto.X509Certificate(pem).fingerprint256 !== RIOT_ROOT_FINGERPRINT256) throw new Error('riotgames.pem is not Riot\'s published root');
  return pem;
}

/**
 * The name check for the game's certificate. Node calls it only after the chain verified against `ca` (Riot's root
 * alone), so the question is just "is this the game client's certificate": the standard check for the host, else a
 * subject CN the game client uses (CN=rclient; no subjectAltName for 127.0.0.1).
 */
export function lolServerIdentity(host, cert) {
  const err = tls.checkServerIdentity(host, cert);
  if (!err) return undefined;
  return LOL_CERT_NAMES.includes(cert?.subject?.CN) ? undefined : err;
}

const UNTRUSTED = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_SIGNATURE_FAILURE', 'CERT_UNTRUSTED', 'CERT_REJECTED', 'INVALID_CA', 'INVALID_PURPOSE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_CHAIN_TOO_LONG']);

/** A request error → 'refused' | 'reset' | 'timeout' | 'cert-expired' | 'cert-not-yet-valid' | 'untrusted' | 'weak-md' | 'not-tls' | 'error'. */
export function classifyLolError(e) {
  const code = String(e?.code || ''), msg = String(e?.message || '');
  if (code === 'ECONNREFUSED') return 'refused';
  if (code === 'ETIMEDOUT' || msg === 'timeout') return 'timeout';
  if (code === 'CERT_HAS_EXPIRED') return 'cert-expired';
  if (code === 'CERT_NOT_YET_VALID') return 'cert-not-yet-valid';
  if (code === 'CA_MD_TOO_WEAK' || code === 'ERR_SSL_CA_MD_TOO_WEAK' || /digest algorithm too weak|md too weak/i.test(msg)) return 'weak-md';
  if (UNTRUSTED.has(code)) return 'untrusted';
  if (code === 'EPROTO' || /wrong version number|packet length too long|unknown protocol|http request/i.test(msg)) return 'not-tls';
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ECONNABORTED' || code === 'ERR_STREAM_PREMATURE_CLOSE') return 'reset';
  return 'error';
}

/** A dedicated keep-alive agent for the game's loopback API: Riot's root only, the name check above, TLS ≥ 1.2. */
export function lolAgent({ ca, compat = false } = {}) {
  return new https.Agent({
    keepAlive: true, maxSockets: 1, maxFreeSockets: 1, timeout: LOL_TIMEOUT_MS,
    ca: [ca], rejectUnauthorized: true, checkServerIdentity: lolServerIdentity, minVersion: 'TLSv1.2',
    ...(compat ? { ciphers: LOL_COMPAT_CIPHERS } : {}),
  });
}

/** One GET. → { status, json } (200) · { status } (any other HTTP status) · { error } — never throws. */
export function lolRead({ agent, host = LOL_HOST, port = LOL_PORT, path = LOL_PATH, timeoutMs = LOL_TIMEOUT_MS, maxBytes = LOL_MAX_BYTES } = {}) {
  let req = null;
  const promise = new Promise((resolve) => {
    let done = false, timer = null;
    const finish = (r) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(r); };
    try {
      req = https.request({ host, port, path, method: 'GET', agent, headers: { accept: 'application/json' } }, (res) => {
        const status = res.statusCode;
        const chunks = [];
        let size = 0;
        res.on('data', (c) => { if (done) return; size += c.length; if (size > maxBytes) { finish({ error: 'too-big' }); req.destroy(); } else chunks.push(c); });
        res.on('end', () => {
          if (status !== 200) return finish({ status });
          let json;
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return finish({ error: 'bad-json' }); }
          finish(json && typeof json === 'object' && !Array.isArray(json) ? { status, json } : { error: 'bad-json' });
        });
        res.on('error', () => finish({ error: 'reset' }));
        res.on('close', () => { if (!res.complete) finish({ error: 'reset' }); });
      });
      req.on('error', (e) => finish({ error: classifyLolError(e) }));
      timer = setTimeout(() => { finish({ error: 'timeout' }); req.destroy(); }, timeoutMs);
      timer.unref?.();
      req.end();
    } catch (e) { finish({ error: classifyLolError(e) }); }
  });
  promise.abort = () => { try { req?.destroy(); } catch { /* gone */ } };
  return promise;
}

const TLS_REASONS = new Set(['cert-expired', 'cert-not-yet-valid', 'untrusted', 'weak-md']);
const MESSAGES = {
  'cert-expired': 'the game client\'s certificate has expired; Game Link won\'t read it until Riot renews it (verification is never bypassed)',
  'cert-not-yet-valid': 'the game client\'s certificate is not valid yet (is the PC clock right?); nothing was read',
  untrusted: 'something on port 2999 has a certificate Riot\'s root didn\'t sign; refused, nothing was read',
  'not-tls': 'something on port 2999 isn\'t the game client (no TLS); ignored',
  'bad-json': 'the game client sent an unreadable answer; skipped',
  'too-big': 'the game client sent an answer over the size limit; skipped',
};

/**
 * The poller. opts (tests): { host, port, ca (PEM; default Riot's root), liveMs, loadingMs, probeMs, probeMaxMs,
 * timeoutMs, maxBytes, failsGone, setTimer, clearTimer, normalize }. start() is the attachPoller start function.
 */
export function createLolPoller(opts = {}) {
  const host = opts.host || LOL_HOST, port = opts.port || LOL_PORT;
  const liveMs = Math.max(LOL_LIVE_MS, opts.liveMs ?? LOL_LIVE_MS);   // ≤ 2 reads a second, whatever a caller asks
  const loadingMs = opts.loadingMs ?? LOL_LOADING_MS;
  const probeMs = opts.probeMs ?? LOL_PROBE_MS, probeMaxMs = opts.probeMaxMs ?? LOL_PROBE_MAX_MS;
  const timeoutMs = opts.timeoutMs ?? LOL_TIMEOUT_MS, maxBytes = opts.maxBytes ?? LOL_MAX_BYTES;
  const failsGone = opts.failsGone ?? LOL_FAILS_GONE;
  const setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer || ((h) => clearTimeout(h));
  const normalize = opts.normalize || normalizeLol;
  let ca = opts.ca || null;
  let run = null;   // the running generation: { gen, timer, inflight, agent, compat, … }
  let gen = 0;
  const st = { phase: 'off', reason: null, reads: 0, answered: 0, pushes: 0, lastOkAt: null, nextMs: null, tls: null, starts: 0 };

  function start({ push, log = () => {}, now = () => Date.now() } = {}) {
    if (typeof push !== 'function') throw new Error('createLolPoller: start({ push }) needs a push function');
    stopRun();
    if (!ca) ca = riotRootPem();   // throws (→ the hub logs "couldn't start") if the bundled root is missing or altered
    const r = { gen: ++gen, timer: null, inflight: null, agent: lolAgent({ ca }), compat: false, state: null, had: false, fails: 0, backoff: probeMs, said: new Set(), push, log, now };
    run = r;
    st.starts++;
    Object.assign(st, { phase: 'probing', reason: null, nextMs: 0, tls: null });
    schedule(r, 0);
    return function stop() { if (run === r) stopRun(); };
  }

  function stopRun() {
    const r = run;
    run = null;
    if (!r) return;
    r.gen = -1;
    if (r.timer) clearTimer(r.timer);
    r.timer = null;
    r.inflight?.abort();
    try { r.agent.destroy(); } catch { /* best effort */ }
    Object.assign(st, { phase: 'off', nextMs: null });
  }

  function schedule(r, ms) {
    if (run !== r) return;
    st.nextMs = ms;
    r.timer = setTimer(() => {
      r.timer = null;
      tick(r).catch((e) => { say(r, 'bug', 'error', `poll failed (${String(e?.message || e).slice(0, 80)})`); schedule(r, probeMaxMs); });
    }, ms);
    r.timer?.unref?.();
  }

  /** Say something once until it changes (no log spam); never a payload or a name. */
  function say(r, key, level, msg) { if (r.said.has(key)) return; r.said.add(key); try { r.log(level, msg); } catch { /* the hub's logger */ } }

  async function tick(r) {
    if (run !== r) return;
    const t0 = r.now();
    st.reads++;
    let res = await (r.inflight = lolRead({ agent: r.agent, host, port, timeoutMs, maxBytes }));
    r.inflight = null;
    if (run !== r) return;
    if (res.error === 'weak-md' && !r.compat) {
      // the game's certificate is SHA-1 signed: OpenSSL 3 refuses that by default. Retry on THIS connection at
      // security level 0 — still Riot's root only, still the name check
      try { r.agent.destroy(); } catch { /* best effort */ }
      r.agent = lolAgent({ ca, compat: true });
      r.compat = true;
      say(r, 'compat', 'info', 'the game client\'s certificate is SHA-1 signed: this loopback connection accepts it at OpenSSL security level 0 (still pinned to Riot\'s root)');
      res = await (r.inflight = lolRead({ agent: r.agent, host, port, timeoutMs, maxBytes }));
      r.inflight = null;
      if (run !== r) return;
    }
    st.tls = r.compat ? 'compat' : 'default';
    const elapsed = Math.max(0, r.now() - t0);
    if (res.status) return answered(r, res, elapsed);
    return failed(r, res.error, elapsed);
  }

  function emit(r, value) {
    st.pushes++;
    try { r.push(value); } catch (e) { say(r, 'push', 'warn', `push failed (${String(e?.message || e).slice(0, 80)})`); }
  }

  function answered(r, res, elapsed) {
    st.answered++;
    r.fails = 0;
    r.backoff = probeMs;
    const poll = res.status === 200 ? { status: 200, allgamedata: res.json } : { status: res.status };
    const out = normalize(poll, r.state, { nowMs: r.now() });
    if (out.rejected || !out.state) return failed(r, 'bad-json', elapsed);
    r.state = out.state;
    const phase = out.state.status === 'loading' ? 'loading' : out.state.status === 'watching' ? 'watching' : 'live';
    if (!r.had || st.phase !== phase) say(r, `phase:${phase}`, 'info', phase === 'loading' ? 'a League of Legends game is loading' : phase === 'watching' ? 'League of Legends is showing a game that isn\'t yours (spectating, a replay)' : 'reading your League of Legends game');
    r.said.delete('gone');
    for (const k of TLS_REASONS) r.said.delete(k);
    r.had = true;
    Object.assign(st, { phase, reason: null, lastOkAt: r.now() });
    emit(r, { state: out.state, events: out.events });
    const every = phase === 'loading' ? loadingMs : liveMs;
    schedule(r, Math.max(0, every - elapsed));
  }

  function failed(r, why, elapsed) {
    const tlsProblem = TLS_REASONS.has(why);
    if (MESSAGES[why]) say(r, why, tlsProblem || why === 'not-tls' ? 'warn' : 'info', MESSAGES[why]);
    if (r.had && !tlsProblem && why !== 'refused' && ++r.fails < failsGone) {
      // a game was answering: a hiccup (a slow read, a reset) gets a few quick retries before it counts as gone
      schedule(r, Math.max(0, liveMs - elapsed));
      return;
    }
    if (r.had) {
      r.had = false;
      r.state = normalize(null, r.state, { nowMs: r.now() }).state;   // null: the memory goes; the next game starts clean
      say(r, 'gone', 'info', 'the League of Legends game closed');
      r.said.delete('phase:live'); r.said.delete('phase:loading'); r.said.delete('phase:watching');
      emit(r, null);
    }
    r.fails = 0;
    Object.assign(st, { phase: tlsProblem ? 'untrusted' : 'probing', reason: why === 'refused' || why === 'timeout' || why === 'reset' ? null : why });
    const wait = tlsProblem ? probeMaxMs : r.backoff;
    r.backoff = Math.min(probeMaxMs, Math.round(r.backoff * LOL_BACKOFF));
    schedule(r, wait);
  }

  return {
    start,
    stop: stopRun,
    /** { running, phase: 'off' | 'probing' | 'loading' | 'live' | 'watching' | 'untrusted', reason, reads, answered, pushes, lastOkAt, nextMs, tls } */
    status: () => ({ running: !!run, ...st }),
    get running() { return !!run; },
  };
}
