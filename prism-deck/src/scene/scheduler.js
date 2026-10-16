// Frame scheduler — many animated slots, one timer, per-slot fps.
//
// Shared by the plugin (Node, setTimeout) and the web runtime (rAF). Each slot
// declares an fps; the scheduler wakes when the earliest slot is due, ticks
// every due slot (within a per-pump time budget, rotating who goes first so no
// slot starves), and sleeps entirely when nothing is animating.
//
//   const s = createScheduler({ cap: 15 });
//   const slot = s.add({ fps: 10, active: () => visible, tick: (nowMs) => draw() });
//   s.remove(slot);

import { TOKENS } from './tokens.js';

export const FPS_CAP = TOKENS.deck.fps.cap;

/**
 * Effective fps for a facet: its hint, capped; 0 when it should not animate
 * (still facet, reduced motion, or paused).
 */
export function effectiveFps(facet, { cap = FPS_CAP, reduced = false } = {}) {
  if (!facet || !facet.animated || reduced) return 0;
  return Math.max(1, Math.min(cap, facet.fps || 10));
}

/** Snap t to the fps grid so identical frames produce identical strings (and dedupe). */
export const quantize = (t, fps) => (fps > 0 ? Math.floor(t * fps + 1e-6) / fps : t);

const defaultNow = () => (globalThis.performance?.now ? performance.now() : Date.now());

/**
 * opts: { cap, now(), setTimer(fn, ms) → handle, clearTimer(handle), raf: bool, budgetMs }
 * In raf mode setTimer is called with the pump and ignores ms (requestAnimationFrame).
 */
export function createScheduler({ cap = FPS_CAP, now = defaultNow, setTimer, clearTimer, raf = false, budgetMs = 10 } = {}) {
  const st = setTimer || ((fn, ms) => setTimeout(fn, ms));
  const ct = clearTimer || ((h) => clearTimeout(h));
  const slots = new Set();
  let timer = null, timerAt = Infinity, running = true, turn = 0;
  const stats = { pumps: 0, ticks: 0, skipped: 0 };

  const interval = (slot) => 1000 / Math.max(0.1, Math.min(cap, slot.fps || 1));
  const wants = (slot) => slot.fps > 0 && (!slot.active || slot.active());

  function plan() {
    if (!running) return;
    let next = Infinity;
    for (const s of slots) if (wants(s)) next = Math.min(next, s._due ?? 0);
    if (next === Infinity) { if (timer !== null) { ct(timer); timer = null; timerAt = Infinity; } return; }
    if (timer !== null && timerAt <= next) return;
    if (timer !== null) ct(timer);
    timerAt = next;
    timer = st(pump, Math.max(0, next - now()));
  }

  function pump() {
    timer = null; timerAt = Infinity;
    if (!running) return;
    stats.pumps++;
    const t0 = now();
    const list = [...slots].filter(wants);
    const n = list.length;
    turn = (turn + 1) % Math.max(1, n);
    for (let k = 0; k < n; k++) {
      const s = list[(turn + k) % n];
      if ((s._due ?? 0) > t0 + 2) continue;
      if (now() - t0 > budgetMs) { stats.skipped++; continue; }
      const iv = interval(s);
      // Keep cadence; if we fell far behind, resync instead of bursting.
      s._due = (s._due ?? t0) + iv;
      if (s._due < t0) s._due = t0 + iv;
      stats.ticks++;
      try { s.tick(t0); } catch (err) { s.onError ? s.onError(err) : (s.fps = 0); }
    }
    plan();
  }

  return {
    add(slot) {
      // Random phase spreads slots that start together across frames.
      slot._due = now() + (slot.phase ?? Math.random() * (1000 / Math.max(1, Math.min(cap, slot.fps || 1))));
      slots.add(slot);
      plan();
      return slot;
    },
    remove(slot) { slots.delete(slot); plan(); },
    /** Re-plan after a slot's fps / active() changed. */
    wake(slot) { if (slot) slot._due = Math.min(slot._due ?? Infinity, now()); plan(); },
    stop() { running = false; if (timer !== null) ct(timer); timer = null; timerAt = Infinity; },
    start() { if (!running) { running = true; plan(); } },
    get size() { return slots.size; },
    get active() { return [...slots].filter(wants).length; },
    stats,
    cap,
    raf,
  };
}

/**
 * Change governor (API 1.5.1) — runtimes cap a unit's fps by how many keys its recent frames actually
 * changed, so facets need no hand-tuned frame clocks: a wall whose frames touch 3 keys runs at full
 * rate, one that repaints all 32 keys of an XL every frame is throttled to fit `budget` updates/s, and
 * a unit whose last `window` frames changed nothing drops to `idle` fps (a probe) until it changes again.
 *
 *   const gov = createChangeGovernor({ budget: 60 });
 *   // after each frame: gov.observe(keysWhoseSliceChanged)
 *   slot.fps = gov.fps(facetFps);           // on an interaction: gov.reset() (full rate at once)
 */
export function createChangeGovernor({ window = 6, budget = 60, min = 1, idle = 2 } = {}) {
  const hist = [];
  return {
    /** Record one rendered frame: how many keys / segments / widgets it actually changed. */
    observe(changed) { hist.push(Math.max(0, +changed || 0)); if (hist.length > window) hist.shift(); },
    /** The fps to run at, given what the facet asks for. */
    fps(want) {
      if (!(want > 0)) return 0;
      if (hist.length >= window && hist.every((c) => c === 0)) return Math.min(want, idle);
      const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 1;
      return Math.max(Math.min(min, want), Math.min(want, budget / Math.max(1, avg)));
    },
    /** Forget the history (after an input: transitions start at full rate). */
    reset() { hist.length = 0; },
    get history() { return [...hist]; },
  };
}
