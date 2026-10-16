// game-reaction — a reflex test on one key. Press to arm it; the key goes dark and waits a random 1.2–4 s
// (from the rng in the state), then the beam strikes. Press as fast as you can: the key shows your time in
// ms, measured between the two events' clocks, and keeps your best. Press while it waits and it's a false
// start. The clock ticks at 4 Hz only while the key waits for the beam.
//
// State (plain JSON): { phase ('idle' | 'wait' | 'go' | 'done' | 'early'), armAt, delay, goAt, ms, best, tries, last: [ms…], rng }.

import { surface, keyInto } from '../../scene/index.js';
import { rngSeed, rngNext } from '../../scene/game.js';
import { clamp, outExpo } from '../../scene/easing.js';
import { ageOf, beam, burst, ringWave, convergeText, HUE } from './_d8-kit.js';

export const rating = (ms) => (ms < 200 ? 'Lightning' : ms < 260 ? 'Sharp' : ms < 340 ? 'Quick' : ms < 500 ? 'Steady' : 'Sleepy');

export default {
  id: 'game-reaction',
  title: 'Reaction',
  category: 'Reflex',
  description: 'Press to arm, wait in the dark, and hit the key the instant the beam strikes: it shows your reaction time in ms and keeps your best. Jump early and it is a false start.',
  tags: ['game', 'reflex', 'reaction', 'timer', 'speed', 'ms', 'toy', 'interactive'],
  surface: 'key',
  animated: false,
  fps: 12,
  loop: 2,
  game: {
    tickHz: 4,
    ticking: (s) => s.phase === 'wait',
    animate: 0.9,
    init({ seed }) { return { phase: 'idle', armAt: 0, delay: 0, goAt: 0, ms: 0, best: 0, tries: 0, last: [], rng: rngSeed(seed) }; },
    readout(s) {
      const msg = { idle: 'Press to start', wait: 'Wait for it', go: 'Press now!', done: s.ms + ' ms', early: 'Too early' }[s.phase] || '';
      const avg = s.last.length ? Math.round(s.last.reduce((a, b) => a + b, 0) / s.last.length) : 0;
      return { title: 'Reaction', cards: [
        { title: 'Reaction', value: msg, role: 'value', hue: HUE.lime, tone: s.phase === 'go' ? 'alert' : s.phase === 'early' ? 'warn' : s.phase === 'done' ? 'ok' : 'idle' },
        { title: 'Best', value: s.best ? s.best + ' ms' : '—', role: 'value', hue: HUE.citrine },
        { title: 'Tries', value: s.tries, hue: HUE.amber },
        { title: 'Average', value: avg ? avg + ' ms' : '—', role: 'value', sub: s.last.length ? 'last ' + s.last.length : undefined, hue: HUE.cyan },
      ] };
    },
    reduce(s, ev) {
      if (ev.type === 'tick') return s.phase === 'wait' && ev.t - s.armAt >= s.delay ? { ...s, phase: 'go', goAt: ev.t } : s;
      if (ev.type !== 'press') return s;
      if (s.phase === 'wait') return { ...s, phase: 'early' };
      if (s.phase === 'go') {
        const ms = Math.max(1, Math.round((ev.t - s.goAt) * 1000));
        return { ...s, phase: 'done', ms, best: s.best ? Math.min(s.best, ms) : ms, tries: s.tries + 1, last: [...s.last, ms].slice(-5) };
      }
      const [x, rng] = rngNext(s.rng);
      return { ...s, phase: 'wait', armAt: ev.t, delay: +(1.2 + x * 2.8).toFixed(3), rng };
    },
  },
  order: 50,
  render(ctx) {
    const k = surface(ctx);
    const s = ctx.game, prev = ctx.gamePrev;
    const age = ageOf(ctx);
    const big = Math.min(k.w, k.h) >= 110;
    const look = {
      idle: { hue: HUE.amber, tone: 'idle' }, wait: { hue: HUE.violet, tone: 'idle' }, go: { hue: HUE.citrine, tone: 'active' },
      done: { hue: s.ms < 260 ? HUE.jade : s.ms < 400 ? HUE.cyan : HUE.periwinkle, tone: s.ms < 260 ? 'ok' : 'active' }, early: { hue: HUE.rose, tone: 'neg' },
    }[s.phase];
    keyInto(k, { x: 0, y: 0, w: k.w, h: k.h, i: 0 }, (q) => {
      q.background({ tone: look.tone });
      const box = q.theme.glyphBox(q, { labeled: true });
      if (s.phase === 'idle' || s.phase === 'wait') {
        const w = s.phase === 'wait';
        q.pictogram((g) => { g.circle(24, 24, 13, { role: w ? 'dim' : 'line' }); g.dot(24, 24, w ? 2 : 3.2); if (!w) g.line(24, 6.5, 24, 13.5, { role: 'accent', weight: 0.8 }); }, { box, tone: w ? 'idle' : 'active', opacity: w ? 0.6 : undefined });
        q.label(w ? 'Wait…' : 'React', { color: w ? 'dim' : 'ink' });
        if (big && s.best && !w) q.eyebrow(`best ${s.best}`, { align: 'center', x: q.w / 2 });
      } else if (s.phase === 'go') {   // the beam strikes
        const a = outExpo(clamp(age / 0.1));
        q.pictogram((g) => g.group({ scale: 0.6 + 0.4 * a }, (h) => { h.circle(24, 24, 12, { role: 'accent', fill: true }); h.dot(24, 24, 4.5); }), { box, tone: 'active' });
        beam(q, q.w / 2, { alpha: a, slant: 0.1 });
        burst(q, clamp(age / 0.45), { cy: box.y + box.size / 2, rays: 12 });
        q.label('Now!', { color: 'ink' });
      } else if (s.phase === 'done') {
        const u = prev?.phase === 'go' ? clamp(age / 0.4) : 1;
        convergeText(q, 'hero', String(s.ms), u, { cy: box.y + box.size * 0.52 });
        q.label(big ? `ms · ${rating(s.ms)}` : 'ms', { color: 'muted' });
        if (s.ms === s.best && s.tries > 1) ringWave(q, clamp(age / 0.6));
        if (big) q.eyebrow(s.ms === s.best ? 'new best' : `best ${s.best}`, { align: 'center', x: q.w / 2, color: s.ms === s.best ? 'ink' : 'muted' });
      } else {   // early
        q.pictogram((g) => { g.arc(24, 24, 13, 30, 330, { role: 'accent' }); g.line(24, 13, 24, 26, { role: 'accent', weight: 1.1 }); g.dot(24, 32, 1.9, { role: 'accent' }); }, { box, tone: 'neg' });
        q.label('Too soon', { color: 'ink' });
      }
    }, { hue: look.hue, tone: look.tone });
    return k.svg();
  },
};
