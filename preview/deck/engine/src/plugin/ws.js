// Minimal RFC 6455 WebSocket (client + server side), zero dependencies.
//
// The Stream Deck app runs Node plugins on its bundled Node 20, which has no
// global WebSocket. This is the transport for the plugin (client role: frames
// masked) and for the fake Stream Deck used by tests (server role, via
// acceptWebSocket on an http 'upgrade'). Text and binary messages, fragmentation,
// ping/pong, the close handshake, a message-size cap and `bufferedAmount`
// (bytes queued in the socket) for backpressure.

import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

export const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const OP = Object.freeze({ CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa });
export const DEFAULT_MAX_MESSAGE = 64 * 1024 * 1024;

/** Sec-WebSocket-Accept for a Sec-WebSocket-Key. */
export const acceptKey = (key) => crypto.createHash('sha1').update(String(key) + WS_GUID).digest('base64');

/** One frame. Client frames must be masked (RFC 6455 §5.3); server frames must not be. */
export function encodeFrame(opcode, payload = Buffer.alloc(0), { mask = false, fin = true } = {}) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = (fin ? 0x80 : 0) | (opcode & 0x0f);
  if (!mask) return Buffer.concat([header, data]);
  header[1] |= 0x80;
  const key = crypto.randomBytes(4);
  const out = Buffer.allocUnsafe(len);
  for (let i = 0; i < len; i++) out[i] = data[i] ^ key[i & 3];
  return Buffer.concat([header, key, out]);
}

/** Incremental frame decoder. push(chunk) → frames [{ fin, opcode, masked, payload }]. Throws on protocol errors. */
export class FrameDecoder {
  constructor({ maxFrame = DEFAULT_MAX_MESSAGE } = {}) { this.buf = Buffer.alloc(0); this.maxFrame = maxFrame; }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const frames = [];
    for (;;) {
      const b = this.buf;
      if (b.length < 2) break;
      const fin = (b[0] & 0x80) !== 0, rsv = b[0] & 0x70, opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (rsv) throw new WsError(1002, 'reserved bits set (no extensions negotiated)');
      if (len === 126) { if (b.length < 4) break; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) break;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(this.maxFrame)) throw new WsError(1009, 'frame too large');
        len = Number(big); off = 10;
      }
      if (len > this.maxFrame) throw new WsError(1009, 'frame too large');
      if (opcode >= 0x8 && (len > 125 || !fin)) throw new WsError(1002, 'invalid control frame');
      const need = off + (masked ? 4 : 0) + len;
      if (b.length < need) break;
      let payload;
      if (masked) {
        const key = b.subarray(off, off + 4);
        payload = Buffer.allocUnsafe(len);
        const src = b.subarray(off + 4, need);
        for (let i = 0; i < len; i++) payload[i] = src[i] ^ key[i & 3];
      } else payload = Buffer.from(b.subarray(off, need));
      frames.push({ fin, opcode, masked, payload });
      this.buf = b.subarray(need);
    }
    return frames;
  }
}

export class WsError extends Error { constructor(code, message) { super(message); this.code = code; } }

/**
 * A WebSocket over a connected socket. role 'client' masks outgoing frames and
 * rejects masked incoming ones; 'server' the reverse.
 * Events: 'message' (string | Buffer, isBinary), 'close' ({ code, reason }), 'error' (Error), 'pong'.
 */
export class WebSocketConnection extends EventEmitter {
  constructor(socket, { role = 'client', maxMessage = DEFAULT_MAX_MESSAGE, head } = {}) {
    super();
    this.socket = socket;
    this.role = role;
    this.maxMessage = maxMessage;
    this.readyState = 1; // OPEN
    this.decoder = new FrameDecoder({ maxFrame: maxMessage });
    this.parts = null; // fragmented message being reassembled
    this.partsLen = 0;
    this.partsOp = 0;
    this.closeSent = false;
    this.closed = false;
    socket.setNoDelay?.(true);
    socket.on('data', (c) => this._onData(c));
    socket.on('close', () => this._finish(1006, ''));
    socket.on('error', (e) => { this.emit('error', e); });
    // Bytes that arrived with the upgrade: deliver after the caller has attached listeners.
    if (head && head.length) setImmediate(() => this._onData(head));
  }

  get bufferedAmount() { return this.socket.writableLength || 0; }

  _onData(chunk) {
    if (this.closed) return;
    let frames;
    try { frames = this.decoder.push(chunk); } catch (e) { return this._fail(e.code || 1002, e.message); }
    for (const f of frames) {
      if (this.closed) return;
      const expectMasked = this.role === 'server';
      if (f.masked !== expectMasked) return this._fail(1002, expectMasked ? 'client frames must be masked' : 'server frames must not be masked');
      switch (f.opcode) {
        case OP.TEXT: case OP.BINARY:
          if (this.parts) return this._fail(1002, 'new message inside a fragmented one');
          if (f.fin) { this._deliver(f.opcode, f.payload); break; }
          this.parts = [f.payload]; this.partsLen = f.payload.length; this.partsOp = f.opcode;
          break;
        case OP.CONT:
          if (!this.parts) return this._fail(1002, 'continuation without a message');
          this.partsLen += f.payload.length;
          if (this.partsLen > this.maxMessage) return this._fail(1009, 'message too large');
          this.parts.push(f.payload);
          if (f.fin) { const all = Buffer.concat(this.parts); const op = this.partsOp; this.parts = null; this.partsLen = 0; this._deliver(op, all); }
          break;
        case OP.PING: this._write(OP.PONG, f.payload); break;
        case OP.PONG: this.emit('pong', f.payload); break;
        case OP.CLOSE: {
          const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1005;
          const reason = f.payload.length > 2 ? f.payload.subarray(2).toString('utf8') : '';
          if (!this.closeSent) { this._write(OP.CLOSE, f.payload.length >= 2 ? f.payload.subarray(0, 2) : Buffer.alloc(0)); this.closeSent = true; }
          this.readyState = 2;
          this.socket.end();
          this._finish(code, reason);
          return;
        }
        default: return this._fail(1002, `unknown opcode ${f.opcode}`);
      }
    }
  }

  _deliver(opcode, payload) {
    if (opcode === OP.TEXT) this.emit('message', payload.toString('utf8'), false);
    else this.emit('message', payload, true);
  }

  _write(opcode, payload) {
    if (this.socket.destroyed) return false;
    return this.socket.write(encodeFrame(opcode, payload, { mask: this.role === 'client' }));
  }

  /** Send a text (string) or binary (Buffer) message. Returns false when the socket buffer is above its high-water mark. */
  send(data) {
    if (this.readyState !== 1) throw new WsError(1006, 'WebSocket is not open');
    return typeof data === 'string' ? this._write(OP.TEXT, Buffer.from(data, 'utf8')) : this._write(OP.BINARY, data);
  }

  ping(data = Buffer.alloc(0)) { if (this.readyState === 1) this._write(OP.PING, data); }

  close(code = 1000, reason = '') {
    if (this.closed || this.closeSent) return;
    const r = Buffer.from(String(reason).slice(0, 120), 'utf8');
    const p = Buffer.alloc(2 + r.length); p.writeUInt16BE(code, 0); r.copy(p, 2);
    this._write(OP.CLOSE, p);
    this.closeSent = true;
    this.readyState = 2;
    // Give the peer a moment to answer, then drop the socket.
    const t = setTimeout(() => this.socket.destroy(), 1000);
    t.unref?.();
  }

  terminate() { this.socket.destroy(); this._finish(1006, 'terminated'); }

  _fail(code, reason) {
    try { if (!this.closeSent) { const p = Buffer.alloc(2); p.writeUInt16BE(code, 0); this._write(OP.CLOSE, p); this.closeSent = true; } } catch { /* socket gone */ }
    this.emit('error', new WsError(code, reason));
    this.socket.destroy();
    this._finish(code, reason);
  }

  _finish(code, reason) {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.emit('close', { code, reason });
  }
}

/**
 * Connect to ws://host:port/path. Resolves with an open WebSocketConnection.
 * opts: { timeoutMs = 10000, headers, maxMessage }
 */
export function connectWebSocket(url, { timeoutMs = 10000, headers = {}, maxMessage } = {}) {
  const u = new URL(url);
  if (u.protocol !== 'ws:') return Promise.reject(new Error(`only ws:// is supported, got ${u.protocol}`));
  const key = crypto.randomBytes(16).toString('base64');
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err, ws) => { if (done) return; done = true; clearTimeout(timer); err ? reject(err) : resolve(ws); };
    const req = http.request({
      host: u.hostname, port: u.port || 80, path: `${u.pathname}${u.search}`, method: 'GET',
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', ...headers },
    });
    const timer = setTimeout(() => { req.destroy(new Error(`WebSocket connect timeout after ${timeoutMs} ms`)); }, timeoutMs);
    req.on('upgrade', (res, socket, head) => {
      if (res.headers['sec-websocket-accept'] !== acceptKey(key)) { socket.destroy(); return finish(new Error('bad Sec-WebSocket-Accept')); }
      finish(null, new WebSocketConnection(socket, { role: 'client', maxMessage, head }));
    });
    req.on('response', (res) => { res.resume(); finish(new Error(`WebSocket upgrade refused: HTTP ${res.statusCode}`)); });
    req.on('error', (e) => finish(e));
    req.end();
  });
}

/**
 * Server side: complete an http 'upgrade' and return the connection (or null after
 * answering 400). Use with http.createServer().on('upgrade', (req, socket, head) => …).
 */
export function acceptWebSocket(req, socket, head, { maxMessage } = {}) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return null;
  }
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
  return new WebSocketConnection(socket, { role: 'server', maxMessage, head });
}
