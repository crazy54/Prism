import { __m as __bm } from '../../../facets.bundle.js?v=b7d3401196';
// Game Link · League of Legends: the pure, browser-safe half of Riot's Live Client Data API (the Game Client API the
// game serves on https://127.0.0.1:2999 while a match runs). No node:* imports, no clocks, no I/O: the poller
// (./gamelink-lol-client.js) and the web demo replay run the same code, so a recorded match looks the same everywhere.
//
//   normalizeLol(poll, prev, { nowMs })  → { state, events }   one poll + the previous state → ctx.data.gamelink (v1, game 'lol')
//   sanitizeLol(poll)                    → the poll with every identity dropped (names, Riot ids, tag lines, skins)
//   lolView(state, nowMs)                → what facets see (events no older than EVENT_TTL_MS)
//   structureOf(name)                    → 'Turret_T2_C_05_A' → { kind: 'tower', team: 'chaos', lane: 'mid' }
//
// poll: { status: 200, allgamedata, eventdata? }   a read that answered (eventdata, when given, replaces allgamedata.events)
//       { status: 404 | 503 | …, body? }           the game client answers but has no game data yet (the loading screen)
//       null                                       no game client (nothing listens on 2999): state null, memory dropped
//
// Riot's docs: https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api (endpoints, root cert),
// sample payloads https://static.developer.riotgames.com/docs/lol/liveclientdata_sample.json and
// https://static.developer.riotgames.com/docs/lol/liveclientdata_events.json. The contract is
// aaa-prism-play/lead/CONTRACT-moba.md (gamelink v1 unchanged; MOBA extras in state.lol):
//   - display-only, and only what the game already shows THIS player: our champion, the team kill scores (the sums of
//     the Tab scoreboard's kills), globally announced events (kills, first blood, ace, objectives)
//   - abilities: levels only. ready / cooldown are always null: the API doesn't report them, and we never estimate
//     (Riot's Game Integrity policy names "tracking enemy ultimate cooldowns" as the forbidden example)
//   - no derived timers: no dragon, baron or inhibitor respawn timers, nothing counted from an event's time. The only
//     countdown is OUR respawn time, which the game shows on our HUD
//   - objectives only from the events Riot sends (in spectator mode Riot sends none: that's "watching" anyway)
//   - privacy: summoner names, Riot ids (game name + tag line) and skins are used only inside sanitizeLol, to find OUR
//     player and to tell whether an event's killer / victim is us, an ally or an enemy. They never leave it; the state
//     has none, the logs have none, the fixtures are fictional
//   - streamer mode: Riot then puts champion names in the events instead of Riot ids (developer-relations #1045 /
//     #1161), so champion names are a fallback — but only when that champion is unique in the match
//   - modes Riot doesn't allow third parties to show (Brawl: Overwolf's Riot compliance page) and TFT are "watching"
//     with no data at all. No facet may turn our level into a "power spike" alert or advice (same page)
//
// Event mapping (Riot EventName → gamelink events; each { type, at, seq, … }; at = receipt time like CS2):
//   GameStart → matchJoined { map, mode }        ChampionKill → kill (we killed) · death (we died)
//   Multikill → multiKill { count, label }      FirstBlood → firstBlood { ours, self }      Ace → ace { ours, self }
//   DragonKill → objective { name: 'dragon', kind: element, ours, stolen }       HeraldKill → objective 'herald'
//   HordeKill → objective 'grubs'      BaronKill → objective 'baron'      AtakhanKill → objective 'atakhan'
//   TurretKilled → objective 'tower' (kind: lane; ours = an enemy tower fell)   InhibKilled → objective 'inhibitor'
//   GameEnd → gameover { result }      not mapped: MinionsSpawning (only the phase), FirstBrick (TurretKilled carries
//   it), InhibRespawningSoon / InhibRespawned (no respawn timers), anything new
// plus, from our own champion: levelUp { level } · respawn · context { value } (the status changed).
// Riot's eventdata is the whole history on every read: events are deduped by Riot's EventID within a game. The first
// read of a game we didn't watch load (Game Link turned on mid-match) is a baseline: its history is marked seen and
// nothing fires; an event first seen more than LOL_STALE_S of game time after it happened (a reconnect's loading
// screen brings the history back) never fires. A new game is told by its clock going back, never by a 404 hiccup.
// Our kills / deaths also follow our scoreboard line, so a kill Riot names by an ambiguous champion (streamer mode)
// still counts once — never twice, whichever of the two shows it first.
// The data shape is frozen as gamelink v1: src/apps/sources/README.md § Game Link (+ lead/CONTRACT-moba.md).

const { GAMELINK_VERSION, EVENT_TTL_MS, EVENT_MAX, deepEqual, gameLinkView } = __bm(627);

export const LOL_GAME = 'lol';
export const LOL_PAUSE_MS = 3000;          // the game clock hasn't moved for this long while the API answers → paused
export const LOL_STALE_S = 10;            // a Riot event older than this (game time) when first seen never fires (a reconnect's history)
export const LOL_NEW_GAME_S = 30;          // the game clock going back more than this: a new game
export const LOL_MINIONS_S = 90;           // phase 'live' from here even if MinionsSpawning was never seen (Riot sends it at 1:05)
export const LOL_SEEN_MAX = 4096;          // Riot EventIDs remembered per game
export const LOL_STATUSES = Object.freeze(['loading', 'live', 'paused', 'watching']);
/** Game modes shown as "watching" with no data: TFT isn't League; Riot approves no Brawl data on third-party products. */
export const LOL_NO_DATA_MODES = new Set(['tft', 'brawl']);
/** Events that start an effect (the plugin pushes them with priority). */
export const LOL_URGENT = new Set(['kill', 'death', 'multiKill', 'firstBlood', 'ace', 'objective', 'levelUp', 'respawn', 'gameover', 'matchJoined', 'context']);
/** Riot's map ids (https://static.developer.riotgames.com/docs/lol/maps.json) → titles (ASCII). */
export const LOL_MAP_TITLES = Object.freeze({ 1: "Summoner's Rift", 2: "Summoner's Rift", 3: 'The Proving Grounds', 4: 'Twisted Treeline', 8: 'The Crystal Scar', 10: 'Twisted Treeline', 11: "Summoner's Rift", 12: 'Howling Abyss', 14: "Butcher's Bridge", 16: 'Cosmic Ruins', 18: 'Valoran City Park', 19: 'Substructure 43', 20: 'Crash Site', 21: 'Nexus Blitz', 22: 'Convergence', 30: 'Rings of Wrath', 35: 'The Bandlewood' });
export const LOL_MULTIKILL = Object.freeze({ 2: 'double', 3: 'triple', 4: 'quadra', 5: 'penta' });
/** Riot EventName → the objective it announces (the kill feed shows these to everyone). */
export const LOL_OBJECTIVES = Object.freeze({ DragonKill: 'dragon', HeraldKill: 'herald', HordeKill: 'grubs', BaronKill: 'baron', AtakhanKill: 'atakhan', TurretKilled: 'tower', InhibKilled: 'inhibitor' });

const MEM = Symbol('gamelink.lol');     // the deriver's memory rides on the state, non-enumerable (never in a snapshot)
const TEAMS = { ORDER: 'order', CHAOS: 'chaos' };
const SLOTS = ['Q', 'W', 'E', 'R'];
const FURY = new Set(['battlefury', 'dragonfury', 'gnarfury']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v, lo = 0, hi = 1e9) => { const n = num(v); return n === null ? null : Math.min(hi, Math.max(lo, Math.round(n))); };
const str = (v, max = 64) => (typeof v === 'string' ? v.slice(0, max) : null);
const ascii = (v, max = 32) => (typeof v === 'string' && v && /^[\x20-\x7e]+$/.test(v) ? v.slice(0, max) : null);
const token = (v, max = 24) => (typeof v === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(v) ? v.toLowerCase().slice(0, max) : null);
const teamOf = (v) => TEAMS[typeof v === 'string' ? v.toUpperCase() : ''] || null;
const pct = (v, max) => { const a = num(v), b = num(max); return a === null || b === null || b <= 0 ? null : Math.min(100, Math.max(0, Math.round((a / b) * 100))); };

// ── structures and non-player killers ───────────────────────────────────────

const STRUCT_TEAM = { T1: 'order', T100: 'order', TORDER: 'order', T2: 'chaos', T200: 'chaos', TCHAOS: 'chaos' };
const LANE = { L: 'top', L2: 'top', C: 'mid', L1: 'mid', R: 'bot', L0: 'bot' };

/**
 * A turret or inhibitor name → { kind: 'tower' | 'inhibitor', team (its owner), lane } or null. Riot has used
 * 'Turret_T2_L_03_A' / 'Barracks_T1_R1' (the docs) and 'Turret_TChaos_L2_P3_…' (2026 captures); both are read.
 */
export function structureOf(name) {
  if (typeof name !== 'string') return null;
  const m = /^(Turret|Barracks|Inhib)_(T1|T2|T100|T200|TOrder|TChaos)_([A-Z][0-9]?)/i.exec(name);
  if (!m) return null;
  const kind = /^turret$/i.test(m[1]) ? 'tower' : 'inhibitor';
  const lanePart = m[3].toUpperCase();
  const lane = kind === 'inhibitor' ? LANE[lanePart[0]] ?? null : LANE[lanePart] ?? LANE[lanePart[0]] ?? null;
  return { kind, team: STRUCT_TEAM[m[2].toUpperCase()] || null, lane };
}

/** A minion's or turret's team from a killer name ('Minion_T100L1S04N0003' → 'order'), else null (monsters, unknown). */
function nonPlayerTeam(name) {
  const s = structureOf(name);
  if (s) return s.team;
  const m = /^Minion_T(100|200)/i.exec(name);
  return m ? (m[1] === '100' ? 'order' : 'chaos') : null;
}

/** 'game_character_displayname_Annie' / 'Character_Aatrox_Name' / 'Annie' → 'Annie' (ASCII letters and digits) or null. */
export function championKey(raw, display = null) {
  for (const v of [raw, display]) {
    if (typeof v !== 'string' || !v) continue;
    const m = /^game_character_displayname_([A-Za-z0-9]+)$/.exec(v) || /^Character_([A-Za-z0-9]+)_Name$/.exec(v);
    if (m) return m[1].slice(0, 24);
    if (v === raw) continue;
    const k = v.replace(/[^A-Za-z0-9]/g, '');
    if (k && /^[\x20-\x7e]+$/.test(v)) return k.slice(0, 24);
  }
  return null;
}

// ── the edge: identities → relations, then dropped ──────────────────────────

/** Every name a player may appear under in eventdata (Riot ids, game names, legacy summoner names). Never returned. */
function namesOf(p) {
  const out = new Set();
  const add = (v) => { if (typeof v === 'string' && v) { out.add(v); const h = v.indexOf('#'); if (h > 0) out.add(v.slice(0, h)); } };
  add(p.riotId); add(p.riotIdGameName); add(p.summonerName);
  if (typeof p.riotIdGameName === 'string' && typeof p.riotIdTagLine === 'string' && p.riotIdGameName && p.riotIdTagLine) add(`${p.riotIdGameName}#${p.riotIdTagLine}`);
  return out;
}

/** The active player's champion from its ability ids ('AnnieQ', 'AnnieR', 'AnniePassive' → 'Annie'), when they agree. */
function abilityChampion(ab) {
  if (!isObj(ab)) return null;
  const keys = new Set();
  for (const s of SLOTS) { const id = ab[s]?.id; if (typeof id === 'string' && id.endsWith(s) && id.length > 1) keys.add(id.slice(0, -1)); }
  const pid = ab.Passive?.id;
  if (typeof pid === 'string' && /Passive$/.test(pid) && pid.length > 7) keys.add(pid.slice(0, -7));
  return keys.size === 1 ? [...keys][0] : null;
}

/** Which of allPlayers is the active player: Riot id first, then names, then a unique champion. → index | -1 */
function findSelf(ap, players) {
  const mine = namesOf(ap);
  if (!mine.size && !isObj(ap.abilities)) return -1;
  const byExact = (keyOf) => { const hits = players.map((p, i) => (keyOf(p) ? i : -1)).filter((i) => i >= 0); return hits.length === 1 ? hits[0] : -1; };
  const full = typeof ap.riotId === 'string' && ap.riotId.includes('#') ? ap.riotId : null;
  let i = full ? byExact((p) => p.riotId === full || (p.riotIdGameName && p.riotIdTagLine && `${p.riotIdGameName}#${p.riotIdTagLine}` === full) || p.summonerName === full) : -1;
  if (i < 0 && mine.size) i = byExact((p) => [...namesOf(p)].some((n) => mine.has(n)));
  if (i < 0 && mine.size) { const low = new Set([...mine].map((n) => n.toLowerCase())); i = byExact((p) => [...namesOf(p)].some((n) => low.has(n.toLowerCase()))); }
  if (i < 0) { const key = abilityChampion(ap.abilities); if (key) i = byExact((p) => championKey(p.rawChampionName, p.championName) === key); }
  return i;
}

/**
 * name → 'self' | 'order' | 'chaos' | null for event fields (KillerName, VictimName, Recipient, Acer, Assisters).
 * Identity names win; champion names (streamer mode) count only when unique; an ambiguous name gives its team if all
 * candidates share one, else null. Turrets and minions resolve to their team; monsters to null.
 */
function relationOf(players, selfIdx) {
  const byName = new Map(), byChamp = new Map();
  const put = (m, k, i) => { if (!k) return; const s = m.get(k) || new Set(); s.add(i); m.set(k, s); };
  players.forEach((p, i) => {
    for (const n of namesOf(p)) put(byName, n, i);
    put(byChamp, typeof p.championName === 'string' ? p.championName : null, i);
    put(byChamp, championKey(p.rawChampionName, null), i);
  });
  const team = (i) => teamOf(players[i]?.team);
  const pick = (set) => {
    if (set.size === 1) { const [i] = set; return i === selfIdx ? 'self' : team(i); }
    const ts = new Set([...set].map(team));
    return ts.size === 1 ? [...ts][0] : null;
  };
  return (name) => {
    if (typeof name !== 'string' || !name) return null;
    if (byName.has(name)) return pick(byName.get(name));
    const np = nonPlayerTeam(name);
    if (np) return np;
    const champ = byChamp.get(name);
    return champ && champ.size === 1 ? pick(champ) : null;   // a champion two players share tells nothing
  };
}

const STOLEN = { True: true, False: false, true: true, false: false };

function cleanEvent(e, rel) {
  if (!isObj(e) || !Number.isInteger(e.EventID) || e.EventID < 0 || typeof e.EventName !== 'string') return null;
  const name = e.EventName.slice(0, 32);
  const o = { id: e.EventID, name, time: num(e.EventTime) };
  if ('KillerName' in e) o.killer = rel(e.KillerName);
  if ('VictimName' in e) o.victim = rel(e.VictimName);
  if ('Recipient' in e) o.recipient = rel(e.Recipient);
  if ('Acer' in e) o.acer = rel(e.Acer);
  if ('AcingTeam' in e) o.acingTeam = teamOf(e.AcingTeam);
  if (Array.isArray(e.Assisters)) o.assistSelf = e.Assisters.slice(0, 16).some((a) => rel(a) === 'self');
  if ('KillStreak' in e) o.streak = int(e.KillStreak, 0, 99);
  if ('DragonType' in e) o.dragon = token(e.DragonType, 16);
  if ('Stolen' in e) o.stolen = STOLEN[e.Stolen] ?? (typeof e.Stolen === 'boolean' ? e.Stolen : null);
  if ('TurretKilled' in e) o.structure = structureOf(e.TurretKilled);
  if ('InhibKilled' in e) o.structure = structureOf(e.InhibKilled);
  if ('Result' in e) o.result = /^win$/i.test(String(e.Result)) ? 'win' : /^lose|loss|defeat$/i.test(String(e.Result)) ? 'loss' : null;
  return o;
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items.slice(0, 10)) {
    if (!isObj(it)) continue;
    const slot = int(it.slot, 0, 6);
    const id = int(it.itemID, 0, 1e7);
    if (slot === null || id === null) continue;
    const count = int(it.count, 0, 999);
    out.push({ slot: slot === 6 ? 'trinket' : slot, name: ascii(it.displayName, 32) || `item${id}`, ready: null, cooldown: null, charges: count !== null && count > 1 ? count : null });
  }
  return out.sort((a, b) => (a.slot === 'trinket' ? 6 : a.slot) - (b.slot === 'trinket' ? 6 : b.slot));
}

function cleanAbilities(ab) {
  if (!isObj(ab)) return [];
  const out = [];
  for (const s of SLOTS) {
    const a = ab[s];
    if (!isObj(a)) continue;
    out.push({ slot: s, name: ascii(a.id, 32), level: int(a.abilityLevel, 0, 9), ready: null, cooldown: null, ultimate: s === 'R', passive: false, charges: null });
  }
  if (isObj(ab.Passive)) out.push({ slot: 'P', name: ascii(ab.Passive.id, 32), level: null, ready: null, cooldown: null, ultimate: false, passive: true, charges: null });
  return out;
}

function resourceOf(t) {
  const k = token(t, 16);
  if (!k) return null;
  return FURY.has(k) ? 'fury' : k;
}

/**
 * One poll → the parts Game Link uses, with every identity removed: summoner names, Riot ids, tag lines, skins, runes,
 * other players' items / levels / respawn timers never leave this function. What survives: OUR champion's own numbers,
 * each team's kill total, and the events as relations ('self' | 'order' | 'chaos' | null). null when it isn't a poll.
 */
export function sanitizeLol(poll) {
  if (!isObj(poll)) return null;
  const status = int(poll.status ?? (poll.allgamedata ? 200 : null), 0, 999);
  if (status === null) return null;
  const g = isObj(poll.allgamedata) ? poll.allgamedata : null;
  if (status !== 200 || !g || !isObj(g.gameData)) return { status: status === 200 ? 204 : status, game: null, spectator: false, self: null, teams: null, events: [] };
  const gd = g.gameData;
  const mapNumber = int(gd.mapNumber, 0, 9999);
  const game = { mode: token(gd.gameMode, 24) || 'unknown', map: token(gd.mapName, 24) || (mapNumber !== null ? `map${mapNumber}` : 'unknown'), mapNumber, time: num(gd.gameTime) };
  const players = Array.isArray(g.allPlayers) ? g.allPlayers.slice(0, 20).filter(isObj) : [];
  const ap = isObj(g.activePlayer) ? g.activePlayer : null;
  const spectator = !ap || 'error' in ap || (!isObj(ap.championStats) && !namesOf(ap).size);
  const selfIdx = spectator ? -1 : findSelf(ap, players);
  const rel = relationOf(players, selfIdx);
  const teams = { order: { kills: 0, players: 0 }, chaos: { kills: 0, players: 0 } };
  for (const p of players) { const t = teamOf(p.team); if (t) { teams[t].players++; teams[t].kills += int(p.scores?.kills, 0, 9999) ?? 0; } }
  let self = null;
  if (!spectator) {
    const cs = isObj(ap.championStats) ? ap.championStats : {};
    const me = selfIdx >= 0 ? players[selfIdx] : null;
    const sc = isObj(me?.scores) ? me.scores : {};
    const key = me ? championKey(me.rawChampionName, me.championName) : abilityChampion(ap.abilities);
    self = {
      found: !!me,
      team: me ? teamOf(me.team) : null,
      champion: key ? { id: key, name: ascii(me?.championName, 32) || key } : null,
      level: int(ap.level, 0, 99) ?? int(me?.level, 0, 99),
      gold: num(ap.currentGold) === null ? null : Math.max(0, Math.floor(ap.currentGold)),
      health: num(cs.currentHealth), healthMax: num(cs.maxHealth),
      resource: { type: resourceOf(cs.resourceType), value: num(cs.resourceValue), max: num(cs.resourceMax) },
      dead: typeof me?.isDead === 'boolean' ? me.isDead : null,
      respawn: num(me?.respawnTimer),
      scores: { kills: int(sc.kills, 0, 9999), deaths: int(sc.deaths, 0, 9999), assists: int(sc.assists, 0, 9999), cs: int(sc.creepScore, 0, 99999) },
      abilities: cleanAbilities(ap.abilities),
      items: me ? cleanItems(me.items) : [],
    };
  }
  const evSrc = isObj(poll.eventdata) && Array.isArray(poll.eventdata.Events) ? poll.eventdata.Events : isObj(g.events) && Array.isArray(g.events.Events) ? g.events.Events : [];
  const events = evSrc.slice(-2000).map((e) => cleanEvent(e, rel)).filter(Boolean).sort((a, b) => a.id - b.id);
  return { status: 200, game, spectator, self, teams, events };
}

// ── the deriver ─────────────────────────────────────────────────────────────

function memOf(prev) {
  const m = prev?.[MEM];
  return m ? { ...m, seen: new Set(m.seen) } : null;   // a copy: replaying from an older state never sees later events
}
function newMem(base = null) {
  return {
    session: base?.session ?? 0, ctx: base?.ctx ?? null, evSeq: base?.evSeq ?? 0, rev: base?.rev ?? 0,
    seen: new Set(), game: null, gameTime: null, team: null, selfSnap: null,
    kEv: 0, dEv: 0, k0: 0, d0: 0, kE0: 0, dE0: 0, kOut: 0, dOut: 0,   // our kills / deaths: Riot's events vs our scoreboard line
    minions: false, ended: null, clockT: null, clockSince: null,
  };
}
function withMem(state, mem) { Object.defineProperty(state, MEM, { value: mem, enumerable: false }); return state; }

/**
 * Feed one poll. prev is the state this function returned last time (or null). Returns the next state and the events
 * this poll produced (also appended to state.events). poll null = no game client: { state: null } (the memory goes
 * with it: the next game starts clean). A poll that isn't one returns prev unchanged with rejected: true. nowMs is
 * the receipt time (the plugin's wall clock, the same clock as ctx.now).
 */
export function normalizeLol(poll, prev = null, { nowMs = 0 } = {}) {
  if (poll === null || poll === undefined) return { state: null, events: [] };
  const p = sanitizeLol(poll);
  if (!p) return { state: prev, events: [], rejected: true };
  const mem = memOf(prev) || newMem();
  const raw = derive(p, mem, nowMs);
  return finish(prev, mem, p, raw, nowMs);
}

function contextOf(p, mem, nowMs) {
  if (p.status !== 200 || !p.game) return 'loading';
  if (p.spectator || !p.self || LOL_NO_DATA_MODES.has(p.game.mode)) return 'watching';
  return !mem.ended && mem.clockSince !== null && p.game.time !== null && nowMs - mem.clockSince >= LOL_PAUSE_MS ? 'paused' : 'live';
}

/** The clock's last move: paused = the API answers but the game clock stood still for LOL_PAUSE_MS. */
function trackClock(mem, t, nowMs) {
  if (t === null) return;
  if (mem.clockT === null || t !== mem.clockT) { mem.clockT = t; mem.clockSince = nowMs; }
}

/** The event rules. Mutates mem; returns raw events (no at / seq). */
function derive(p, mem, nowMs) {
  const ev = [];
  const prevCtx = mem.ctx;
  if (p.status !== 200 || !p.game) {
    // the game client answers without game data: the loading screen (or a hiccup). The memory stays: a hiccup in the
    // middle of a game must not replay its history; a new game is told by its clock (below)
    if (prevCtx !== 'loading') ev.push({ type: 'context', value: 'loading' });
    mem.ctx = 'loading';
    return ev;
  }
  const t = p.game.time;
  const sameGame = !!mem.game && mem.game.mode === p.game.mode && mem.game.map === p.game.map && !(t !== null && mem.gameTime !== null && t < mem.gameTime - LOL_NEW_GAME_S);
  let baseline = false;
  if (!sameGame) {
    // a new game. If we watched it load, everything in it is new; else (Game Link turned on mid-match, the plugin
    // started mid-match) this first read is a baseline: its history is marked seen and nothing fires
    baseline = prevCtx !== 'loading';
    Object.assign(mem, newMem(mem), { session: mem.session + 1 });
  }
  mem.game = { mode: p.game.mode, map: p.game.map };
  if (t !== null) mem.gameTime = t;
  trackClock(mem, t, nowMs);
  const ctx = contextOf(p, mem, nowMs);
  if (ctx !== prevCtx) ev.push({ type: 'context', value: ctx });
  mem.ctx = ctx;
  const s = p.self;
  if (s?.team) mem.team = s.team;

  // Riot's events, in EventID order, each once per game. One older than LOL_STALE_S of game time never fires (a
  // reconnect's loading screen brings the whole history back)
  const fresh = [];
  for (const e of p.events) {
    if (mem.seen.has(e.id)) continue;
    if (mem.seen.size >= LOL_SEEN_MAX) mem.seen.delete(mem.seen.values().next().value);
    mem.seen.add(e.id);
    if (e.name === 'MinionsSpawning') mem.minions = true;            // the history tells the phase even in a baseline
    if (e.name === 'GameEnd') mem.ended = e.result ?? 'unknown';
    const isNew = !baseline && !(e.time !== null && t !== null && t - e.time > LOL_STALE_S);
    if (e.name === 'ChampionKill') {
      if (e.killer === 'self') { mem.kEv++; if (isNew) e.newSelfKill = true; }
      if (e.victim === 'self') { mem.dEv++; if (isNew) e.newSelfDeath = true; }
    }
    if (isNew) fresh.push(e);
  }
  if (ctx === 'watching') { mem.selfSnap = null; return ev; }   // spectating, a replay, TFT: not our game — no effects

  const sc = s?.scores || {};
  const S = sc.kills ?? 0, D = sc.deaths ?? 0;
  if (!mem.selfSnap) {
    // our counters start at this read: what the scoreboard and the history held before this read's new events
    const nk = fresh.filter((e) => e.newSelfKill).length, nd = fresh.filter((e) => e.newSelfDeath).length;
    Object.assign(mem, { k0: Math.max(0, S - nk), d0: Math.max(0, D - nd), kE0: mem.kEv - nk, dE0: mem.dEv - nd, kOut: 0, dOut: 0 });
  }
  if (baseline) { mem.selfSnap = snapOf(s); return ev; }
  // a kill counts once whether Riot's event or our scoreboard line shows it first (or only one does: streamer mode)
  const kTarget = Math.max(S - mem.k0, mem.kEv - mem.kE0);
  const dTarget = Math.max(D - mem.d0, mem.dEv - mem.dE0);
  const kill = () => { if (mem.kOut < kTarget) { mem.kOut++; ev.push({ type: 'kill', headshot: null, roundKills: null }); } };
  const death = () => { if (mem.dOut < dTarget) { mem.dOut++; ev.push({ type: 'death' }); } };
  const ours = (team) => (team && mem.team ? team === mem.team : null);
  const teamRel = (r) => (r === 'self' ? mem.team : r);

  let killsLeft = fresh.filter((e) => e.newSelfKill).length;   // our kill events still ahead in this read
  for (const e of fresh) {
    switch (e.name) {
      case 'GameStart': ev.push({ type: 'matchJoined', map: p.game.map, mode: p.game.mode }); break;
      case 'ChampionKill':
        if (e.newSelfKill) { killsLeft--; kill(); }
        if (e.newSelfDeath) death();
        break;
      case 'Multikill':
        // a kill always comes before its multikill: one the scoreboard showed without an event of ours is due now
        if (e.killer === 'self' && e.streak >= 2) { while (mem.kOut < kTarget - killsLeft) kill(); ev.push({ type: 'multiKill', count: e.streak, label: LOL_MULTIKILL[e.streak] || 'penta' }); }
        break;
      case 'FirstBlood': ev.push({ type: 'firstBlood', ours: ours(teamRel(e.recipient)), self: e.recipient === 'self' }); break;
      case 'Ace': ev.push({ type: 'ace', ours: ours(e.acingTeam ?? teamRel(e.acer)), self: e.acer === 'self' }); break;
      case 'TurretKilled': case 'InhibKilled': {
        // ours = an ENEMY structure fell: its owner is in its name (a minion is often the killer)
        const st = e.structure;
        ev.push({ type: 'objective', name: LOL_OBJECTIVES[e.name], ours: st?.team && mem.team ? st.team !== mem.team : ours(teamRel(e.killer)), kind: st?.lane ?? null, self: e.killer === 'self' || !!e.assistSelf });
        break;
      }
      case 'DragonKill': case 'HeraldKill': case 'HordeKill': case 'BaronKill': case 'AtakhanKill': {
        const o = { type: 'objective', name: LOL_OBJECTIVES[e.name], ours: ours(teamRel(e.killer)), kind: e.name === 'DragonKill' ? e.dragon ?? null : null, self: e.killer === 'self' || !!e.assistSelf };
        if (typeof e.stolen === 'boolean') o.stolen = e.stolen;
        ev.push(o);
        break;
      }
      case 'GameEnd': { const { us, them } = scoreOf(p, mem); ev.push({ type: 'gameover', result: e.result ?? null, us, them }); break; }
      default: break;   // MinionsSpawning, FirstBrick, InhibRespawningSoon, InhibRespawned, anything new: no event
    }
  }
  // the scoreboard moved without an event we could pin on us (streamer mode, two of one champion): still exactly once
  while (mem.kOut < kTarget) kill();
  while (mem.dOut < dTarget) death();

  // our champion's own edges
  const old = mem.selfSnap;
  if (s && old) {
    if (s.level !== null && old.level !== null && s.level > old.level) ev.push({ type: 'levelUp', level: s.level });
    if (old.dead === true && s.dead === false) ev.push({ type: 'respawn' });
  }
  mem.selfSnap = snapOf(s);
  return ev;
}

const snapOf = (s) => (s ? { level: s.level, dead: s.dead } : null);

function scoreOf(p, mem) {
  const t = mem.team;
  if (!t || !p.teams) return { us: null, them: null };
  const other = t === 'order' ? 'chaos' : 'order';
  return { us: p.teams[t].kills, them: p.teams[other].kills };
}

const STATUS_OF = { loading: 'loading', live: 'live', paused: 'paused', watching: 'watching' };

/** The facet-facing state (gamelink v1 + state.lol) from the sanitized poll and the deriver's memory. */
function build(p, mem) {
  const ctx = mem.ctx;
  const status = STATUS_OF[ctx] || 'loading';
  const ownGame = ctx === 'live' || ctx === 'paused';
  const s = ownGame ? p.self : null;
  const noData = !!p.game && LOL_NO_DATA_MODES.has(p.game.mode);   // TFT, Brawl: nothing about the game is shown
  const g = noData ? null : p.game;
  const dead = s ? (s.dead ?? ((s.health ?? 1) <= 0)) : false;
  const player = s ? {
    fresh: true, alive: !dead, team: s.team ?? mem.team ?? null,
    health: dead ? 0 : pct(s.health, s.healthMax), armor: null, helmet: null,
    flashed: 0, smoked: 0, burning: 0, money: s.gold, equip: null, activity: null,
  } : null;
  const stats = s ? { kills: s.scores.kills, assists: s.scores.assists, deaths: s.scores.deaths, mvps: null, score: null, roundKills: null, roundHs: null } : null;
  const ended = mem.ended;
  const { us, them } = ownGame ? scoreOf(p, mem) : { us: null, them: null };
  const result = ended === 'win' || ended === 'loss' ? ended : null;
  const match = g ? {
    map: g.map, title: LOL_MAP_TITLES[g.mapNumber] || g.map, mode: g.mode,
    phase: ended ? 'gameover' : 'live',
    side: ownGame ? mem.team : null, ct: null, t: null, us, them, target: null, matchPoint: null,
    result: ownGame ? result : null,
  } : null;
  const phase = noData ? null : !g ? 'pregame' : ended ? 'post' : mem.minions || (g.time ?? 0) >= LOL_MINIONS_S ? 'live' : 'pregame';
  const res = s?.resource || {};
  const lol = {
    phase,
    clock: g && g.time !== null ? { t: Math.max(0, Math.floor(g.time)), daytime: null, paused: ctx === 'paused' } : null,
    hero: s && s.champion ? {
      id: s.champion.id, name: s.champion.name, level: s.level,
      respawnIn: dead && s.respawn !== null && s.respawn > 0 ? Math.ceil(s.respawn) : null,   // our own death timer: the game shows it on our HUD
      mana: res.type === 'none' ? null : pct(res.value, res.max), manaMax: res.max !== null && res.max > 0 ? Math.round(res.max) : null, resource: res.type ?? null,
      hpMax: s.healthMax !== null ? Math.round(s.healthMax) : null, buybackReady: null, buybackCost: null, buybackCooldown: null,
    } : null,
    economy: s ? { gold: s.gold, gpm: null, xpm: null, lastHits: null, denies: null, cs: s.scores.cs } : null,
    abilities: s ? s.abilities.slice(0, 8) : [],
    items: s ? s.items.slice(0, 10) : [],
    status: null,
    aegis: null,
  };
  return { status, player, weapon: null, stats, round: null, match, lol };
}

function finish(prev, mem, p, raw, nowMs) {
  const core = build(p, mem);
  const events = raw.map((e) => ({ ...e, at: nowMs, seq: ++mem.evSeq }));
  const kept = [...(prev?.events || []).filter((e) => nowMs - e.at <= EVENT_TTL_MS), ...events].slice(-EVENT_MAX);
  // no new event and the same picture: the same state (a poll that changed nothing; expiring events are the view's business)
  if (prev && !events.length && deepEqual(coreOf(prev), core)) return { state: withMem({ ...prev }, mem), events: [] };
  mem.rev++;
  const state = withMem({ v: GAMELINK_VERSION, game: LOL_GAME, at: nowMs, rev: mem.rev, ...core, events: kept }, mem);
  return { state, events };
}

const coreOf = (s) => ({ status: s.status, player: s.player, weapon: s.weapon, stats: s.stats, round: s.round, match: s.match, lol: s.lol });

/** What facets see: the state with events no older than EVENT_TTL_MS (a plain copy, no deriver memory). */
export function lolView(state, nowMs) {
  return gameLinkView(state, nowMs);
}
