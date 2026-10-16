// The update budget for setImage / setFeedback, from the hardware lab on the owner's
// Galleon 100 SD + Stream Deck + (aaa-prism-ds/hardware-lab/RESULTS.md §6–7, 10):
//
//   - The app QUEUES, never drops: above ~230–300 updates/s in total (all devices, under
//     100% CPU) lag grows without bound, and at 60 fps × 12 keys its watchdog killed the
//     plugin ("Socket unresponsive"). → one shared budget of ~200 updates/s across every
//     device and both kinds (setImage + setFeedback), with headroom.
//   - Bytes are not the limit (10.4 MB/s of simple 64 KB frames kept up); per-frame render
//     cost is: 1,200 elements per frame collapsed at ~47/s, 300 was fine at 80/s.
//     → every update costs max(1, elements / 300) budget units, so heavy frames slow down.
//   - One key alone does 60 fps; 4 dials × 60 fps of setFeedback kept up. → a per-key cap
//     well above Elgato's "10 calls/s" guidance (which the app doesn't enforce).
//
// Per device: dedupe (identical to what the device shows → dropped), latest-wins coalescing
// (≤ 1 pending frame per context), presses first (priority frames skip the per-key interval
// and may borrow one burst from the shared bucket), and backpressure on the socket buffer.
// allocateFps() turns the shared budget into a fair fps per render unit.

export const DEFAULT_LIMITS = Object.freeze({
  updatesPerSec: 200,       // shared by every device and both kinds (setImage + setFeedback)
  perKeyPerSec: 30,         // per key / dial (one key measured clean at 60 fps)
  elementsPerUpdate: 300,   // a frame with more SVG elements costs proportionally more
  burstSeconds: 0.25,
  highWater: 256 * 1024,    // hold animation frames while more than this is waiting in the socket
  minFps: 0.5,
});

/** Clamp user-provided limits to sane ranges (global settings are untrusted). */
export function normalizeLimits(o = {}) {
  const num = (v, d, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  return {
    updatesPerSec: num(o.updatesPerSec, DEFAULT_LIMITS.updatesPerSec, 20, 1000),
    perKeyPerSec: num(o.perKeyPerSec, DEFAULT_LIMITS.perKeyPerSec, 1, 60),
    elementsPerUpdate: num(o.elementsPerUpdate, DEFAULT_LIMITS.elementsPerUpdate, 50, 5000),
    burstSeconds: num(o.burstSeconds, DEFAULT_LIMITS.burstSeconds, 0.05, 2),
    highWater: num(o.highWater, DEFAULT_LIMITS.highWater, 16 * 1024, 64 * 1024 * 1024),
    minFps: num(o.minFps, DEFAULT_LIMITS.minFps, 0.05, 10),
  };
}

/** SVG element count (opening tags) — the render-cost proxy the lab measured. */
export function elementCount(svg) {
  let n = 0;
  for (let i = svg.indexOf('<'); i >= 0; i = svg.indexOf('<', i + 1)) { const c = svg.charCodeAt(i + 1); if ((c >= 97 && c <= 122) || (c >= 65 && c <= 90)) n++; }
  return n;
}

/** Budget units one update costs. */
export const updateCost = (elements, limits = DEFAULT_LIMITS) => Math.max(1, (elements || 0) / (limits.elementsPerUpdate || 300));

export class TokenBucket {
  constructor(ratePerSec, capacity, now) { this.rate = ratePerSec; this.cap = Math.max(1, capacity); this.tokens = this.cap; this.now = now; this.t = now(); }
  refill() { const t = this.now(); this.tokens = Math.min(this.cap, this.tokens + ((t - this.t) / 1000) * this.rate); this.t = t; }
  has(n = 1) { this.refill(); return this.tokens >= n; }
  take(n = 1) { this.refill(); this.tokens -= n; }
  /** ms until n tokens are available. */
  waitMs(n = 1) { this.refill(); return this.tokens >= n ? 0 : Math.ceil(((n - this.tokens) / this.rate) * 1000); }
  setRate(rate, cap) { this.refill(); this.rate = rate; this.cap = Math.max(1, cap); this.tokens = Math.min(this.tokens, this.cap); }
}

/** The plugin-wide update bucket (share one between every DeviceBudget). */
export const createUpdateBucket = (limits = {}, now = () => performance.now()) => { const l = normalizeLimits(limits); return new TokenBucket(l.updatesPerSec, Math.max(4, l.updatesPerSec * l.burstSeconds), now); };

/**
 * Water-filling: give every unit min(desired fps, per-key cap, r) where r is the largest
 * per-update rate that keeps Σ fps × images within the budget. `images` = updates per
 * frame (members × cost). demands: [{ id, fps, images }] → Map(id → fps)
 */
export function allocateFps(budgetPerSec, demands, { perKeyPerSec = DEFAULT_LIMITS.perKeyPerSec, minFps = DEFAULT_LIMITS.minFps } = {}) {
  const out = new Map();
  const list = demands.filter((d) => d.fps > 0 && d.images > 0).map((d) => ({ ...d, want: Math.min(d.fps, perKeyPerSec) }));
  for (const d of demands) if (!(d.fps > 0 && d.images > 0)) out.set(d.id, 0);
  const total = list.reduce((s, d) => s + d.want * d.images, 0);
  if (total <= budgetPerSec) { for (const d of list) out.set(d.id, d.want); return out; }
  list.sort((a, b) => a.want - b.want);
  let remaining = budgetPerSec;
  let weight = list.reduce((s, d) => s + d.images, 0);
  let i = 0;
  for (; i < list.length; i++) {
    const r = remaining / weight;
    if (list[i].want <= r) { out.set(list[i].id, list[i].want); remaining -= list[i].want * list[i].images; weight -= list[i].images; }
    else break;
  }
  const r = weight > 0 ? remaining / weight : 0;
  for (; i < list.length; i++) out.set(list[i].id, Math.max(minFps, Math.floor(r * 100) / 100));
  return out;
}

const KINDS = ['image', 'feedback'];

/**
 * One device's queue on the shared budget.
 * opts: { send(context, kind, payload) → boolean, now() → ms, setTimer, clearTimer, buffered() → bytes, limits,
 *         updates: the shared TokenBucket (createUpdateBucket) }
 */
export class DeviceBudget {
  constructor({ send, now = () => performance.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h), buffered = () => 0, limits = {}, updates = null } = {}) {
    this._send = send;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.buffered = buffered;
    this.limits = normalizeLimits(limits);
    this.updates = updates || createUpdateBucket(this.limits, now);
    this.last = new Map();     // `${kind}|${context}` → last sent key
    this.lastAt = new Map();   // `${kind}|${context}` → ms of last send
    this.pending = new Map();  // `${kind}|${context}` → { context, kind, payload, key, cost, priority, at }
    this.timer = null;
    this.timerAt = Infinity;
    this.stats = { submitted: 0, sent: 0, deduped: 0, coalesced: 0, deferred: 0, backpressure: 0, failed: 0, cost: 0 };
  }

  /** Per-device view of the limits (the shared bucket's rate is set by the runtime once). */
  setLimits(limits) { this.limits = normalizeLimits(limits); }

  /**
   * Offer a frame. payload: string (setImage data URL) or object (setFeedback); cost: budget units (updateCost()).
   * → 'sent' | 'deduped' | 'queued'
   */
  submit(context, kind, payload, { priority = false, cost = 1 } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`unknown kind ${kind}`);
    this.stats.submitted++;
    const id = `${kind}|${context}`;
    const key = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (this.last.get(id) === key) {
      // Identical to what the device already shows: nothing to send (a stale pending frame is moot too).
      this.pending.delete(id);
      this.stats.deduped++;
      return 'deduped';
    }
    const prev = this.pending.get(id);
    if (prev) this.stats.coalesced++;
    const item = { context, kind, payload, key, cost: Math.max(1, cost), priority: priority || !!prev?.priority, at: prev?.at ?? this.now() };
    if (this._canSend(item)) { this.pending.delete(id); this._do(item); return 'sent'; }
    this.pending.set(id, item);
    this.stats.deferred++;
    this._schedule();
    return 'queued';
  }

  _keyWait(item) {
    const at = this.lastAt.get(`${item.kind}|${item.context}`);
    return at === undefined ? 0 : Math.ceil(1000 / this.limits.perKeyPerSec - (this.now() - at) - 0.5);
  }

  _canSend(item) {
    if (!item.priority) {
      if (this.buffered() > this.limits.highWater) { this.stats.backpressure++; return false; }
      if (this._keyWait(item) > 0) return false;
    }
    // Deficit bucket: a frame goes once the bucket is positive and its whole cost goes into
    // debt (heavy frames never starve behind light ones; the average stays in budget).
    // Presses may borrow one more burst.
    this.updates.refill();
    return this.updates.tokens > (item.priority ? -this.updates.cap : 0);
  }

  _waitFor(item) {
    this.updates.refill();
    let w = item.priority ? 0 : Math.ceil((Math.max(0, 0.001 - this.updates.tokens) / this.updates.rate) * 1000);
    if (!item.priority) {
      w = Math.max(w, this._keyWait(item));
      if (this.buffered() > this.limits.highWater) w = Math.max(w, 25);
    }
    return Math.max(1, w);
  }

  _do(item) {
    const id = `${item.kind}|${item.context}`;
    let ok = false;
    try { ok = this._send(item.context, item.kind, item.payload) !== false; } catch { ok = false; }
    if (!ok) { this.stats.failed++; return; }
    this.updates.take(item.cost);
    this.stats.cost += item.cost;
    this.last.set(id, item.key);
    this.lastAt.set(id, this.now());
    this.stats.sent++;
  }

  /** Send whatever is allowed now, priority first, then oldest. */
  flush() {
    this.timer = null;
    this.timerAt = Infinity;
    const items = [...this.pending.values()].sort((a, b) => (b.priority - a.priority) || (a.at - b.at));
    for (const it of items) {
      const id = `${it.kind}|${it.context}`;
      if (this.pending.get(id) !== it) continue;
      if (this._canSend(it)) { this.pending.delete(id); this._do(it); }
    }
    if (this.pending.size) this._schedule();
  }

  _schedule() {
    if (!this.pending.size) return;
    let w = Infinity;
    for (const it of this.pending.values()) w = Math.min(w, this._waitFor(it));
    const at = this.now() + w;
    if (this.timer !== null && this.timerAt <= at) return;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timerAt = at;
    this.timer = this.setTimer(() => this.flush(), w);
    this.timer?.unref?.();
  }

  /** The next frame to this context is sent even if identical (after sleep / a host redraw). */
  invalidate(context) {
    if (context === undefined) { this.last.clear(); return; }
    for (const k of KINDS) this.last.delete(`${k}|${context}`);
  }

  /** Context went away: drop its pending frame and memory. */
  forget(context) {
    for (const k of KINDS) { const id = `${k}|${context}`; this.pending.delete(id); this.last.delete(id); this.lastAt.delete(id); }
  }

  dispose() { if (this.timer !== null) this.clearTimer(this.timer); this.timer = null; this.pending.clear(); }
}
