// game-catch — sparks of light land on random keys; press them before their ring closes. A round lasts
// 20–45 s and speeds up as it goes (more sparks at once, shorter lives); a rare prism is worth three;
// four catches in a row start a combo. The clock ticks at 4 Hz only while a round runs. The screen or
// strip shows score, time (a beam), best and combo; without one, a beam along the top row is the clock.
//
// State (plain JSON): { cols, rows, phase ('ready' | 'run' | 'over'), tk, dur (ticks), lights: [[cell, born, life, bonus]],
//   score, hits, miss, gone, combo, top, best, overAt, rng }.

import { surface, rect } from '../../scene/index.js';
import { rngSeed, rngNext, rngInt } from '../../scene/game.js';
import { clamp, lerp, outExpo } from '../../scene/easing.js';
import { cellsOf, ageOf, spread, beam, sweepX, burst, ringWave, readout, hasReadout, statusKey, cellKey, panelBase, HUE, middleCell } from './_d8-kit.js';
import { PIECES } from './_d8-pieces.js';

const TICK = 4;   // Hz
const LIGHT_HUES = spread(9, HUE.rose, HUE.violet);

/** One clock tick of a running round: lights expire, new ones land. */
function step(s, t) {
  const tk = s.tk + 1;
  if (tk >= s.dur) return { ...s, tk, phase: 'over', lights: [], best: Math.max(s.best, s.score), overAt: t };
  let { rng, gone, combo } = s;
  const lights = s.lights.filter((L) => { if (L[1] + L[2] > tk) return true; gone++; combo = 0; return false; });
  const N = s.cols * s.rows, f = tk / s.dur;
  const cap = Math.max(1, Math.min(N >= 8 ? (f < 0.3 ? 1 : f < 0.7 ? 2 : 3) : f < 0.5 ? 1 : 2, Math.floor(N / 3)));
  let x;
  [x, rng] = rngNext(rng);
  if (lights.length < cap && (lights.length === 0 || x < 0.55)) {
    const free = [];
    for (let c = 0; c < N; c++) if (!lights.some((L) => L[0] === c) && !(s.lights.some((L) => L[0] === c && L[1] + L[2] <= tk))) free.push(c);
    if (free.length) {
      let k, b;
      [k, rng] = rngInt(rng, free.length);
      [b, rng] = rngNext(rng);
      const bonus = b < 0.08 ? 1 : 0;
      const life = Math.max(3, Math.round(lerp(7, 3, f) * (bonus ? 0.75 : 1)));
      lights.push([free[k], tk, life, bonus]);
    }
  }
  return { ...s, tk, lights, gone, combo, rng };
}

export default {
  id: 'game-catch',
  title: 'Catch the Light',
  category: 'Reflex',
  description: 'Sparks of light land on random keys: press each before its ring closes. Rounds speed up as they go; a rare prism is worth three and streaks build a combo.',
  tags: ['game', 'reflex', 'whack', 'reaction', 'speed', 'arcade', 'interactive'],
  surface: 'deck',
  animated: false,
  fps: 12,
  loop: 4,
  params: {
    seconds: { type: 'select', default: '30', options: ['20', '30', '45'], label: 'Round length (s)' },
  },
  game: {
    tickHz: TICK,
    ticking: (s) => s.phase === 'run',
    animate: 1.2,
    init({ seed, grid, params }) {
      return { cols: grid.cols, rows: grid.rows, phase: 'ready', tk: 0, dur: (+params.seconds || 30) * TICK, lights: [], score: 0, hits: 0, miss: 0, gone: 0, combo: 0, top: 0, best: 0, overAt: 0, rng: rngSeed(seed) };
    },
    reduce(s, ev) {
      if (ev.type === 'tick') return s.phase === 'run' ? step(s, ev.t) : s;
      if (ev.type !== 'press') return s;
      const c = ev.cell, keyed = Number.isInteger(c) && c >= 0 && c < s.cols * s.rows;
      if (!keyed && !Number.isInteger(ev.dial)) return s;
      if (s.phase !== 'run') {
        if (s.phase === 'over' && ev.t - s.overAt < 1) return s;   // a late swat right after the buzzer doesn't restart
        return step({ ...s, phase: 'run', tk: -1, lights: [], score: 0, hits: 0, miss: 0, gone: 0, combo: 0, top: 0 }, ev.t);
      }
      if (!keyed) return s;
      const L = s.lights.find((x) => x[0] === c);
      if (!L) return { ...s, miss: s.miss + 1, combo: 0 };
      const combo = s.combo + 1;
      return { ...s, lights: s.lights.filter((x) => x !== L), score: s.score + (L[3] ? 3 : 1) + (combo >= 4 ? 1 : 0), hits: s.hits + 1, combo, top: Math.max(s.top, combo) };
    },
  },
  order: 40,
  render(ctx) {
    const d = surface(ctx);
    panelBase(d, ctx);
    const s = ctx.game, prev = ctx.gamePrev, ev = ctx.gameEvent;
    const age = ageOf(ctx);
    const quiet = !hasReadout(ctx), mid = middleCell(s.cols, s.rows);
    const sub = ev?.type === 'tick' && Number.isFinite(age) ? clamp(age * TICK, 0, 1) : 0;
    const now = s.tk + sub;
    const evCell = ev?.type === 'press' && Number.isInteger(ev.cell) ? ev.cell : -1;
    const hit = evCell >= 0 && prev?.lights?.find((x) => x[0] === evCell) && !s.lights.find((x) => x[0] === evCell);
    const ended = s.phase === 'over' && prev?.phase === 'run';
    const remain = s.phase === 'run' ? clamp(1 - now / s.dur) : s.phase === 'over' ? 0 : 1;
    for (const c of cellsOf(ctx)) {
      const L = s.lights.find((x) => x[0] === c.k);
      const gone = !L && prev?.lights?.find((x) => x[0] === c.k) && ev?.type === 'tick' && s.phase === 'run';
      const hue = L ? (L[3] ? HUE.amber : LIGHT_HUES[(c.k * 5 + L[1]) % LIGHT_HUES.length]) : HUE.coral;
      if (quiet && c.k === mid && s.phase !== 'run' && !L) {
        cellKey(d, c, (q) => statusKey(q, s.phase === 'ready' ? { title: 'Catch', value: s.best || '—', sub: 'press' } : { title: 'Score', value: s.score, sub: s.score >= s.best && s.score ? 'new best' : `best ${s.best}`, tone: 'ok' }), { hue: HUE.coral, tone: s.phase === 'over' ? 'ok' : 'idle' });
        continue;
      }
      const isHit = hit && c.k === evCell, isMiss = evCell === c.k && !hit && s.phase === 'run' && prev?.phase === 'run' && age < 0.35;
      const tone = L ? 'active' : isHit && age < 0.5 ? 'ok' : isMiss ? 'neg' : 'idle';
      cellKey(d, c, (q) => {
        q.background({ tone });
        const box = q.theme.glyphBox(q, { labeled: false });
        if (L) {
          const born = clamp((now - L[1]) / 0.8), rem = clamp((L[1] + L[2] - now) / L[2]);
          const a = outExpo(born);
          if (L[3]) q.pictogram((g) => g.group({ scale: 0.4 + 0.6 * a, rotate: (1 - a) * -90 }, (h) => PIECES[0](h)), { box, tone: 'active' });
          else q.pictogram((g) => g.group({ scale: 0.3 + 0.7 * a }, (h) => { h.circle(24, 24, 9.5, { role: 'accent', fill: true }); h.dot(24, 24, 3.6); }), { box, tone: 'active' });
          // the closing ring: catch it before it shuts
          q.pictogram((g) => { if (rem > 0.02) g.arc(24, 24, 17, 0, Math.max(2, 359.9 * rem), { role: 'accent', weight: 1.2, opacity: 0.35 + 0.65 * a }); }, { box, tone: rem < 0.34 ? 'warn' : 'active' });
        } else {
          q.pictogram((g) => g.circle(24, 24, 3.2, { role: 'dim', fill: false, opacity: s.phase === 'run' ? 0.7 : 0.45 }), { box, tone: 'idle' });
          if (gone) q.pictogram((g) => g.circle(24, 24, 6.5 + 6 * clamp(age / 0.3), { role: 'dim', opacity: 1 - clamp(age / 0.3) }), { box, tone: 'idle' });
        }
        if (isHit) { burst(q, clamp(age / 0.55), { rays: 12 }); ringWave(q, clamp(age / 0.45)); }
        if (ended) {
          const b = sweepX(age, { t0: 0.1, dur: 0.8, pos: c.col, span: s.cols, w: q.w });
          if (b.on) beam(q, b.x);
        }
        if (quiet && c.row === 0 && s.phase !== 'ready') {   // the clock: a beam along the top row, shrinking to the left
          const f = clamp(remain * s.cols - c.col), y = q.m.bleed + q.m.u * 1.5, h = Math.max(1.5, q.m.u * 1.3);
          const x0 = q.m.safe, w = q.w - q.m.safe * 2;
          if (f > 0) q.add(rect({ x: x0, y, width: Math.max(h, w * f), height: h, rx: h / 2, fill: remain < 0.2 ? q.colors.warn : q.ctx.tint }));
        }
      }, { hue, tone });
    }
    const secs = Math.ceil(remain * s.dur / TICK);
    readout(d, ctx, [
      { title: 'Score', value: s.score, sub: s.phase === 'ready' ? 'press any key' : s.phase === 'over' ? (s.score >= s.best && s.score ? 'new best' : 'final') : `${s.hits} caught`, hue: HUE.coral, tone: s.phase === 'over' ? 'ok' : 'idle', short: 'Score' },
      { title: 'Time', value: `0:${String(secs).padStart(2, '0')}`, bar: remain, barColor: remain < 0.2 ? undefined : undefined, hue: remain < 0.2 && s.phase === 'run' ? HUE.rose : HUE.amber, short: 'Time' },
      { title: 'Best', value: s.best || '—', sub: 'highest score', hue: HUE.citrine },
      { title: 'Combo', value: `×${s.combo}`, sub: `${s.gone} got away · top ×${s.top}`, hue: HUE.lime, tone: s.combo >= 4 ? 'active' : 'idle' },
    ]);
    return d.svg();
  },
};
