// Native-messaging connection to Prism Control (through prism-relay.exe), with reconnect backoff
// (browser.md §6.1) and the hello/welcome handshake (PROTOCOL.md §3).
//
// Backoff: 1 s, doubling to 30 s while the host keeps failing; 5 min while the host is not installed
// or forbids our id. The backoff resets only once the host has actually spoken (any frame), because
// connectNative() itself never fails synchronously for a missing host. The next attempt time is kept
// in storage.session so a restarted service worker (woken by the 30 s alarm) honours it.

import { PROTO, T, STATUS, LIMITS } from '../shared/protocol.js';
import { utf8Length } from '../shared/util.js';

export const BACKOFF_MIN_MS = 1000;
export const BACKOFF_MAX_MS = 30_000;
export const BACKOFF_MISSING_MS = 5 * 60_000;
export const HELLO_RETRY_MS = [5000, 10_000, 20_000, 30_000];
export const CONNECTING_GRACE_MS = 5000;

export function classifyDisconnect(message) {
  const m = String(message || '').toLowerCase();
  if (m.includes('not found')) return STATUS.HOST_MISSING;
  if (m.includes('forbidden')) return STATUS.HOST_FORBIDDEN;
  return STATUS.HOST_ERROR;
}

export class NativeConnection {
  constructor({ chrome, hostName, clock, random = Math.random, onWelcome, onMessage, onSessionEnd, onStatus, hello, connectNative, log = () => {} }) {
    this.chrome = chrome;
    // Replaceable for the browser tests, which simulate the relay inside the real worker.
    this.connectNative = connectNative || ((name) => this.chrome.runtime.connectNative(name));
    this.hostName = hostName;
    this.clock = clock;
    this.random = random;
    this.onWelcome = onWelcome;          // (welcomeData) => void
    this.onMessage = onMessage;          // (msg) => void, only after welcome
    this.onSessionEnd = onSessionEnd;    // () => void: stop publishing
    this.onStatus = onStatus || (() => {});
    this.hello = hello;                  // () => hello data
    this.log = log;
    this.port = null;
    this.status = STATUS.IDLE;
    this.detail = '';
    this.backoffMs = BACKOFF_MIN_MS;
    this.nextAt = 0;
    this.retryTimer = null;
    this.helloTimer = null;
    this.helloTry = 0;
    this.welcomed = false;
    this.helloSent = false;
    this.heardFromHost = false;
    this.seq = 0;
    this.openedAt = 0;
    this.connectedAt = 0;
    this.welcome = null;
  }

  async restore() {
    try {
      const { conn } = await this.chrome.storage.session.get('conn');
      if (conn && typeof conn === 'object') {
        if (Number.isFinite(conn.backoffMs)) this.backoffMs = Math.min(Math.max(conn.backoffMs, BACKOFF_MIN_MS), BACKOFF_MISSING_MS);
        if (Number.isFinite(conn.nextAt)) this.nextAt = conn.nextAt;
        if (typeof conn.status === 'string' && conn.status !== STATUS.CONNECTED && conn.status !== STATUS.CONNECTING) this.setStatus(conn.status, conn.detail || '');
      }
    } catch { /* storage.session unavailable: start fresh */ }
  }

  persist() {
    const conn = { backoffMs: this.backoffMs, nextAt: this.nextAt, status: this.status, detail: this.detail };
    try { this.chrome.storage.session.set({ conn }).catch?.(() => {}); } catch { /* ignore */ }
  }

  setStatus(s, detail = '') {
    if (this.status === s && this.detail === detail) return;
    this.status = s;
    this.detail = detail;
    this.persist();
    this.onStatus(s, detail);
  }

  /** Connects now if no attempt is pending; otherwise makes sure a timer is set for the due time. */
  connectIfDue(reason = 'auto') {
    if (this.port) return;
    const now = this.clock.now();
    if (reason !== 'manual' && now < this.nextAt) {
      if (!this.retryTimer) this.retryTimer = this.clock.setTimeout(() => { this.retryTimer = null; this.connectIfDue('timer'); }, this.nextAt - now);
      return;
    }
    if (this.retryTimer) { this.clock.clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.connect();
  }

  /** User pressed "Retry now": forget the backoff. */
  retryNow() {
    this.backoffMs = BACKOFF_MIN_MS;
    this.nextAt = 0;
    if (this.port) { this.sendHello(); return; }
    this.connectIfDue('manual');
  }

  connect() {
    this.heardFromHost = false;
    this.welcomed = false;
    this.helloSent = false;
    this.seq = 0;
    let port;
    try {
      port = this.connectNative(this.hostName);
    } catch (e) {
      this.failed(String(e && e.message || e));
      return;
    }
    this.port = port;
    this.openedAt = this.clock.now();
    port.onMessage.addListener((m) => this.handle(m));
    port.onDisconnect.addListener(() => {
      const err = this.chrome.runtime.lastError ? this.chrome.runtime.lastError.message : '';
      if (this.port !== port) return;
      this.port = null;
      this.endSession();
      this.failed(err || 'Native host has exited.');
    });
    this.setStatus(STATUS.CONNECTING);
    this.helloTry = 0;
    this.sendHello();
  }

  failed(message) {
    const status = classifyDisconnect(message);
    let delay;
    if (status === STATUS.HOST_MISSING || status === STATUS.HOST_FORBIDDEN) {
      delay = BACKOFF_MISSING_MS;
      this.backoffMs = BACKOFF_MIN_MS;
    } else {
      delay = this.backoffMs;
      this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
    }
    const jitter = 1 + (this.random() * 0.2 - 0.1);
    delay = Math.round(delay * jitter);
    this.nextAt = this.clock.now() + delay;
    this.setStatus(status, message);
    this.log('native port closed', status, message, 'retry in', delay);
    if (this.retryTimer) this.clock.clearTimeout(this.retryTimer);
    this.retryTimer = this.clock.setTimeout(() => { this.retryTimer = null; this.connectIfDue('timer'); }, delay);
  }

  endSession() {
    if (this.helloTimer) { this.clock.clearTimeout(this.helloTimer); this.helloTimer = null; }
    const was = this.welcomed;
    this.welcomed = false;
    this.welcome = null;
    if (was) this.onSessionEnd();
  }

  /**
   * Sends hello (and schedules the next retry). `hello()` returns null until the app has loaded the profile uid
   * and the user's privacy settings: then nothing is posted, the retry timer stays, and the app calls
   * `helloNow()` once it is ready. A hello with defaults would make the plugin see the wrong profile and level.
   */
  sendHello() {
    if (!this.port) return;
    const data = this.hello();
    if (data && this.post(T.HELLO, data, true)) this.helloSent = true;
    if (this.helloTimer) this.clock.clearTimeout(this.helloTimer);
    const wait = HELLO_RETRY_MS[Math.min(this.helloTry, HELLO_RETRY_MS.length - 1)];
    this.helloTry++;
    this.helloTimer = this.clock.setTimeout(() => {
      this.helloTimer = null;
      if (!this.port || this.welcomed) return;
      // No welcome yet: the plugin is not (yet) listening behind the relay.
      if (this.status === STATUS.CONNECTING && this.clock.now() - this.openedAt >= CONNECTING_GRACE_MS) this.setStatus(STATUS.PLUGIN_DOWN, 'no welcome');
      this.sendHello();
    }, wait);
  }

  /** The app became ready while a port was already open: say hello now instead of at the next retry. */
  helloNow() {
    if (!this.port || this.welcomed || this.helloSent) return;
    this.helloTry = 0;
    this.sendHello();
  }

  handle(msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    if (!this.heardFromHost) { this.heardFromHost = true; this.backoffMs = BACKOFF_MIN_MS; this.nextAt = 0; this.persist(); }
    let size = 0;
    try { size = utf8Length(JSON.stringify(msg)); } catch { return; }
    if (size > LIMITS.inMaxBytes) {
      this.log('dropped oversize frame', size);
      if (this.welcomed && msg.t === T.CMD && Number.isInteger(msg.id)) {
        this.post(T.RESULT, undefined, false, { id: msg.id, ok: false, error: { code: 'bad_args', message: 'frame too large' } });
      }
      return;
    }
    switch (msg.t) {
      case T.RELAY_DOWN:
        this.endSession();
        this.setStatus(STATUS.PLUGIN_DOWN, 'relay.down');
        this.helloTry = HELLO_RETRY_MS.length - 1;
        this.sendHello();       // fallback for relays that never send relay.up; harmless otherwise
        return;
      case T.RELAY_UP:
        this.endSession();
        this.helloTry = 0;
        this.sendHello();
        return;
      case T.WELCOME: {
        if (msg.v !== PROTO) { this.setStatus(STATUS.PROTO_MISMATCH, `v=${msg.v}`); return; }
        const data = msg.data && typeof msg.data === 'object' ? msg.data : {};
        if (data.proto !== undefined && data.proto !== PROTO) { this.setStatus(STATUS.PROTO_MISMATCH, `proto=${data.proto}`); return; }
        if (this.helloTimer) { this.clock.clearTimeout(this.helloTimer); this.helloTimer = null; }
        if (this.welcomed) this.onSessionEnd();
        this.welcomed = true;
        this.welcome = data;
        this.connectedAt = this.clock.now();
        this.setStatus(STATUS.CONNECTED);
        this.onWelcome(data);
        return;
      }
      default:
        if (msg.v !== PROTO) return;
        if (this.welcomed) this.onMessage(msg);
    }
  }

  /**
   * Posts one message. `force` allows sending before welcome (hello only). Returns false if not sent.
   * `extra` merges envelope fields (result: id/ok/error).
   */
  post(t, data, force = false, extra = null) {
    if (!this.port || (!this.welcomed && !force)) return false;
    const msg = { v: PROTO, t, seq: ++this.seq, at: this.clock.now() };
    if (extra) Object.assign(msg, extra);
    if (data !== undefined) msg.data = data;
    let size;
    try { size = utf8Length(JSON.stringify(msg)); } catch { return false; }
    if (size > LIMITS.outMaxBytes) { this.log('refused oversize message', t, size); return false; }
    try { this.port.postMessage(msg); return true; } catch (e) { this.log('post failed', String(e)); return false; }
  }

  close() {
    if (this.port) { try { this.port.disconnect(); } catch { /* ignore */ } }
    this.port = null;
    this.endSession();
  }
}
