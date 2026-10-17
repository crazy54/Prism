// Stateful facets (API 1.5) — games and toys on the deck.
//
// A facet with a `game` block is a pure state machine plus a pure renderer:
//
//   game: {
//     init({ seed, device, grid, params }) → state       plain JSON, small (≤ GAME_STATE_MAX bytes)
//     reduce(state, event) → state                       pure + deterministic; return the same object for "no change"
//     tickHz: 2,                                         optional: clock ticks (≤ TICK_MAX_HZ) …
//     ticking(state) → bool                              … delivered only while this says the game needs them
//     animate: 0.6,                                      seconds of transition after each event (default 0.6)
//   }
//   render(ctx) reads ctx.game (the current state), ctx.gamePrev (the state before the last event, or
//   null) and ctx.gameEvent (the last event + its `age` in seconds, or null) to animate transitions.
//
// Events: { type: 'press' | 'release' | 'rotate' | 'touch' | 'tick', key?, dial?, ticks?, x?, y?, hold?, heldFor? (release), t, seed, n }
//   key   device key index (span / deck: the pressed key, like ctx.pressKey); the host adds
//   cell  the key's index within the facet's grid (row-major, 0-based; null when the key is outside it) and
//   col, row  its grid position — so a reducer never needs the device layout
//   t     seconds on the host clock; n the event's sequence number; seed a per-event value (hash of the
//         game seed and n) for reseeding, e.g. a new round
// `reset` is handled by the host (a fresh init with a new seed); reducers never see it.
// Randomness lives in the state (`rng` below: a uint32 you thread through reduce) — never Math.random,
// Date or the event clock — so the same event log always replays to the same state.
//
// Hosts: createGameHost(facet, opts) is the runtime-neutral driver the web player, the hid runner
// and the plugin wrap: dispatch input, pump ticks, ask fps(t) when to render, persist snapshot().

import { createContext, gameGrid } from './context.js';

export { gameGrid };

export const GAME_EVENTS = ['press', 'release', 'rotate', 'touch', 'tick', 'reset'];
export const TICK_MAX_HZ = 4;
export const GAME_STATE_MAX = 4096;      // bytes of JSON — fits a Stream Deck action's settings
export const DEFAULT_ANIMATE = 0.6;
export const GAME_FPS = 12;               // transition fps cap (the device budget is ~200 updates/s for all keys)
export const GAME_RESET_HOLD_S = 1.5;     // runtimes: holding a game key this long deals a new game (not on the Galleon)

// ---------- seeded randomness carried in state ----------

/** A uint32 rng state from any seed. */
export const rngSeed = (seed = 7) => (mix32(seed >>> 0, 0x2545f491) || 0x9e3779b9) >>> 0;

/** One draw: → [x in [0, 1), next state] (mulberry32, the same generator as scene/noise.rng). */
export function rngNext(r) {
  const a = (r + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}
/** → [integer in [0, n), next state]. */
export function rngInt(r, n) { const [x, r2] = rngNext(r); return [Math.floor(x * n), r2]; }
/** → [shuffled copy, next state] (Fisher–Yates). */
export function rngShuffle(r, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { let j; [j, r] = rngInt(r, i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return [out, r];
}
/** Two uint32s → one (event seeds, rounds). */
export function mix32(a, b) {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------- grid ----------

const gridSig = (g) => `${g.cols}x${g.rows}`;

/** The arguments init() gets for these render options. */
export function gameArgs(facet, opts = {}) {
  const ctx = createContext(facet, { ...opts, game: null });
  return { seed: ctx.seed, device: ctx.device.id, grid: gameGrid(ctx), params: ctx.params };
}

/** Is it plain JSON (what reduce must return)? */
export function isPlainJson(v, depth = 0) {
  if (depth > 12) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isPlainJson(x, depth + 1));
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.values(v).every((x) => x !== undefined && isPlainJson(x, depth + 1));
  return false;
}

// ---------- the host ----------

/**
 * Drive one game instance. opts: the facet's render options that fix its geometry and rules
 * ({ device, span, size, params, seed }) plus:
 *   snapshot   a previous snapshot() to resume (ignored if it's for another facet / grid)
 *   log        true: keep every event (replays, tests, bug reports)
 *   clock()    seconds, used when an event has no `t`
 * → { state, prev, last, n, dispatch(ev), reset(t), pump(t), needsTick(), tickHz, animating(t), fps(t, cap),
 *     renderOpts(t), snapshot(), log, grid }
 */
export function createGameHost(facet, opts = {}) {
  const G = facet.game;
  if (!G || typeof G.init !== 'function' || typeof G.reduce !== 'function') throw new Error(`${facet.id}: not a game facet (needs game.init and game.reduce)`);
  const args = gameArgs(facet, opts);
  const grid = args.grid;
  const tickHz = Math.min(TICK_MAX_HZ, Math.max(0, +G.tickHz || 0));
  const animate = Math.max(0, G.animate ?? DEFAULT_ANIMATE);
  const byKey = new Map(grid.cells.map((c, k) => [c.i, k]));
  const clock = opts.clock || (() => 0);
  const log = opts.log ? [] : null;

  let baseSeed = args.seed >>> 0, n = 0, state, prev = null, last = null, nextTick = null;
  const snap = opts.snapshot;
  if (snap && snap.facet === facet.id && snap.grid === gridSig(grid) && snap.state !== undefined) {
    ({ seed: baseSeed = baseSeed, n = 0, state } = snap);   // transitions don't replay on resume (last / prev stay null)
  } else state = G.init(args);

  const event = (raw) => {
    if (!raw || !GAME_EVENTS.includes(raw.type)) throw new Error(`${facet.id}: unknown game event ${JSON.stringify(raw?.type)}`);
    const ev = { type: raw.type, t: Number.isFinite(raw.t) ? raw.t : clock(), n: n + 1 };
    ev.seed = mix32(baseSeed, ev.n);
    if (Number.isInteger(raw.key)) {
      ev.key = raw.key;
      const k = facet.surface === 'key' ? 0 : byKey.get(raw.key);
      ev.cell = k ?? null;
      if (k !== undefined) { ev.col = grid.cells[k].col; ev.row = grid.cells[k].row; }
    } else if (facet.surface === 'key' && (raw.type === 'press' || raw.type === 'release') && !Number.isInteger(raw.dial)) { ev.cell = 0; ev.col = 0; ev.row = 0; }
    if (Number.isInteger(raw.dial)) ev.dial = raw.dial;
    if (Number.isFinite(raw.ticks)) ev.ticks = Math.trunc(raw.ticks);
    if (raw.type === 'release' && Number.isFinite(raw.heldFor)) ev.heldFor = Math.max(0, raw.heldFor);
    if (raw.type === 'touch') { ev.x = +raw.x || 0; ev.y = +raw.y || 0; ev.hold = !!raw.hold; }
    return ev;
  };

  const host = {
    facet, grid, tickHz, animate,
    get state() { return state; },
    get prev() { return prev; },
    get last() { return last; },
    get n() { return n; },
    log,
    /** Apply one input event. → { state, changed } (changed: the state's JSON differs). */
    dispatch(raw) {
      const ev = event(raw);
      const before = JSON.stringify(state);
      let next;
      if (ev.type === 'reset') next = G.init({ ...args, seed: ev.seed });
      else next = G.reduce(state, ev);
      if (next === undefined) next = state;
      n = ev.n;
      log?.push(ev);
      const changed = next !== state && JSON.stringify(next) !== before;
      if (changed || ev.type !== 'tick') {      // ticks that change nothing don't restart transitions
        if (changed) prev = state;
        state = next;
        if (ev.type !== 'tick' || changed) last = ev;
      }
      if (!host.needsTick()) nextTick = null;
      else if (ev.type === 'tick' || nextTick === null) nextTick = ev.t + 1 / tickHz;
      return { state, changed, event: ev };
    },
    /** A new game (long-press on hardware, a "New game" button). */
    reset(t) { return host.dispatch({ type: 'reset', t }); },
    /** Does the game want clock ticks right now? */
    needsTick() { return tickHz > 0 && typeof G.ticking === 'function' && !!G.ticking(state); },
    /** Deliver the ticks that are due at t (at most one per call; ≤ tickHz a second). → changed? */
    pump(t = clock()) {
      if (!host.needsTick()) { nextTick = null; return false; }
      if (nextTick === null) { nextTick = t + 1 / tickHz; return false; }
      if (t + 1e-6 < nextTick) return false;
      return host.dispatch({ type: 'tick', t }).changed;
    },
    /** Is a transition playing at t? (one extra frame past `animate` so the settled frame is drawn) */
    animating(t = clock(), fps = GAME_FPS) { return !!last && last.type !== 'tick' && t - last.t <= animate + 2 / Math.max(1, fps); },
    /** The render rate the game needs at t: the facet's fps (≤ cap) during transitions, tickHz while ticking, else 0. */
    fps(t = clock(), cap = GAME_FPS) {
      const f = Math.max(1, Math.min(cap, GAME_FPS, facet.fps || GAME_FPS));
      if (host.animating(t, f)) return f;
      return host.needsTick() ? tickHz : 0;
    },
    /** What render() needs: opts.game, opts.gamePrev, opts.gameEvent (with its age at t). */
    renderOpts(t = clock()) {
      return { game: state, gamePrev: prev, gameEvent: last ? { ...last, age: Math.max(0, t - last.t) } : null };
    },
    /** Small, JSON-safe: persist it (action settings) and pass it back as opts.snapshot to resume. */
    snapshot() { return { v: 1, facet: facet.id, grid: gridSig(grid), seed: baseSeed, n, state }; },
  };
  return host;
}

/** Replay an event log from a fresh init. → final state (the same log always gives the same state). */
export function replayGame(facet, opts, events) {
  const h = createGameHost(facet, { ...opts, snapshot: null });
  for (const ev of events) h.dispatch(ev);
  return h.state;
}
