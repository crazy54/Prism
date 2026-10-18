// Browser bridge — for Windows / macOS machines with no capture CLI: a localhost-only
// page captures audio in the browser (getUserMedia for a microphone, getDisplayMedia for
// system audio on Windows/ChromeOS or a tab elsewhere), meters it in an AudioWorklet and
// streams LEVELS ONLY (rms, peak, band energies — ~70 bytes, ~30 times a second) to the
// plugin over an authenticated WebSocket. Audio never leaves the page.
//
//   const br = await createBridgeServer({ config: { hopHz: 30, bands: 16 }, onMeter, onHello });
//   br.url   → 'http://127.0.0.1:<port>/#<token>'   hand to the host's openUrl (we never open browsers)
//   await br.close()
//
// Security (a local page that a malicious website or another local user must not be able to feed):
//   - binds 127.0.0.1 only; Host must be 127.0.0.1:<port> / localhost:<port> (DNS-rebinding guard)
//   - WebSocket Origin must be this server's own origin (blocks cross-site WebSocket hijacking)
//   - a random 144-bit token travels in the URL fragment (never sent in HTTP requests or logs) and comes
//     back as a WebSocket subprotocol 'auth.<token>', compared in constant time; wrong → 403 before upgrade
//   - one client at a time (a new authenticated page replaces the old), client frames must be masked,
//     ≤ 16 KiB per message, ≤ 120 messages/s; strict CSP on the page (script-src 'self', no inline script)
// Zero dependencies: node:http + node:crypto (loaded lazily), RFC 6455 framing below.

import { fftInPlace, windowedMagnitudes, bandLayout, bandAmplitudes } from './dsp.js';

export const BRIDGE_PROTOCOL = 'prism-audio.v1';
export const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_MESSAGE = 16384;

// ── RFC 6455 framing (pure; unit-tested) ─────────────────────────────────────

/** Encode one unmasked server frame (fin set). opcode: 1 text, 2 binary, 8 close, 9 ping, 10 pong. */
export function encodeFrame(opcode, payload = new Uint8Array(0), { mask = null } = {}) {
  const data = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const len = data.length;
  const ext = len < 126 ? 0 : len < 65536 ? 2 : 8;
  const out = new Uint8Array(2 + ext + (mask ? 4 : 0) + len);
  out[0] = 0x80 | (opcode & 0x0f);
  out[1] = (mask ? 0x80 : 0) | (ext === 0 ? len : ext === 2 ? 126 : 127);
  const dv = new DataView(out.buffer);
  if (ext === 2) dv.setUint16(2, len);
  if (ext === 8) dv.setBigUint64(2, BigInt(len));
  let o = 2 + ext;
  if (mask) { out.set(mask, o); o += 4; for (let i = 0; i < len; i++) out[o + i] = data[i] ^ mask[i & 3]; }
  else out.set(data, o);
  return out;
}

/**
 * Incremental parser for CLIENT frames (must be masked). onMessage(opcode, Uint8Array) for complete
 * text/binary messages; onControl(opcode, payload) for ping/pong/close; onError(reason) → caller drops the socket.
 */
export function createFrameParser({ onMessage, onControl, onError, maxMessage = MAX_MESSAGE }) {
  let buf = new Uint8Array(0), parts = [], partsLen = 0, msgOp = 0, dead = false;
  const fail = (r) => { dead = true; onError?.(r); };
  return function push(chunk) {
    if (dead) return;
    const c = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const all = new Uint8Array(buf.length + c.length); all.set(buf); all.set(c, buf.length); buf = all;
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      if (buf[0] & 0x70) return fail('reserved bits set');
      let len = buf[1] & 0x7f, off = 2;
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.length);
      if (len === 126) { if (buf.length < 4) return; len = dv.getUint16(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; const big = dv.getBigUint64(2); if (big > BigInt(maxMessage)) return fail('frame too large'); len = Number(big); off = 10; }
      if (!masked) return fail('client frames must be masked');
      if (len > maxMessage) return fail('frame too large');
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const data = new Uint8Array(len);
      for (let i = 0; i < len; i++) data[i] = buf[off + 4 + i] ^ mask[i & 3];
      buf = buf.slice(off + 4 + len);
      if (op >= 0x8) {                                   // control frames: never fragmented, ≤ 125 bytes
        if (!fin || len > 125) return fail('bad control frame');
        onControl?.(op, data);
        if (op === 0x8) { dead = true; return; }
        continue;
      }
      if (op !== 0x0) { if (parts.length) return fail('interleaved message'); msgOp = op; }
      else if (!parts.length) return fail('continuation without a message');
      if (msgOp !== 0x1 && msgOp !== 0x2) return fail(`unsupported opcode ${msgOp}`);
      parts.push(data); partsLen += len;
      if (partsLen > maxMessage) return fail('message too large');
      if (fin) {
        const msg = new Uint8Array(partsLen); let o = 0;
        for (const p of parts) { msg.set(p, o); o += p.length; }
        parts = []; partsLen = 0;
        onMessage?.(msgOp, msg);
      }
    }
  };
}

/** Decode a binary meter message: Float32 LE [rms, peak, ...bands] → { rms, peak, bands } or null. */
export function decodeMeter(bytes) {
  if (!bytes || bytes.length < 8 || bytes.length % 4 || bytes.length > 4 * 130) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const n = bytes.length / 4, vals = new Array(n);
  for (let i = 0; i < n; i++) { const v = dv.getFloat32(i * 4, true); vals[i] = Number.isFinite(v) ? Math.max(0, Math.min(4, v)) : 0; }
  return { rms: vals[0], peak: vals[1], bands: vals.slice(2) };
}

/** Constant-time string compare (equal length required). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Decide an upgrade request (pure; unit-tested). → { ok: true, protocol } | { ok: false, status, reason }
 * req: { url, headers } with lower-case header names (Node's IncomingMessage).
 */
export function checkUpgrade(req, { port, token }) {
  const h = req.headers || {};
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(String(h.host || '').toLowerCase())) return { ok: false, status: 421, reason: 'bad host' };
  if ((req.url || '').split('?')[0] !== '/ws') return { ok: false, status: 404, reason: 'not found' };
  if (String(h.upgrade || '').toLowerCase() !== 'websocket') return { ok: false, status: 400, reason: 'not a websocket upgrade' };
  if (String(h['sec-websocket-version'] || '') !== '13') return { ok: false, status: 426, reason: 'websocket version 13 required' };
  if (!h['sec-websocket-key']) return { ok: false, status: 400, reason: 'missing key' };
  const origin = String(h.origin || '').toLowerCase();
  if (!hosts.some((x) => origin === `http://${x}`)) return { ok: false, status: 403, reason: 'bad origin' };
  const protos = String(h['sec-websocket-protocol'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!protos.includes(BRIDGE_PROTOCOL)) return { ok: false, status: 403, reason: 'missing protocol' };
  const auth = protos.find((p) => p.startsWith('auth.'));
  if (!auth || !safeEqual(auth.slice(5), token)) return { ok: false, status: 403, reason: 'bad token' };
  return { ok: true, protocol: BRIDGE_PROTOCOL };
}

// ── the page ────────────────────────────────────────────────────────────────

/** AudioWorklet module: the same FFT / band code as the plugin (stringified from dsp.js). */
export function bridgeWorkletSource() {
  return `// Prism Deck audio bridge — meter worklet (levels only; audio stays in this page)
${fftInPlace.toString()}
${windowedMagnitudes.toString()}
${bandLayout.toString()}
${bandAmplitudes.toString()}
class PrismMeter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.hop = Math.max(32, Math.round(sampleRate / Math.max(1, Math.min(120, o.hopHz || 30))));
    this.nb = Math.max(0, Math.min(128, o.bands | 0));
    let size = 256; const want = o.fftSize || Math.round(sampleRate * 0.064);
    while (size < want && size < 8192) size *= 2;
    this.size = size; this.win = new Float32Array(size); this.wi = 0; this.frame = new Float32Array(size);
    this.re = new Float64Array(size); this.im = new Float64Array(size); this.mags = new Float32Array(size / 2 + 1);
    this.layout = this.nb ? bandLayout(sampleRate, size, this.nb, o.minHz || 40, o.maxHz || 12000) : null;
    this.amps = new Float32Array(this.nb);
    this.n = 0; this.sum = 0; this.peak = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length && input[0]) {
      const chs = input.length, len = input[0].length;
      for (let i = 0; i < len; i++) {
        let v = 0;
        for (let c = 0; c < chs; c++) v += input[c][i];
        v /= chs;
        this.win[this.wi] = v; this.wi = this.wi + 1 === this.size ? 0 : this.wi + 1;
        this.sum += v * v; const a = v < 0 ? -v : v; if (a > this.peak) this.peak = a;
        if (++this.n >= this.hop) this.emit();
      }
    }
    return true;
  }
  emit() {
    const out = new Float32Array(2 + this.nb);
    out[0] = Math.sqrt(this.sum / this.n); out[1] = this.peak;
    this.n = 0; this.sum = 0; this.peak = 0;
    if (this.nb) {
      for (let i = 0, r = this.wi; i < this.size; i++) { this.frame[i] = this.win[r]; r = r + 1 === this.size ? 0 : r + 1; }
      windowedMagnitudes(this.frame, this.re, this.im, this.mags);
      bandAmplitudes(this.mags, this.layout.lo, this.layout.hi, this.amps);
      out.set(this.amps, 2);
    }
    this.port.postMessage(out.buffer, [out.buffer]);
  }
}
registerProcessor('prism-meter', PrismMeter);
`;
}

/** The page script (served as /bridge.js — the CSP forbids inline script). */
export function bridgePageScript() {
  return `// Prism Deck audio bridge — page
'use strict';
const token = location.hash.slice(1);
const $ = (id) => document.getElementById(id);
let ws = null, cfg = null, ctx = null, stream = null, node = null, bars = [], level = null;
function status(msg, tone) { const s = $('status'); s.textContent = msg; s.dataset.tone = tone || ''; }
function enable(on) { for (const b of document.querySelectorAll('[data-src]')) b.disabled = !on; $('stop').disabled = !stream; }
function buildMeter(n) {
  const m = $('meter'); m.textContent = ''; bars = [];
  for (let i = 0; i < n; i++) { const b = document.createElement('i'); b.style.setProperty('--h', String(i / Math.max(1, n - 1))); m.appendChild(b); bars.push(b); }
}
function draw(v) {
  if (level) level.style.transform = 'scaleX(' + Math.min(1, v[1]).toFixed(3) + ')';
  for (let i = 0; i < bars.length; i++) {
    const a = v[2 + i] || 0, db = a > 0 ? 1 + (20 * Math.log10(a)) / 72 : 0;
    bars[i].style.transform = 'scaleY(' + Math.max(0.02, Math.min(1, db)).toFixed(3) + ')';
  }
}
function connect() {
  if (!token) { status('Open this page from Prism Deck — the link carries a one-time key.', 'warn'); return; }
  ws = new WebSocket('ws://' + location.host + '/ws', ['${BRIDGE_PROTOCOL}', 'auth.' + token]);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => status('Connected to Prism Deck. Choose what it should listen to.', 'ok');
  ws.onmessage = (e) => {
    if (typeof e.data !== 'string') return;
    try { const m = JSON.parse(e.data); if (m.type === 'config') { cfg = m; buildMeter(m.bands || 0); enable(true); } } catch (err) { /* ignore */ }
  };
  ws.onclose = () => { stop(true); enable(false); status('Disconnected. Reopen this page from Prism Deck to reconnect.', 'warn'); };
}
async function start(kind) {
  stop(true);
  const quiet = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  try {
    stream = kind === 'display'
      ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: quiet, systemAudio: 'include' })
      : await navigator.mediaDevices.getUserMedia({ audio: quiet });
  } catch (err) { status(kind === 'display' ? 'Sharing was cancelled or is not allowed.' : 'Microphone access was denied.', 'warn'); stream = null; enable(true); return; }
  const tracks = stream.getAudioTracks();
  if (!tracks.length) { status('That share has no audio. On Windows pick "Entire screen" and tick "Share system audio"; elsewhere share a browser tab with audio.', 'warn'); stop(true); return; }
  for (const v of stream.getVideoTracks()) v.enabled = false;
  ctx = new AudioContext({ latencyHint: 'interactive' });
  await ctx.resume();
  await ctx.audioWorklet.addModule('/worklet.js');
  node = new AudioWorkletNode(ctx, 'prism-meter', { processorOptions: cfg, numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  const mute = new GainNode(ctx, { gain: 0 });
  ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
  node.port.onmessage = (e) => { if (ws && ws.readyState === 1) ws.send(e.data); draw(new Float32Array(e.data)); };
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'hello', source: kind, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency || 0, label: String(tracks[0].label || '').slice(0, 80) }));
  tracks[0].addEventListener('ended', () => { status('Capture ended.', 'warn'); stop(); });
  status((kind === 'display' ? 'Listening to the shared audio' : 'Listening to the microphone') + '. Keep this tab open; close it to stop.', 'live');
  enable(true);
}
function stop(silent) {
  if (node) { node.port.onmessage = null; node.disconnect(); node = null; }
  if (ctx) { ctx.close(); ctx = null; }
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'stopped' })); }
  draw(new Float32Array(2 + bars.length));
  if (!silent) status('Stopped. Choose a source to start again.', 'ok');
  $('stop').disabled = true;
}
level = $('level');
for (const b of document.querySelectorAll('[data-src]')) b.addEventListener('click', () => start(b.dataset.src));
$('stop').addEventListener('click', () => stop());
enable(false);
connect();
`;
}

/** The page (Refraction: ink-navy Night / pearl Day, instrument label, the Beam). */
export function bridgePageHtml() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Prism Deck · Audio bridge</title>
<style>
:root{--bg:#0a0c12;--panel:#10131c;--line:#252a3a;--ink:#ece9f7;--muted:#a7a4bb;--accent:#b8a2f2;--beam:#ffffff;--mint:#8fe3c4;--warn:#f2c46b;--ok:#7fdcb5;color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#f6f5f9;--panel:#ffffff;--line:#dcd9e6;--ink:#1b1930;--muted:#55526a;--accent:#7353bb;--beam:#5b8fd6;--mint:#2f9e7a;--warn:#8a5a00;--ok:#1d6b4f;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:min(560px,92vw);background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:28px 28px 22px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
.eyebrow{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}.lam{text-transform:none}
h1{margin:10px 0 6px;font-size:28px;font-weight:700;letter-spacing:-.03em}
p{margin:0 0 14px;color:var(--muted)}
.beam{height:1px;margin:18px 0;background:linear-gradient(90deg,transparent,var(--accent) 30%,var(--beam) 50%,var(--mint) 70%,transparent)}
.row{display:flex;gap:10px;flex-wrap:wrap}
button{font:inherit;font-weight:600;padding:10px 16px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer}
button.primary{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
button:disabled{opacity:.45;cursor:default}
button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
#status{min-height:1.5em;margin:16px 0 8px;font-weight:600}
#status[data-tone=warn]{color:var(--warn)}#status[data-tone=ok],#status[data-tone=live]{color:var(--ok)}
#meter{display:flex;gap:3px;align-items:flex-end;height:64px;margin:6px 0 4px}
#meter i{flex:1;height:100%;border-radius:3px 3px 1px 1px;transform-origin:bottom;transform:scaleY(.02);background:hsl(calc(285 - var(--h) * 140) 70% 70%)}
.track{height:4px;border-radius:2px;background:var(--line);overflow:hidden}#level{height:100%;background:var(--accent);transform-origin:left;transform:scaleX(0)}
small{display:block;margin-top:14px;color:var(--muted)}
@media (prefers-reduced-motion:no-preference){#meter i,#level{transition:transform 60ms linear}}
</style></head><body><main>
<div class="eyebrow">Prism Deck · Audio bridge · <span class="lam">λ</span> 584</div>
<h1>Let your keys hear the music</h1>
<p>This page listens on this computer and sends Prism Deck only levels — about thirty small numbers a second. Nothing is recorded or uploaded.</p>
<div class="row">
<button class="primary" data-src="display" type="button">Share system audio</button>
<button data-src="mic" type="button">Use microphone</button>
<button id="stop" type="button">Stop</button>
</div>
<div id="status" role="status" aria-live="polite">Connecting…</div>
<div id="meter" aria-hidden="true"></div>
<div class="track" aria-hidden="true"><div id="level"></div></div>
<div class="beam" aria-hidden="true"></div>
<small>System audio: Chrome or Edge on Windows — choose “Entire screen” and tick “Share system audio”. On macOS and Linux browsers can share a tab’s audio only. Keep this tab open; closing it stops listening.</small>
</main><script src="/bridge.js"></script></body></html>
`;
}

// ── the server ──────────────────────────────────────────────────────────────

/**
 * opts: { host = '127.0.0.1', port = 0, token?, config: { hopHz, bands, minHz, maxHz },
 *         onMeter({ rms, peak, bands }), onHello(info), onConnect(), onDisconnect(reason), onLog(msg) }
 * → Promise<{ url, port, token, connected, client, close() }>
 */
export async function createBridgeServer(opts = {}) {
  const [http, crypto] = await Promise.all([import('node:http'), import('node:crypto')]);
  const host = opts.host || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') throw new Error('the audio bridge only binds to localhost');
  const token = opts.token || crypto.randomBytes(18).toString('base64url');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) throw new Error('bridge token must be 16–128 url-safe characters');
  const config = { type: 'config', hopHz: 30, bands: 16, minHz: 40, maxHz: 12000, ...(opts.config || {}) };
  const log = (m) => opts.onLog?.(m);
  let port = 0, current = null, closed = false;
  const sockets = new Set();
  const state = { connected: false, client: null };

  const pages = {
    '/': ['text/html; charset=utf-8', bridgePageHtml],
    '/bridge.js': ['text/javascript; charset=utf-8', bridgePageScript],
    '/worklet.js': ['text/javascript; charset=utf-8', bridgeWorkletSource],
  };
  const csp = () => `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src ws://127.0.0.1:${port} ws://localhost:${port}; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

  const server = http.createServer((req, res) => {
    const hostOk = [`127.0.0.1:${port}`, `localhost:${port}`].includes(String(req.headers.host || '').toLowerCase());
    if (!hostOk) { res.writeHead(421).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET' }).end(); return; }
    const page = pages[(req.url || '/').split('?')[0]];
    if (!page) { res.writeHead(404).end(); return; }
    const body = page[1]();
    res.writeHead(200, {
      'content-type': page[0], 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'same-origin', 'x-frame-options': 'DENY', 'content-security-policy': csp(),
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  server.on('clientError', (_e, s) => s.destroy());

  server.on('upgrade', (req, sock) => {
    const verdict = checkUpgrade(req, { port, token });
    if (!verdict.ok || closed) {
      log(`bridge: refused upgrade (${verdict.reason || 'closed'})`);
      sock.end(`HTTP/1.1 ${verdict.status || 503} ${verdict.reason || 'closed'}\r\nConnection: close\r\n\r\n`);
      sock.destroy();
      return;
    }
    const accept = crypto.createHash('sha1').update(String(req.headers['sec-websocket-key']) + WS_GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: ${verdict.protocol}\r\n\r\n`);
    sock.setNoDelay(true);
    if (current) { try { current.end(encodeFrame(0x8, new Uint8Array([0x03, 0xe8]))); } catch { /* gone */ } current.destroy(); }
    current = sock;
    state.connected = true; state.client = null;
    opts.onConnect?.();
    sock.write(encodeFrame(0x1, JSON.stringify(config)));
    let windowStart = Date.now(), count = 0;
    const parse = createFrameParser({
      onMessage(op, data) {
        const t = Date.now();
        if (t - windowStart >= 1000) { windowStart = t; count = 0; }
        if (++count > 120) return;                          // rate limit: drop, don't disconnect
        if (op === 0x2) { const m = decodeMeter(data); if (m) opts.onMeter?.(m); return; }
        let msg;
        try { msg = JSON.parse(new TextDecoder().decode(data)); } catch { return; }
        if (msg?.type === 'hello') {
          state.client = { source: msg.source === 'display' ? 'display' : 'mic', sampleRate: Number(msg.sampleRate) || 0, baseLatency: Number(msg.baseLatency) || 0, label: String(msg.label || '').slice(0, 80) };
          opts.onHello?.(state.client);
        } else if (msg?.type === 'stopped') { state.client = null; opts.onDisconnect?.('stopped'); }
      },
      onControl(op, data) {
        if (op === 0x9) sock.write(encodeFrame(0xa, data));
        else if (op === 0x8) { sock.end(encodeFrame(0x8, data.subarray(0, 2))); }
      },
      onError(reason) { log(`bridge: dropped client (${reason})`); sock.end(encodeFrame(0x8, new Uint8Array([0x03, 0xea]))); sock.destroy(); },
    });
    sock.on('data', parse);
    sock.on('error', () => {});
    sock.on('close', () => {
      if (current !== sock) return;
      current = null; state.connected = false; state.client = null;
      if (!closed) opts.onDisconnect?.('closed');
    });
  });

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(opts.port || 0, host, () => { server.off('error', reject); resolve(); }); });
  port = server.address().port;
  server.unref?.();
  const url = `http://127.0.0.1:${port}/#${token}`;
  log(`bridge: listening on 127.0.0.1:${port}`);
  return {
    url, port, token,
    get connected() { return state.connected; },
    get client() { return state.client; },
    close() {
      if (closed) return Promise.resolve();
      closed = true;
      for (const s of sockets) s.destroy();
      if (current) current.destroy();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
