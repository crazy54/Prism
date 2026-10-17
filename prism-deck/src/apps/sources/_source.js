// Building blocks for data sources (see README.md for the interface). Browser-safe.
//
//   simulatedSource({ id, provides, rate, compute(tSeconds, seed) })   pure, cached per 1/rate s
//   createPoller({ probes, rate, setTimer, clearTimer, now })          single-flight, throttled probes
//   History(capacity)                                                  number ring, oldest first
//
// A source never samples inside snapshot(): live sources sample on their own timer (at most
// `rate` Hz, each probe at most every `every` s, one run in flight); snapshot() only reads.

/** Fixed-capacity number history, oldest first (plain arrays: snapshots are handed to renders). */
export class History {
  constructor(capacity = 60) { this.cap = Math.max(2, capacity | 0); this.buf = []; }
  push(v) { this.buf.push(Number.isFinite(v) ? v : 0); if (this.buf.length > this.cap) this.buf.shift(); return this; }
  values() { return this.buf.slice(); }
  get length() { return this.buf.length; }
}

const r4 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : x);
/** Round numbers (deeply) to 4 decimals: stable strings → better per-key frame dedupe. */
export function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = stable(v[k]); return o; }
  return r4(v);
}

/**
 * A simulated source: snapshot(nowMs) = compute(t, seed) with t quantized to the source's rate,
 * so equal instants give equal (cached) objects and a 1 Hz source changes once a second.
 */
export function simulatedSource({ id, provides, rate = 1, seed = 7, now = () => Date.now(), compute }) {
  let key = null, cache = null, running = false;
  return {
    id, provides: [...provides], rate, mode: 'simulated',
    get running() { return running; },
    start() { running = true; return this; },
    stop() { running = false; return this; },
    snapshot(nowMs = now()) {
      const q = Math.floor((nowMs / 1000) * rate + 1e-9);
      if (q !== key) { key = q; cache = stable(compute(q / rate, seed)); }
      return cache;
    },
    status() { return { id, mode: 'simulated', running, rate }; },
  };
}

/**
 * Runs probes on a timer: probe = { id, every (s), run(nowMs) → value | Promise<value>, timeoutMs? }.
 * A probe runs only when due and not already in flight; failures are counted (after `maxFails`
 * in a row the probe is marked unavailable and stops running; a null result means "not available
 * on this machine" and stops it at once). onResult(id, value, nowMs, dead).
 */
export function createPoller({ probes, rate = 1, setTimer, clearTimer, now, onResult = () => {}, onTick = () => {}, maxFails = 3 }) {
  const st = new Map(probes.map((p) => [p.id, { due: 0, busy: false, fails: 0, dead: false, runs: 0 }]));
  let timer = null, running = false;
  const interval = 1000 / Math.max(0.05, rate);
  function tick() {
    timer = null;
    if (!running) return;
    const t = now();
    for (const p of probes) {
      const s = st.get(p.id);
      if (s.dead || s.busy || t < s.due) continue;
      s.due = t + Math.max(interval, (p.every ?? 1 / rate) * 1000) - 5;
      s.busy = true; s.runs++;
      // undefined = this run failed (retried; dead after maxFails in a row) · null = not available here (stop)
      const done = (v) => { s.busy = false; if (v === undefined) { if (++s.fails >= maxFails) s.dead = true; } else { s.fails = 0; if (v === null) s.dead = true; } onResult(p.id, v, now(), s.dead); };
      try {
        const r = p.run(t);
        if (r && typeof r.then === 'function') r.then(done, () => done(undefined));
        else done(r);
      } catch { done(undefined); }
    }
    onTick(t);
    if (running) timer = setTimer(tick, interval);
  }
  return {
    start() { if (!running) { running = true; timer = setTimer(tick, 0); } return this; },
    stop() { running = false; if (timer !== null) clearTimer(timer); timer = null; return this; },
    get running() { return running; },
    state: (id) => ({ ...st.get(id) }),
    alive: (id) => !st.get(id)?.dead,
  };
}
