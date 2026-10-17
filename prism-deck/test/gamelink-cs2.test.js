// Game Link · the pure halves (src/apps/sources/gamelink-cs2.js, gamelink-companion.js, the demo round in
// src/facets/gamelink/_gl-sim.js): every CS2 fixture frame replayed against the reference events
// (test/fixtures/gamelink/cs2/sequence.json), the lead's CS2 rules (no bomb timer, self vs spectating, flash hold,
// one strike a second, identities dropped), VDF + Steam library discovery on fake readers, the cfg text, and the
// companion mapper. Fictional data only; nothing here touches the disk outside the fixtures.
//
//   node --test test/gamelink-cs2.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeCs2, tickCs2, cs2NextTick, gameLinkView, sanitizeCs2, parseVdf, libraryFolders, vdfGet, findCs2, steamRoots, joinPath,
  cs2Cfg, isPrismCfg, cfgState, mapTitle, CFG_NAME, CFG_DATA, STATUSES, EVENT_TTL_MS, EVENT_MAX, FLASH_HOLD_MS, FLASH_STUCK_MS, FLASH_RESTRIKE, FLASH_STRIKE_GAP_MS, URGENT_EVENTS, roundReason, ROUND_REASONS,
} from '../src/apps/sources/gamelink-cs2.js';
import { normalizeCompanion, plainDetail, RESERVED_GAME_IDS } from '../src/apps/sources/gamelink-companion.js';
import { simGameLink, SIM_LOOP, SIM_FRAMES, SIM_ROUNDS } from '../src/facets/gamelink/_gl-sim.js';
import { simulatedGameLink } from '../src/apps/sources/gamelink-sim.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gamelink', 'cs2');
const SEQ = JSON.parse(fs.readFileSync(path.join(FIX, 'sequence.json'), 'utf8'));
const frame = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const T0 = Date.UTC(2026, 9, 10, 19, 0, 0);   // the fixtures' fictional match day
const clone = (o) => JSON.parse(JSON.stringify(o));
const r4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * The reference deriver's events, in our frozen v1 vocabulary. Deliberate differences (lead/DECISIONS.md, CS2):
 * no fuse / time-since-plant on bomb events (no bomb timer, ever); flash strengths 0–1 instead of 0–255; weapon names
 * without the "weapon_" prefix; round-win reasons in the v1 vocabulary (roundReason: 'ct_win_defuse' → 'bomb_defused').
 */
function expected(list) {
  return list.map((e) => {
    const o = { ...e };
    if (o.type === 'bombPlanted') delete o.fuseS;
    if (o.type === 'bombDefused' || o.type === 'bombExploded') delete o.afterS;
    if (o.type === 'flashOnset') { o.strength = r4(o.value / 255); delete o.value; }
    if (o.type === 'flashClear') o.peak = r4(o.peak / 255);
    if (typeof o.weapon === 'string') o.weapon = o.weapon.replace(/^weapon_/, '');
    if (o.type === 'roundWon' || o.type === 'roundLost') o.reason = roundReason(o.reason);
    return o;
  });
}

/** Replay the whole sequence: [{ fr, state, events }] */
function replay() {
  let st = null;
  return SEQ.frames.map((fr) => {
    const r = normalizeCs2(frame(fr.file), st, { nowMs: T0 + fr.atMs });
    st = r.state;
    return { fr, state: r.state, events: r.events };
  });
}

test('cs2: every fixture frame derives exactly the reference events (sequence.json)', () => {
  assert.equal(SEQ.frames.length, 41);
  for (const { fr, events } of replay()) {
    const got = events.map(({ at, seq, ...e }) => e);
    assert.deepEqual(got, expected(fr.expect), `${fr.file}: ${fr.note}`);
    for (const e of events) {
      if (e.type === 'bombPlanted') { assert.ok(!('at' in e) && !('seq' in e), 'the plant carries no time and takes no seq (no bomb timer)'); continue; }
      assert.equal(e.at, T0 + fr.atMs, 'events carry the receipt time'); assert.ok(Number.isInteger(e.seq));
    }
  }
});

test('cs2: statuses walk menu → loading → live → spectating → between → live → menu; event seq is monotonic', () => {
  const runs = replay();
  const statuses = runs.map((x) => x.state.status);
  const compact = statuses.filter((s, i) => s !== statuses[i - 1]);
  assert.deepEqual(compact, ['menu', 'loading', 'live', 'spectating', 'between', 'live', 'menu', 'live']);
  for (const s of statuses) assert.ok(STATUSES.includes(s));
  const seqs = runs.flatMap((x) => x.events.filter((e) => e.type !== 'bombPlanted').map((e) => e.seq));
  assert.deepEqual(seqs, seqs.map((_, i) => seqs[0] + i), 'consecutive: no gap where the plant was');
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
  assert.equal(new Set(seqs).size, seqs.length);
});

test('cs2: the v1 state reads the round, the match, our player, our weapon (fixture 16)', () => {
  const runs = replay();
  const s = runs.find((x) => x.fr.file === '16-kill-headshot.json').state;
  assert.equal(s.v, 1); assert.equal(s.game, 'cs2'); assert.equal(s.status, 'live');
  assert.deepEqual(s.player, { fresh: true, alive: true, team: 'CT', health: 73, armor: 91, helmet: true, flashed: 0, smoked: 0, burning: 0, money: 1450, equip: 4700, activity: 'playing' });
  assert.deepEqual(s.weapon, { name: 'm4a1_silencer', kind: 'rifle', clip: 4, clipMax: 20, reserve: 3, reserveUnit: 'mags', reloading: false, low: true });
  assert.deepEqual(s.stats, { kills: 9, assists: 1, deaths: 4, mvps: 2, score: 21, roundKills: 2, roundHs: 1 });
  assert.deepEqual(s.round, { phase: 'live', number: 7, bomb: null, win: null, result: null, reason: null });
  assert.equal(s.match.map, 'de_inferno'); assert.equal(s.match.title, 'Inferno');
  assert.deepEqual([s.match.side, s.match.us, s.match.them, s.match.target, s.match.matchPoint], ['CT', 4, 2, 13, null]);
  assert.equal(s.cs2.defuseKit, true);
  assert.equal(s.cs2.grenades.flashbang, 1);
  const win = runs.find((x) => x.fr.file === '22-round-win-defuse.json').state;
  assert.deepEqual(win.round, { phase: 'over', number: 7, bomb: 'defused', win: 'CT', result: 'win', reason: 'bomb_defused' });
  assert.equal(runs.find((x) => x.fr.file === '22-round-win-defuse.json').events.find((e) => e.type === 'roundWon').reason, 'bomb_defused');
  const lost = runs.find((x) => x.fr.file === '29-round-loss.json').state;
  assert.deepEqual([lost.round.result, lost.round.reason], ['loss', 'elimination']);
  assert.equal(runs.find((x) => x.fr.file === '23-freezetime-round8.json').state.round.reason, null, 'cleared with the next round');
  const mp = runs.find((x) => x.fr.file === '34-match-point.json').state;
  assert.equal(mp.match.matchPoint, 'us'); assert.equal(mp.match.side, 'T'); assert.equal(mp.round.number, 24);
  const over = runs.find((x) => x.fr.file === '36-gameover-win.json').state;
  assert.equal(over.match.result, 'win'); assert.deepEqual([over.match.us, over.match.them], [13, 11]);
  assert.equal(over.round.reason, 'elimination', 'the last round reason rides the gameover post');
  const reload = runs.find((x) => x.fr.file === '18-reload-done.json').state;
  assert.equal(reload.weapon.reloading, true); assert.equal(reload.weapon.low, false, 'never "low" while reloading');
});

test('cs2: no bomb timer, ever — the bomb is a state; no plant time, fuse or countdown anywhere', () => {
  const runs = replay();
  const planted = runs.find((x) => x.fr.file === '20-bomb-planted.json');
  assert.equal(planted.state.round.bomb, 'planted');
  assert.deepEqual(planted.events, [{ type: 'bombPlanted' }], 'the plant: no at, no seq (returned to the listener for the push only)');
  assert.ok(!planted.state.events.some((e) => e.type === 'bombPlanted'), 'never in state.events (what facets see)');
  assert.equal(planted.state.at, runs.find((x) => x.fr.file === '19-reload-end.json').state.at, 'a post that only plants the bomb keeps state.at');
  const heartbeat = runs.find((x) => x.fr.file === '21-defusing-heartbeat.json');
  assert.deepEqual(heartbeat.events, [], 'a heartbeat while planted changes nothing');
  assert.equal(heartbeat.state.rev, planted.state.rev, 'the same state: frames dedupe');
  for (const { state } of runs) {
    const text = JSON.stringify(gameLinkView(state, state.at));
    assert.doesNotMatch(text, /plantedAt|explodesAt|c4EndsAt|"fuse|afterS|countdown|cutoff|phase_ends_in|timeLeft/i);
  }
  // the spectator-only bomb block (GOTV countdown) never reaches the state
  const spec = normalizeCs2(JSON.parse(fs.readFileSync(path.join(FIX, 'spectator-only', 'gotv-bomb-defusing.json'), 'utf8')), null, { nowMs: T0 });
  assert.equal(spec.state.status, 'watching');
  assert.deepEqual(spec.events.map((e) => e.type), ['context']);
  assert.equal(spec.state.player, null, 'never the observed player in GOTV / a demo');
  assert.doesNotMatch(JSON.stringify(spec.state), /countdown|defusing|allplayers|round_totaldmg|position/);
});

test('cs2: identities are dropped at the edge (Steam ids, names, slots never in the state)', () => {
  for (const { state } of replay()) {
    const text = JSON.stringify(gameLinkView(state, state.at));
    assert.doesNotMatch(text, /7656119800000000|PrismPilot|Lumen|observer_slot|steamid|prism-gsi-example-token/);
  }
  const s = sanitizeCs2(frame('27-spectating-teammate.json'));
  assert.equal(s.player.self, false);
  assert.ok(!('steamid' in s.player) && !('name' in s.player));
  assert.equal(sanitizeCs2(frame('15-kill.json')).player.self, true);
  assert.equal(sanitizeCs2({ provider: { appid: 570 } }), null, 'not CS2');
  assert.equal(sanitizeCs2('nope'), null);
});

test('cs2: spectating shows OUR last values, dimmed — never the teammate\'s vitals or flash', () => {
  const runs = replay();
  const death = runs.find((x) => x.fr.file === '26-death.json').state;
  for (const f of ['27-spectating-teammate.json', '28-spectating-teammate-flashed.json', '29-round-loss.json']) {
    const s = runs.find((x) => x.fr.file === f).state;
    assert.equal(s.status, 'spectating', f);
    assert.equal(s.player.fresh, false); assert.equal(s.player.alive, false);
    assert.equal(s.player.health, 0, 'our health, not the teammate\'s'); assert.equal(s.player.flashed, 0, 'the teammate\'s flash is not ours');
    assert.equal(s.player.money, death.player.money);
    assert.deepEqual(s.stats, death.stats);
    assert.equal(s.weapon, null);
  }
  const loss = runs.find((x) => x.fr.file === '29-round-loss.json').state;
  assert.equal(loss.round.result, 'loss');
  const between = runs.find((x) => x.fr.file === '30-round-over-no-player.json').state;
  assert.equal(between.status, 'between'); assert.equal(between.player.fresh, false);
});

test('cs2: resync frames (03, 31, 33, 38) re-baseline silently: no kills, money or MVPs from 600 s of history', () => {
  const runs = replay();
  for (const f of ['03-freezetime.json', '31-halftime.json', '33-round23-over.json', '38-dm-live.json']) {
    const types = runs.find((x) => x.fr.file === f).events.map((e) => e.type);
    assert.ok(types.includes('resync'), f);
    for (const t of ['kill', 'money', 'mvp', 'hurt', 'death']) assert.ok(!types.includes(t), `${f}: ${t}`);
  }
});

// ── the flash model (H1 + FIXLIST 1: gamelink-fix) ──────────────────────────
/** A CS2 heartbeat: the same body with no delta blocks (CS2 sends it 5 s after our last 204 when nothing changed). */
const heartbeat = (f) => { const b = clone(frame(f)); delete b.previously; delete b.added; return b; };
const flashedBody = (v, base = '08-flash-onset.json') => { const p = frame(base); p.player.state.flashed = v; return p; };
const isStrike = (e) => e.type === 'flashOnset' || e.type === 'flashFull';

/** Interleave posts [{ at, body }] with the listener's timer (cs2NextTick → tickCs2) up to endMs, like gamelink.js does. */
function drive(st, posts, endMs) {
  const out = [], vis = [];
  let i = 0;
  for (let guard = 0; guard < 10000; guard++) {
    const due = cs2NextTick(st), next = posts[i];
    if (next && (due === null || next.at <= due)) {
      const r = normalizeCs2(next.body, st, { nowMs: next.at });
      st = r.state; out.push(...r.events.map((e) => ({ ...e, at: next.at, via: 'post' }))); vis.push([next.at, st.player?.flashed ?? 0]); i++;
      continue;
    }
    if (due !== null && due <= endMs) {
      const r = tickCs2(st, due);
      assert.notEqual(cs2NextTick(r.state), due, 'a tick always moves on (no busy timer)');
      st = r.state; out.push(...r.events.map((e) => ({ ...e, via: 'tick' }))); vis.push([due, st.player?.flashed ?? 0]);
      continue;
    }
    return { st, out, vis };
  }
  throw new Error('drive: no progress');
}
const liveBefore = () => { let st = null; for (const f of ['06-round-live.json', '07-hurt.json']) st = normalizeCs2(frame(f), st, { nowMs: T0 }).state; return st; };
const FADE = ['09-flash-fade-1.json', '10-flash-fade-2.json', '11-flash-fade-3.json', '12-flash-fade-4.json', '13-flash-fade-5.json', '14-flash-clear.json'];

test('cs2: silence while flashed holds the value; the safety clear fires once, after FLASH_HOLD_MS without a post, and masks the value', () => {
  const on = normalizeCs2(frame('08-flash-onset.json'), liveBefore(), { nowMs: T0 + 1000 });
  assert.equal(on.state.player.flashed, 1);
  assert.ok(FLASH_HOLD_MS > 5000 && FLASH_STUCK_MS > FLASH_HOLD_MS, 'both holds are longer than the 5 s heartbeat');
  // the plateau: no posts for 1.9 s — still fully white
  assert.equal(tickCs2(on.state, T0 + 2900).state, on.state, 'nothing due yet');
  assert.equal(gameLinkView(on.state, T0 + 2900).player.flashed, 1);
  assert.equal(cs2NextTick(on.state), T0 + 1000 + FLASH_HOLD_MS, 'silence: cleared FLASH_HOLD_MS after the last post');
  // CS2 went quiet: cleared once
  const cleared = tickCs2(on.state, T0 + 1000 + FLASH_HOLD_MS);
  assert.equal(cleared.state.player.flashed, 0);
  assert.deepEqual(cleared.events.map(({ type, peak, timeout }) => ({ type, peak, timeout })), [{ type: 'flashClear', peak: 1, timeout: true }]);
  assert.equal(cs2NextTick(cleared.state), null);
  assert.equal(tickCs2(cleared.state, T0 + 20000).events.length, 0);
  // after the clear: the game's fade (still blind, falling) never strikes again, and its own clear doesn't fire twice
  let s = cleared.state;
  const after = [], levels = [];
  for (const f of FADE) { const r = normalizeCs2(frame(f), s, { nowMs: T0 + 8000 + levels.length * 50 }); s = r.state; after.push(...r.events.map((e) => e.type)); levels.push(s.player.flashed); }
  assert.deepEqual(after.filter((t) => t.startsWith('flash')), [], 'a fade after a timeout: no onset, no full, no second clear');
  assert.deepEqual(levels, [0, 0, 0, 0, 0, 0], 'masked: the timed-out flash never comes back');
  // …but a real new flash afterwards strikes as usual
  const again = normalizeCs2(frame('08-flash-onset.json'), s, { nowMs: T0 + 12000 });
  assert.deepEqual(again.events.filter(isStrike).map((e) => e.type), ['flashOnset', 'flashFull']);
  // a fade without a timeout (fixtures 09–14) follows the payloads down
  s = on.state;
  levels.length = 0;
  for (const f of FADE) { s = normalizeCs2(frame(f), s, { nowMs: T0 + 3000 }).state; levels.push(s.player.flashed); }
  assert.deepEqual(levels, [r4(177 / 255), r4(113 / 255), r4(64 / 255), r4(28 / 255), r4(7 / 255), 0]);
});

test('cs2: the 5 s heartbeat holds a flash (it refreshes the hold); a stuck 255 stream clears exactly once and never strikes again (H1)', () => {
  const on = normalizeCs2(frame('08-flash-onset.json'), liveBefore(), { nowMs: T0 + 1000 }).state;
  // the heartbeat 4.99 s later still says 255: the flash holds, nothing is pushed, and the silence hold restarts
  const hb = normalizeCs2(heartbeat('08-flash-onset.json'), on, { nowMs: T0 + 1000 + 4990 });
  assert.deepEqual(hb.events, []); assert.equal(hb.state.rev, on.rev, 'no push for a heartbeat');
  assert.equal(hb.state.player.flashed, 1);
  assert.equal(tickCs2(hb.state, T0 + 1000 + 5000).events.length, 0, 'no clear at 5 s: no white → clear → white race with the heartbeat');
  assert.equal(cs2NextTick(hb.state), T0 + 1000 + FLASH_STUCK_MS, 'now the stuck rule (same value) is the nearer one');
  // a stuck stream: heartbeats repeat 255 every 5 s for 30 s
  const posts = Array.from({ length: 6 }, (_, k) => ({ at: T0 + 1000 + (k + 1) * 5000, body: heartbeat('08-flash-onset.json') }));
  const { out, st } = drive(on, posts, T0 + 40000);
  assert.deepEqual(out.map((e) => `${e.type}${e.timeout ? '(timeout)' : ''}`), ['flashClear(timeout)'], 'exactly one clear, no re-onset, no strobe');
  assert.equal(st.player.flashed, 0);
  // CS2 went silent mid-flash (no heartbeat at all): one clear at FLASH_HOLD_MS
  const quiet = drive(on, [], T0 + 40000);
  assert.deepEqual(quiet.out.map((e) => [e.type, e.timeout]), [['flashClear', true]]);
});

test('cs2: the visible flash never rises between strikes — a stream that dips and comes back brightens at most once a second (FIXLIST 1)', () => {
  // 255 ↔ 40 every 100 ms for 3 s (never 0, so no flashClear guards the facets), then the clear
  const posts = Array.from({ length: 30 }, (_, k) => ({ at: T0 + 1000 + k * 100, body: flashedBody(k % 2 ? 40 : 255) }));
  posts.push({ at: T0 + 4100, body: flashedBody(0) });
  const { out, vis } = drive(liveBefore(), posts, T0 + 6000);
  const rises = vis.filter(([, v], i) => i > 0 && v > vis[i - 1][1]).map(([t]) => t);
  assert.ok(rises.length >= 2 && rises.length <= 4, `rises at ${rises.map((t) => t - T0)}`);
  for (let i = 1; i < rises.length; i++) assert.ok(rises[i] - rises[i - 1] >= FLASH_STRIKE_GAP_MS, 'the deck brightens at most once a second');
  const strikesAt = out.filter(isStrike).map((e) => e.at);
  for (let i = 1; i < strikesAt.length; i++) assert.ok(strikesAt[i] === strikesAt[i - 1] || strikesAt[i] - strikesAt[i - 1] >= FLASH_STRIKE_GAP_MS);
  assert.equal(out.filter((e) => e.type === 'flashClear').length, 1, 'one clear at the end');
  // a small dip-then-rise (noise, < FLASH_RESTRIKE) is held: non-increasing between strikes
  let st = normalizeCs2(flashedBody(200), liveBefore(), { nowMs: T0 + 1000 }).state;
  st = normalizeCs2(flashedBody(180), st, { nowMs: T0 + 3000 }).state;
  const jitter = normalizeCs2(flashedBody(180 + FLASH_RESTRIKE - 1), st, { nowMs: T0 + 3100 });
  assert.equal(jitter.state.player.flashed, r4(180 / 255), 'held at the low point');
  assert.deepEqual(jitter.events, []);
  // a strike the gap holds back is deferred, not dropped: the listener's timer applies it once the second is up
  let s = normalizeCs2(flashedBody(255), liveBefore(), { nowMs: T0 + 1000 }).state;
  s = normalizeCs2(flashedBody(40), s, { nowMs: T0 + 1300 }).state;
  const held = normalizeCs2(flashedBody(255), s, { nowMs: T0 + 1500 });
  assert.equal(held.state.player.flashed, r4(40 / 255), 'too soon: held');
  assert.equal(cs2NextTick(held.state), T0 + 2000, 'due when the second is up');
  const later = tickCs2(held.state, T0 + 2000);
  assert.equal(later.state.player.flashed, 1);
  assert.deepEqual(later.events.map((e) => e.type), ['flashFull'], 'a re-flash inside the fade: full, no new onset');
});

test('cs2: the first post after a restart mid-match is a baseline — context only, never the plant, win or gameover it merely describes (M1)', () => {
  for (const f of ['20-bomb-planted.json', '22-round-win-defuse.json', '36-gameover-win.json']) {
    const r = normalizeCs2(frame(f), null, { nowMs: T0 });
    assert.deepEqual(r.events.map((e) => e.type), ['context'], f);
    assert.equal(r.state.status, 'live', f);
    assert.ok(r.state.match.side, `${f}: our side is known from the baseline`);
  }
  // and the stream goes on normally from there
  let st = normalizeCs2(frame('20-bomb-planted.json'), null, { nowMs: T0 }).state;
  st = normalizeCs2(frame('21-defusing-heartbeat.json'), st, { nowMs: T0 + 5000 }).state;
  const win = normalizeCs2(frame('22-round-win-defuse.json'), st, { nowMs: T0 + 6000 });
  assert.deepEqual(win.events.map((e) => e.type), ['roundWon', 'bombDefused', 'mvp', 'money']);
  // a flash already in progress at the restart shows nothing until a real new strike
  const mid = normalizeCs2(frame('09-flash-fade-1.json'), null, { nowMs: T0 });
  assert.equal(mid.state.player.flashed, 0);
  const fade = normalizeCs2(frame('10-flash-fade-2.json'), mid.state, { nowMs: T0 + 500 });
  assert.deepEqual([fade.events, fade.state.player.flashed], [[], 0]);
});

test('cs2: no teamKill from a stats reset (warmup → match) or a suicide; a real team kill still counts (L1)', () => {
  const w = frame('02-warmup.json');
  const warm = clone(w); warm.player.match_stats = { kills: 3, assists: 0, deaths: 1, mvps: 0, score: 6 };
  const start = clone(w);
  start.map.phase = 'live'; start.round = { phase: 'freezetime' }; start.player.state.money = 800;
  start.player.match_stats = { kills: 0, assists: 0, deaths: 0, mvps: 0, score: 0 };
  start.previously = { map: { phase: 'warmup' }, player: { match_stats: { kills: 3, deaths: 1, score: 6 } } };
  let st = null;
  for (const f of ['00-main-menu.json', '01-map-loading.json']) st = normalizeCs2(frame(f), st, { nowMs: T0 }).state;
  st = normalizeCs2(warm, st, { nowMs: T0 + 1000 }).state;
  assert.ok(!normalizeCs2(start, st, { nowMs: T0 + 2000 }).events.some((e) => e.type === 'teamKill'), 'warmup → match start');
  let s = normalizeCs2(frame('24-round8-live.json'), null, { nowMs: T0 }).state;
  s = normalizeCs2(frame('25-hurt-heavy.json'), s, { nowMs: T0 + 1000 }).state;
  const suicide = clone(frame('26-death.json')); suicide.player.match_stats.kills = frame('25-hurt-heavy.json').player.match_stats.kills - 1;
  assert.deepEqual(normalizeCs2(suicide, s, { nowMs: T0 + 2000 }).events.map((e) => e.type), ['hurt', 'death'], 'a suicide / fall: −1 kill and a death');
  const tk = clone(frame('25-hurt-heavy.json')); tk.player.match_stats.kills -= 1;
  assert.ok(normalizeCs2(tk, s, { nowMs: T0 + 2000 }).events.some((e) => e.type === 'teamKill'), 'kills −1 alive, nothing reset: a team kill');
});

test('cs2: a demo or GOTV of your own view is "watching", not live (L5: spectator-only fields inside the components we subscribe)', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(FIX, 'spectator-only', 'gotv-bomb-defusing.json'), 'utf8'));
  for (const k of ['allplayers', 'bomb', 'phase_countdowns', 'grenades']) delete spec[k];   // our cfg never asks for these
  spec.player.steamid = spec.provider.steamid;                                            // the demo camera on us
  const noPos = clone(spec); delete noPos.player.position; delete noPos.player.forward; delete noPos.player.spectarget;   // player_state's round_totaldmg alone
  const noDmg = clone(spec); delete noDmg.player.state.round_totaldmg;                                                      // the player position alone
  for (const [name, body] of [['round_totaldmg', noPos], ['position', noDmg]]) {
    const a = normalizeCs2(body, null, { nowMs: T0 });
    const flashed = clone(body); flashed.player.state.flashed = 255; flashed.previously = { player: { state: { flashed: 0 } } };
    const b = normalizeCs2(flashed, a.state, { nowMs: T0 + 2000 });
    assert.equal(b.state.status, 'watching', name);
    assert.equal(b.state.player, null, `${name}: never the demo's vitals`);
    assert.deepEqual(b.events, [], `${name}: no flash, hurt or round events from a demo`);
  }
  // live play never carries either (every live fixture stays self / observing)
  for (const fr of SEQ.frames) assert.equal(sanitizeCs2(frame(fr.file)).spectator, false, fr.file);
});

test('cs2: gameover with our side unknown has no result (L6); dying flashed leaves no stale flashClear for the next round (L7)', () => {
  const st = normalizeCs2(frame('01-map-loading.json'), null, { nowMs: T0 }).state;   // no player yet: our side unknown
  const over = clone(frame('36-gameover-win.json')); delete over.player;
  over.map.name = frame('01-map-loading.json').map.name;
  over.map.round = frame('01-map-loading.json').map.round;   // no round jump (that would be a silent resync)
  const g = normalizeCs2(over, st, { nowMs: T0 + 1000 }).events.find((e) => e.type === 'gameover');
  assert.deepEqual([g.result, g.us, g.them], [null, null, null], 'never "draw" for an unknown side');
  // L7: die at flashed 200 → spectate → round over → the next freeze time: no flashClear
  const d = clone(frame('26-death.json')); d.player.state.flashed = 200;
  let s = null;
  for (const [i, b] of [frame('24-round8-live.json'), frame('25-hurt-heavy.json'), d, frame('27-spectating-teammate.json'), frame('29-round-loss.json'), frame('30-round-over-no-player.json')].entries()) s = normalizeCs2(b, s, { nowMs: T0 + i * 1000 }).state;
  const ft = clone(frame('23-freezetime-round8.json')); ft.map.round = 8; ft.previously = { round: { phase: 'over' } };
  const next = normalizeCs2(ft, s, { nowMs: T0 + 10000 });
  assert.ok(!next.events.some((e) => e.type === 'flashClear'), `next freeze time: ${next.events.map((e) => e.type)}`);
  assert.equal(next.state.player.flashed, 0);
  assert.equal(cs2NextTick(next.state), null, 'no safety clear pending either');
});

test('cs2: the reserve says "mags" only where magazines are known; unknown units are null, big numbers a count (L8)', () => {
  const p = frame('15-kill.json');
  const unit = (name, type, reserve) => { const q = clone(p); q.player.weapons.weapon_2 = { name: `weapon_${name}`, paintkit: 'default', type, ammo_clip: 10, ammo_clip_max: 100, ammo_reserve: reserve, state: 'active' }; return normalizeCs2(q, null, { nowMs: T0 }).state.weapon.reserveUnit; };
  assert.equal(unit('negev', 'Machine Gun', 2), null);
  assert.equal(unit('m249', 'Machine Gun', 2), null);
  assert.equal(unit('revolver', 'Pistol', 1), null);
  assert.equal(unit('cz75a', 'Pistol', 1), null);
  assert.equal(unit('ak47', 'Rifle', 3), 'mags');
  assert.equal(unit('ak47', 'Rifle', 90), 'count', 'a reserve too big to be magazines is a round count');
  assert.equal(unit('nova', 'Shotgun', 24), 'shells');
});

test('cs2: no facet-visible field tells how long ago the bomb was planted — two plants at different times give identical views (L9)', () => {
  // the same round, with the plant post arriving 0.6 s or 9.6 s after the reload ended: everything else identical
  const from = SEQ.frames.findIndex((f) => f.file === '06-round-live.json'), to = SEQ.frames.findIndex((f) => f.file === '20-bomb-planted.json');
  const world = (plantAt) => {
    let st = null;
    for (const fr of SEQ.frames.slice(from, to)) st = normalizeCs2(frame(fr.file), st, { nowMs: T0 + fr.atMs }).state;
    const plant = normalizeCs2(frame('20-bomb-planted.json'), st, { nowMs: T0 + plantAt });
    const hb = normalizeCs2(frame('21-defusing-heartbeat.json'), plant.state, { nowMs: T0 + 703400 });
    return { plant, hb };
  };
  const a = world(667200), b = world(676200);
  assert.deepEqual(a.plant.events.map((e) => e.type), ['bombPlanted']);
  assert.equal(a.plant.state.round.bomb, 'planted');
  for (const now of [677000, 690000, 703000]) {
    const va = gameLinkView(a.plant.state, T0 + now), vb = gameLinkView(b.plant.state, T0 + now);
    assert.deepEqual(va, vb, `identical views ${now - 676200} ms after the later plant`);
    assert.ok(!va.events.some((e) => e.type === 'bombPlanted'));
  }
  assert.deepEqual(gameLinkView(a.hb.state, T0 + 704000), gameLinkView(b.hb.state, T0 + 704000), 'after the heartbeat too');
  // the defuse is a one-shot with its own time (the round is over: nothing left to time)
  const d = normalizeCs2(frame('22-round-win-defuse.json'), a.hb.state, { nowMs: T0 + 708600 });
  assert.equal(d.state.events.find((e) => e.type === 'bombDefused').at, T0 + 708600);
});


test('cs2: at most one flash strike a second (photosensitivity); a re-flash inside a fade extends it', () => {
  let st = normalizeCs2(frame('07-hurt.json'), null, { nowMs: T0 }).state;
  const set = (v) => { const p = frame('08-flash-onset.json'); p.player.state.flashed = v; return p; };
  const strikes = [];
  const feed = (v, ms) => { const r = normalizeCs2(set(v), st, { nowMs: T0 + ms }); st = r.state; strikes.push(...r.events.filter((e) => e.type === 'flashOnset' || e.type === 'flashFull').map((e) => [e.type, ms])); };
  feed(255, 100); feed(0, 300); feed(255, 500); feed(0, 700); feed(200, 900); feed(0, 1050); feed(255, 1200);
  assert.deepEqual(strikes, [['flashOnset', 100], ['flashFull', 100], ['flashOnset', 1200], ['flashFull', 1200]]);
  assert.equal(st.player.flashed, 1, 'the value always follows the game');
  st = normalizeCs2(frame('07-hurt.json'), null, { nowMs: T0 }).state;
  strikes.length = 0;
  feed(255, 0); feed(120, 2000); feed(255, 2100);   // a second flashbang during the fade
  assert.deepEqual(strikes, [['flashOnset', 0], ['flashFull', 0], ['flashFull', 2100]], 'no new onset inside a fade');
});

test('cs2: events stay ≤ 10 s and ≤ 16; the view prunes, the state never mutates', () => {
  let st = null;
  const p = frame('15-kill.json');
  st = normalizeCs2(frame('06-round-live.json'), st, { nowMs: T0 }).state;
  for (let i = 0; i < 30; i++) {
    const q = clone(p);
    q.player.state.money = 1000 + i;   // one money event a post
    st = normalizeCs2(q, st, { nowMs: T0 + i * 100 }).state;
  }
  assert.equal(st.events.length, EVENT_MAX);
  const v = gameLinkView(st, T0 + 2900 + EVENT_TTL_MS - 500);
  assert.ok(v.events.length < EVENT_MAX && v.events.length > 0);
  assert.equal(gameLinkView(st, T0 + 60_000).events.length, 0);
  assert.equal(st.events.length, EVENT_MAX, 'the view is a copy');
  const frozen = Object.freeze(clone(frame('16-kill-headshot.json')));
  assert.doesNotThrow(() => normalizeCs2(frozen, st, { nowMs: T0 + 5000 }), 'inputs are never mutated');
  assert.ok([...URGENT_EVENTS].every((t) => typeof t === 'string'));
  assert.ok(!URGENT_EVENTS.has('money'));
});

test('cs2: a body that isn\'t CS2 returns the previous state untouched', () => {
  const st = normalizeCs2(frame('07-hurt.json'), null, { nowMs: T0 }).state;
  const r = normalizeCs2({ provider: { appid: 440 }, player: {} }, st, { nowMs: T0 + 1 });
  assert.equal(r.rejected, true); assert.equal(r.state, st); assert.deepEqual(r.events, []);
});

test('cs2: weapons — kinds, magazines vs shells, grenades; map titles', () => {
  const p = frame('15-kill.json');
  p.player.weapons.weapon_2 = { name: 'weapon_nova', paintkit: 'default', type: 'Shotgun', ammo_clip: 8, ammo_clip_max: 8, ammo_reserve: 24, state: 'active' };
  const s = normalizeCs2(p, null, { nowMs: T0 }).state;
  assert.deepEqual([s.weapon.kind, s.weapon.reserveUnit, s.weapon.reserve], ['shotgun', 'shells', 24]);
  p.player.weapons.weapon_2 = { name: 'weapon_hegrenade', paintkit: 'default', type: 'Grenade', ammo_reserve: 1, state: 'active' };
  const g = normalizeCs2(p, null, { nowMs: T0 }).state;
  assert.deepEqual([g.weapon.kind, g.weapon.clip, g.weapon.reserveUnit, g.weapon.low], ['grenade', null, 'count', false]);
  assert.equal(g.cs2.grenades.he, 1);
  assert.deepEqual(['ct_win_elimination', 't_win_elimination', 'ct_win_defuse', 't_win_bomb', 'ct_win_time', 't_win_time', 'ct_win_rescue', 'ct_win_surrender', 'weird', '', null].map(roundReason),
    ['elimination', 'elimination', 'bomb_defused', 'bomb_exploded', 'time', 'time', 'rescue', 'other', 'other', null, null]);
  assert.ok(ROUND_REASONS.includes('other'));
  assert.equal(mapTitle('de_inferno'), 'Inferno'); assert.equal(mapTitle('cs_office'), 'Office'); assert.equal(mapTitle('workshop/123/aim_redline'), 'Redline'); assert.equal(mapTitle('de_dust2'), 'Dust2');
});

// ── VDF + discovery ─────────────────────────────────────────────────────────
const VDF_NEW = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"
\t\t"label"\t\t""
\t\t"apps"
\t\t{
\t\t\t"228980"\t\t"1234"
\t\t}
\t}
\t// a comment
\t"1"
\t{
\t\t"path"\t\t"D:\\\\ExampleLibrary"
\t\t"apps"
\t\t{
\t\t\t"730"\t\t"35000000000"
\t\t}
\t}
}`;
const VDF_OLD = `"LibraryFolders" { "TimeNextStatsReport" "1791600000" "ContentStatsID" "-1" "1" "E:\\\\OldLibrary" }`;

test('vdf: new and old libraryfolders formats, escapes, comments, conditionals, no prototype keys', () => {
  const v = parseVdf(VDF_NEW);
  const libs = libraryFolders(v);
  assert.deepEqual(libs.map((l) => l.path), ['C:\\Program Files (x86)\\Steam', 'D:\\ExampleLibrary']);
  assert.ok(libs[1].apps.has('730') && !libs[0].apps.has('730'));
  assert.deepEqual(libraryFolders(parseVdf(VDF_OLD)), [{ path: 'E:\\OldLibrary', apps: null }]);
  const acf = parseVdf('"AppState"\n{\n "appid" "730"\n "installdir" "Counter-Strike Global Offensive" [$WIN32]\n "name" "Counter-Strike 2"\n}');
  assert.equal(vdfGet(acf, 'appstate').installdir, 'Counter-Strike Global Offensive');
  assert.equal(vdfGet(acf, 'AppState').name, 'Counter-Strike 2');
  const evil = parseVdf('"__proto__" { "polluted" "1" } "x" "y"');
  assert.equal({}.polluted, undefined); assert.equal(evil.x, 'y');
  assert.deepEqual(parseVdf(''), {}); assert.deepEqual(parseVdf('"a" {'), { a: {} });
});

/** A fake read-only file system for findCs2: { 'path': 'text' | true (dir) }. */
function fakeIo(platform, files, extra = {}) {
  const norm = (p) => (platform === 'win32' ? p.replace(/\//g, '\\').toLowerCase() : p);
  const map = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]));
  const isDirPath = (p) => [...map.keys()].some((k) => k.startsWith(norm(p) + (platform === 'win32' ? '\\' : '/'))) || map.get(norm(p)) === true;
  return { platform, env: {}, home: '/home/example', readText: async (p) => (typeof map.get(norm(p)) === 'string' ? map.get(norm(p)) : null), isFile: async (p) => typeof map.get(norm(p)) === 'string', isDir: async (p) => isDirPath(p), ...extra };
}

test('discovery (Windows): registry SteamPath → libraryfolders → appmanifest → cs2.exe → cfg/ (a bare folder is not an install)', async () => {
  const reads = [];
  const reg = async (k, v) => { reads.push(`${k}\\${v}`); return k.startsWith('HKCU') ? 'c:/program files (x86)/steam' : null; };
  const base = {
    'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf': VDF_NEW,
    'D:\\ExampleLibrary\\steamapps\\appmanifest_730.acf': '"AppState" { "appid" "730" "installdir" "Counter-Strike Global Offensive" }',
    'D:\\ExampleLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe': 'MZ',
    'D:\\ExampleLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg\\gamestate_integration_steelseries.cfg': '"SteelSeries"',
  };
  const ok = await findCs2(fakeIo('win32', base, { readRegistry: reg }));
  assert.equal(ok.found, true);
  assert.equal(ok.cfgDir, 'D:\\ExampleLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\cfg');
  assert.equal(ok.cfgPath, ok.cfgDir + '\\' + CFG_NAME);
  assert.ok(reads[0].startsWith('HKCU\\Software\\Valve\\Steam'), 'HKCU SteamPath first');
  // this PC's situation: no library lists 730, no manifest — only a leftover folder → not found
  const leftover = { ...base };
  delete leftover['D:\\ExampleLibrary\\steamapps\\appmanifest_730.acf'];
  delete leftover['D:\\ExampleLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe'];
  const no = await findCs2(fakeIo('win32', leftover, { readRegistry: reg }));
  assert.deepEqual(no, { found: false, reason: 'not-installed', leftover: true });
  const noBin = { ...base };
  delete noBin['D:\\ExampleLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe'];
  assert.equal((await findCs2(fakeIo('win32', noBin, { readRegistry: reg }))).reason, 'no-binary');
  assert.equal((await findCs2(fakeIo('win32', {}, { readRegistry: async () => null }))).reason, 'no-steam');
  assert.equal((await findCs2({ platform: 'darwin' })).reason, 'unsupported');
});

test('discovery (Linux): ~/.steam/steam and ~/.local/share/Steam, deduped', async () => {
  const home = '/home/example';
  const lib = `${home}/.local/share/Steam`;
  const files = {
    [`${lib}/steamapps/libraryfolders.vdf`]: `"libraryfolders" { "0" { "path" "${lib}" "apps" { "730" "1" } } }`,
    [`${home}/.steam/steam/steamapps/libraryfolders.vdf`]: `"libraryfolders" { "0" { "path" "${lib}" "apps" { "730" "1" } } }`,
    [`${lib}/steamapps/appmanifest_730.acf`]: '"AppState" { "installdir" "Counter-Strike Global Offensive" }',
    [`${lib}/steamapps/common/Counter-Strike Global Offensive/game/bin/linuxsteamrt64/cs2`]: 'ELF',
    [`${lib}/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/x.cfg`]: '',
  };
  const io = fakeIo('linux', files, { home });
  assert.deepEqual(await steamRoots(io), [`${home}/.steam/steam`, lib]);
  const r = await findCs2(io);
  assert.equal(r.found, true);
  assert.equal(r.cfgPath, `${lib}/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/${CFG_NAME}`);
  assert.equal(joinPath('win32', 'c:/a/', '/b', 'c'), 'c:\\a\\b\\c');
  assert.equal(joinPath('linux', '/home/x/', 'y'), '/home/x/y');
});

// ── the cfg text ────────────────────────────────────────────────────────────
const TOKEN = 'ab'.repeat(32);

test('cfg: the exact gamestate_integration_prism.cfg text (DECISIONS: uri, 2 / 0 / 0.05 / 5, our token, player-only data + map_round_wins)', () => {
  const text = cs2Cfg({ port: 38140, token: TOKEN });
  assert.equal(text, [
    '"Prism Deck Game Link v1"',
    '{',
    '    // Written by Prism Deck (the Stream Deck plugin) when you clicked "Connect CS2".',
    '    // "Disconnect" in the plugin removes this file. It never changes other integrations.',
    '    "uri"       "http://127.0.0.1:38140/v1/cs2"',
    '    "timeout"   "2.0"',
    '    "buffer"    "0.0"',
    '    "throttle"  "0.05"',
    '    "heartbeat" "5.0"',
    '    "auth"',
    '    {',
    `        "token" "${TOKEN}"`,
    '    }',
    '    "data"',
    '    {',
    '        "provider"            "1"',
    '        "map"                 "1"',
    '        "map_round_wins"      "1"',
    '        "round"               "1"',
    '        "player_id"           "1"',
    '        "player_state"        "1"',
    '        "player_weapons"      "1"',
    '        "player_match_stats"  "1"',
    '    }',
    '}',
    '',
  ].join('\n'));
  assert.ok(/^[\x0a\x0d\x20-\x7e]*$/.test(text), 'plain ASCII, no BOM');
  assert.ok(!/allplayers|bomb|phase_countdowns|position|grenades/.test(text), 'nothing spectator-only');
  assert.deepEqual(CFG_DATA, ['provider', 'map', 'map_round_wins', 'round', 'player_id', 'player_state', 'player_weapons', 'player_match_stats']);
  // the parsed cfg is what CS2 reads
  const v = parseVdf(text)['Prism Deck Game Link v1'];
  assert.equal(v.uri, 'http://127.0.0.1:38140/v1/cs2'); assert.equal(v.auth.token, TOKEN); assert.equal(v.throttle, '0.05');
  assert.ok(isPrismCfg(text) && isPrismCfg(text.replace(/\n/g, '\r\n')));
  assert.equal(isPrismCfg('"SteelSeries Engine 3"\n{ }'), false);
  assert.equal(cfgState(null, { port: 38140, token: TOKEN }), 'absent');
  assert.equal(cfgState(text.replace(/\n/g, '\r\n'), { port: 38140, token: TOKEN }), 'current');
  assert.equal(cfgState(text, { port: 38141, token: TOKEN }), 'outdated');
  assert.equal(cfgState(text, { port: 38140, token: 'cd'.repeat(32) }), 'outdated');
  assert.equal(cfgState('"Other"{}', { port: 38140, token: TOKEN }), 'foreign');
  assert.throws(() => cs2Cfg({ port: 0, token: TOKEN }));
  assert.throws(() => cs2Cfg({ port: 38140, token: 'short' }));
  assert.throws(() => cs2Cfg({ port: 38140, token: '"; "uri" "http://evil.example' }));
});

// ── companions (Prism Sight, mod bridges) ───────────────────────────────────
const BATCH = (over = {}) => ({
  v: 1, source: 'prism-sight', game: 'factorio', session: 'run-0001', seq: 1, sentAt: T0,
  state: { status: 'live', player: { alive: true, health: 87.5, money: 12345 }, stats: { kills: 2 }, match: { map: 'Nauvis', mode: 'freeplay' }, detail: { research: 'Automation', rockets: 0, line: { belts: 120, items: ['iron-plate', 'gear'] } } },
  events: [{ type: 'researchDone', at: T0 - 100, tech: 'Automation' }],
  ...over,
});

test('companion: a batch becomes the game-neutral v1 state; extras at state[game]', () => {
  const r = normalizeCompanion(BATCH(), null, { nowMs: T0 + 5 });
  const s = r.state;
  assert.equal(s.v, 1); assert.equal(s.game, 'factorio'); assert.equal(s.source, 'prism-sight'); assert.equal(s.status, 'live');
  assert.equal(s.player.health, 87.5); assert.equal(s.player.armor, null, 'unknown vitals are null (keys show —)'); assert.equal(s.player.flashed, 0);
  assert.equal(s.weapon, null); assert.equal(s.round, null);
  assert.equal(s.stats.kills, 2); assert.equal(s.stats.deaths, null);
  assert.deepEqual(s.factorio, { research: 'Automation', rockets: 0, line: { belts: 120, items: ['iron-plate', 'gear'] } });
  assert.deepEqual(r.events.map(({ seq, ...e }) => e), [{ type: 'researchDone', tech: 'Automation', at: T0 + 5 }], 'stamped with the receipt time');
  assert.ok(!JSON.stringify(gameLinkView(s, T0 + 5)).includes('_companion'));
  // the same (session, seq) twice: ignored · a later batch without state keeps the last state
  assert.equal(normalizeCompanion(BATCH(), s, { nowMs: T0 + 6 }).duplicate, true);
  const next = normalizeCompanion({ v: 1, game: 'factorio', session: 'run-0001', seq: 2, events: [{ type: 'hurt', damage: 3 }] }, s, { nowMs: T0 + 7 });
  assert.equal(next.state.player.health, 87.5); assert.equal(next.state.events.length, 2); assert.equal(next.state.rev, s.rev + 1);
  // a new adapter run (session) starts its own seq
  assert.ok(!normalizeCompanion(BATCH({ session: 'run-0002' }), next.state, { nowMs: T0 + 8 }).duplicate);
});

test('companion: strict validation, clamping, stale events dropped, reserved ids refused', () => {
  for (const [body, err] of [
    [{ ...BATCH(), v: 2 }, 'bad_version'], [BATCH({ game: 'Factorio' }), 'bad_game'], [BATCH({ game: 'no-mans-sky' }), 'bad_game'], [BATCH({ game: 'cs2' }), 'bad_game'],
    [BATCH({ game: 'player' }), 'bad_game'], [BATCH({ session: '' }), 'bad_session'], [BATCH({ seq: -1 }), 'bad_seq'], [BATCH({ state: [] }), 'bad_state'],
    [BATCH({ events: {} }), 'bad_events'], [{ v: 1, game: 'nms', session: 's', seq: 0 }, 'bad_state'],
  ]) assert.equal(normalizeCompanion(body, null, { nowMs: T0 }).error, err, JSON.stringify(body).slice(0, 80));
  assert.ok(RESERVED_GAME_IDS.has('events') && RESERVED_GAME_IDS.has('cs2'));
  const r = normalizeCompanion(BATCH({ state: { status: 'bogus', player: { health: 900, flashed: 7, team: 'x'.repeat(200) } }, events: [{ type: 'old', at: T0 - 9000 }, { type: 'Bad Type' }, { type: 'ok', nested: { a: 1 }, n: Infinity, s: 'y'.repeat(100) }] }), null, { nowMs: T0 });
  assert.equal(r.state.status, 'live');
  assert.equal(r.state.player.health, 100); assert.equal(r.state.player.flashed, 1); assert.equal(r.state.player.team.length, 16);
  assert.deepEqual(r.events.map(({ at, seq, ...e }) => e), [{ type: 'ok', s: 'y'.repeat(64) }]);
  assert.deepEqual(plainDetail({ a: { b: { c: { d: 1 } } }, 'bad key': 1, f: NaN }), { a: { b: { c: null } }, f: null });
});

// ── the demo round ──────────────────────────────────────────────────────────
test('demo round: deterministic, loops every 60 s, walks the effects; the simulated source serves the same', () => {
  assert.equal(SIM_LOOP, 60); assert.equal(SIM_ROUNDS.length, 2);
  assert.ok(SIM_FRAMES.length > 20);
  assert.equal(simGameLink(12.3), simGameLink(12.3), 'the same object for the same instant');
  assert.deepEqual(simGameLink(12.3).player, simGameLink(12.3 + SIM_LOOP).player, 'loops');
  const at = (t) => simGameLink(t);
  assert.equal(at(8.5).player.flashed, 1); assert.equal(at(10.5).player.flashed, r4(64 / 255)); assert.equal(at(12).player.flashed, 0);
  assert.equal(at(20.5).round.bomb, 'planted'); assert.equal(at(27.5).round.result, 'win'); assert.equal(at(27.5).round.reason, 'bomb_defused');
  assert.equal(at(42).status, 'spectating'); assert.equal(at(46.5).player.flashed, 0, 'the teammate\'s flash is never ours');
  assert.equal(at(53).round.result, 'loss'); assert.equal(at(53).round.reason, 'elimination'); assert.equal(at(56).status, 'between');
  const seen = new Set();
  for (let t = 0; t < SIM_LOOP; t += 0.25) for (const e of at(t).events) seen.add(e.type);
  for (const ty of ['hurt', 'flashOnset', 'flashFull', 'flashClear', 'kill', 'multiKill', 'lowAmmo', 'reloadStart', 'reloadEnd', 'bombDefused', 'roundWon', 'mvp', 'roundStart', 'roundLive', 'death', 'roundLost']) assert.ok(seen.has(ty), ty);
  assert.ok(!seen.has('bombPlanted'), 'the plant is a state, never a timed event');
  assert.equal(at(20.5).round.bomb, 'planted');
  // event times are on the sim clock (t × 1000): ages are well-defined for a facet that simulates
  const ev = at(64).events.find((e) => e.type === 'roundLive');
  assert.equal(ev.at, (SIM_LOOP + 4) * 1000);
  assert.doesNotMatch(JSON.stringify(at(30)), /765000000000|Demo(Pilot|Wing)|steamid/);
  const src = simulatedGameLink({ now: () => 0 });
  assert.equal(src.mode, 'simulated');
  assert.deepEqual(src.snapshot(9_000).gamelink, simGameLink(9));
  for (let t = 0; t < 60; t += 3) assert.ok(STATUSES.includes(at(t).status));
});
