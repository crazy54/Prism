// alert-countdown — counts down to a moment. Each second the digit arrives Refraction
// style (two spectral copies converge into focus) and the ring drains one step; the
// last three seconds turn amber, then red, with a beat; zero lands as a flash and the
// end label, held for two seconds, then it starts over. Frames only change in the
// first ~0.3 s of each second, so the hardware sends a few updates a second.

import { surface, path, rect, n, phase, clamp, arrive, polar, arcPath } from '../../scene/index.js';
import { cellOf, themeBox, cellRing, squaresPath } from './_d2-motion.js';

const HOLD = 2;

export default {
  id: 'alert-countdown',
  title: 'Countdown',
  category: 'Alerts & Attention',
  description: 'Counts down to a moment: the ring drains a step each second, the last three turn amber then red with a beat, and zero lands as a flash.',
  tags: ['alert', 'countdown', 'timer', 'go live', 'deadline', 'seconds', 'attention'],
  surface: 'key',
  fps: 10,
  loop: 12,
  params: {
    seconds: { type: 'number', default: 10, min: 3, max: 60, step: 1, label: 'From (s)' },
    label: { type: 'text', default: 'Live in', label: 'Eyebrow', maxLength: 12 },
    endLabel: { type: 'text', default: 'Live', label: 'At zero', maxLength: 8 },
  },
  order: 40,
  render(ctx) {
    const k = surface(ctx);
    const N = Math.round(ctx.params.seconds);
    const cycle = N + HOLD;
    const tc = ctx.reduced ? N * 0.4 : phase(ctx.t, cycle) * cycle;
    const done = tc >= N;
    const sec = Math.floor(tc), frac = tc - sec;
    const left = N - sec;                       // N … 1 while counting
    const a = arrive(frac, 0.3);
    const tone = done ? 'crit' : left <= 1 ? 'crit' : left <= 3 ? 'warn' : 'active';
    k.background({ tone });
    const color = k.tone(tone);
    const box = themeBox(k, false);
    const cell = cellOf(k, box);
    const cx = k.w / 2, cy = k.h / 2;
    const R = Math.min(k.w, k.h) / 2 - k.m.safe * 0.75;
    const sw = cell ? Math.max(1, Math.round(cell * 0.75)) : Math.max(1.5, k.m.bold * 0.8);
    // ring: track + what's left, draining one step per second
    const value = done ? 1 : (left - a) / N;
    if (cell) {
      const all = cellRing(cx, cy, R - sw, 0, 360, sw);
      const on = cellRing(cx, cy, R - sw, 0, 360 * value, sw);
      k.add(path(squaresPath(all, sw), { fill: k.colors.dim, fillOpacity: 0.35 }));
      if (value > 0.001) k.add(path(squaresPath(on, sw), { fill: color }));
    } else {
      k.add(path(arcPath(cx, cy, R - sw / 2, 0, 359.99), { fill: 'none', stroke: k.colors.dim, strokeWidth: n(sw), strokeOpacity: 0.3 }));
      if (value > 0.001) k.add(path(arcPath(cx, cy, R - sw / 2, 0, Math.min(359.99, 360 * value)), { fill: 'none', stroke: color, strokeWidth: n(sw), strokeLinecap: 'round' }));
      if (!done && value > 0.001) { const [hx, hy] = polar(cx, cy, R - sw / 2, 360 * value); k.add(`<circle cx="${n(hx)}" cy="${n(hy)}" r="${n(sw * 0.9)}" fill="${k.dark ? '#ffffff' : k.colors.ink}"/>`); }
    }
    if (done) {
      // zero: a flash that decays, the end label as the hero
      const e = Math.exp(-(tc - N) / 0.3);
      if (e > 0.02) k.add(rect({ width: k.w, height: k.h, fill: color, fillOpacity: n((k.dark ? 0.45 : 0.3) * (cell ? Math.ceil(e * 3) / 3 : e), 3) }));
      k.hero(ctx.params.endLabel, { cy, maxWidth: R * 1.5 });
      return k.svg();
    }
    // the beat in the last three seconds
    if (left <= 3 && frac < 0.35) k.add(rect({ width: k.w, height: k.h, fill: color, fillOpacity: n((k.dark ? 0.16 : 0.1) * (1 - frac / 0.35), 3) }));
    // the digit converges into focus: two spectral copies close in on it
    const digit = String(left);
    const split = (1 - a) * Math.max(2, k.m.bold * 1.2);
    const off = cell ? Math.round(split) : split;
    if (off > 0.4) {
      k.hero(digit, { cy: cy + k.h * 0.04, x: cx - off, color: ctx.theme.spectral(ctx.hue - 60), opacity: 0.55 * (1 - a), maxWidth: R * 1.4 });
      k.hero(digit, { cy: cy + k.h * 0.04, x: cx + off, color: ctx.theme.spectral(ctx.hue + 60), opacity: 0.55 * (1 - a), maxWidth: R * 1.4 });
    }
    k.hero(digit, { cy: cy + k.h * 0.04, opacity: 0.35 + 0.65 * a, maxWidth: R * 1.4 });
    k.eyebrow(ctx.params.label, { align: 'center', x: cx, y: cy - R * 0.42, maxWidth: R * 1.3 });
    return k.svg();
  },
};
