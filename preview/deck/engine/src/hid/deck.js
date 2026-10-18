// HidDeck — one physical deck over hidraw: claim → open → reset stream →
// (feature helper, Galleon keep-alive) → images out, input events in.
//
//   const deck = await HidDeck.open(info);            // info from listDecks(); throws EBUSY when claimed
//   await deck.setKey(0, img);                        // img { data: RGBA, w, h } at the native key px
//   await deck.setLcd(img, { x: 200, y: 0, w: 200, h: 100 });   // + strip segment / Galleon widget / Neo info bar
//   deck.on('input', (ev) => …);                      // { type: 'down', key } · { type: 'rotate', dial, ticks } …
//   await deck.close();                               // logo (helper) or black keys; Galleon → standalone mode
//
// Frame pacing: every image is one atomic group of reports per target ('key:3', 'lcd:0,0,200,100').
// Identical pixels are dropped (dedupe per target); a newer frame for a target that hasn't been sent
// yet replaces the pending one (latest wins — never a backlog); groups go out through a token bucket
// of `budget` reports/s. Every report is checked against the documented-report allowlist first.

import { EventEmitter } from 'node:events';
import { encodeKeyImage } from '../raster/index.js';
import { claimDeck, HidError } from './claim.js';
import { openHidraw } from './transport.js';
import { packets, checkOutputReport } from './packets.js';
import { features, galleonRingIndex } from './features.js';
import { createInputParser } from './input.js';
import { startFeatureHelper } from './helper.js';
import { hidKey } from './models.js';
import { dim, solid, hashBytes } from './pixels.js';

const QUALITY = { key: 90, lcd: 85 };

export class HidDeck extends EventEmitter {
  /**
   * Claim and open a deck. opts:
   *   transport          an already-open transport (tests, --dry-run); otherwise openHidraw(info.path)
   *   claim (true)       refuse when another process / app holds the deck (EBUSY); force skips the app heuristic only
   *   helper ('auto')    'auto' | true (required) | false | a started helper; Galleon always requires one
   *   startHelper, openTransport, encode, now, setTimer, clearTimer, pollMs (8), budget (reports/s), quality, proc, lockDir, fs
   */
  static async open(info, opts = {}) {
    const m = info.model;
    // Composite devices: never open anything but the deck interface (the Galleon's other hidraw nodes are its keyboard).
    if (m.iface !== undefined && !opts.transport && info.iface !== m.iface) throw new HidError('EINVAL', `${info.path} is USB interface ${info.iface ?? '?'} of the ${m.name}, not its deck interface ${m.iface}; refusing to open it`);
    let lock = null, transport = null, helper = null, deck = null;
    try {
      if (opts.claim !== false) lock = claimDeck(info, { force: opts.force, proc: opts.proc, fs: opts.claimFs, lockDir: opts.lockDir, isAlive: opts.isAlive });
      transport = opts.transport || await (opts.openTransport || openHidraw)(info.path, { fs: opts.fs });
      const wantHelper = opts.helper && typeof opts.helper === 'object' ? opts.helper : m.keepAlive ? true : opts.helper ?? 'auto';
      if (wantHelper && typeof wantHelper === 'object') helper = wantHelper;
      else if (wantHelper) {
        try { helper = await (opts.startHelper || startFeatureHelper)(info.path, { onAsync: (l) => deck?.emit('helper', l) }); } catch (e) {
          if (wantHelper === true) throw m.keepAlive ? new HidError('ENOHELPER', `${m.name} ignores every command until it gets a feature-report keep-alive every 500 ms, which needs python3 (${e.message})`, { cause: e }) : e;
          helper = null;
        }
      }
      deck = new HidDeck(info, { ...opts, transport, helper, lock });
      if (m.keepAlive) await helper.keepAlive(m.keepAlive.ms, m.keepAlive.report);
      if (opts.reset !== false && m.resetStream && !m.inputOnly) await deck.#write(packets.resetStream(m.outLen));
      deck.#startPolling();
      return deck;
    } catch (e) {
      try { helper?.close(); } catch { /* ignore */ }
      try { transport?.close(); } catch { /* ignore */ }
      lock?.release();
      throw e;
    }
  }

  constructor(info, { transport, helper = null, lock = null, encode = encodeKeyImage, now, setTimer, clearTimer, pollMs = 8, budget, quality } = {}) {
    super();
    this.info = info;
    this.model = info.model;
    this.transport = transport;
    this.helper = helper;
    this.lock = lock;
    this.encode = encode;
    this.now = now || (() => Date.now());
    this.setTimer = setTimer || ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = clearTimer || ((h) => clearTimeout(h));
    this.pollMs = pollMs;
    this.quality = { ...QUALITY, ...(quality || {}) };
    this.rate = Math.max(10, budget || this.model.budget);
    this.burst = Math.max(64, Math.round(this.rate / 2));
    this.tokens = this.burst;
    this.refillAt = this.now();
    this.dimLevel = 1;
    this.brightnessMode = helper ? 'hardware' : 'software';
    this.parser = createInputParser(this.model);
    this.pending = new Map();   // target → { pkts, done[] }
    this.lastHash = new Map();  // target → hash of the last frame queued
    this.sending = false;
    this.pumpTimer = null;
    this.closed = false;
    this.stats = { frames: 0, deduped: 0, superseded: 0, reports: 0, bytes: 0, inputs: 0 };
    this.idle = [];
  }

  get keyCount() { return this.model.keys; }

  // ---------- images ----------

  /** A key image at the model's native key px (logical orientation). Resolves true when written, false when deduped / superseded. */
  setKey(key, img) {
    const m = this.model;
    if (!m.key) return Promise.reject(new HidError('EINVAL', `${m.name} has no key displays`));
    if (!(key >= 0 && key < m.keys)) return Promise.reject(new RangeError(`key ${key} outside 0–${m.keys - 1}`));
    if (img.w !== m.key.w || img.h !== m.key.h) return Promise.reject(new RangeError(`key image must be ${m.key.w}×${m.key.h}, got ${img.w}×${img.h}`));
    return this.#submit(`key:${key}`, img, (src) => {
      const bytes = this.encode(src, { fmt: m.keyFmt, xf: m.keyXf, ppm: m.ppm, quality: this.quality.key });
      if (m.proto === 'orig') return packets.orig(hidKey(m, key), bytes);
      if (m.proto === 'mini') return packets.mini(key, bytes);
      return packets.gen2Key(key, bytes);
    });
  }

  /** The strip / screen / info bar. rect: logical { x, y, w, h } inside the LCD (default: all of it; the Neo info bar is whole-window only). */
  setLcd(img, rect) {
    const L = this.model.lcd;
    if (!L) return Promise.reject(new HidError('EINVAL', `${this.model.name} has no strip or screen`));
    const r = rect || { x: 0, y: 0, w: L.w, h: L.h };
    if (img.w !== r.w || img.h !== r.h) return Promise.reject(new RangeError(`LCD image must be ${r.w}×${r.h}, got ${img.w}×${img.h}`));
    if (r.x < 0 || r.y < 0 || r.x + r.w > L.w || r.y + r.h > L.h) return Promise.reject(new RangeError(`region ${r.x},${r.y} ${r.w}×${r.h} outside the ${L.w}×${L.h} ${L.kind}`));
    if (L.cmd === 0x0b && (r.x || r.y || r.w !== L.w || r.h !== L.h)) return Promise.reject(new RangeError('the Neo info bar only takes whole-window images'));
    return this.#submit(`lcd:${r.x},${r.y},${r.w},${r.h}`, img, (src) => {
      const bytes = this.encode(src, { fmt: 'jpeg', xf: L.xf, quality: this.quality.lcd });
      return L.cmd === 0x0b ? packets.window(bytes) : packets.region(r.x, r.y, r.w, r.h, bytes);
    });
  }

  /** Black on every key and the whole LCD (no feature report needed). */
  async clear() {
    const m = this.model, jobs = [];
    if (m.key) for (let k = 0; k < m.keys; k++) jobs.push(this.setKey(k, solid(m.key.w, m.key.h)));
    if (m.lcd) jobs.push(this.setLcd(solid(m.lcd.w, m.lcd.h)));
    await Promise.all(jobs);
    await this.flush();
  }

  /** Forget what was sent (forces the next frame of every target out, e.g. after a brightness change). */
  invalidate() { this.lastHash.clear(); this.emit('invalidate'); }

  // ---------- feature reports ----------

  /** Brightness 0–100: hardware through the helper, else software dimming of every frame. → 'hardware' | 'software' */
  async setBrightness(pct) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    if (this.helper) {
      try {
        await this.#feature((len) => features.brightness(this.model, p, len));
        if (this.dimLevel !== 1) { this.dimLevel = 1; this.invalidate(); }
        return (this.brightnessMode = 'hardware');
      } catch (e) { this.emit('warning', `hardware brightness failed (${e.message}); dimming in software`); }
    }
    const k = p / 100;
    if (k !== this.dimLevel) { this.dimLevel = k; this.invalidate(); }
    return (this.brightnessMode = 'software');
  }

  /** The firmware logo (helper only). */
  showLogo() { return this.helper ? this.#feature((len) => features.showLogo(this.model, len)) : Promise.reject(new HidError('ENOHELPER', 'show-logo needs the feature helper')); }

  /** Dial ring LEDs: Studio (24 per ring, output report) or Galleon (4 per dial, feature reports). colors: [[r, g, b], …] */
  async setRing(dial, colors) {
    const R = this.model.ring;
    if (!R) throw new HidError('EINVAL', `${this.model.name} has no ring LEDs`);
    if (R.kind === 'studio') {
      const rgb = new Uint8Array(72), off = R.offsets[dial] || 0;
      for (let i = 0; i < 24; i++) rgb.set((colors[(i - off + 24) % 24] || [0, 0, 0]).slice(0, 3), i * 3);
      return this.#write(packets.studioRing(dial, rgb));
    }
    if (!this.helper) throw new HidError('ENOHELPER', 'Galleon ring LEDs need the feature helper');
    for (let i = 0; i < R.leds; i++) { const [r, g, b] = colors[i] || [0, 0, 0]; await this.helper.set(features.galleonRingPixel(galleonRingIndex(dial, i, R.offsets), r, g, b)); }
  }

  async #feature(build) {
    let last;
    for (const len of this.model.feature.lens) {
      try { return await this.helper.set(build(len)); } catch (e) { last = e; if (e.code === 'EREFUSED') break; }
    }
    throw last;
  }

  // ---------- pacing ----------

  #submit(target, img, toPackets) {
    if (this.closed) return Promise.reject(new HidError('ENODEV', `${this.info.path} is closed`));
    const h = hashBytes(img.data, Math.round(this.dimLevel * 1000) ^ 0x811c9dc5);
    if (this.lastHash.get(target) === h) { this.stats.deduped++; return Promise.resolve(false); }
    let pkts;
    try { pkts = toPackets(this.dimLevel === 1 ? img : dim(img, this.dimLevel)); } catch (e) { return Promise.reject(e); }
    for (const p of pkts) { const why = checkOutputReport(p, this.model); if (why) return Promise.reject(new HidError('EREFUSED', `refused output report: ${why}`)); }
    this.lastHash.set(target, h);
    this.stats.frames++;
    return new Promise((resolve, reject) => {
      const prev = this.pending.get(target);
      if (prev) { this.stats.superseded++; for (const d of prev.done) d.resolve(false); }
      this.pending.set(target, { pkts, done: [{ resolve, reject }] });
      this.#pump();
    });
  }

  #pump() {
    if (this.sending || this.closed || this.pumpTimer !== null) return;
    const first = this.pending.entries().next();
    if (first.done) { for (const r of this.idle.splice(0)) r(); return; }
    const [target, job] = first.value;
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.refillAt) * this.rate) / 1000);
    this.refillAt = t;
    const need = Math.min(job.pkts.length, this.burst);
    if (this.tokens < need) {
      const wait = Math.ceil(((need - this.tokens) * 1000) / this.rate);
      this.pumpTimer = this.setTimer(() => { this.pumpTimer = null; this.#pump(); }, wait);
      return;
    }
    this.tokens -= job.pkts.length;
    this.pending.delete(target);
    this.sending = true;
    this.#write(job.pkts).then(
      () => { this.sending = false; for (const d of job.done) d.resolve(true); this.#pump(); },
      (e) => { this.sending = false; for (const d of job.done) d.reject(e); this.#pump(); },
    );
  }

  async #write(pkts) {
    for (const p of pkts) {
      const why = checkOutputReport(p, this.model);
      if (why) throw new HidError('EREFUSED', `refused output report: ${why}`);
    }
    try {
      for (const p of pkts) { await this.transport.write(p); this.stats.reports++; this.stats.bytes += p.length; }
    } catch (e) { this.#fail(e); throw e; }
  }

  /** Resolves when nothing is pending or in flight. */
  flush() {
    if (!this.sending && !this.pending.size) return Promise.resolve();
    return new Promise((r) => this.idle.push(r));
  }

  // ---------- input ----------

  #startPolling() {
    if (!this.pollMs) return;
    this.pollTimer = setInterval(() => this.poll(), this.pollMs);
  }

  /** Drain pending input reports (called on the poll timer; tests call it directly). → events */
  poll() {
    const out = [];
    for (let i = 0; i < 64 && !this.closed; i++) {
      let r;
      try { r = this.transport.read(); } catch (e) { this.#fail(e); break; }
      if (!r) break;
      for (const ev of this.parser.parse(r)) { this.stats.inputs++; out.push(ev); this.emit('input', ev); }
    }
    return out;
  }

  // ---------- lifecycle ----------

  #fail(e) {
    if (this.closed) return;
    this.#teardown();
    this.emit('disconnect', e);
  }

  #teardown() {
    this.closed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.pumpTimer !== null) { this.clearTimer(this.pumpTimer); this.pumpTimer = null; }
    for (const job of this.pending.values()) for (const d of job.done) d.resolve(false);
    this.pending.clear();
    for (const r of this.idle.splice(0)) r();
    try { this.helper?.close(); } catch { /* gone */ }
    try { this.transport.close(); } catch { /* gone */ }
    this.lock?.release();
  }

  /**
   * Close: finish in-flight frames, then leave the deck tidy — the firmware logo when the helper is
   * there, else black keys (blank: false keeps the last frame). The Galleon needs nothing: when the
   * keep-alive stops it returns to its standalone (numpad / volume) mode by itself.
   */
  async close({ blank = true } = {}) {
    if (this.closed) return;
    try {
      await this.flush();
      if (blank && !this.model.keepAlive && !this.model.inputOnly) {
        let logo = false;
        if (this.helper) { try { await this.showLogo(); logo = true; } catch { /* fall back */ } }
        if (!logo) { this.dimLevel = 1; this.lastHash.clear(); await this.clear(); }
      }
    } catch { /* unplugged while closing */ }
    if (!this.closed) this.#teardown();
  }
}
