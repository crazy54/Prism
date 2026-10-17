// Game Link facets (src/facets/gamelink/): the three faces (demo / waiting / live), the CS2 fixture match replayed
// through the normalizer into the facets' effect state (the right effect on the right frame), the CS2 rules (no bomb
// timer, self vs spectating, the flash follows the game and holds through silence), photosensitivity (rise slew, peak
// cap, ≤ 1 bright onset a second, never a red field), the element budget mid-effect, the update budget per effect
// per device (a whole-deck flash ≤ 128 sends on the Galleon), Calm / Still, and the "Prism · CS2" profiles.
// Fictional data only (test/fixtures/gamelink/cs2).
//
//   node --test test/gamelink-facets.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allFacets, findFacet } from '../src/facets/index.js';
import { render } from '../src/render.js';
import { renderTargets } from '../src/facets/schema.js';
import { validateSvg } from '../src/scene/validate.js';
import { toDeviceSvg } from '../src/scene/qt.js';
import { rasterize } from '../src/raster/index.js';
import { normalizeCs2, gameLinkView, tickCs2, FLASH_HOLD_MS } from '../src/apps/sources/gamelink-cs2.js';
import { gameLinkOf, tierOf, fxOf, faceOf, slotModel, layoutOf, FLASH_PEAK, FLASH_Q, FLASH_RISE, FLASH_REARM_S, HURT_MAX_ALPHA, SLOTS } from '../src/facets/gamelink/_gl-kit.js';
import { simGameLink, SIM_LOOP } from '../src/facets/gamelink/_gl-sim.js';
import { createContext } from '../src/scene/context.js';
import { gameProfiles, GAMELINK_LAYOUTS, checkProfile, sampleProfiles, SAMPLE_LAYOUTS, CS2_JUMP } from '../src/export/profile.js';
import { readZip } from '../src/export/plugin-zip.js';
import { getDevice } from '../src/devices.js';
import { normalizePress, normalizeSettings, gameProfileFor, GAME_PROFILES, BUNDLED_PROFILES } from '../src/plugin/settings.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gamelink', 'cs2');
const SEQ = JSON.parse(fs.readFileSync(path.join(FIX, 'sequence.json'), 'utf8'));
const frameOf = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const T0 = Date.UTC(2026, 9, 10, 19, 0, 0);
const GL = allFacets().filter((f) => f.gallery === 'gamelink');
const DECK = findFacet('gamelink-cs2-deck');
const elements = (svg) => (svg.match(/<[A-Za-z]/g) || []).length;

/** The fixture match, replayed: [{ name, at, state }]. */
const POSTS = (() => { let st = null; return SEQ.frames.map((fr) => { st = normalizeCs2(frameOf(fr.file), st, { nowMs: T0 + fr.atMs }).state; return { name: fr.file.replace(/\.json$/, ''), at: T0 + fr.atMs, state: st }; }); })();
const post = (prefix) => POSTS.find((p) => p.name.startsWith(prefix)) || assert.fail(`no fixture ${prefix}`);
/** The live view `dt` ms after a fixture post (no newer post yet: the hold-on-silence path). */
const viewAt = (prefix, dt = 0) => { const p = post(prefix); const now = p.at + dt; return { mode: 'live', s: gameLinkView(p.state, now), nowMs: now }; };
const fxAt = (prefix, dt = 0, tier = 'soft') => fxOf(viewAt(prefix, dt), tier);
const liveOpts = (prefix, dt = 0) => { const v = viewAt(prefix, dt); return { data: { gamelink: v.s }, now: v.nowMs, t: 3 }; };
/** The slices a runtime sends for a render: keys, dial segments, Galleon widgets (or the whole key / small screen). */
const slicesOf = (f, r) => (f.surface === 'key' || (f.surface === 'screen' && !r.widgets) ? [r.svg] : [...(r.keys || []).map((k) => k.svg), ...(r.segments || []), ...(r.widgets || []).map((w) => w.svg)]);
const whiteOf = (svg) => Math.max(0, ...[...svg.matchAll(/id="[^"]*-glflash\d*"[^>]*fill-opacity="([\d.]+)"/g)].map((m) => +m[1]));   // the whiteout rect

// ── faces ───────────────────────────────────────────────────────────────────
test('gamelink: every facet draws the three faces — demo round (absent), "Waiting for CS2" (null), live (an object)', () => {
  assert.ok(GL.length >= 12, `${GL.length} Game Link facets`);
  for (const f of GL) {
    const tg = renderTargets(f)[0];
    const demo = render(f, { ...tg, t: 15.2 }).svg, waiting = render(f, { ...tg, t: 15.2, data: { gamelink: null } }).svg, live = render(f, { ...tg, ...liveOpts('16-kill', 3000) }).svg;
    assert.notEqual(demo, waiting, `${f.id}: waiting is not the demo`);
    assert.notEqual(live, waiting, `${f.id}: live is not waiting`);
    for (const svg of [demo, waiting, live]) assert.deepEqual(validateSvg(svg, { maxBytes: 524288 }), [], f.id);
    // with live data and no effect running, the frame depends on the data, never on t
    const quiet = liveOpts('06-round', 6000);
    assert.equal(render(f, { ...tg, ...quiet, t: 2 }).svg, render(f, { ...tg, ...quiet, t: 40 }).svg, `${f.id}: live frames ignore t`);
  }
  const wait = { mode: 'waiting', s: null, nowMs: T0 };
  const fx = fxOf(wait, 'soft');
  assert.equal(faceOf(wait), 'waiting');
  assert.deepEqual([fx.flash, fx.hurt, fx.kill, fx.death, fx.round, fx.planted], [0, null, null, null, null, false], 'waiting invents nothing');
  assert.deepEqual([slotModel('round', wait, fx).value, slotModel('round', wait, fx).sub], ['Waiting', 'for CS2']);
  for (const slot of ['health', 'armor', 'ammo', 'money', 'kills', 'score']) assert.equal(slotModel(slot, wait, fx).value, '—', `${slot}: no invented data while waiting`);
  // absent = the demo round on the sim's own clock
  const v = gameLinkOf({ data: {}, t: 15.2, now: 0 });
  assert.equal(v.mode, 'demo'); assert.equal(v.nowMs, 15200); assert.deepEqual(v.s, simGameLink(15.2));
  assert.equal(gameLinkOf({ data: { gamelink: null }, now: 5 }).mode, 'waiting');
});

// ── the fixture match → effects ─────────────────────────────────────────────
test('gamelink: the fixture match replayed through the normalizer fires the right effect on the right frame', () => {
  // quiet before, damage on the hurt post, its splash scaled by the damage, gone after 0.6 s
  assert.equal(fxAt('06-round', 100).hurt, null);
  const h = fxAt('07-hurt', 0).hurt;
  assert.ok(h && h.k === 0 && h.dmg === 27, 'hurt on 07');
  assert.ok(fxAt('25-hurt', 0).hurt.reach > h.reach, 'heavier damage splashes further');
  assert.equal(fxAt('07-hurt', 700).hurt, null, 'damage splash over');
  assert.equal(slotModel('health', viewAt('07-hurt', 300), fxAt('07-hurt', 300)).sub, '−27', 'the damage on the health key');
  // the flashbang: a strike, held through silence, fading with the game's value, cleared
  assert.equal(fxAt('07-hurt', 3000).flash, 0);
  assert.ok(fxAt('08-flash', 0).flash > 0 && fxAt('08-flash', 0).flashRise, 'flash on 08, rising');
  assert.equal(fxAt('08-flash', 200).flash, FLASH_Q.soft, 'full white after the rise');
  assert.equal(fxAt('08-flash', 2300).flash, FLASH_Q.soft, 'silence while fully flashed is not "flash over": held');
  const fade = ['09', '10', '11', '12', '13'].map((n) => fxAt(n, 10).flash);
  assert.deepEqual(fade, [5, 3, 2, 1, 1], 'the whiteout follows flashed 177 → 113 → 64 → 28 → 7');
  assert.equal(fxAt('14-flash', 0).flash, 0, 'cleared on 14');
  // kills: a kill, then a headshot double
  const k1 = fxAt('15-kill', 0).kill, k2 = fxAt('16-kill', 0).kill;
  assert.deepEqual([k1.count, k1.headshot], [1, false]);
  assert.deepEqual([k2.count, k2.headshot, k2.label], [2, true, 'double']);
  assert.equal(slotModel('kills', viewAt('16-kill', 50), fxAt('16-kill', 50)).sub, '2K');
  assert.equal(fxAt('16-kill', 1100).kill, null);
  // the bomb: planted is a state with a steady pulse — no onset of its own: the source never shows when the plant
  // arrived (gamelink-fix L9), so the frame 100 ms after the plant is the frame 1.5 s after it
  const pl = fxAt('20-bomb', 100);
  assert.ok(pl.planted && pl.plant === null, 'planted on 20, with no plant-timed onset');
  assert.deepEqual(fxAt('20-bomb', 1100), fxAt('20-bomb', 100), 'the same pulse phase looks the same, whenever the plant was');
  assert.ok(fxAt('21-defusing', 0).planted, 'still planted on the heartbeat (no timer drawn)');
  // the round: won by a defuse (a cool burst), lost later
  const w = fxAt('22-round', 100);
  assert.ok(w.round?.won && w.round.reason === 'bomb_defused' && w.defuse, 'round won by a defuse on 22');
  assert.equal(slotModel('round', viewAt('22-round', 3000), fxAt('22-round', 3000)).sub, 'Defused');
  // death: the crack, not a hurt splash; then spectating (dimmed, our last values only)
  const d = fxAt('26-death', 50);
  assert.ok(d.death && !d.hurt, 'death on 26 (the crack, no splash)');
  assert.equal(faceOf(viewAt('26-death', 50)), 'dead');
  assert.equal(faceOf(viewAt('27-spect', 0)), 'spectating');
  assert.equal(fxAt('27-spect', 0).dim, 2, 'spectating dims the deck');
  const lost = fxAt('29-round', 100);
  assert.ok(lost.round && !lost.round.won, 'round lost on 29');
  assert.equal(faceOf(viewAt('30-round', 0)), 'spectating', 'between rounds with no player: as spectating');
  // the match: halftime, match point, the final scoreboard, the menu, deathmatch
  assert.equal(fxAt('31-half', 0).phase, 'halftime');
  const mp = slotModel('score', viewAt('34-match', 0), fxAt('34-match', 0));
  assert.deepEqual([mp.sub, mp.tone], ['Match point', 'warn']);
  const go = viewAt('36-gameover', 3000);
  assert.deepEqual([slotModel('score', go, fxOf(go, 'soft')).value, slotModel('score', go, fxOf(go, 'soft')).sub, slotModel('round', go, fxOf(go, 'soft')).value], ['13–11', 'Victory', 'Final']);
  assert.equal(faceOf(viewAt('37-back', 0)), 'menu');
  assert.ok(fxAt('39-dm', 50).death, 'deathmatch death');
  assert.equal(faceOf(viewAt('40-dm', 50)), 'live', 'respawned');
});

test('gamelink: self vs spectating — a watched teammate never drives our deck; GOTV is "not your match"', () => {
  const v = viewAt('28-spect', 0), fx = fxOf(v, 'full');
  assert.equal(v.s.player.fresh, false);
  assert.equal(fx.flash, 0, 'the teammate is flashed: never our whiteout');
  const hp = slotModel('health', v, fx);
  assert.equal(hp.value, '0', 'our last health, not the teammate\'s 81');
  assert.equal(hp.tone, 'off');
  assert.equal(slotModel('ammo', v, fx).value, '—', 'no weapon of the watched player');
  const gotv = normalizeCs2(JSON.parse(fs.readFileSync(path.join(FIX, 'spectator-only', fs.readdirSync(path.join(FIX, 'spectator-only')).find((x) => x.endsWith('.json'))), 'utf8')), null, { nowMs: T0 }).state;
  const gv = { mode: 'live', s: gameLinkView(gotv, T0), nowMs: T0 };
  assert.equal(faceOf(gv), 'watching');
  const gfx = fxOf(gv, 'full');
  assert.deepEqual([gfx.flash, gfx.hurt, gfx.kill, gfx.death, gfx.planted], [0, null, null, null, false], 'no effects while watching');
  assert.equal(slotModel('round', gv, gfx).value, 'Watching');
});

// ── the CS2 rules ───────────────────────────────────────────────────────────
test('gamelink: no bomb timer — planted pulses at a fixed rate, phased on the wall clock, never growing with time since the plant', () => {
  const p = post('20-bomb');
  const at = (dtMs, tier = 'soft') => fxOf({ mode: 'live', s: gameLinkView(p.state, p.at + dtMs), nowMs: p.at + dtMs }, tier);
  // the same instant of the 1 s pulse looks the same 2 s, 9 s or 30 s after the plant: nothing ramps
  for (const ms of [137, 486, 820]) {
    const base = at(2000 + ms);
    for (const later of [9000, 30000]) assert.deepEqual([at(later + ms).pulse, at(later + ms).plant], [base.pulse, null], `pulse at +${later + ms} ms`);
  }
  const lv = Array.from({ length: 40 }, (_, i) => at(2000 + i * 50).pulse);
  assert.deepEqual(lv.slice(0, 20), lv.slice(20), 'periodic, 1 s');
  assert.ok(Math.max(...lv) === 3 && Math.min(...lv) === 0, 'a full pulse');
  // the frames: the round key pulses, the same frame a period later; nothing on the deck counts
  const opts = (ms) => ({ device: 'galleon', data: { gamelink: gameLinkView(p.state, p.at + ms) }, now: p.at + ms, t: 9 });
  assert.equal(render(DECK, opts(5250)).svg, render(DECK, opts(25250)).svg, 'a frame 20 s later is identical: no countdown, no ramp');
  const m = slotModel('round', viewAt('21-defusing', 0), fxAt('21-defusing', 0));
  assert.equal(m.value, 'Planted');
  assert.ok(!/\d/.test(`${m.value} ${m.sub ?? ''}`), 'no digits on the planted key');
  // Still: a "Planted" label and no pulse
  const st = at(4321, 'still');
  assert.deepEqual([st.pulse, st.planted, st.plant], [0, true, null]);
  assert.equal(render(DECK, { ...opts(5250), reduced: true }).svg, render(DECK, { ...opts(5750), reduced: true }).svg, 'Still: static');
});

test('gamelink: the flash follows the game — held through silence, cleared by the source\'s safety clear', () => {
  const p = post('08-flash');
  for (const ms of [300, 1200, 2300, 4800]) assert.equal(fxAt('08-flash', ms).flash, FLASH_Q.soft, `held at +${ms} ms`);
  const { state } = tickCs2(p.state, p.at + FLASH_HOLD_MS + 10);
  const v = { mode: 'live', s: gameLinkView(state, p.at + FLASH_HOLD_MS + 10), nowMs: p.at + FLASH_HOLD_MS + 10 };
  assert.equal(fxOf(v, 'soft').flash, 0, 'a stuck stream clears after the safety decay');
});

// ── photosensitivity ────────────────────────────────────────────────────────
/** A synthetic flash stream: [ms, flashed 0–255] posts on top of a live fixture frame → views every 25 ms. */
function flashStream(posts, { until = 4000 } = {}) {
  const base = frameOf('07-hurt.json');
  let st = POSTS.find((x) => x.name.startsWith('07-hurt')).state;
  const t0 = post('07-hurt').at + 2000;
  const out = [];
  let i = 0;
  for (let ms = 0; ms <= until; ms += 25) {
    while (i < posts.length && posts[i][0] <= ms) {
      const pl = JSON.parse(JSON.stringify(base));
      pl.player.state.flashed = posts[i][1];
      pl.previously = { player: { state: { flashed: 0 } } };
      st = normalizeCs2(pl, st, { nowMs: t0 + posts[i][0] }).state;
      i++;
    }
    out.push({ ms, view: { mode: 'live', s: gameLinkView(st, t0 + ms), nowMs: t0 + ms } });
  }
  return out;
}
const brightOnsets = (levels, Q) => { const half = Math.ceil(Q / 2); const at = []; levels.forEach((l, i) => { if (l > half && (i === 0 || levels[i - 1] <= half)) at.push(i); }); return at; };

test('gamelink photosensitivity: rise slew ≥ 80 ms, capped peak, ≤ 1 bright onset a second on any stream, never a red field', () => {
  // rise: a strike's first frames stay at half the peak; the full peak waits ≥ 80 ms
  for (const tier of ['soft', 'full', 'calm']) {
    const Q = FLASH_Q[tier];
    for (const ms of [0, 40, 79]) assert.ok(fxAt('08-flash', ms, tier).flash <= Math.ceil(Q / 2), `${tier}: +${ms} ms`);
    assert.ok(FLASH_RISE[tier] >= 0.08);
    assert.equal(fxAt('08-flash', FLASH_RISE[tier] * 1000 + 5, tier).flash, Q, `${tier}: the peak after the rise`);
    assert.ok(FLASH_PEAK[tier] < 0.95, `${tier}: the peak is capped below a white field`);
  }
  assert.ok(FLASH_PEAK.calm < FLASH_PEAK.soft && FLASH_PEAK.soft < FLASH_PEAK.full, 'calm < soft < full');
  // the frames: no surface ever above the cap, the first frame of a strike at about half
  for (const [effects, motion, tier] of [['soft', 'full', 'soft'], ['full', 'full', 'full'], ['full', 'calm', 'calm']]) {
    let peak = 0;
    for (const [f, ms] of [['08-flash', 0], ['08-flash', 150], ['09-flash', 0], ['11-flash', 0]]) {
      const r = render(DECK, { device: 'galleon', ...liveOpts(f, ms), params: { effects }, motion });
      const w = Math.max(...slicesOf(DECK, r).map(whiteOf));
      if (f === '08-flash' && ms === 0) assert.ok(w <= FLASH_PEAK[tier] * 0.6 + 1e-6, `${tier}: the strike's first frame (${w})`);
      peak = Math.max(peak, w);
    }
    assert.ok(peak <= FLASH_PEAK[tier] + 1e-6 && peak > 0.3, `${tier}: peak white ${peak}`);
  }
  // the brightest frame never reaches a white field (rasterized: mean luminance of every slice below 0.95)
  const hot = render(DECK, { device: 'galleon', ...liveOpts('08-flash', 300), params: { effects: 'full' } });
  for (const s of slicesOf(DECK, hot).slice(0, 16)) {
    const img = rasterize(s);
    let sum = 0;
    for (let i = 0; i < img.data.length; i += 4) sum += (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) / 255;
    assert.ok(sum / (img.data.length / 4) < 0.95, 'peak below a full white field');
  }
  // onset rate: however the stream flickers, at most one bright onset in any second (the normalizer's one strike a
  // second, our re-arm after a clear)
  const streams = {
    'two flashes 400 ms apart': [[0, 255], [400, 255], [1200, 120], [1800, 0]],
    'a flash, a clear, a flash 300 ms later': [[0, 255], [500, 0], [800, 255], [2600, 0]],
    'toggling 255 / 0 every 150 ms': Array.from({ length: 24 }, (_, i) => [i * 150, i % 2 ? 0 : 255]),
    'a partial then a full one': [[0, 90], [350, 255], [2500, 0]],
  };
  for (const tier of ['soft', 'full']) for (const [name, posts] of Object.entries(streams)) {
    const views = flashStream(posts);
    const levels = views.map((x) => fxOf(x.view, tier).flash);
    const on = brightOnsets(levels, FLASH_Q[tier]).map((i) => views[i].ms);
    for (let i = 1; i < on.length; i++) assert.ok(on[i] - on[i - 1] >= FLASH_REARM_S * 1000 - 1, `${tier} / ${name}: bright onsets at ${on.join(', ')} ms`);
  }
  // never a red field: damage is edge shards (≤ HURT_MAX_ALPHA), never a red wash — rasterize mid-splash and the crack
  const reddish = (svg) => { const img = rasterize(svg); let red = 0; const n = img.data.length / 4; for (let i = 0; i < img.data.length; i += 4) { const [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]]; if (r > 120 && r > g * 1.7 && r > b * 1.7) red++; } return red / n; };
  for (const theme of ['prism', 'neon']) for (const [f, ms] of [['25-hurt', 0], ['25-hurt', 120], ['25-hurt', 260], ['07-hurt', 120], ['26-death', 50]]) {
    const r = render(DECK, { device: 'galleon', theme, ...liveOpts(f, ms), params: { effects: 'full' } });
    for (const s of slicesOf(DECK, r)) { const red = reddish(s); assert.ok(red < 0.35, `${theme} ${f}+${ms}: ${(red * 100).toFixed(1)}% of a surface is red`); }
  }
  assert.ok(HURT_MAX_ALPHA <= 0.6);
});

test('gamelink: Still (or effects off) is static state only; Calm is gentle', () => {
  const tierOfCtx = (motion, effects, reduced = false) => tierOf({ motion, reduced, params: { effects } });
  assert.equal(tierOfCtx('full', 'soft'), 'soft'); assert.equal(tierOfCtx('full', 'full'), 'full');
  assert.equal(tierOfCtx('calm', 'full'), 'calm'); assert.equal(tierOfCtx('still', 'full'), 'still');
  assert.equal(tierOfCtx('full', 'off'), 'still'); assert.equal(tierOfCtx('full', 'full', true), 'still');
  for (const [f, ms] of [['08-flash', 150], ['16-kill', 100], ['25-hurt', 100], ['26-death', 100], ['22-round', 300], ['20-bomb', 300]]) {
    const st = fxAt(f, ms, 'still');
    assert.deepEqual([st.flash, st.hurt, st.kill, st.death, st.round, st.plant, st.pulse], [0, null, null, null, null, null, 0], `still: ${f}`);
    // the frame is a pure function of the state: the same a second later
    const a = render(DECK, { device: 'plus', ...liveOpts(f, ms), reduced: true }).svg, b = render(DECK, { device: 'plus', ...liveOpts(f, ms + 700), reduced: true }).svg;
    if (f !== '25-hurt' && f !== '16-kill') assert.equal(a, b, `still frames don't move: ${f}`);
  }
  assert.ok(fxAt('08-flash', 300, 'still').flashStill, 'a static FLASHED tint');
  assert.equal(slotModel('round', viewAt('20-bomb', 300), fxAt('20-bomb', 300, 'still')).value, 'Planted');
  const calm = fxAt('16-kill', 100, 'calm');
  assert.ok(calm.kill && calm.kill.n <= 4, 'calm: fewer, gentler steps');
  assert.ok(fxAt('08-flash', 300, 'calm').flash <= FLASH_Q.calm);
});

// ── budgets ─────────────────────────────────────────────────────────────────
const EFFECT_INSTANTS = [['08-flash', 0], ['08-flash', 150], ['10-flash', 50], ['12-flash', 50], ['07-hurt', 100], ['25-hurt', 200], ['15-kill', 100], ['16-kill', 300], ['26-death', 150], ['26-death', 1800], ['22-round', 250], ['22-round', 1000], ['29-round', 400], ['20-bomb', 300], ['27-spect', 0], ['36-gameover', 500]];
test('gamelink: every frame mid-effect stays valid and under 300 elements per key / segment / widget, deterministic', () => {
  for (const f of GL) for (const tg of renderTargets(f)) for (const theme of ['prism', 'paper', 'neon', 'pixel']) for (const [fx, ms] of EFFECT_INSTANTS) {
    for (const effects of ['soft', 'full']) {
      const opts = { ...tg, theme, ...liveOpts(fx, ms), params: { effects }, idPrefix: 'pdtest' };
      const r = render(f, opts);
      const probs = validateSvg(r.svg, { w: r.w, h: r.h, maxBytes: 524288, idPrefix: 'pdtest' });
      assert.deepEqual(probs, [], `${f.id} ${JSON.stringify(tg)} ${theme} ${fx}+${ms}: ${probs.join('; ')}`);
      for (const s of slicesOf(f, r)) {
        const c = elements(toDeviceSvg(s));
        assert.ok(c < 300, `${f.id} ${JSON.stringify(tg)} ${theme} ${fx}+${ms}: ${c} elements`);
        assert.ok(s.length < 32768, `${f.id}: a ${s.length} B slice`);
      }
      if (theme === 'prism' && effects === 'soft') assert.equal(render(f, opts).svg, r.svg, `${f.id}: deterministic`);
    }
  }
});

/** What a runtime would send for one effect: a frame per post and per 1/15 s, one send per slice that changed. */
function sends(f, device, from, to, tailMs, { params = { effects: 'soft' }, motion = 'full' } = {}) {
  const a = POSTS.findIndex((p) => p.name.startsWith(from)), b = POSTS.findIndex((p) => p.name.startsWith(to));
  const times = new Set();
  for (let t = POSTS[a].at - 200; t <= POSTS[b].at + tailMs; t += 1000 / 15) times.add(Math.round(t));
  for (let i = a; i <= b; i++) times.add(POSTS[i].at);
  let last = null, n = 0, surfaces = 0, per = [];
  for (const now of [...times].sort((x, y) => x - y)) {
    let s = POSTS[a - 1].state;
    for (let i = a; i <= b; i++) if (POSTS[i].at <= now) s = POSTS[i].state;
    const slices = slicesOf(f, render(f, { device, now, t: 1, data: { gamelink: gameLinkView(s, now) }, params, motion, reduced: motion === 'still' }));
    if (last) slices.forEach((x, i) => { if (x !== last[i]) { n++; per[i] = (per[i] || 0) + 1; } });
    last = slices; surfaces = slices.length;
  }
  return { n, surfaces, worst: Math.max(0, ...per.filter(Boolean)), seconds: (POSTS[b].at + tailMs - POSTS[a].at + 200) / 1000 };
}
const EFFECTS = { flash: ['08', '14', 600], hurt: ['25', '25', 700], kill: ['16', '16', 1300], death: ['26', '27', 600], 'round won': ['22', '22', 2000], 'round lost': ['29', '29', 2000], 'planted 3 s': ['20', '20', 3000] };

test('gamelink budget: a whole-deck flash costs ≤ 8 sends per surface (≤ 128 on the Galleon); every effect fits the update budget', (t) => {
  const table = [];
  for (const device of ['galleon', 'plus', 'xl', 'mk2', 'mini']) {
    const row = [device];
    for (const [name, [from, to, tail]] of Object.entries(EFFECTS)) {
      const { n, surfaces, worst, seconds } = sends(DECK, device, from, to, tail);
      row.push(`${name} ${n}`);
      if (name === 'flash') { assert.ok(n <= 8 * surfaces, `${device}: flash ${n} sends > 8 × ${surfaces}`); if (device === 'galleon') assert.ok(n <= 128, `Galleon flash: ${n} sends`); }
      // fits the plugin's update budget (≈ 180 / s allocatable) with room for other units, and no key above the per-key cap
      assert.ok(n / seconds <= 120, `${device} ${name}: ${n} sends in ${seconds} s`);
      assert.ok(worst <= 15 * Math.max(1, seconds), `${device} ${name}: one surface changed ${worst} times`);
    }
    table.push(row.join(' · '));
  }
  t.diagnostic(`sends per effect (gamelink-cs2-deck, soft): ${table.join(' | ')}`);
  // quantized: the flash fade visits few distinct images per key
  const seen = new Map();
  for (let ms = -100; ms <= 5400; ms += 33) {
    const p = [...POSTS].reverse().find((x) => x.at <= post('08-flash').at + ms) || POSTS[0];
    const now = post('08-flash').at + ms;
    const r = render(DECK, { device: 'galleon', now, t: 1, data: { gamelink: gameLinkView(p.state, now) } });
    r.keys.forEach((k, i) => { if (!seen.has(i)) seen.set(i, new Set()); seen.get(i).add(k.svg); });
  }
  for (const [i, set] of seen) assert.ok(set.size <= 9, `key ${i}: ${set.size} distinct flash frames`);
  // the plain HUD returns byte-identical once an effect is over
  for (const [fxName, over] of [['15-kill', 2500], ['16-kill', 2500], ['07-hurt', 2000], ['22-round', 2500]]) {
    const done = render(DECK, { device: 'galleon', ...liveOpts(fxName, over) }), later = render(DECK, { device: 'galleon', ...liveOpts(fxName, over + 4000) });
    assert.deepEqual(done.keys.map((k) => k.svg), later.keys.map((k) => k.svg), `${fxName}: the plain HUD, byte-identical, once the effect is over`);
    assert.deepEqual(done.widgets.map((k) => k.svg), later.widgets.map((k) => k.svg));
  }
});

// ── layouts ─────────────────────────────────────────────────────────────────
test('gamelink deck: every device gets a layout — instruments, the prism scene, the readout (Galleon widgets, + strip)', () => {
  const lay = (device) => layoutOf(createContext(DECK, { device }));
  for (const device of ['galleon', 'plus', 'plusxl', 'mk2', 'xl', 'mini', 'neo', 'studio']) {
    const { slots, readout } = lay(device);
    assert.ok(slots.every((s) => SLOTS.includes(s)), device);
    assert.ok(slots.includes('health') || readout.includes('health'), `${device}: health somewhere`);
    assert.ok(slots.includes('round') || readout.includes('round'), `${device}: the round somewhere`);
  }
  assert.deepEqual(lay('galleon').readout, ['health', 'armor', 'ammo', 'money']);
  assert.deepEqual(lay('plus').readout, ['health', 'armor', 'ammo', 'money']);
  assert.equal(lay('galleon').slots.filter((s) => s === 'scene').length, 6);
  const r = render(DECK, { device: 'galleon', t: 7.5 });
  assert.equal(r.keys.length, 12); assert.equal(r.widgets.length, 4);
  assert.equal(render(DECK, { device: 'plus', t: 7.5 }).segments.length, 4);
});

// ── profiles ────────────────────────────────────────────────────────────────
test('gamelink profiles: "Prism · CS2 — <device>" for every sample device — the deck facet everywhere, Back in the bottom-right corner', () => {
  const ps = gameProfiles();
  assert.deepEqual(ps.map((p) => p.name), ['Prism · CS2 — Galleon 100 SD', 'Prism · CS2 — Stream Deck +', 'Prism · CS2 — Stream Deck MK.2', 'Prism · CS2 — Stream Deck XL', 'Prism · CS2 — Stream Deck Mini', 'Prism · CS2 — Stream Deck Neo', 'Prism · CS2 — Stream Deck + XL']);
  assert.deepEqual(ps.map((p) => p.device).sort(), Object.keys(SAMPLE_LAYOUTS).sort(), 'one per sample profile');
  for (const p of ps) {
    assert.deepEqual(checkProfile(p.zip), [], p.name);
    assert.deepEqual(p.dropped, [], `${p.name}: nothing dropped`);
    const page = p.files.filter((x) => /\.sdProfile\/Profiles\/[^/]+\/manifest\.json$/.test(x.name)).map((x) => JSON.parse(x.data)).find((m) => m.Controllers.some((c) => c.Actions && Object.keys(c.Actions).length));
    const keypad = page.Controllers.find((c) => c.Type === 'Keypad').Actions;
    const actions = page.Controllers.flatMap((c) => Object.values(c.Actions || {}));
    const L = GAMELINK_LAYOUTS[p.device];
    assert.equal(actions.length, L.pages[0].keys.length + (L.pages[0].dials?.length || 0) + (L.pages[0].infobar ? 1 : 0), `${p.name}: every key and dial`);
    const d = getDevice(p.device);
    // the way out: Back, bottom-right, on every device (switchToProfile with no name = the previous profile)
    const back = keypad[`${d.cols - 1},${d.rows - 1}`];
    assert.deepEqual([back.Settings.facet, back.Settings.press], ['icon-back', { kind: 'back' }], `${p.name}: Back in the bottom-right corner`);
    assert.equal(back.Name, 'Prism Display');
    for (const [coord, a] of Object.entries(keypad)) if (a !== back) assert.deepEqual([a.Settings.facet, a.Settings.params, a.Settings.press], ['gamelink-cs2-deck', { back: true }, undefined], `${p.name} ${coord}`);
    for (const c of page.Controllers.filter((x) => x.Type === 'Encoder')) for (const a of Object.values(c.Actions)) assert.equal(a.Settings.facet, 'gamelink-cs2-deck');
    assert.equal(normalizePress(back.Settings.press).kind, 'back');
    assert.ok(gameProfileFor(p.deviceType, 'cs2'), `${p.name}: a manifest name`);
    assert.notEqual(gameProfileFor(p.deviceType, 'cs2'), BUNDLED_PROFILES[p.deviceType], 'never overwrites the sample profile');
  }
  const neo = ps.find((p) => p.device === 'neo').files.map((x) => x.data && String(x.data)).find((x) => x && x.includes('"Type":"Neo"'));
  assert.ok(neo && neo.includes('gamelink-screen-match'), 'the Neo info bar shows the match');
  assert.equal(new Set(Object.values(GAME_PROFILES.cs2)).size, 7);
  // the deck leaves the bottom-right key to Back: blank there; a displaced round key takes the least important place
  const lay = (device, back) => layoutOf(createContext(DECK, { device }), { back });
  for (const device of Object.keys(GAMELINK_LAYOUTS)) {
    const a = lay(device, false).slots, b = lay(device, true).slots;
    assert.equal(b.at(-1), 'blank', `${device}: the Back corner is left free`);
    assert.ok(b.includes('round') || lay(device, true).readout.includes('round'), `${device}: the round (the face) is still shown`);
    assert.equal(b.filter((x, i) => x !== a[i]).length <= 2, true, `${device}: at most the corner and one move`);
  }
  assert.deepEqual(lay('mini-2022', true).slots, ['health', 'armor', 'ammo', 'money', 'round', 'blank'], 'the Mini: the round moves over, kills gives way');
  // the sample Home pages jump here: a CS2 key next to the Showcase key
  for (const sp of sampleProfiles()) {
    const home = JSON.parse(readZip(sp.zip).find((e) => e.name.endsWith(`${sp.pages[0].toUpperCase()}/manifest.json`)).data.toString('utf8'));
    const keys = home.Controllers.find((c) => c.Type === 'Keypad').Actions;
    const [c, r] = CS2_JUMP[sp.device].at;
    assert.deepEqual([keys[`${c},${r}`].Settings.facet, keys[`${c},${r}`].Settings.press], ['icon-target', { kind: 'profile', profile: 'cs2' }], `${sp.name}: the CS2 jump key`);
    assert.ok(gameProfileFor(sp.deviceType, 'cs2'), `${sp.name}: a CS2 profile to jump to`);
  }
  // a key can jump to it: press { kind: 'profile', profile: 'cs2' }
  assert.deepEqual(normalizePress({ kind: 'profile', profile: 'cs2' }), { kind: 'profile', profile: 'cs2' });
  assert.deepEqual(normalizePress({ kind: 'profile', profile: 'nope', page: 2 }), { kind: 'profile', page: 2 });
  assert.deepEqual(normalizeSettings({ facet: 'icon-mic', press: { kind: 'profile', profile: 'cs2' } }).press, { kind: 'profile', profile: 'cs2' });
  assert.equal(gameProfileFor(12, 'cs2'), 'profiles/prism-cs2-galleon');
  assert.equal(gameProfileFor(9, 'cs2'), 'profiles/prism-cs2-neo');
  assert.equal(gameProfileFor(13, 'cs2'), 'profiles/prism-cs2-plusxl');
  assert.equal(gameProfileFor(10, 'cs2'), null, 'no CS2 profile for a device without one (Studio)');
});

test('gamelink: the demo round loops and moves (the catalog, the web player, the plugin while Game Link is off)', () => {
  const svgAt = (t) => render(DECK, { device: 'galleon', t }).svg;
  assert.notEqual(svgAt(2), svgAt(15.2));
  assert.equal(svgAt(15.2), svgAt(15.2 + SIM_LOOP), 'seamless loop');
  const kinds = new Set();
  for (let t = 0; t < SIM_LOOP; t += 0.25) { const fx = fxOf({ mode: 'demo', s: simGameLink(t), nowMs: Math.round(t * 1000) }, 'soft'); for (const k of ['flash', 'hurt', 'kill', 'death', 'round', 'planted', 'defuse']) if (fx[k]) kinds.add(k); }
  assert.deepEqual([...kinds].sort(), ['death', 'defuse', 'flash', 'hurt', 'kill', 'planted', 'round'], 'the demo shows every moment');
});
