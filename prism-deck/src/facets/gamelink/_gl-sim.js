// The Game Link demo round: what Game Link facets show while nothing real is connected (the catalog, the web
// player, conformance tests, and the plugin while Game Link is off, tagged DEMO). Pure and deterministic: fictional
// CS2 GSI payloads, shaped like research/cs2-fixtures, replayed through the real normalizer
// (src/apps/sources/gamelink-cs2.js), so the demo exercises exactly the code live data goes through.
//
//   simGameLink(t) → ctx.data.gamelink (v1) at t seconds; loops every SIM_LOOP s
//     0–30 s  round 7, won: buy, round live, hurt, a flashbang (255, held, then a fade), a kill, a headshot double
//             with low ammo, a reload, the bomb planted (a state: no timer), defused, round won, MVP
//     30–60 s round 8, lost: hurt heavy, death, spectating a teammate (our last values, dimmed), round lost, between
//   SIM_ROUNDS     the two scripted rounds ({ from, to, round, result })
//   SIM_FRAMES     the raw payload timeline [{ t, payload }] (tests, the web replay)
//
// Times are on the sim's own clock: event `at` values are t × 1000 ms, so a facet that simulates computes
// age = (t × 1000 − ev.at) / 1000. The plugin's simulated source calls simGameLink(Date.now() / 1000): there the
// clock is the wall clock, the same as ctx.now. Every name and number is invented.

import { normalizeCs2, gameLinkView } from '../../apps/sources/gamelink-cs2.js';

export const SIM_LOOP = 60;
export const SIM_ROUNDS = Object.freeze([
  Object.freeze({ from: 0, to: 30, round: 7, result: 'win' }),
  Object.freeze({ from: 30, to: 60, round: 8, result: 'loss' }),
]);

const SELF = '76500000000000001', MATE = '76500000000000002';   // fictional; the normalizer drops ids anyway
const clone = (o) => JSON.parse(JSON.stringify(o));

const W = {
  knife: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
  usp: { name: 'weapon_usp_silencer', type: 'Pistol', ammo_clip: 12, ammo_clip_max: 12, ammo_reserve: 2, state: 'active' },
  m4: { name: 'weapon_m4a1_silencer', type: 'Rifle', ammo_clip: 20, ammo_clip_max: 20, ammo_reserve: 3, state: 'active' },
  flash: { name: 'weapon_flashbang', type: 'Grenade', ammo_reserve: 1, state: 'holstered' },
  famas: { name: 'weapon_famas', type: 'Rifle', ammo_clip: 25, ammo_clip_max: 25, ammo_reserve: 3, state: 'active' },
};

function world() {
  return {
    map: {
      mode: 'competitive', name: 'de_inferno', phase: 'live', round: 6,
      team_ct: { score: 4, consecutive_round_losses: 0, timeouts_remaining: 3, matches_won_this_series: 0 },
      team_t: { score: 2, consecutive_round_losses: 2, timeouts_remaining: 3, matches_won_this_series: 0 },
      num_matches_to_win_series: 0,
      round_wins: { 1: 'ct_win_elimination', 2: 't_win_elimination', 3: 'ct_win_elimination', 4: 'ct_win_defuse', 5: 't_win_bomb', 6: 'ct_win_elimination' },
    },
    round: { phase: 'freezetime' },
    player: {
      steamid: SELF, name: 'DemoPilot', observer_slot: 6, team: 'CT', activity: 'playing',
      state: { health: 100, armor: 0, helmet: false, flashed: 0, smoked: 0, burning: 0, money: 4750, round_kills: 0, round_killhs: 0, equip_value: 700 },
      weapons: { weapon_0: { ...W.knife }, weapon_1: { ...W.usp } },
      match_stats: { kills: 7, assists: 1, deaths: 4, mvps: 2, score: 17 },
    },
  };
}

const st = (w) => w.player.state;
const gun = (w) => w.player.weapons.weapon_2;
const flashAt = (v) => (w) => { st(w).flashed = v; };

// [t seconds, change] — applied in order to one evolving world; every frame after the first carries a delta block
const SCRIPT = [
  [0, () => {}],
  [1.5, (w) => { Object.assign(st(w), { money: 850, armor: 100, helmet: true, equip_value: 4600 }); w.player.weapons.weapon_1.state = 'holstered'; w.player.weapons.weapon_2 = { ...W.m4 }; }],
  [2.5, (w) => { Object.assign(st(w), { money: 250, defusekit: true, equip_value: 5200 }); w.player.weapons.weapon_3 = { ...W.flash }; }],
  [4, (w) => { w.round.phase = 'live'; }],
  [6, (w) => { Object.assign(st(w), { health: 73, armor: 91 }); }],
  [8, flashAt(255)],
  [9.6, flashAt(177)], [10, flashAt(113)], [10.4, flashAt(64)], [10.8, flashAt(28)], [11.2, flashAt(7)], [11.6, flashAt(0)],
  [13, (w) => { Object.assign(st(w), { round_kills: 1, money: 550 }); gun(w).ammo_clip = 13; Object.assign(w.player.match_stats, { kills: 8, score: 19 }); }],
  [15, (w) => { Object.assign(st(w), { round_kills: 2, round_killhs: 1, money: 850 }); gun(w).ammo_clip = 4; Object.assign(w.player.match_stats, { kills: 9, score: 21 }); }],
  [16, (w) => { gun(w).state = 'reloading'; }],
  [17.6, (w) => { Object.assign(gun(w), { ammo_clip: 20, ammo_reserve: 2 }); }],
  [18, (w) => { gun(w).state = 'active'; }],
  [20, (w) => { w.round.bomb = 'planted'; }],
  [27, (w) => {
    w.round = { phase: 'over', win_team: 'CT', bomb: 'defused' };
    w.map.round = 7; w.map.team_ct.score = 5; w.map.team_t.consecutive_round_losses = 3; w.map.round_wins[7] = 'ct_win_defuse';
    Object.assign(st(w), { money: 4650 }); Object.assign(w.player.match_stats, { mvps: 3, score: 24 });
  }],
  [30, (w) => { w.round = { phase: 'freezetime' }; Object.assign(st(w), { health: 100, round_kills: 0, round_killhs: 0 }); }],
  [33, (w) => { w.round.phase = 'live'; }],
  [37, (w) => { Object.assign(st(w), { health: 38, armor: 64 }); }],
  [38.5, (w) => {
    const s = st(w);
    Object.assign(s, { health: 0, armor: 0, helmet: false }); delete s.defusekit;
    w.player.weapons = {}; w.player.match_stats.deaths = 5;
  }],
  [41.5, (w) => {
    w.player = {
      steamid: MATE, name: 'DemoWing', observer_slot: 2, team: 'CT', activity: 'playing',
      state: { health: 81, armor: 100, helmet: true, flashed: 0, smoked: 0, burning: 0, money: 1900, round_kills: 1, round_killhs: 0, equip_value: 4100 },
      weapons: { weapon_0: { ...W.knife }, weapon_1: { ...W.famas } },
      match_stats: { kills: 11, assists: 3, deaths: 6, mvps: 1, score: 27 },
    };
  }],
  [46, (w) => { st(w).flashed = 240; }],            // the teammate is flashed: never our whiteout
  [47.5, (w) => { st(w).flashed = 0; }],
  [52, (w) => {
    w.round = { phase: 'over', win_team: 'T' };
    w.map.round = 8; w.map.team_t.score = 3; w.map.team_t.consecutive_round_losses = 0; w.map.team_ct.consecutive_round_losses = 1; w.map.round_wins[8] = 't_win_elimination';
  }],
  [55, (w) => { w.player = null; }],
];

function payloadOf(w, i, t) {
  const p = { provider: { name: 'Counter-Strike: Global Offensive', appid: 730, version: 14191, steamid: SELF, timestamp: 1791658800 + Math.floor(t) } };
  p.map = clone(w.map);
  if (w.round) p.round = clone(w.round);
  if (w.player) p.player = clone(w.player);
  if (i > 0) p.previously = {};
  return p;
}

export const SIM_FRAMES = (() => {
  const w = world();
  return Object.freeze(SCRIPT.map(([t, change], i) => { change(w); return Object.freeze({ t, payload: payloadOf(w, i, t) }); }));
})();

let STATES = null;
function states() {
  if (!STATES) {
    let s = null;
    STATES = SIM_FRAMES.map((f) => { s = normalizeCs2(f.payload, s, { nowMs: Math.round(f.t * 1000) }).state; return { t: f.t, state: s }; });
  }
  return STATES;
}

let memo = { key: null, value: null };

/** ctx.data.gamelink of the demo round at t seconds (the same object for the same instant). */
export function simGameLink(t) {
  const tt = Math.max(0, Number.isFinite(+t) ? +t : 0);
  const k = Math.floor(tt / SIM_LOOP + 1e-9);
  const phase = tt - k * SIM_LOOP;
  const S = states();
  let i = 0;
  for (let j = 0; j < S.length; j++) if (S[j].t <= phase + 1e-9) i = j;
  const v = gameLinkView(S[i].state, Math.round(phase * 1000));
  const key = `${k}|${i}|${v.events.length}`;
  if (memo.key === key) return memo.value;
  const shift = Math.round(k * SIM_LOOP * 1000);
  const value = { ...v, at: v.at + shift, rev: v.rev + k * 1000, events: v.events.map((e) => ({ ...e, at: e.at + shift, seq: e.seq + k * 1000 })) };
  memo = { key, value };
  return value;
}
