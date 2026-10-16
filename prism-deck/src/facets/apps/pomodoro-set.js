// app-pomodoro-set — a whole pomodoro set on one key: four focus rounds with short breaks between,
// then a long break. Each press moves to the next phase. The ring drains as light; four dots
// along the bottom show where you are in the set. When a round ends, the key celebrates — rays of
// the Spectrum fly out and the ring closes into a check — then holds, quietly, until you press
// (overtime counts by the minute). After round four: a long break, then "Set done".
// States are the set's phases, so the runtime remembers where you are. ≤ 1 update/s running.

import { surface, circle, n } from '../../scene/index.js';
import { clamp, outExpo, arrive, lerp } from '../../scene/easing.js';
import { polar } from '../../scene/shapes.js';
import { text, isBig, progressArc, headDot, burst, mmss } from './_d7-kit.js';

const STATES = ['ready', 'focus-1', 'break-1', 'focus-2', 'break-2', 'focus-3', 'break-3', 'focus-4'];

export default {
  id: 'app-pomodoro-set',
  title: 'Pomodoro Set',
  category: 'Clocks & Timers',
  description: 'Four focus rounds, short breaks, a long break: press for the next phase. The ring drains as light and a finished round bursts. The timer runs for real on the key.',
  tags: ['pomodoro', 'focus', 'timer', 'break', 'productivity', 'rounds', 'deep work'],
  surface: 'key',
  fps: 4,
  loop: 60,
  states: STATES,
  tones: { ready: 'idle', 'focus-1': 'active', 'focus-2': 'active', 'focus-3': 'active', 'focus-4': 'active', 'break-1': 'ok', 'break-2': 'ok', 'break-3': 'ok' },
  press: 'cycle',
  params: {
    focus: { type: 'number', default: 25, min: 1, max: 90, step: 1, label: 'Focus minutes' },
    rest: { type: 'number', default: 5, min: 1, max: 30, step: 1, label: 'Short break minutes' },
    longRest: { type: 'number', default: 15, min: 5, max: 60, step: 1, label: 'Long break minutes' },
    hue: { type: 'hue', default: 34.2, min: 0, max: 360, label: 'Hue' },
  },
  order: 11,
  render(ctx) {
    const k0 = surface(ctx);
    const { w, h } = ctx;
    const C = k0.colors, u = k0.m.u;
    const name = ctx.stateName || 'ready';
    const [kind, numStr] = name.split('-');
    const round = Number(numStr) || 0;
    const P = ctx.params;
    // ready right after round four = the long break
    const longBreak = kind === 'ready' && (Number.isFinite(ctx.pressAge) || ctx.pressed) && ctx.since < P.longRest * 60 + 30;
    const total = (kind === 'focus' ? P.focus : kind === 'break' ? P.rest : longBreak ? P.longRest : P.focus) * 60;
    const timing = kind !== 'ready' || longBreak;
    const left = timing ? total - ctx.since : total;
    const finished = timing && left <= 0;
    const tone = kind === 'focus' ? 'active' : kind === 'break' || longBreak ? 'ok' : 'idle';
    const k = k0;
    k.background({ tone: finished ? 'ok' : tone });
    const big = isBig(k);
    const tint = kind === 'focus' ? ctx.tint : C.pos;
    // ring
    const dotsH = big ? 10 * u : 8 * u;
    const top = big ? k.m.text + 9 * u : k.m.safe;
    const bottom = h - k.m.safe - dotsH;
    const R = Math.min((bottom - top) / 2, w / 2 - k.m.safe * 1.1);
    const cx = w / 2, cy = (top + bottom) / 2;
    const sw = Math.max(1.5, k.m.bold * 0.85);
    const enter = ctx.reduced ? 1 : arrive(ctx.since, 0.6);
    k.add(progressArc({ cx, cy, r: R, value: 1, color: C.line, width: sw * 0.55 }));
    if (!finished) {
      const frac = timing ? clamp(left / total) * enter : 1;
      if (frac > 0) {
        k.add(progressArc({ cx, cy, r: R, value: frac, color: tint, width: sw, opacity: timing ? 1 : 0.4 }));
        if (timing) { const [hx, hy] = polar(cx, cy, R, 360 * frac); k.add(headDot(k, hx, hy, sw * 0.55, tint)); }
      }
      const label = kind === 'focus' ? 'Focus' : kind === 'break' ? 'Break' : longBreak ? 'Rest' : 'Ready';
      text(k, label, { cy: cy - R * 0.42, size: (big ? 7.5 : 6.5) * u, weight: 600, caps: true, tracking: 0.1, color: timing ? tint : 'muted', maxWidth: R * 1.5, minSize: 6.5 * u });
      text(k, mmss(timing ? Math.ceil(left) : total), { cy: cy + R * 0.08, size: R * 0.56, weight: 700, tabular: true, color: timing ? 'ink' : 'muted', maxWidth: R * 1.55 });
      if (!timing) text(k, 'start', { cy: cy + R * 0.5, size: (big ? 8 : 7) * u, weight: 400, color: 'dim', maxWidth: R * 1.4 });
    } else {
      // the finish: rays fly out once, the ring closes into a check, then the key holds still
      const a = -left;
      k.add(burst(k, { cx, cy, r0: R * 0.5, r1: R * 1.45, age: a, dur: 1.2, count: 12, hue: ctx.hue, spin: 15 }));
      const close = ctx.reduced ? 1 : outExpo(clamp(a / 0.5));
      k.add(progressArc({ cx, cy, r: R, value: close, color: C.pos, width: sw }));
      const g = R * 1.05;
      k.glyph('check', { box: { x: cx - g / 2, y: cy - g / 2 - R * 0.12, size: g }, state: 'done', since: a, tone: 'ok' });
      const next = kind === 'focus' ? (round === 4 ? 'Long break next' : 'Break next') : kind === 'break' ? `Round ${round + 1} next` : 'Set done';
      if (big) k.eyebrow(next, { color: 'pos', maxWidth: w - k.m.text * 2 });
      else text(k, kind === 'focus' ? 'Break' : kind === 'break' ? 'Focus' : 'Done', { cy: cy + R * 0.62, size: 6.5 * u, weight: 600, caps: true, tracking: 0.08, color: 'pos' });
      if (big && a >= 60) text(k, `+${Math.floor(a / 60)}m`, { cy: cy + R * 0.62, size: 7 * u, color: 'muted', weight: 600, tabular: true });
    }
    if (big && !finished) k.eyebrow(kind === 'focus' ? `${P.focus} min` : kind === 'break' ? `${P.rest} min` : longBreak ? `${P.longRest} min` : `4 × ${P.focus}`, { color: 'muted' });
    // the set: four dots — done (filled), now (lit ring), to come (hollow)
    const doneCount = kind === 'focus' ? round - 1 : kind === 'break' ? round : longBreak ? 4 : 0;
    const dr = Math.max(1.6, 2.1 * u), gap = dr * 3.6;
    const dy = h - k.m.safe - dotsH / 2 + u;
    for (let i = 0; i < 4; i++) {
      const x = cx + (i - 1.5) * gap;
      const now = kind === 'focus' && i === round - 1 && !finished;
      const filled = i < doneCount || (kind === 'focus' && finished && i === round - 1);
      if (filled) k.add(circle({ cx: n(x), cy: n(dy), r: n(dr), fill: kind === 'focus' && i === round - 1 ? C.pos : tint }));
      else k.add(circle({ cx: n(x), cy: n(dy), r: n(dr - 0.5), fill: now ? tint : 'none', fillOpacity: now ? 0.25 : undefined, stroke: now ? tint : C.dim, strokeWidth: n(Math.max(1, u * 0.7)) }));
    }
    void lerp;
    return k.svg();
  },
};
