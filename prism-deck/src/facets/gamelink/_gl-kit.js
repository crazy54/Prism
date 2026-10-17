// Game Link kit (not a facet): how every gamelink-* facet reads ctx.data.gamelink, picks its effect tier and turns
// the game's events into QUANTIZED effect states. Pure: no drawing here (that's _gl-draw.js), no clocks of its own.
//
//   gameLinkOf(ctx)      → view { mode: 'demo' | 'waiting' | 'live', s (the v1 state or null), nowMs }
//                          absent → the demo round (simGameLink(ctx.t), nowMs = t × 1000); null → waiting; else live (ctx.now)
//   tierOf(ctx)          → 'full' | 'soft' | 'calm' | 'still'   (ctx.motion and the `effects` param; Still = static state only)
//   faceOf(view)         → 'demo-…' never: 'waiting' | 'menu' | 'loading' | 'watching' | 'live' | 'dead' | 'spectating' | 'paused'
//   fxOf(view, tier)     → the deck's effect state this instant: every field is a small integer step, so the frames of
//                          one effect are a handful of distinct images per surface (runtimes dedupe identical frames)
//   slotModel(slot, view, fx) → what one instrument shows (title, value, unit, sub, tone, bar …)
//   layoutOf(ctx)        → which instrument sits on each key / readout surface of a deck
//
// The CS2 rules (lead/DECISIONS.md) are enforced here:
//   - no bomb timer, ever: 'planted' is a steady pulse at a FIXED rate, phased on the wall clock (never on the plant
//     time); nothing grows with time since the plant. The source never shows facets when the plant arrived (no
//     bombPlanted event in the view: gamelink-fix L9), so the pulse itself is the plant's onset
//   - flash follows the game: the whiteout level is the game's `flashed` value (held through silence by the source),
//     only ever capped by the rise slew of the latest strike; ≤ 1 strike a second comes from the normalizer
//   - self vs spectating: effects come from OUR events only (the normalizer's); a spectating face never shows vitals
//     of the player we watch (the state never contains them)

import { simGameLink } from './_gl-sim.js';
import { clamp } from '../../scene/easing.js';

/** The data every Game Link facet reads (the catalog's dataShape). */
export const DATA_SHAPE = Object.freeze({
  gamelink: 'Game Link v1 (src/apps/sources/README.md § Game Link): { v, game, status, player { fresh, alive, team, health, armor, helmet, flashed 0–1, money, equip }, weapon { name, kind, clip, clipMax, reserve, reserveUnit, reloading, low }, stats, round { phase, number, bomb, result, reason }, match { map, title, side, us, them, target, matchPoint, result }, events [] } · absent = demo round · null = waiting',
});

// ── the three answers ─────────────────────────────────────────────────────────

/** ctx.data.gamelink → { mode, s, nowMs }. */
export function gameLinkOf(ctx) {
  const d = ctx.data;
  if (!d || !Object.hasOwn(d, 'gamelink') || d.gamelink === undefined) return { mode: 'demo', s: simGameLink(ctx.t), nowMs: Math.round(ctx.t * 1000) };
  const g = d.gamelink;
  if (!g || typeof g !== 'object') return { mode: 'waiting', s: null, nowMs: ctx.now };
  return { mode: 'live', s: g, nowMs: ctx.now };
}

/** The `effects` param every Game Link facet carries (default soft; full is opt-in; off = static state only). */
export const EFFECTS_PARAM = Object.freeze({ type: 'select', default: 'soft', options: ['soft', 'full', 'off'], label: 'Effects (soft · full · off)' });

/** The effect tier: Still (or effects off) → static state only; Calm → gentle; else the param. */
export function tierOf(ctx) {
  const e = ctx.params?.effects ?? 'soft';
  if (ctx.reduced || ctx.motion === 'still' || e === 'off') return 'still';
  if (ctx.motion === 'calm') return 'calm';
  return e === 'full' ? 'full' : 'soft';
}

/** The deck's face. */
export function faceOf(view) {
  if (view.mode === 'waiting' || !view.s) return 'waiting';
  const s = view.s;
  switch (s.status) {
    case 'menu': return 'menu';
    case 'loading': return 'loading';
    case 'watching': return 'watching';
    case 'paused': return 'paused';
    case 'spectating': case 'between': return 'spectating';
    case 'live': return s.player && s.player.fresh !== false && s.player.alive === false ? 'dead' : 'live';
    default: return 'menu';
  }
}

/** Where the match is: 'warmup' | 'freeze' | 'live' | 'planted' | 'over' | 'halftime' | 'gameover' | null. */
export function phaseOf(s) {
  if (!s?.match) return null;
  const m = s.match, r = s.round;
  if (m.phase === 'gameover') return 'gameover';
  if (m.phase === 'intermission') return 'halftime';
  if (m.phase === 'warmup') return 'warmup';
  if (!r) return m.phase === 'live' ? 'live' : null;
  if (r.phase === 'over') return 'over';
  if (r.phase === 'freezetime') return 'freeze';
  return r.bomb === 'planted' ? 'planted' : 'live';
}

// ── time and quantization ─────────────────────────────────────────────────────

/** The newest event of one of `types` no older than `win` s (and not from the future) → { e, a (age s) } | null. */
export function newest(view, types, win) {
  const list = view.s?.events;
  if (!Array.isArray(list)) return null;
  const set = typeof types === 'string' ? [types] : types;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (!e || !set.includes(e.type) || !Number.isFinite(e.at)) continue;
    const a = (view.nowMs - e.at) / 1000;
    if (a < -0.05) continue;
    return a < win ? { e, a: Math.max(0, a) } : null;
  }
  return null;
}

/** The step (0 … n − 1) of an effect lasting `dur` s at age a, or -1 once it is over. */
export const stepOf = (a, dur, n) => (a >= dur ? -1 : Math.min(n - 1, Math.floor((a / dur) * n + 1e-9)));

/** Flash whiteout levels per tier (the fade's distinct images per surface: rise + fall stay ≤ 8 sends on soft / full). */
export const FLASH_Q = Object.freeze({ full: 6, soft: 6, calm: 3 });
/** The whiteout's peak opacity per tier (the photosensitivity cap: never a 100 % white field). */
export const FLASH_PEAK = Object.freeze({ full: 0.93, soft: 0.85, calm: 0.45 });
/** Rise slew: the first frame of a strike shows at most half the peak; the full peak waits this long (s). */
export const FLASH_RISE = Object.freeze({ full: 0.08, soft: 0.12, calm: 0.5 });
/** After a flash clears, light without a new strike stays faint this long (s): ≤ 1 bright onset a second. */
export const FLASH_REARM_S = 1;
/** Planted: one pulse a second, whatever happens (a FIXED rate: not a timer). */
export const BOMB_PULSE_S = 1;
const PULSE_STEPS = [0, 1, 2, 3, 3, 2, 1, 0];   // a quantized triangle wave, 8 steps a period
/** Damage never paints more than this opacity (edge shards only, never a red field). */
export const HURT_MAX_ALPHA = 0.55;

const DUR = { hurt: 0.6, kill: 1.0, death: 2.4, round: 1.8, defuse: 1.2, explode: 1.4, money: 1.6, hurtLabel: 1.5 };

/**
 * The effect state at this instant. Every number is a step index, so identical instants of an effect give identical
 * frames. → { tier, flash, flashStill, hurt, kill, death, round, plant, pulse, defuse, explode, breathe, dim, face, phase }
 */
export function fxOf(view, tier) {
  const s = view.s, face = faceOf(view), phase = phaseOf(s);
  const fx = { tier, face, phase, flash: 0, flashRise: false, flashQ: FLASH_Q[tier] || 6, flashStill: false, hurt: null, kill: null, death: null, round: null, plant: null, pulse: 0, planted: false, defuse: null, explode: null, breathe: 0, dim: 0 };
  if (face === 'spectating' || face === 'watching' || face === 'paused') fx.dim = 2;
  else if (face === 'dead') fx.dim = 1;
  if (!s || face === 'watching' || face === 'waiting' || face === 'menu' || face === 'loading') return fx;
  const still = tier === 'still', calm = tier === 'calm';
  const p = s.player;

  // flash: follows the game's value; the latest strike limits the rise
  const f = p && p.fresh !== false ? clamp(+p.flashed || 0) : 0;
  if (still) fx.flashStill = f >= 0.3;
  else if (f > 0) {
    const Q = fx.flashQ;
    const lf = Math.min(Q, Math.max(1, Math.ceil(f * Q - 1e-6)));
    let lr = Q;
    const rise = FLASH_RISE[tier];
    const slew = (a) => (calm ? (a < rise / 2 ? 1 : a < rise ? 2 : Q) : a < rise ? Math.ceil(Q / 2) : Q);
    const strike = newest(view, ['flashOnset', 'flashFull'], 1.5);
    if (strike) lr = slew(strike.a);
    // photosensitivity: light that comes back within a second of a clear without a new strike (the normalizer allows
    // one a second) stays faint, then rises with the same slew: the deck never strobes on a stream that flickers
    const clear = newest(view, 'flashClear', FLASH_REARM_S + rise);
    if (clear && !(strike && strike.e.at > clear.e.at)) lr = Math.min(lr, clear.a < FLASH_REARM_S ? 1 : slew(clear.a - FLASH_REARM_S));
    fx.flash = Math.min(lf, lr);
    fx.flashRise = lr < lf;
  }
  if (still) {
    fx.planted = phase === 'planted';
    return fx;
  }

  // death: the glass cracks (drawn in over 0.3 s), holds, then fades into the dimmed face
  const de = newest(view, 'death', DUR.death);
  if (de) {
    const a = de.a;
    const k = calm ? (a < 1.6 ? 3 : a < 2.0 ? 4 : 5) : a < 0.3 ? Math.floor(a / 0.1) : a < 1.6 ? 3 : a < 2.0 ? 4 : 5;
    fx.death = { k, grow: k < 3 ? (k + 1) / 3 : 1, alpha: k <= 3 ? 1 : k === 4 ? 0.5 : 0.22, origin: 'health' };
  }
  // damage: a center-out splash of refracted shards, reach scaled by the damage taken (no direction exists: none invented)
  const hu = newest(view, 'hurt', DUR.hurt);
  if (hu && !(de && Math.abs(de.e.at - hu.e.at) < 1)) {
    const n = calm ? 2 : 6;
    const k = stepOf(hu.a, DUR.hurt, n);
    if (k >= 0) fx.hurt = { k, n, reach: clamp(0.3 + (+hu.e.damage || 0) / 90, 0.35, 1), dmg: +hu.e.damage || 0 };
  }
  // kill: a spectral shard burst on the kill counter, rippling across the deck; headshot sharper; multi-kills escalate
  const ki = newest(view, 'kill', DUR.kill);
  if (ki) {
    const mk = s.events.find((e) => e.type === 'multiKill' && e.at === ki.e.at);
    const count = Math.max(1, Math.min(5, +(mk?.count ?? ki.e.roundKills ?? 1) || 1));
    const n = calm ? 4 : 10;
    const k = stepOf(ki.a, DUR.kill, n);
    if (k >= 0) fx.kill = { k, n, headshot: !!ki.e.headshot, count, label: mk?.label || null };
  }
  // round end: a sweep in the winner's color with the reason's flavor (a loss is a cool fade)
  const ro = newest(view, ['roundWon', 'roundLost'], DUR.round);
  if (ro) {
    const won = ro.e.type === 'roundWon';
    const a = ro.a;
    let sweep = -1, wash = 0;
    if (won && !calm) { if (a < 0.9) sweep = Math.floor(a / 0.09); wash = a < 0.9 ? 0 : a < 1.35 ? 2 : 1; }
    else wash = a < 0.6 ? 3 : a < 1.2 ? 2 : 1;
    if (calm) wash = Math.min(2, wash);
    fx.round = { won, reason: ro.e.reason || null, team: ro.e.winTeam || null, sweep, sweeps: 10, wash };
  }
  // the bomb: planted = a steady alarm at a fixed rate (no onset of its own: the plant's time is never visible);
  // defused cool, exploded warm
  fx.planted = phase === 'planted';
  if (fx.planted) {
    const ph = (((view.nowMs / 1000) / BOMB_PULSE_S) % 1 + 1) % 1;
    fx.pulse = PULSE_STEPS[Math.min(7, Math.floor(ph * 8))];
  }
  const bd = newest(view, 'bombDefused', DUR.defuse);
  if (bd) { const n = calm ? 3 : 10; const k = stepOf(bd.a, DUR.defuse, n); if (k >= 0) fx.defuse = { k, n }; }
  const bx = newest(view, 'bombExploded', DUR.explode);
  if (bx) { const n = calm ? 3 : 10; const k = stepOf(bx.a, DUR.explode, n); if (k >= 0) fx.explode = { k, n }; }
  // freezetime: calm breathing (three levels, a 4 s breath on the wall clock)
  if (phase === 'freeze' && face === 'live') {
    const ph = ((view.nowMs / 4000) % 1 + 1) % 1;
    fx.breathe = Math.round((0.5 - 0.5 * Math.cos(ph * Math.PI * 2)) * 2);
  }
  return fx;
}

/** Is anything transient running (a frame that differs from the plain HUD)? */
export const fxBusy = (fx) => !!(fx.flash || fx.hurt || fx.kill || fx.death || fx.round || fx.plant || fx.defuse || fx.explode);

// ── words and numbers ─────────────────────────────────────────────────────────

const WEAPONS = {
  ak47: 'AK-47', m4a1_silencer: 'M4A1-S', m4a1: 'M4A4', awp: 'AWP', deagle: 'Deagle', usp_silencer: 'USP-S', glock: 'Glock-18', hkp2000: 'P2000',
  p250: 'P250', fiveseven: 'Five-SeveN', tec9: 'Tec-9', cz75a: 'CZ75', elite: 'Dualies', revolver: 'R8', famas: 'FAMAS', galilar: 'Galil AR', aug: 'AUG',
  sg556: 'SG 553', ssg08: 'SSG 08', scar20: 'SCAR-20', g3sg1: 'G3SG1', mac10: 'MAC-10', mp9: 'MP9', mp7: 'MP7', mp5sd: 'MP5-SD', ump45: 'UMP-45', p90: 'P90',
  bizon: 'PP-Bizon', nova: 'Nova', xm1014: 'XM1014', sawedoff: 'Sawed-Off', mag7: 'MAG-7', m249: 'M249', negev: 'Negev', taser: 'Zeus', c4: 'C4',
  flashbang: 'Flash', smokegrenade: 'Smoke', hegrenade: 'HE', molotov: 'Molotov', incgrenade: 'Incendiary', decoy: 'Decoy', healthshot: 'Medi-Shot',
};
/** A weapon's display name ('m4a1_silencer' → 'M4A1-S'; any knife → 'Knife'; unknown → tidied ASCII). */
export function weaponTitle(name) {
  const k = String(name || '').toLowerCase().replace(/^weapon_/, '');
  if (!k) return '—';
  if (/^(knife|bayonet)/.test(k)) return 'Knife';
  return WEAPONS[k] || k.replace(/[^a-z0-9]+/g, ' ').trim().toUpperCase().slice(0, 12) || '—';
}
const KINDS = { knife: 'Knife', pistol: 'Pistol', smg: 'SMG', rifle: 'Rifle', shotgun: 'Shotgun', mg: 'MG', sniper: 'Sniper', grenade: 'Grenade', c4: 'C4', taser: 'Taser', other: 'Weapon' };
export const kindTitle = (k) => KINDS[k] || 'Weapon';

/** $1,234 (US grouping, the real minus for negatives). */
export function money(v, { sign = false } = {}) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${v < 0 ? '−' : sign ? '+' : ''}$${a}`;
}
const num = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '—');
export const REASONS = Object.freeze({ elimination: 'Elimination', bomb_defused: 'Defused', bomb_exploded: 'Detonated', time: 'Time', rescue: 'Rescue', other: 'Round over' });
export const MULTI = Object.freeze({ 2: 'Double', 3: 'Triple', 4: 'Quad', 5: 'Ace' });
export const MULTI_SHORT = Object.freeze({ 2: '2K', 3: '3K', 4: '4K', 5: 'ACE' });

// ── instruments ───────────────────────────────────────────────────────────────

/** Every instrument slot a Game Link surface can show. */
export const SLOTS = Object.freeze(['health', 'armor', 'ammo', 'money', 'kills', 'score', 'round', 'kda', 'nades', 'weapon', 'gear', 'mvp', 'map', 'scene', 'blank']);
/** Their Spectrum hues (every instrument keeps its own position on the Spectrum, as the rest of Prism does). */
export const SLOT_HUE = Object.freeze({ health: 8, armor: 217.5, ammo: 60.4, money: 138.9, kills: 296, score: 243.6, round: 34.2, kda: 269.8, nades: 165.1, weapon: 86.5, gear: 112.7, mvp: 60.4, map: 191.3, scene: 217.5, blank: 217.5 });
/** The two sides' hues (CT cool azure, T warm amber): the round sweep and the score chip. */
export const TEAM_HUE = Object.freeze({ CT: 232, T: 62 });

/**
 * What an instrument shows. → { title, value, unit, sub, subTone, tone, bar, barTone, word (a word, not a number),
 *   hue, pict, dimmed, flag }
 */
export function slotModel(slot, view, fx) {
  const s = view.s, face = fx.face, phase = fx.phase;
  const p = s?.player || null, w = s?.weapon || null, st = s?.stats || null, r = s?.round || null, m = s?.match || null;
  const off = face === 'waiting' || face === 'menu' || face === 'loading' || face === 'watching';
  const stale = face === 'spectating' || face === 'paused';   // our last values, dimmed
  const out = { slot, title: '', value: '—', unit: null, sub: null, subTone: null, tone: 'idle', bar: null, barTone: null, word: false, hue: SLOT_HUE[slot] ?? 217.5, pict: slot, dimmed: off || stale || face === 'dead' };
  const dead = face === 'dead' || (p && p.alive === false);
  switch (slot) {
    case 'health': {
      out.title = 'Health';
      const hp = p?.health;
      if (off || !Number.isFinite(hp)) { out.tone = 'off'; break; }
      out.value = num(hp); out.bar = clamp(hp / 100);
      if (Number.isFinite(p.armor)) out.bar2 = clamp(p.armor / 100);   // the armor under it, as in the game's HUD
      if (stale || dead || hp <= 0) { out.tone = 'off'; out.sub = 'Down'; out.barTone = 'off'; break; }
      out.tone = hp <= 10 ? 'crit' : hp <= 25 ? 'warn' : hp > 50 ? 'ok' : 'idle';
      out.barTone = hp <= 25 ? 'neg' : hp <= 50 ? 'warn' : 'ok';
      const h = newest(view, 'hurt', DUR.hurtLabel);
      if (h && Number.isFinite(h.e.damage)) { out.sub = `−${Math.round(h.e.damage)}`; out.subTone = 'neg'; }
      break;
    }
    case 'armor': {
      out.title = 'Armor';
      const ar = p?.armor;
      if (off || !Number.isFinite(ar)) { out.tone = 'off'; break; }
      out.value = num(ar); out.bar = clamp(ar / 100); out.barTone = 'info';
      out.helmet = !!p.helmet;
      out.sub = p.helmet ? 'Helmet' : ar > 0 ? 'Vest' : 'None';
      out.tone = stale || dead || ar <= 0 ? 'off' : 'idle';
      break;
    }
    case 'ammo': {
      out.title = 'Ammo';
      if (off || stale || dead || !w) { out.tone = 'off'; out.sub = w ? weaponTitle(w.name) : null; break; }
      out.weapon = w;
      if (!Number.isFinite(w.clip)) { out.value = weaponTitle(w.name); out.word = true; out.sub = kindTitle(w.kind); out.pict = w.kind === 'knife' ? 'knife' : w.kind === 'grenade' ? 'nades' : 'ammo'; break; }
      out.value = num(w.clip);
      out.unit = Number.isFinite(w.clipMax) ? `/${w.clipMax}` : null;
      out.bar = Number.isFinite(w.clipMax) && w.clipMax > 0 ? clamp(w.clip / w.clipMax) : null;
      out.sub = w.reserveUnit === 'mags' && Number.isFinite(w.reserve) ? `${w.reserve} ${w.reserve === 1 ? 'mag' : 'mags'}` : weaponTitle(w.name);
      if (w.reloading) { out.tone = 'busy'; out.sub = 'Reload'; out.barTone = 'off'; }
      else if (w.clip <= 0) { out.tone = 'crit'; out.barTone = 'neg'; out.sub = w.reserveUnit === 'mags' && w.reserve === 0 ? 'Empty' : 'Reload'; }
      else if (w.low) { out.tone = 'warn'; out.barTone = 'warn'; }
      else out.barTone = 'active';
      break;
    }
    case 'money': {
      out.title = phase === 'freeze' && face === 'live' ? 'Buy' : 'Money';
      if (off || !Number.isFinite(p?.money)) { out.tone = 'off'; break; }
      out.value = money(p.money);
      out.tone = stale ? 'off' : phase === 'freeze' && face === 'live' ? 'active' : 'idle';
      const mv = newest(view, 'money', DUR.money);
      if (mv && Number.isFinite(mv.e.delta) && !stale) { out.sub = money(mv.e.delta, { sign: true }); out.subTone = mv.e.delta > 0 ? 'ok' : 'muted'; }
      else if (Number.isFinite(p.equip)) out.sub = `Gear ${money(p.equip)}`;
      break;
    }
    case 'kills': {
      out.title = 'Kills';
      const k = st?.roundKills;
      if (off || !Number.isFinite(k)) { out.tone = 'off'; out.sub = off ? null : 'this round'; break; }
      out.value = num(k);
      out.sub = k >= 2 ? MULTI_SHORT[Math.min(5, k)] : Number.isFinite(st.roundHs) && st.roundHs > 0 ? `${st.roundHs} HS` : Number.isFinite(st.kills) ? `${st.kills} in match` : 'this round';
      out.tone = stale ? 'off' : k >= 2 ? 'active' : 'idle';
      out.multi = k >= 2 ? MULTI_SHORT[Math.min(5, k)] : null;
      break;
    }
    case 'score': {
      out.title = m?.side || 'Score';
      out.side = m?.side || null;
      if (off || !m || !Number.isFinite(m.us) || !Number.isFinite(m.them)) { out.tone = 'off'; if (m && Number.isFinite(m.ct)) { out.value = `${m.ct}–${m.t}`; out.sub = 'CT – T'; } break; }
      out.value = `${m.us}–${m.them}`;
      if (phase === 'gameover') { out.sub = m.result === 'win' ? 'Victory' : m.result === 'loss' ? 'Defeat' : 'Draw'; out.tone = m.result === 'win' ? 'ok' : 'off'; }
      else if (m.matchPoint) { out.sub = 'Match point'; out.tone = 'warn'; }
      else if (phase === 'halftime') { out.sub = 'Sides swap'; }
      else out.sub = Number.isFinite(m.target) ? `first to ${m.target}` : m.title || null;
      if (stale && phase !== 'gameover') out.tone = 'off';
      break;
    }
    case 'round': {
      out.title = r && Number.isFinite(r.number) ? `Round ${r.number}` : m?.title || 'Round';
      out.word = true;
      if (face === 'waiting') { out.value = 'Waiting'; out.sub = 'for CS2'; out.tone = 'off'; out.pict = 'link'; break; }
      if (face === 'menu') { out.value = 'Menu'; out.sub = 'in CS2'; out.tone = 'off'; break; }
      if (face === 'loading') { out.value = 'Loading'; out.sub = m?.title || null; out.tone = 'busy'; break; }
      if (face === 'watching') { out.value = 'Watching'; out.sub = 'not your match'; out.tone = 'off'; break; }
      if (face === 'paused') { out.value = 'Paused'; out.tone = 'off'; break; }
      const reason = r?.reason ? REASONS[r.reason] || null : null;
      switch (phase) {
        case 'gameover': out.title = 'Match'; out.value = 'Final'; out.sub = m?.result === 'win' ? 'Victory' : m?.result === 'loss' ? 'Defeat' : 'Draw'; out.tone = m?.result === 'win' ? 'ok' : 'idle'; break;
        case 'halftime': out.value = 'Half'; out.sub = 'time'; break;
        case 'warmup': out.title = m?.title || 'Warmup'; out.value = 'Warmup'; out.sub = null; break;
        case 'freeze': out.value = 'Buy'; out.sub = m?.matchPoint ? 'Match point' : 'freeze time'; out.tone = 'active'; break;
        case 'planted': out.value = 'Planted'; out.sub = 'bomb'; out.tone = 'warn'; out.pict = 'bomb'; break;
        case 'over': out.value = r?.result === 'win' ? 'Won' : r?.result === 'loss' ? 'Lost' : 'Over'; out.sub = reason; out.tone = r?.result === 'win' ? 'ok' : 'idle'; out.pict = r?.result === 'win' ? 'flag' : 'round'; break;
        case 'live': default: out.value = 'Live'; out.sub = m?.matchPoint ? 'Match point' : m?.title || null; out.tone = m?.matchPoint ? 'warn' : 'idle'; break;
      }
      if (face === 'spectating') { out.title = out.title || 'Round'; out.value = 'Spectating'; out.sub = phase === 'over' ? reason || (r?.result === 'win' ? 'Won' : r?.result === 'loss' ? 'Lost' : null) : phase === 'planted' ? 'Planted' : null; out.tone = 'off'; out.pict = 'eye'; }
      else if (face === 'dead' && phase !== 'over') { out.value = 'Down'; out.sub = phase === 'planted' ? 'Planted' : out.sub; out.tone = 'off'; }
      if (fx.tier === 'still' && phase === 'planted' && face !== 'spectating') { out.value = 'Planted'; out.tone = 'warn'; }
      if (fx.flashStill) out.sub = 'Flashed';   // Still: a static label, never a whiteout
      break;
    }
    case 'kda': {
      out.title = 'K · A · D';
      if (off || !st || !Number.isFinite(st.kills)) { out.tone = 'off'; break; }
      out.value = `${num(st.kills)}/${num(st.deaths)}`;
      out.sub = st.assists === 1 ? '1 assist' : `${num(st.assists)} assists`;
      out.kda = [st.kills, st.assists, st.deaths];
      out.tone = stale ? 'off' : 'idle';
      break;
    }
    case 'nades': {
      out.title = 'Utility';
      const g = s?.cs2?.grenades;
      out.nades = g && p?.fresh !== false && !off ? g : null;
      if (!out.nades) { out.tone = 'off'; break; }
      const total = Object.values(g).reduce((a, b) => a + (+b || 0), 0);
      out.value = num(total); out.tone = stale ? 'off' : 'idle';
      break;
    }
    case 'weapon': {
      out.title = w ? kindTitle(w.kind) : 'Weapon';
      out.word = true;
      if (off || stale || !w) { out.tone = 'off'; out.value = '—'; out.word = false; break; }
      out.value = weaponTitle(w.name);
      out.sub = w.reloading ? 'Reloading' : null;
      out.pict = w.kind === 'knife' ? 'knife' : w.kind === 'grenade' ? 'nades' : 'ammo';
      break;
    }
    case 'gear': {
      out.title = 'Gear';
      if (off || !Number.isFinite(p?.equip)) { out.tone = 'off'; break; }
      out.value = money(p.equip);
      const kit = !!s?.cs2?.defuseKit, c4 = !!s?.cs2?.hasC4;
      out.sub = kit ? 'Defuse kit' : c4 ? 'Bomb carrier' : p.helmet ? 'Helmet' : null;
      out.kit = kit; out.c4 = c4;
      out.tone = stale ? 'off' : c4 ? 'active' : 'idle';
      break;
    }
    case 'mvp': {
      out.title = 'MVP';
      if (off || !Number.isFinite(st?.mvps)) { out.tone = 'off'; break; }
      out.value = num(st.mvps); out.sub = Number.isFinite(st.score) ? `score ${st.score}` : null;
      out.tone = stale ? 'off' : newest(view, 'mvp', 6) ? 'active' : 'idle';
      break;
    }
    case 'map': {
      out.title = m?.mode ? m.mode[0].toUpperCase() + m.mode.slice(1) : 'Map';
      out.word = true;
      if (!m) { out.tone = 'off'; out.word = false; break; }
      out.value = m.title || m.map || '—';
      out.sub = m.side ? `${m.side} side` : null;
      out.tone = off ? 'off' : 'idle';
      break;
    }
    default: break;
  }
  return out;
}

// ── layouts ───────────────────────────────────────────────────────────────────

const L = (...rows) => rows;
/** Per device (deck facet): key slots row by row ('scene' cells form the prism scene), readout slots (screen widgets / strip segments). */
const LAYOUTS = {
  galleon: { keys: L(['score', 'round', 'kills'], ['scene', 'scene', 'scene'], ['scene', 'scene', 'scene'], ['kda', 'nades', 'weapon']), readout: ['health', 'armor', 'ammo', 'money'] },
  plus: { keys: L(['score', 'round', 'kills', 'kda'], ['scene', 'scene', 'scene', 'scene']), readout: ['health', 'armor', 'ammo', 'money'] },
  plusxl: { keys: L(['score', 'round', 'kills', 'kda', 'nades', 'weapon', 'gear', 'mvp', 'map'], Array(9).fill('scene'), Array(9).fill('scene'), Array(9).fill('scene')), readout: ['health', 'armor', 'ammo', 'money', 'kills', 'score'] },
  mk2: { keys: L(['health', 'armor', 'ammo', 'money', 'kills'], Array(5).fill('scene'), ['score', 'round', 'kda', 'nades', 'weapon']) },
  xl: { keys: L(['health', 'armor', 'ammo', 'money', 'kills', 'score', 'round', 'kda'], Array(8).fill('scene'), Array(8).fill('scene'), ['nades', 'weapon', 'scene', 'scene', 'scene', 'scene', 'gear', 'mvp']) },
  mini: { keys: L(['health', 'armor', 'ammo'], ['money', 'kills', 'round']) },
  neo: { keys: L(['health', 'armor', 'ammo', 'money'], ['kills', 'score', 'round', 'kda']), readout: ['round'] },
  studio: { keys: L(['health', 'armor', 'ammo', 'money', 'kills', 'score', 'round', 'kda', 'nades', 'weapon', 'gear', 'mvp', 'map', 'blank', 'blank', 'blank'], Array(16).fill('scene')) },
};
const PRIORITY = ['health', 'armor', 'ammo', 'money', 'kills', 'score', 'round', 'kda', 'nades', 'weapon', 'gear', 'mvp', 'map'];

/**
 * Which instrument goes where on a deck. hud: no scene (every key an instrument, the rest blank). back: the
 * bottom-right key belongs to another action (the CS2 profiles' Back key): it is left blank, and if it held the round
 * (the face: Waiting, Planted, Won…) the round takes the place of the least important instrument left on the keys.
 * → { slots: [slot per grid cell, in cell order], readout: [slot per readout surface] }
 */
export function layoutOf(ctx, { hud = false, back = false } = {}) {
  const cells = ctx.grid?.cells || [];
  const cols = Math.max(1, ...cells.map((c) => c.col + 1)), rows = Math.max(1, ...cells.map((c) => c.row + 1));
  const D = ctx.deck;
  const nRead = D?.screen?.kind === 'galleon' ? 4 : D?.strip ? D.strip.segments : D?.screen?.kind === 'infobar' ? 1 : 0;
  const known = LAYOUTS[ctx.device?.id] || LAYOUTS[ctx.device?.family];   // the 2022 Mini / XL use their family's layout
  let grid = known && known.keys.length === rows && known.keys.every((r) => r.length === cols) ? known.keys : null;
  let readout = known?.readout && known.readout.length === nRead ? known.readout : null;
  if (!readout) readout = nRead === 1 ? ['round'] : PRIORITY.slice(0, nRead);
  if (!grid) {
    // generic: instruments on the first (and last) row, the scene between
    const onReadout = new Set(nRead > 1 ? readout : []);
    const pool = PRIORITY.filter((x) => !onReadout.has(x));
    grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, () => 'scene'));
    const fill = (r) => { for (let c = 0; c < cols; c++) grid[r][c] = pool.shift() || 'blank'; };
    fill(0);
    if (rows === 2 && cols < 4) fill(1);
    if (rows >= 3) fill(rows - 1);
  }
  let slots = cells.map((c) => grid[c.row]?.[c.col] || 'blank');
  if (hud) {
    const onReadout = new Set(nRead > 1 ? readout : []);
    const pool = PRIORITY.filter((x) => !onReadout.has(x) && !slots.includes(x));
    slots = slots.map((x) => (x === 'scene' ? pool.shift() || 'blank' : x));
  }
  // ── the Back key (gamelink-fix) ──
  if (back && cells.length > 1) {
    const corner = cells.reduce((b, c, i) => (c.row > cells[b].row || (c.row === cells[b].row && c.col > cells[b].col) ? i : b), 0);
    const gone = slots[corner];
    slots = slots.map((x, i) => (i === corner ? 'blank' : x));
    if (gone === 'round' && !readout.includes('round')) {
      const rank = (x) => { const r = PRIORITY.indexOf(x); return r < 0 ? -1 : r; };
      let worst = -1;
      slots.forEach((x, i) => { if (x !== 'scene' && x !== 'blank' && x !== 'round' && (worst < 0 || rank(x) > rank(slots[worst]))) worst = i; });
      if (worst >= 0) slots = slots.map((x, i) => (i === worst ? 'round' : x));
    }
  }
  return { slots, readout };
}
