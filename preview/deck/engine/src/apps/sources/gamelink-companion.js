import { __m as __bm } from '../../../facets.bundle.js';
// Game Link · companions: the pure, browser-safe mapper for POST /v1/companion (./gamelink.js).
//
// A companion is any local adapter that already knows a game's state and posts it in the game-neutral
// gamelink v1 vocabulary: Prism Control's Prism Sight module (screen reading for offline, anti-cheat-free games),
// a game mod's local API bridge, … (lead/DECISIONS.md, Games scope). Overwatch is out of scope entirely.
//
//   normalizeCompanion(body, prev, { nowMs }) → { state, events } | { error } | { state: prev, events: [], duplicate: true }
//
// Body (Content-Type: application/json, Authorization: Bearer <tokens.companion from gamelink.json>):
//   { "v": 1, "source": "prism-sight", "game": "nms", "session": "<id per adapter run>", "seq": 12, "sentAt": <epoch ms>,
//     "state":  { "status": "live", "player": {…}, "weapon": {…}, "stats": {…}, "round": {…}, "match": {…}, "detail": {…} },   // optional: a full replace
//     "events": [ { "type": "hurt", "at": <epoch ms>, "damage": 12 }, … ] }                                                     // optional
//
// Everything is clamped to the v1 shape (src/apps/sources/README.md § Game Link): unknown neutral fields are
// dropped, numbers must be finite, strings are cut to 64 characters, `detail` (the game's own extras) becomes
// state[game] as small plain JSON. Events are stamped with the receipt time; ones the adapter held for more than
// 3 s are dropped (an old kill never fires late). The same (session, seq) is ignored the second time.

const { GAMELINK_VERSION, STATUSES, EVENT_TTL_MS, EVENT_MAX } = __bm(607);

export const COMPANION_STATUSES = Object.freeze([...STATUSES, 'paused']);
export const COMPANION_EVENT_MAX_AGE_MS = 3000;
export const COMPANION_EVENTS_PER_BATCH = 32;
/** Neutral top-level keys: a game id can't be one of these (its extras live at state[game]). */
export const RESERVED_GAME_IDS = new Set(['v', 'game', 'source', 'at', 'rev', 'status', 'player', 'weapon', 'stats', 'round', 'match', 'events', 'cs2', 'demo', 'detail', 'session']);
const GAME_ID = /^[a-z][a-z0-9]{1,23}$/;      // 'nms', 'pc2', 'factorio' — usable as a plain property: gamelink.nms
const EVENT_TYPE = /^[a-z][a-zA-Z0-9]{0,31}$/;
const FIELD = /^[a-z][a-zA-Z0-9]{0,31}$/;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => { const n = fin(v); return n === null ? null : Math.min(hi, Math.max(lo, n)); };
const r4 = (x) => (x === null ? null : Math.round(x * 1e4) / 1e4);
const s64 = (v, max = 64) => (typeof v === 'string' ? v.slice(0, max) : null);
const bool = (v) => (typeof v === 'boolean' ? v : null);
const oneOf = (v, list) => (list.includes(v) ? v : null);

function player(p) {
  if (!isObj(p)) return null;
  return {
    fresh: p.fresh !== false, alive: bool(p.alive), team: s64(p.team, 16),
    health: clamp(p.health, 0, 100), armor: clamp(p.armor, 0, 100), helmet: bool(p.helmet),
    flashed: r4(clamp(p.flashed, 0, 1)) ?? 0, smoked: r4(clamp(p.smoked, 0, 1)) ?? 0, burning: r4(clamp(p.burning, 0, 1)) ?? 0,
    money: clamp(p.money, -1e12, 1e12), equip: clamp(p.equip, 0, 1e12), activity: s64(p.activity, 16),
  };
}
function weapon(w) {
  if (!isObj(w)) return null;
  return {
    name: s64(w.name, 32) || '', kind: s64(w.kind, 16) || 'other',
    clip: clamp(w.clip, 0, 1e4), clipMax: clamp(w.clipMax, 0, 1e4), reserve: clamp(w.reserve, 0, 1e6),
    reserveUnit: oneOf(w.reserveUnit, ['mags', 'shells', 'count']), reloading: w.reloading === true, low: w.low === true,
  };
}
function stats(s) {
  if (!isObj(s)) return null;
  const o = {};
  for (const k of ['kills', 'assists', 'deaths', 'mvps', 'score', 'roundKills', 'roundHs']) o[k] = clamp(s[k], -1e9, 1e9);
  return o;
}
function round(r) {
  if (!isObj(r)) return null;
  return { phase: s64(r.phase, 16), number: clamp(r.number, 0, 1e6), bomb: null, win: s64(r.win, 16), result: oneOf(r.result, ['win', 'loss']) };
}
function match(m) {
  if (!isObj(m)) return null;
  return {
    map: s64(m.map), title: s64(m.title, 32), mode: s64(m.mode, 32), phase: s64(m.phase, 16), side: s64(m.side, 16),
    ct: null, t: null, us: clamp(m.us, -1e9, 1e9), them: clamp(m.them, -1e9, 1e9), target: clamp(m.target, 0, 1e6),
    matchPoint: oneOf(m.matchPoint, ['us', 'them', 'both']), result: oneOf(m.result, ['win', 'loss', 'draw']),
  };
}

/** Small plain JSON only: depth ≤ 3, ≤ 48 keys / 32 items per level, strings ≤ 64, finite numbers. */
export function plainDetail(v, depth = 0) {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? r4(v) : null;
  if (typeof v === 'string') return v.slice(0, 64);
  if (depth >= 3) return null;
  if (Array.isArray(v)) return v.slice(0, 32).map((x) => plainDetail(x, depth + 1));
  if (isObj(v)) {
    const o = {};
    for (const [k, x] of Object.entries(v).slice(0, 48)) if (FIELD.test(k)) o[k] = plainDetail(x, depth + 1);
    return o;
  }
  return null;
}

function event(e, { nowMs, sentAt }) {
  if (!isObj(e) || typeof e.type !== 'string' || !EVENT_TYPE.test(e.type)) return null;
  if (fin(e.at) !== null && fin(sentAt) !== null && sentAt - e.at > COMPANION_EVENT_MAX_AGE_MS) return null;
  const o = { type: e.type };
  let n = 0;
  for (const [k, v] of Object.entries(e)) {
    if (k === 'type' || k === 'at' || k === 'seq' || !FIELD.test(k) || n >= 8) continue;
    if (typeof v === 'string') o[k] = v.slice(0, 64);
    else if (typeof v === 'boolean' || v === null) o[k] = v;
    else if (fin(v) !== null) o[k] = r4(v);
    else continue;
    n++;
  }
  o.at = nowMs;
  return o;
}

/**
 * One companion batch → the game's gamelink state. prev is this game's previous state (or null).
 * → { state, events } · { state: prev, events: [], duplicate: true } · { error: 'bad_version' | 'bad_game' | 'bad_session' | 'bad_seq' | 'bad_state' | 'bad_events' }
 */
export function normalizeCompanion(body, prev = null, { nowMs = 0 } = {}) {
  if (!isObj(body) || body.v !== 1) return { error: 'bad_version' };
  if (typeof body.game !== 'string' || !GAME_ID.test(body.game) || RESERVED_GAME_IDS.has(body.game)) return { error: 'bad_game' };
  if (typeof body.session !== 'string' || !body.session || body.session.length > 64) return { error: 'bad_session' };
  if (!Number.isInteger(body.seq) || body.seq < 0) return { error: 'bad_seq' };
  if (body.state !== undefined && !isObj(body.state)) return { error: 'bad_state' };
  if (body.events !== undefined && !Array.isArray(body.events)) return { error: 'bad_events' };
  const memo = prev?._companion;
  if (prev && memo?.session === body.session && body.seq <= memo.seq) return { state: prev, events: [], duplicate: true };
  const st = body.state;
  const base = st ? {
    status: oneOf(st.status, COMPANION_STATUSES) || 'live',
    player: player(st.player), weapon: weapon(st.weapon), stats: stats(st.stats), round: round(st.round), match: match(st.match),
    detail: st.detail === undefined ? null : plainDetail(st.detail),
  } : prev ? { status: prev.status, player: prev.player, weapon: prev.weapon, stats: prev.stats, round: prev.round, match: prev.match, detail: prev[body.game] ?? null } : null;
  if (!base) return { error: 'bad_state' };   // the first batch of a game must carry its state
  let seq = prev?._companion?.evSeq || 0;
  const events = (body.events || []).slice(0, COMPANION_EVENTS_PER_BATCH).map((e) => event(e, { nowMs, sentAt: fin(body.sentAt) })).filter(Boolean).map((e) => ({ ...e, seq: ++seq }));
  const kept = [...(prev?.events || []).filter((e) => nowMs - e.at <= EVENT_TTL_MS), ...events].slice(-EVENT_MAX);
  const { detail, ...neutral } = base;
  const state = { v: GAMELINK_VERSION, game: body.game, source: s64(body.source, 32) || 'companion', at: nowMs, rev: (prev?.rev || 0) + 1, ...neutral, events: kept, [body.game]: detail ?? {} };
  Object.defineProperty(state, '_companion', { value: { session: body.session, seq: body.seq, evSeq: seq }, enumerable: false });
  return { state, events };
}
