// Game Link · Counter-Strike 2: the pure, browser-safe half of Valve's Game State Integration (GSI).
// No node:* imports, no clocks, no I/O: the plugin's listener (./gamelink.js) and the web demo replay
// run the same code, so a recorded round looks the same everywhere.
//
//   normalizeCs2(payload, prev, { nowMs })  → { state, events }  one CS2 POST body + the previous state → ctx.data.gamelink (v1)
//   tickCs2(state, nowMs)                   → { state, events }  time-only transitions (the flash hold's safety clear, a deferred strike)
//   gameLinkView(state, nowMs)              → the facet-facing copy (events no older than EVENT_TTL_MS)
//   sanitizeCs2(payload)                    → the payload with every identity dropped (Steam ids, names, clan, slots) + a self flag
//   parseVdf(text)                          → Valve KeyValues (libraryfolders.vdf, appmanifest_*.acf) → plain objects
//   findCs2(io)                             → where CS2 is installed (Steam libraries; Windows registry via an injected reader, Linux homes)
//   cs2Cfg({ port, token })                 → the text of gamestate_integration_prism.cfg
//
// The event rules are research/cs2-gsi.md §7.4 (the reference deriver cs2-researcher/scripts/derive_events.py),
// with the lead's decisions on top (aaa-prism-play/lead/DECISIONS.md, CS2):
//   - no bomb timer, ever: round.bomb is a state ('planted' | 'defused' | 'exploded'); no plant time, no fuse, no cutoffs.
//     The plant's arrival time is never facet-visible: bombPlanted is returned to the listener (an urgent push) but
//     never kept in state.events (no `at`, no `seq`), and a post that only plants the bomb doesn't move state.at
//   - self events only from frames where player.steamid == provider.steamid; while we spectate, the state keeps OUR last
//     values (fresh: false, alive: false, no flash) — never the observed player's
//   - spectator-only data (allplayers, bomb, phase_countdowns, grenades, player position, player.state.round_totaldmg)
//     is dropped at the edge and marks the post "watching" (GOTV, a demo, the spectator team: not our game)
//   - silence while flashed is not "flash over": the value holds until a newer payload; every self post refreshes the
//     hold; it clears by itself after FLASH_HOLD_MS without a post or FLASH_STUCK_MS without a change (a stuck stream)
//   - the visible flash never rises outside a strike, and at most one strike a second (photosensitivity); a timed-out
//     value stays masked until it falls or a real new flash rises above it
// The data shape is frozen as gamelink v1: src/apps/sources/README.md § Game Link.

export const GAMELINK_VERSION = 1;
export const CS2_APPID = 730;
export const CFG_NAME = 'gamestate_integration_prism.cfg';
export const CFG_TITLE = 'Prism Deck Game Link v1';
export const FLASH_ON = 32;             // flashed (0–255) crossing this from below = a flash onset (12%)
export const FLASH_FULL = 250;          // … crossing this = fully blind
export const FLASH_HOLD_MS = 6500;      // flashed and no self post for this long → cleared (CS2 went quiet; > the 5 s heartbeat, so a heartbeat holds it)
export const FLASH_STUCK_MS = 7500;     // … or the same raw value for this long → cleared (a stuck stream: a real plateau lasts ≤ ~2 s)
export const FLASH_RESTRIKE = 32;       // a new strike: the raw value rises this much above its lowest point since the last strike
export const FLASH_STRIKE_GAP_MS = 1000; // at most one strike (the visible value rising; flashOnset / flashFull) per second
export const EVENT_TTL_MS = 10000;      // facets see events up to this old
export const EVENT_MAX = 16;            // … and at most this many (newest last)
export const STATUSES = Object.freeze(['menu', 'loading', 'live', 'spectating', 'between', 'watching']);
/** Events that start an effect: the plugin's push is urgent for them (the first frame jumps the queue). */
export const URGENT_EVENTS = new Set(['hurt', 'death', 'respawn', 'flashOnset', 'flashFull', 'flashClear', 'kill', 'multiKill', 'mvp', 'bombPlanted', 'bombDefused', 'bombExploded', 'bombGone', 'roundStart', 'roundLive', 'roundWon', 'roundLost', 'matchPoint', 'halftime', 'gameover', 'reloadStart', 'reloadEnd', 'lowAmmo', 'emptyClip', 'context']);

const GUNS = new Set(['Pistol', 'Rifle', 'SniperRifle', 'Submachine Gun', 'Shotgun', 'Machine Gun']);
const KIND = { Knife: 'knife', Pistol: 'pistol', 'Submachine Gun': 'smg', Rifle: 'rifle', Shotgun: 'shotgun', 'Machine Gun': 'mg', SniperRifle: 'sniper', Grenade: 'grenade', C4: 'c4', Taser: 'taser' };
const TUBE_FED = new Set(['nova', 'xm1014', 'sawedoff']);   // reserve counts shells, not magazines (verify live: research §9 Q5)
const UNKNOWN_RESERVE = new Set(['negev', 'm249', 'revolver', 'cz75a']);   // box-fed / cylinder / odd mags: unit unverified → null until a live capture
const MAX_MAGS = 10;                    // a gun's reserve above this is plainly a round count, not magazines
const GRENADES = { flashbang: 'flashbang', smokegrenade: 'smoke', hegrenade: 'he', molotov: 'molotov', incgrenade: 'incendiary', decoy: 'decoy' };
const TARGET = { competitive: 13, scrimcomp2v2: 9, casual: 8, retakes: 8 };   // regulation wins needed
const SPECTATOR_BLOCKS = ['allplayers', 'bomb', 'phase_countdowns', 'grenades'];
// Spectator-only data inside components we DO subscribe to (research §4: player_position is only sent while spectating,
// player_state carries round_totaldmg only for the spectator team / GOTV / demos). Our cfg asks for none of the blocks
// above, so these are what tell a demo or GOTV of your own view from live play. Verify live (NOTES: needs CS2).
const SPECTATOR_PLAYER_KEYS = ['spectarget', 'position', 'forward'];
const SPECTATOR_STATE_KEYS = ['round_totaldmg'];
const MAP_PHASES = new Set(['warmup', 'live', 'intermission', 'gameover', 'paused', 'timeout_t', 'timeout_ct']);
const ROUND_PHASES = new Set(['freezetime', 'live', 'over']);
const BOMB = new Set(['planted', 'defused', 'exploded']);
const SIDES = new Set(['CT', 'T']);
/** How a round was won (map.round_wins values → gamelink v1 round.reason). Unknown strings → 'other'. */
export const ROUND_REASONS = Object.freeze(['elimination', 'bomb_defused', 'bomb_exploded', 'time', 'rescue', 'other']);
const REASON = { elimination: 'elimination', defuse: 'bomb_defused', bomb: 'bomb_exploded', time: 'time', rescue: 'rescue' };
/** 'ct_win_defuse' → 'bomb_defused', 't_win_bomb' → 'bomb_exploded', 'ct_win_elimination' → 'elimination', … ; null when absent. */
export function roundReason(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const m = /^(?:ct|t)_win_([a-z]+)$/.exec(raw);
  return (m && REASON[m[1]]) || 'other';
}
const ACTIVITY = new Set(['playing', 'menu', 'textinput']);
const MEM = Symbol('gamelink.cs2');     // the deriver's memory rides on the state, non-enumerable (never in a snapshot)

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v, lo = 0, hi = 1e9) => { const n = num(v); return n === null ? null : Math.min(hi, Math.max(lo, Math.round(n))); };
const str = (v, max = 64) => (typeof v === 'string' ? v.slice(0, max) : null);
const r4 = (x) => Math.round(x * 1e4) / 1e4;

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || !a || !b || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.hasOwn(b, k) || !deepEqual(a[k], b[k])) return false;
  return true;
}

// ── the edge: drop identities, keep a self flag ─────────────────────────────

function cleanTeam(t) {
  if (!isObj(t)) return null;
  return { score: int(t.score) ?? 0, consecutive_round_losses: int(t.consecutive_round_losses), timeouts_remaining: int(t.timeouts_remaining), matches_won_this_series: int(t.matches_won_this_series) };
}
function cleanWeapons(ws) {
  if (!isObj(ws)) return {};
  const out = {};
  for (const [k, w] of Object.entries(ws).slice(0, 32)) {
    if (!/^weapon_\d{1,2}$/.test(k) || !isObj(w)) continue;
    const o = { name: str(w.name) || '', type: str(w.type, 32) || '', state: str(w.state, 16) || '' };
    for (const f of ['ammo_clip', 'ammo_clip_max', 'ammo_reserve']) if (num(w[f]) !== null) o[f] = int(w[f], 0, 10000);
    out[k] = o;
  }
  return out;
}
function cleanState(s) {
  if (!isObj(s)) return {};
  const o = {};
  for (const f of ['health', 'armor']) if (num(s[f]) !== null) o[f] = int(s[f], 0, 100);
  for (const f of ['flashed', 'smoked', 'burning']) if (num(s[f]) !== null) o[f] = int(s[f], 0, 255);
  for (const f of ['money', 'round_kills', 'round_killhs', 'equip_value']) if (num(s[f]) !== null) o[f] = int(s[f], 0, 1e7);
  if (typeof s.helmet === 'boolean') o.helmet = s.helmet;
  if (s.defusekit === true) o.defusekit = true;          // present only when true (real CS2 behavior)
  return o;                                               // round_totaldmg (spectator-only) is dropped
}
function cleanStats(m) {
  if (!isObj(m)) return {};
  const o = {};
  for (const f of ['kills', 'assists', 'deaths', 'mvps', 'score']) if (num(m[f]) !== null) o[f] = int(m[f], -1e6, 1e6);
  return o;
}

/**
 * One GSI body → the parts Game Link uses, with every identity removed: provider.steamid, player.steamid, player.name,
 * clan and observer_slot never leave this function; only `player.self` (steamid === provider.steamid) survives.
 * Spectator-only blocks are dropped and flagged. null when it isn't a CS2 body (appid ≠ 730, not an object).
 */
export function sanitizeCs2(payload) {
  if (!isObj(payload) || !isObj(payload.provider) || payload.provider.appid !== CS2_APPID) return null;
  const me = typeof payload.provider.steamid === 'string' ? payload.provider.steamid : null;
  const pp = isObj(payload.player) ? payload.player : null;
  const spectator = SPECTATOR_BLOCKS.some((k) => k in payload) || (!!pp && (SPECTATOR_PLAYER_KEYS.some((k) => k in pp) || (isObj(pp.state) && SPECTATOR_STATE_KEYS.some((k) => k in pp.state))));
  const out = { hasDelta: isObj(payload.previously) || isObj(payload.added), spectator };
  const m = payload.map;
  if (isObj(m)) {
    out.map = {
      mode: str(m.mode, 32) || '', name: str(m.name, 64) || '', phase: MAP_PHASES.has(m.phase) ? m.phase : null, round: int(m.round, 0, 999) ?? 0,
      team_ct: cleanTeam(m.team_ct), team_t: cleanTeam(m.team_t),
    };
    if (isObj(m.round_wins)) { const rw = {}; for (const [k, v] of Object.entries(m.round_wins).slice(0, 64)) if (/^\d{1,3}$/.test(k) && typeof v === 'string') rw[k] = v.slice(0, 32); out.map.round_wins = rw; }
  }
  const r = payload.round;
  if (isObj(r)) {
    out.round = { phase: ROUND_PHASES.has(r.phase) ? r.phase : null };
    if (SIDES.has(r.win_team)) out.round.win_team = r.win_team;
    if (BOMB.has(r.bomb)) out.round.bomb = r.bomb;
  }
  const p = payload.player;
  if (isObj(p)) {
    const self = !!me && typeof p.steamid === 'string' && p.steamid === me;
    out.player = { self, activity: ACTIVITY.has(p.activity) ? p.activity : null };
    if (SIDES.has(p.team)) out.player.team = p.team;
    if ('state' in p) out.player.state = cleanState(p.state);
    if ('weapons' in p) out.player.weapons = cleanWeapons(p.weapons);
    if ('match_stats' in p) out.player.match_stats = cleanStats(p.match_stats);
  }
  return out;
}

// ── helpers over sanitized player blocks ────────────────────────────────────

function activeWeapon(pl) {
  for (const w of Object.values(pl?.weapons || {})) if (w.state === 'active' || w.state === 'reloading') return w;
  return null;
}
const bareName = (n) => String(n || '').replace(/^weapon_/, '');
const isLow = (w) => (w.ammo_clip ?? 0) <= Math.max(1, Math.floor((w.ammo_clip_max ?? 0) / 4));

/** 'de_inferno' → 'Inferno', 'cs_office' → 'Office', 'workshop/123/aim_x' → 'Aim X' (ASCII in, ASCII out). */
export function mapTitle(name) {
  const last = String(name || '').split('/').pop().replace(/^(de|cs|ar|dz|gd|aim|fy|dm)_(?=.)/i, '');
  return last.split(/[_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ').slice(0, 32);
}

function weaponView(w) {
  if (!w) return null;
  const name = bareName(w.name);
  const kind = KIND[w.type] || 'other';
  const gun = GUNS.has(w.type);
  return {
    name, kind,
    clip: gun ? (w.ammo_clip ?? null) : null,
    clipMax: gun ? (w.ammo_clip_max ?? null) : null,
    reserve: w.ammo_reserve ?? null,
    // since 2026-03-18 reserve counts magazines (shells for tube-fed shotguns); a grenade's is how many you carry.
    // Guns whose unit isn't verified say null (shown as no reserve), and a reserve too big to be magazines is a count
    reserveUnit: gun ? (TUBE_FED.has(name) ? 'shells' : UNKNOWN_RESERVE.has(name) ? null : (w.ammo_reserve ?? 0) > MAX_MAGS ? 'count' : 'mags') : kind === 'grenade' ? 'count' : null,
    reloading: w.state === 'reloading',
    low: gun ? w.state !== 'reloading' && isLow(w) : false,
  };
}

function grenadesOf(pl) {
  const g = { flashbang: 0, smoke: 0, he: 0, molotov: 0, incendiary: 0, decoy: 0 };
  for (const w of Object.values(pl?.weapons || {})) { const k = GRENADES[bareName(w.name)]; if (k) g[k] += w.ammo_reserve ?? 1; }
  return g;
}

function targetOf(m) {
  let tgt = TARGET[m?.mode] ?? null;
  if (tgt && (m.round ?? 0) >= 2 * (tgt - 1)) tgt += 3;   // overtime (Premier, MR3): first to 16 — see research §7.4
  return tgt;
}

function scores(m, side) {
  if (!m || !SIDES.has(side)) return { us: null, them: null };
  return { us: m[`team_${side.toLowerCase()}`]?.score ?? null, them: m[side === 'CT' ? 'team_t' : 'team_ct']?.score ?? null };
}

// ── the deriver ─────────────────────────────────────────────────────────────

// ── the flash model ─────────────────────────────────────────────────────────
// What facets see (vis, 0–255) follows the game's raw `flashed` DOWN at once, but only rises in a STRIKE, and there
// is at most one strike a second (FLASH_STRIKE_GAP_MS). A strike is a fresh onset (raw reaches FLASH_ON from a low
// point below it) or a re-flash (raw rises FLASH_RESTRIKE above its lowest point since the last peak). While a strike
// is still rising (no dip yet) vis follows raw up. A strike the gap blocks is deferred to the gap's end (tickCs2), not
// dropped. So a stream that dips and comes back (255 ↔ 40) brightens the deck at most once a second, even for a
// stateless facet that never sees an event.
// The safety clear (tickCs2): vis > 0 and no self post for FLASH_HOLD_MS (every post, heartbeats included, refreshes
// it), or the raw value unchanged for FLASH_STUCK_MS → flashClear { timeout: true }. The raw value then stays MASKED
// (lo = raw): heartbeats repeating it and the fade below it never strike again; only a real new flash does.
const FLASH0 = Object.freeze({ vis: 0, raw: 0, lo: 0, peak: 0, rising: false, pending: false, postAt: null, changedAt: null });

/** A baseline without history (the first post, a new map, back from the menu): nothing shows until a new strike. */
const flashCold = (raw, nowMs) => ({ ...FLASH0, raw, lo: raw, postAt: nowMs, changedAt: nowMs });

/** Can raw start a strike now that the visible value is f.vis? */
const strikes = (f, raw) => raw > f.vis && raw >= FLASH_ON && (f.lo < FLASH_ON || raw - f.lo >= FLASH_RESTRIKE);

/** A strike to raw: mutates f, returns its events (flashOnset from below FLASH_ON, flashFull crossing FLASH_FULL). */
function strikeTo(mem, f, raw, nowMs) {
  const ev = [];
  if (f.vis < FLASH_ON) ev.push({ type: 'flashOnset', strength: r4(raw / 255) });
  if (raw >= FLASH_FULL && f.vis < FLASH_FULL) ev.push({ type: 'flashFull' });
  Object.assign(f, { vis: raw, lo: raw, peak: Math.max(f.peak, raw), rising: true, pending: false });
  mem.strikeAt = nowMs;
  return ev;
}

/**
 * One self post's raw `flashed` (0–255) → its events; replaces mem.flash. quiet (a resync): re-baseline silently —
 * follow the value down, never strike, no events.
 */
function flashPost(mem, raw, nowMs, { quiet = false } = {}) {
  const f = { ...mem.flash };
  const ev = [];
  const was = f.vis;
  if (raw !== f.raw) f.changedAt = nowMs;
  f.raw = raw; f.postAt = nowMs;
  if (f.rising && raw >= f.vis) {
    // the strike is still rising: follow it up (a second flashFull inside one strike waits for the gap, like any strike event)
    if (!quiet && raw >= FLASH_FULL && f.vis < FLASH_FULL && nowMs - mem.strikeAt >= FLASH_STRIKE_GAP_MS) { ev.push({ type: 'flashFull' }); mem.strikeAt = nowMs; }
    Object.assign(f, { vis: raw, lo: raw, peak: Math.max(f.peak, raw) });
  } else {
    if (raw < f.vis) { f.vis = raw; f.rising = false; }
    f.lo = Math.min(f.lo, raw);
    if (!quiet && strikes(f, raw)) {
      if (nowMs - mem.strikeAt >= FLASH_STRIKE_GAP_MS) ev.push(...strikeTo(mem, f, raw, nowMs));
      else f.pending = true;   // photosensitivity: the next strike waits for the gap (tickCs2 applies it then)
    }
  }
  if (raw === 0 && was > 0) { if (!quiet) ev.push({ type: 'flashClear', peak: r4(f.peak / 255) }); f.peak = 0; f.pending = false; }
  mem.flash = f;
  return ev;
}

function memOf(prev) {
  const m = prev?.[MEM];
  return m ? { ...m } : { prevP: null, selfSnap: null, team: null, flash: FLASH0, strikeAt: -Infinity, ctx: null, evSeq: 0, rev: 0 };
}

function withMem(state, mem) { Object.defineProperty(state, MEM, { value: mem, enumerable: false }); return state; }

/**
 * Feed one CS2 POST body. prev is the state this function returned last time (or null). Returns the next state and
 * the events this payload produced (also appended to state.events). A body that isn't CS2 returns prev unchanged
 * with rejected: true. nowMs is the receipt time (the plugin's wall clock, the same clock as ctx.now).
 */
export function normalizeCs2(payload, prev = null, { nowMs = 0 } = {}) {
  const p = sanitizeCs2(payload);
  if (!p) return { state: prev, events: [], rejected: true };
  const mem = memOf(prev);
  const raw = derive(p, mem, nowMs);
  return finish(prev, mem, p, raw, nowMs);
}

/** The event rules (research §7.4), ported from the reference deriver. Mutates mem; returns raw events (no at / seq). */
function derive(p, mem, nowMs) {
  const ev = [];
  const m = p.map || null, r = p.round || null, pl = p.player || null;
  const prevP = mem.prevP;
  const pm = prevP?.map || {}, pr = prevP?.round || {};
  const common = prevP ? ['map', 'round', 'player'].filter((k) => k in p && k in prevP) : [];
  let resync = !!prevP && !p.hasDelta && common.some((k) => !deepEqual(p[k], prevP[k]));
  if (m && prevP?.map && (m.round ?? 0) - (pm.round ?? 0) > 1) resync = true;
  if (m && (m.name !== pm.name || m.mode !== pm.mode)) { mem.team = null; mem.selfSnap = null; }   // a new match: forget side and baseline

  let ctx;
  if (!m) ctx = 'menu';
  else if (!pl) ctx = r ? 'between' : 'loading';
  else if (pl.self && !p.spectator) ctx = 'self';
  else ctx = mem.selfSnap && !p.spectator ? 'observing' : 'watching';
  const prevCtx = mem.ctx;
  if (ctx !== prevCtx) ev.push({ type: 'context', value: ctx === 'self' ? 'live' : ctx });

  const snap = () => ({ ...pl, _roundPhase: r?.phase ?? null });
  const raw = ctx === 'self' ? (pl.state?.flashed ?? 0) : 0;
  if (!prevP) {
    // the first post we ever see (the plugin started mid-match, Listen was just turned on): nothing to compare it
    // with, so a baseline and the context only — never the plant, round win or gameover this post merely describes
    if (ctx === 'self') { if (pl.team) mem.team = pl.team; mem.selfSnap = snap(); mem.flash = flashCold(raw, nowMs); }
    mem.ctx = ctx; mem.prevP = p;
    return ev;
  }
  if (resync) {
    // a full-state post after a failed / timed-out post or a listener restart: re-baseline silently
    ev.push({ type: 'resync' });
    if (ctx === 'self') {
      mem.team = pl.team || mem.team; mem.selfSnap = snap();
      if (prevCtx === 'self') flashPost(mem, raw, nowMs, { quiet: true }); else mem.flash = flashCold(raw, nowMs);
    }
    mem.ctx = ctx; mem.prevP = p;
    return ev;
  }
  if (ctx === 'self' && pl.team) {
    if (mem.team && pl.team !== mem.team) ev.push({ type: 'sideSwap', from: mem.team, to: pl.team });
    mem.team = pl.team;
  }
  if (ctx === 'watching') { mem.ctx = ctx; mem.prevP = p; return ev; }   // GOTV, a demo, the spectator team: not our game

  // map and round events (any in-match context)
  if (m) {
    if (m.name !== pm.name || m.mode !== pm.mode) ev.push({ type: 'matchJoined', map: m.name, mode: m.mode });
    if (m.phase !== (pm.phase ?? null)) {
      ev.push({ type: 'mapPhase', value: m.phase });
      if (m.phase === 'intermission') ev.push({ type: 'halftime' });
    }
    if (r?.win_team && !pr.win_team && mem.team) {
      ev.push({ type: r.win_team === mem.team ? 'roundWon' : 'roundLost', winTeam: r.win_team, reason: roundReason(m.round_wins?.[String(m.round)]) });
    }
    if (m.phase === 'gameover' && pm.phase !== 'gameover') {
      const { us, them } = scores(m, mem.team);
      ev.push({ type: 'gameover', result: us === null || them === null ? null : us > them ? 'win' : us < them ? 'loss' : 'draw', us, them });   // our side unknown: no result
    }
    if (r && r.phase !== (pr.phase ?? null) && m.phase !== 'gameover') {
      if (r.phase === 'freezetime') {
        ev.push({ type: 'roundStart', round: (m.round ?? 0) + 1 });
        const tgt = targetOf(m);
        if (tgt && mem.team) {
          const { us, them } = scores(m, mem.team);
          if (us === tgt - 1 || them === tgt - 1) ev.push({ type: 'matchPoint', us: us === tgt - 1, them: them === tgt - 1 });
        }
      } else if (r.phase === 'live') ev.push({ type: 'roundLive' });
    }
    const b = r?.bomb ?? null, pb = pr.bomb ?? null;
    if (b !== pb) {
      // state only: no plant time, no fuse (DECISIONS: no bomb timer, ever)
      if (b === 'planted') ev.push({ type: 'bombPlanted' });
      else if (b === 'defused') ev.push({ type: 'bombDefused' });
      else if (b === 'exploded') ev.push({ type: 'bombExploded' });
      else if (pb === 'planted' && b === null) ev.push({ type: 'bombGone' });   // T won another way, or a new round
    }
  }

  // self events: only from a self → self pair
  if (ctx === 'self') {
    const old = mem.selfSnap;
    if (old && ['self', 'observing', 'between', 'loading'].includes(prevCtx) && m) {
      const os = old.state || {}, ns = pl.state || {};
      const oh = os.health ?? 0, nh = ns.health ?? 0;
      // a fresh freezetime (not the gameover post, which also says freezetime) refills health: not a respawn
      const newRound = r?.phase === 'freezetime' && old._roundPhase !== 'freezetime' && m.phase !== 'gameover';
      if (nh < oh) {
        ev.push({ type: 'hurt', damage: oh - nh, health: nh });
        if (nh === 0) ev.push({ type: 'death' });
      } else if (nh > oh && oh === 0 && !newRound) ev.push({ type: 'respawn' });
      // back from spectating / between rounds: the flash we had when we died was hidden all along — start from clear
      // (no stale flashClear at the next freeze time), but a flash on this very post is a real onset
      if (prevCtx !== 'self') mem.flash = { ...FLASH0, postAt: nowMs, changedAt: nowMs };
      ev.push(...flashPost(mem, raw, nowMs));
      const dk = (ns.round_kills ?? 0) - (os.round_kills ?? 0), dh = (ns.round_killhs ?? 0) - (os.round_killhs ?? 0);
      if (dk > 0) {   // a freezetime reset gives a negative delta, so it never fires
        for (let i = 0; i < dk; i++) ev.push({ type: 'kill', headshot: i < dh, roundKills: (os.round_kills ?? 0) + i + 1 });
        const n = ns.round_kills ?? 0;
        if (n >= 2 && m.mode !== 'deathmatch') ev.push({ type: 'multiKill', count: n, label: { 2: 'double', 3: 'triple', 4: 'quad' }[n] || 'ace' });
      }
      const oms = old.match_stats || {}, nms = pl.match_stats || {};
      // kills −1 is a team kill — unless the stats were reset (warmup → match start: deaths / assists / MVPs never fall
      // otherwise) or we died in the same post (a suicide or a fall costs a kill too)
      const statsReset = ['deaths', 'assists', 'mvps'].some((k) => (nms[k] ?? 0) < (oms[k] ?? 0)) || (pm.phase === 'warmup' && m.phase !== 'warmup');
      const died = (nms.deaths ?? 0) > (oms.deaths ?? 0);
      if ((nms.kills ?? 0) < (oms.kills ?? 0) && !statsReset && !died) ev.push({ type: 'teamKill' });
      if ((nms.mvps ?? 0) > (oms.mvps ?? 0)) ev.push({ type: 'mvp' });
      const ow = activeWeapon(old), nw = activeWeapon(pl);
      const same = !!ow && !!nw && ow.name === nw.name;
      if (nw && nh > 0 && ow && !same) ev.push({ type: 'weaponSwitch', weapon: bareName(nw.name) });
      if (same && ow.state === 'reloading' && nw.state !== 'reloading') ev.push({ type: 'reloadEnd', weapon: bareName(nw.name) });
      if (nw && GUNS.has(nw.type)) {
        if (nw.state === 'reloading' && !(same && ow.state === 'reloading')) ev.push({ type: 'reloadStart', weapon: bareName(nw.name) });
        const c = nw.ammo_clip ?? 0, cm = nw.ammo_clip_max ?? 0, rv = nw.ammo_reserve ?? 0;
        const wasLow = same && isLow(ow);
        if (isLow(nw) && !wasLow && nw.state !== 'reloading') ev.push({ type: 'lowAmmo', clip: c, clipMax: cm, reserve: rv });
        if (c === 0 && !(same && (ow.ammo_clip ?? 0) === 0)) ev.push({ type: 'emptyClip' });
        if (rv === 0 && !(same && (ow.ammo_reserve ?? 0) === 0)) ev.push({ type: 'lastMag' });
      }
      const dm = (ns.money ?? 0) - (os.money ?? 0);
      if (dm) ev.push({ type: 'money', delta: dm, money: ns.money ?? 0 });
    } else mem.flash = flashCold(raw, nowMs);   // no comparable self frame (a new map, back from the menu): a baseline
    mem.selfSnap = snap();
  } else if (ctx === 'observing' && prevCtx === 'self' && r?.phase === 'live') {
    if ((mem.selfSnap?.state?.health ?? 0) > 0) ev.push({ type: 'death', inferred: true });   // self (alive) → someone else mid-round
  }
  mem.ctx = ctx;
  mem.prevP = p;
  return ev;
}

const STATUS_OF = { self: 'live', observing: 'spectating', between: 'between', loading: 'loading', menu: 'menu', watching: 'watching' };

/** The facet-facing state from the sanitized payload and the deriver's memory (shape: gamelink v1). */
function build(p, mem) {
  const ctx = mem.ctx;
  const status = STATUS_OF[ctx] || 'menu';
  const m = p.map || null, r = p.round || null;
  const fresh = ctx === 'self';
  const ours = fresh ? p.player : (ctx === 'observing' || ctx === 'between') ? mem.selfSnap : null;
  const st = ours?.state || {};
  const side = (fresh ? p.player.team : null) || mem.team || null;
  const health = st.health ?? null;
  const player = ours ? {
    fresh,
    alive: fresh ? (health ?? 0) > 0 : false,
    team: side,
    health, armor: st.armor ?? null, helmet: st.helmet ?? null,
    flashed: fresh ? r4((mem.flash?.vis ?? 0) / 255) : 0,   // the flash model's visible value (see flashPost)
    smoked: fresh ? r4((st.smoked ?? 0) / 255) : 0,
    burning: fresh ? r4((st.burning ?? 0) / 255) : 0,
    money: st.money ?? null, equip: st.equip_value ?? null,
    activity: fresh ? p.player.activity : null,
  } : null;
  const ms = ours?.match_stats;
  const stats = ours ? { kills: ms?.kills ?? null, assists: ms?.assists ?? null, deaths: ms?.deaths ?? null, mvps: ms?.mvps ?? null, score: ms?.score ?? null, roundKills: st.round_kills ?? null, roundHs: st.round_killhs ?? null } : null;
  const weapon = fresh ? weaponView(activeWeapon(p.player)) : null;
  const inMatch = !!m && ctx !== 'watching';
  const { us, them } = inMatch ? scores(m, side) : { us: null, them: null };
  const target = inMatch ? targetOf(m) : null;
  const round = r && m ? {
    phase: r.phase,
    number: (m.round ?? 0) + (r.phase === 'over' || m.phase === 'gameover' ? 0 : 1),
    bomb: r.bomb ?? null,
    win: r.win_team ?? null,
    result: r.win_team && side && inMatch ? (r.win_team === side ? 'win' : 'loss') : null,
    reason: r.win_team ? roundReason(m.round_wins?.[String(m.round)]) : null,   // how the round was won (map_round_wins)
  } : null;
  const match = m ? {
    map: m.name, title: mapTitle(m.name), mode: m.mode, phase: m.phase,
    side: inMatch ? side : null,
    ct: m.team_ct?.score ?? null, t: m.team_t?.score ?? null,
    us, them, target,
    matchPoint: target && us !== null && them !== null && m.phase !== 'gameover' ? (us === target - 1 && them === target - 1 ? 'both' : us === target - 1 ? 'us' : them === target - 1 ? 'them' : null) : null,
    result: m.phase === 'gameover' && us !== null && them !== null ? (us > them ? 'win' : us < them ? 'loss' : 'draw') : null,
  } : null;
  const cs2 = { defuseKit: !!(fresh && st.defusekit), hasC4: fresh ? Object.values(p.player.weapons || {}).some((w) => w.type === 'C4') : false, grenades: grenadesOf(fresh ? p.player : null) };
  return { status, player, weapon, stats, round, match, cs2 };
}

/**
 * Events that never reach state.events (what facets see): the bomb plant. It is returned to the caller (the listener
 * pushes the new state at once) but carries no `at` and takes no `seq`, so no facet can tell when the plant arrived —
 * not from the event, not from a gap in the seq numbers (DECISIONS, CS2: no bomb timer, ever).
 */
const UNSEEN = new Set(['bombPlanted']);

function finish(prev, mem, p, raw, nowMs) {
  const core = build(p, mem);
  const events = raw.map((e) => (UNSEEN.has(e.type) ? { ...e } : { ...e, at: nowMs, seq: ++mem.evSeq }));
  const seen = events.filter((e) => !UNSEEN.has(e.type));
  const kept = [...(prev?.events || []).filter((e) => nowMs - e.at <= EVENT_TTL_MS), ...seen].slice(-EVENT_MAX);
  // no new event and the same picture: the same state (a heartbeat; expiring events are the view's business)
  if (prev && !events.length && deepEqual(coreOf(prev), core)) return { state: withMem({ ...prev }, mem), events: [] };
  mem.rev++;
  // state.at = the last post that changed something a facet may time: a post that only planted the bomb keeps the
  // previous `at` (else "now − at" would be the time since the plant)
  const plantOnly = !!prev && !seen.length && deepEqual(coreOf(prev), { ...core, round: core.round && prev.round ? { ...core.round, bomb: prev.round.bomb } : core.round });
  const state = withMem({ v: GAMELINK_VERSION, game: 'cs2', at: plantOnly ? prev.at : nowMs, rev: mem.rev, ...core, events: kept }, mem);
  return { state, events };
}

const coreOf = (s) => ({ status: s.status, player: s.player, weapon: s.weapon, stats: s.stats, round: s.round, match: s.match, cs2: s.cs2 });

/** The flash model's due times: { clear (the safety clear), strike (a deferred strike) } in ms, each or null. */
function flashDue(state, { flashHoldMs = FLASH_HOLD_MS, flashStuckMs = FLASH_STUCK_MS } = {}) {
  const mem = state?.[MEM], f = mem?.flash;
  if (!f || !state.player?.fresh || mem.ctx !== 'self') return { clear: null, strike: null };
  const clear = f.vis > 0 && f.postAt !== null ? Math.min(f.postAt + flashHoldMs, (f.changedAt ?? f.postAt) + flashStuckMs) : null;
  return { clear, strike: f.pending ? mem.strikeAt + FLASH_STRIKE_GAP_MS : null };
}

/**
 * Time-only transitions, for the listener's timers (the flash model, see flashPost):
 *   - the safety clear: flashed, and no self post for FLASH_HOLD_MS or the same raw value for FLASH_STUCK_MS → 0 with
 *     flashClear { timeout: true }; the raw value stays masked, so the fade or a heartbeat never strikes again
 *   - a strike the one-a-second gap held back, if the game's value still calls for it
 * Returns the state unchanged (and no events) when nothing is due; a new state (maybe without events) when the
 * deriver's memory moved on. opts: { flashHoldMs, flashStuckMs } (tests).
 */
export function tickCs2(state, nowMs, opts = {}) {
  const { clear, strike } = flashDue(state, opts);
  const dueClear = clear !== null && nowMs >= clear, dueStrike = strike !== null && nowMs >= strike;
  if (!dueClear && !dueStrike) return { state, events: [] };
  const m = { ...state[MEM] }, f = { ...m.flash };
  let raw = [];
  if (dueClear) {
    raw.push({ type: 'flashClear', peak: r4(f.peak / 255), timeout: true });
    Object.assign(f, { vis: 0, lo: f.raw, peak: 0, rising: false, pending: false });   // masked at the stuck value
  } else {
    f.pending = false;
    if (strikes(f, f.raw)) raw = strikeTo(m, f, f.raw, nowMs);
  }
  m.flash = f;
  if (!raw.length) return { state: withMem({ ...state }, m), events: [] };
  const events = raw.map((e) => ({ ...e, at: nowMs, seq: ++m.evSeq }));
  m.rev++;
  const kept = [...(state.events || []).filter((x) => nowMs - x.at <= EVENT_TTL_MS), ...events].slice(-EVENT_MAX);
  return { state: withMem({ ...state, at: nowMs, rev: m.rev, player: { ...state.player, flashed: r4(f.vis / 255) }, events: kept }, m), events };
}

/** When tickCs2 next has something to do (ms), or null. */
export function cs2NextTick(state, opts = {}) {
  const { clear, strike } = flashDue(state, opts);
  return clear === null ? strike : strike === null ? clear : Math.min(clear, strike);
}

/** What facets see: the state with events no older than EVENT_TTL_MS (a plain copy, no deriver memory). */
export function gameLinkView(state, nowMs) {
  if (!state) return null;
  const { events = [], ...rest } = state;
  return { ...rest, events: events.filter((e) => nowMs - e.at <= EVENT_TTL_MS) };
}

// ── Valve KeyValues (VDF) ───────────────────────────────────────────────────

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Parse Valve KeyValues text (libraryfolders.vdf, appmanifest_730.acf). Duplicate keys: the last wins. */
export function parseVdf(text) {
  const s = String(text ?? '').replace(/^\uFEFF/, '').slice(0, 4 * 1024 * 1024);
  const n = s.length;
  const root = {};
  const stack = [root];
  let i = 0, key = null;
  const ws = (c) => c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v';
  const skip = () => {
    for (;;) {
      while (i < n && ws(s[i])) i++;
      if (s[i] === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i++; continue; }
      return;
    }
  };
  const quoted = () => {
    i++;
    let out = '';
    while (i < n && s[i] !== '"') {
      if (s[i] === '\\' && i + 1 < n) { const c = s[i + 1]; out += c === 'n' ? '\n' : c === 't' ? '\t' : c; i += 2; } else out += s[i++];
    }
    i++;
    return out;
  };
  const bare = () => { const a = i; while (i < n && !ws(s[i]) && s[i] !== '{' && s[i] !== '}' && s[i] !== '"') i++; return s.slice(a, i); };
  const put = (o, k, v) => { if (!BAD_KEYS.has(k)) o[k] = v; };
  for (;;) {
    skip();
    if (i >= n) break;
    const c = s[i];
    if (c === '{') {
      i++;
      const o = {};
      if (key !== null) put(stack[stack.length - 1], key, o);
      key = null;
      if (stack.length < 64) stack.push(o);
      continue;
    }
    if (c === '}') { i++; if (stack.length > 1) stack.pop(); key = null; continue; }
    const tok = c === '"' ? quoted() : bare();
    if (key === null) {
      if (c !== '"' && tok.startsWith('[') && tok.endsWith(']')) continue;   // a [$WIN32] conditional after a value
      key = tok;
    } else { put(stack[stack.length - 1], key, tok); key = null; }
  }
  return root;
}

/** Case-insensitive key lookup (Valve files mix 'LibraryFolders' and 'libraryfolders'). */
export function vdfGet(o, k) {
  if (!isObj(o)) return undefined;
  if (Object.hasOwn(o, k)) return o[k];
  const lk = k.toLowerCase();
  for (const x of Object.keys(o)) if (x.toLowerCase() === lk) return o[x];
  return undefined;
}

/** Libraries in a libraryfolders.vdf: [{ path, apps: Set<appid> | null }] (old format: path strings, no app list). */
export function libraryFolders(vdf) {
  const top = vdfGet(vdf, 'libraryfolders');
  if (!isObj(top)) return [];
  const out = [];
  for (const [k, v] of Object.entries(top)) {
    if (!/^\d+$/.test(k)) continue;
    if (typeof v === 'string' && v) out.push({ path: v, apps: null });
    else if (isObj(v) && typeof vdfGet(v, 'path') === 'string' && vdfGet(v, 'path')) {
      const apps = vdfGet(v, 'apps');
      out.push({ path: vdfGet(v, 'path'), apps: isObj(apps) ? new Set(Object.keys(apps)) : null });
    }
  }
  return out;
}

// ── finding CS2 (read-only) ─────────────────────────────────────────────────

const STEAM_KEYS = [['HKCU\\Software\\Valve\\Steam', 'SteamPath'], ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath']];

/** Join path parts with the platform's separator (win32: backslashes; forward slashes are converted). */
export function joinPath(platform, ...parts) {
  const sep = platform === 'win32' ? '\\' : '/';
  const ps = parts.filter((x) => typeof x === 'string' && x !== '').map((x) => (platform === 'win32' ? x.replace(/\//g, '\\') : x));
  if (!ps.length) return '';
  const head = ps[0].replace(/[\\/]+$/, '') || sep;
  const rest = ps.slice(1).map((x) => x.replace(/^[\\/]+|[\\/]+$/g, '')).filter(Boolean);
  return [head === sep ? '' : head, ...rest].join(sep) || sep;
}

const sameKey = (platform, p) => (platform === 'win32' ? p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() : p.replace(/\/+$/, ''));
const safeDir = (d) => (typeof d === 'string' && d && d.length <= 128 && !/[\\/:*?"<>|\u0000-\u001f]/.test(d) && d !== '.' && d !== '..' ? d : null);

/**
 * Steam roots to look in, most likely first. Windows: HKCU\Software\Valve\Steam\SteamPath, then the HKLM InstallPath
 * (io.readRegistry(key, value) → string | null; read-only), then %ProgramFiles(x86)%\Steam. Linux: ~/.steam/steam and
 * ~/.local/share/Steam. macOS has no CS2 client.
 */
export async function steamRoots({ platform = 'win32', env = {}, home = '', readRegistry, isDir = async () => false } = {}) {
  const cands = [];
  if (platform === 'win32') {
    for (const [k, v] of STEAM_KEYS) { let p = null; try { p = readRegistry ? await readRegistry(k, v) : null; } catch { p = null; } if (typeof p === 'string' && p.trim()) cands.push(p.trim()); }
    cands.push(joinPath('win32', env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'));
  } else if (platform === 'linux') {
    if (home) cands.push(joinPath('linux', home, '.steam', 'steam'), joinPath('linux', home, '.local', 'share', 'Steam'));
  }
  const seen = new Set(), out = [];
  for (const c of cands) {
    const p = joinPath(platform, c);
    const k = sameKey(platform, p);
    if (seen.has(k)) continue;
    seen.add(k);
    try { if (await isDir(joinPath(platform, p, 'steamapps'))) out.push(p); } catch { /* not there */ }
  }
  return out;
}

/**
 * Where CS2 is installed, verified the way research/cs2-gsi.md §1.4 says (a bare folder is NOT an install):
 * a Steam library whose libraryfolders.vdf lists app 730 (or, old format, any library) with steamapps/appmanifest_730.acf,
 * its installdir, the game binary, and game/csgo/cfg/. Read-only.
 * io: { platform, env, home, readText(path) → string | null, isFile(path), isDir(path), readRegistry(key, value) } (async ok)
 * → { found: true, cfgDir, cfgPath, gameDir, library } | { found: false, reason: 'unsupported' | 'no-steam' | 'not-installed' | 'no-binary' | 'no-cfg-dir', leftover }
 */
export async function findCs2(io = {}) {
  const platform = io.platform || 'win32';
  if (platform !== 'win32' && platform !== 'linux') return { found: false, reason: 'unsupported', leftover: false };
  const J = (...a) => joinPath(platform, ...a);
  const read = async (f) => { try { const t = await io.readText?.(f); return typeof t === 'string' ? t : null; } catch { return null; } };
  const isFile = async (f) => { try { return !!(await io.isFile?.(f)); } catch { return false; } };
  const isDir = async (f) => { try { return !!(await io.isDir?.(f)); } catch { return false; } };
  const roots = await steamRoots({ ...io, platform, isDir });
  if (!roots.length) return { found: false, reason: 'no-steam', leftover: false };
  const libs = [], seen = new Set();
  const addLib = (p, apps) => { const path = J(p); const k = sameKey(platform, path); if (seen.has(k)) { const l = libs.find((x) => x.key === k); if (apps && l && !l.apps) l.apps = apps; return; } seen.add(k); libs.push({ path, apps, key: k }); };
  for (const root of roots) {
    const text = await read(J(root, 'steamapps', 'libraryfolders.vdf'));
    const listed = text ? libraryFolders(parseVdf(text)) : [];
    for (const l of listed) addLib(l.path, l.apps);
    addLib(root, null);
  }
  const ordered = [...libs.filter((l) => l.apps?.has(String(CS2_APPID))), ...libs.filter((l) => !l.apps?.has(String(CS2_APPID)))];
  let reason = 'not-installed';
  for (const lib of ordered) {
    const manifest = await read(J(lib.path, 'steamapps', `appmanifest_${CS2_APPID}.acf`));
    if (!manifest) continue;
    const app = vdfGet(parseVdf(manifest), 'AppState');
    const dir = safeDir(vdfGet(app, 'installdir')) || 'Counter-Strike Global Offensive';
    const gameDir = J(lib.path, 'steamapps', 'common', dir);
    const bin = platform === 'win32' ? J(gameDir, 'game', 'bin', 'win64', 'cs2.exe') : J(gameDir, 'game', 'bin', 'linuxsteamrt64', 'cs2');
    if (!(await isFile(bin))) { reason = 'no-binary'; continue; }
    const cfgDir = J(gameDir, 'game', 'csgo', 'cfg');
    if (!(await isDir(cfgDir))) { reason = 'no-cfg-dir'; continue; }
    return { found: true, library: lib.path, gameDir, cfgDir, cfgPath: J(cfgDir, CFG_NAME) };
  }
  let leftover = false;
  for (const lib of ordered) if (await isDir(J(lib.path, 'steamapps', 'common', 'Counter-Strike Global Offensive'))) { leftover = true; break; }
  return { found: false, reason, leftover };
}

// ── the cfg file ────────────────────────────────────────────────────────────

export const CFG_DATA = Object.freeze(['provider', 'map', 'map_round_wins', 'round', 'player_id', 'player_state', 'player_weapons', 'player_match_stats']);
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * gamestate_integration_prism.cfg (DECISIONS, CS2 · Cfg, + map_round_wins: how each round was won, sent to players):
 * plain ASCII, no BOM. CS2 reads it at launch, so a running CS2 needs a restart. Nothing spectator-only is subscribed.
 */
export function cs2Cfg({ port, token, eol = '\n' } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('cs2Cfg: port must be an integer 1–65535');
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw new Error('cs2Cfg: token must be 16–128 url-safe characters');
  const pad = (k) => `"${k}"`.padEnd(22);
  const lines = [
    `"${CFG_TITLE}"`,
    '{',
    '    // Written by Prism Deck (the Stream Deck plugin) when you clicked "Connect CS2".',
    '    // "Disconnect" in the plugin removes this file. It never changes other integrations.',
    `    "uri"       "http://127.0.0.1:${port}/v1/cs2"`,
    '    "timeout"   "2.0"',
    '    "buffer"    "0.0"',
    '    "throttle"  "0.05"',
    '    "heartbeat" "5.0"',
    '    "auth"',
    '    {',
    `        "token" "${token}"`,
    '    }',
    '    "data"',
    '    {',
    ...CFG_DATA.map((k) => `        ${pad(k)}"1"`),
    '    }',
    '}',
    '',
  ];
  return lines.join(eol);
}

/** Is this cfg text ours (its first key is CFG_TITLE)? Other vendors' files are never touched. */
export function isPrismCfg(text) {
  const first = String(text ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('//'));
  return first === `"${CFG_TITLE}"`;
}

/** Our installed cfg against what we'd write now: 'absent' | 'current' | 'outdated' (port or token changed) | 'foreign'. */
export function cfgState(text, { port, token } = {}) {
  if (text === null || text === undefined) return 'absent';
  if (!isPrismCfg(text)) return 'foreign';
  try { return String(text).replace(/\r\n/g, '\n') === cs2Cfg({ port, token }) ? 'current' : 'outdated'; } catch { return 'outdated'; }
}
