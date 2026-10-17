// app-counter — a tally key. Press to count: the number rolls up like an odometer (the old value
// slides out, the new one rises in). Hold: a ring of amber fills around the edge, and at 0.8 s the
// count resets to zero (the hold reads from the game clock, so letting go early just counts). An
// optional goal draws a beam under the number and celebrates when it is reached.
// Stateful (API 1.5 `game`): the count survives restarts in the action's settings. Static between
// presses; ticks (4 Hz) only while the key is held.

import { surface, rect, n } from '../../scene/index.js';
import { clamp, outExpo, arrive } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { compact } from '../../scene/text.js';
import { text, isBig, perimeter, perimeterStroke, burst } from './_d7-kit.js';

const HOLD = 0.8, ROLL = 0.38;

export default {
  id: 'app-counter',
  title: 'Counter',
  category: 'Controls',
  description: 'A tally key: press to count and the number rolls like an odometer; hold to reset. Optional goal with a celebration. It counts your presses; nothing else is read.',
  tags: ['counter', 'tally', 'count', 'clicker', 'score', 'reps', 'tracker', 'productivity', 'stream', 'streaming', 'goal'],
  surface: 'key',
  animated: false,
  fps: 12,
  loop: 2,
  params: {
    label: { type: 'text', default: 'Count', maxLength: 12, label: 'Label' },
    step: { type: 'number', default: 1, min: 1, max: 100, step: 1, label: 'Count by' },
    goal: { type: 'number', default: 0, min: 0, max: 100000, step: 1, label: 'Goal (0 = none)' },
    hue: { type: 'hue', default: 217.5, min: 0, max: 360, label: 'Hue' },
  },
  game: {
    tickHz: 4,
    ticking: (s) => s.down !== null,
    animate: 1.1,
    init({ params }) { return { count: 0, step: Math.max(1, Math.round(params.step)), down: null, resets: 0 }; },
    reduce(s, ev) {
      if (ev.type === 'press') return { ...s, count: s.count + s.step, down: ev.t };
      if (ev.type === 'tick' && s.down !== null && ev.t - s.down >= HOLD) return { ...s, count: 0, down: null, resets: s.resets + 1 };
      if (ev.type === 'release' && s.down !== null) return ev.t - s.down >= HOLD ? { ...s, count: 0, down: null, resets: s.resets + 1 } : { ...s, down: null };
      return s;
    },
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, u = k.m.u;
    const s = ctx.game || { count: 0, down: null, step: 1 };
    const prev = ctx.gamePrev;
    const ev = ctx.gameEvent;
    const age = ev ? ev.age : 99;
    const goal = ctx.params.goal;
    const reached = goal > 0 && s.count >= goal;
    k.background({ tone: reached ? 'ok' : s.down !== null ? 'active' : 'idle' });
    const big = isBig(k);
    const cy = h * (goal > 0 ? 0.47 : 0.52);
    const size = (big ? 34 : 30) * u * (s.count >= 1000 ? 0.78 : 1);
    const room = w - k.m.text * 2;
    // the odometer: on a count change the old value slides up and out, the new one rises in
    const changed = prev && prev.count !== s.count && ev && (ev.type === 'press' || ev.type === 'tick' || ev.type === 'release');
    const r = changed && !ctx.reduced ? outExpo(clamp(age / ROLL)) : 1;
    const up = s.count > (prev?.count ?? 0) ? 1 : -1;
    const travel = size * 0.95;
    const cid = k.id('win');
    k.def(`<clipPath id="${cid}"><rect x="0" y="${n(cy - size * 0.62)}" width="${n(w)}" height="${n(size * 1.24)}"/></clipPath>`);
    let roll = '';
    if (r < 1) roll += text(k, compact(prev.count), { cy: cy - up * travel * r, size, weight: 700, tabular: true, color: 'ink', opacity: (1 - r) ** 2, maxWidth: room, add: false });
    roll += text(k, compact(s.count), { cy: cy + up * travel * (1 - r), size, weight: 700, tabular: true, color: s.count === 0 && !changed ? 'muted' : 'ink', opacity: r < 1 ? r : undefined, maxWidth: room, add: false });
    k.add(`<g clip-path="url(#${cid})">${roll}</g>`);
    // eyebrow: the label (and +step on press)
    k.eyebrow(ctx.params.label, { color: 'muted', maxWidth: room * 0.7 });
    if (changed && up > 0 && age < 0.9 && big) k.eyebrow(`+${s.step}`, { align: 'right', x: w - k.m.text, color: 'ink', opacity: 1 - clamp((age - 0.5) / 0.4) });
    // hold-to-reset: the amber ring round the edge
    if (s.down !== null && ev?.type === 'press') {
      const f = clamp((age - 0.15) / (HOLD - 0.15));
      const inset = k.m.hair + k.m.line;
      const per = perimeter(inset, inset, w - inset * 2, h - inset * 2, k.m.radius * 0.9);
      if (f > 0) k.add(perimeterStroke(per, f, { color: C.warn, width: k.m.line * 1.8 }));
      if (age > 0.25) k.caption('hold to reset', { y: h - k.m.safe - u, color: 'warn', opacity: clamp((age - 0.25) / 0.2) });
    } else if (ev && prev && s.count === 0 && prev.count > 0 && age < 1.1) {
      k.caption('reset', { y: h - k.m.safe - u, color: 'warn', opacity: 1 - clamp((age - 0.6) / 0.5) });
    } else if (goal > 0) {
      // the goal beam
      const by = h - k.m.safe - 11 * u, bw = room, bh = Math.max(2, 2.4 * u);
      const f = clamp(s.count / goal);
      k.add(rect({ x: n(k.m.text), y: n(by), width: n(bw), height: n(bh), rx: n(bh / 2), fill: C.line }));
      if (f > 0) k.add(rect({ x: n(k.m.text), y: n(by), width: n(Math.max(bh, bw * f)), height: n(bh), rx: n(bh / 2), fill: reached ? C.pos : ctx.tint }));
      k.caption(reached ? `goal ${compact(goal)} ✓` : `of ${compact(goal)}`, { y: h - k.m.safe + u * 0.5, color: reached ? 'pos' : 'dim' });
      if (reached && changed && prev.count < goal) k.add(burst(k, { cx: w / 2, cy, r0: size * 0.4, r1: Math.min(w, h) * 0.55, age, dur: 1.05, count: 12, hue: ctx.hue }));
    }
    void arrive; void mix;
    return k.svg();
  },
};
