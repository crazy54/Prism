// timer — a countdown dial: the wedge of time remaining, measured clockwise to 12.
// ready: the wedge winds up to `level` (the share of the dial that is set).
// running: the wedge lights and drains in real time — `params.minutes` is the whole
// dial, so a facet needs only state + since — and a spark on the rim beats each second.
// done: the dial is empty and the face flashes with a burst of light from the hub.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse, phase, lerp, clamp, outExpo } from '../../scene/easing.js';
import { wedge } from './_dial.js';

const C = 24, R = 16.5, W = 12.5; // rim radius · wedge radius

export default defineGlyph({
  id: 'timer',
  title: 'Timer',
  category: 'time',
  tags: ['timer', 'countdown', 'kitchen', 'pomodoro', 'remaining', 'time'],
  states: { ready: 'idle', running: 'active', done: 'alert' },
  loop: 1,
  draw(g, s) {
    const k = arrive(s.since, 0.5);
    const minutes = typeof s.params.minutes === 'number' && s.params.minutes > 0 ? s.params.minutes : 5;
    const set = clamp(s.level);
    let rem = set;
    if (s.state === 'ready') rem = set * k; // winding up
    if (s.state === 'running') rem = clamp(set - s.since / (minutes * 60));
    if (s.state === 'done') rem = 0;
    const expired = s.state === 'done' || rem <= 0.0005;

    g.circle(C, C, R, { role: expired && s.state !== 'ready' ? 'accent' : 'line' });
    const a = (1 - rem) * 360; // the leading edge, sweeping clockwise as time runs out
    const d = wedge(C, C, W, a, 360);
    if (d) {
      if (s.state === 'running') {
        if (k < 1) g.path(d, { role: 'fill', fill: true, opacity: 0.3 * (1 - k) });
        g.path(d, { role: 'accent', fill: true, opacity: lerp(0.3, 0.88, k) });
      } else g.path(d, { role: 'fill', fill: true, opacity: 0.32 });
    }
    // the hand rides the leading edge
    const [hx, hy] = g.polar(C, C, W, expired ? 0 : a);
    g.line(C, C, hx, hy, { role: expired && s.state !== 'ready' ? 'accent' : 'line' });
    g.dot(C, C, 2.2, { role: 'fill' });

    if (s.state === 'running' && !expired) {
      // one beat per second on the rim, just ahead of the edge
      const [sx, sy] = g.polar(C, C, 14.5, a);
      const b = pulse(s.t, 1);
      g.dot(sx, sy, 1.3 + 0.5 * b, { opacity: 0.55 + 0.45 * b });
    }
    if (expired && s.state !== 'ready') {
      // time's up: rays burst from the hub and fade at the rim, twice a second
      const p = phase(s.t, 0.5), e = outExpo(p);
      const r0 = lerp(4.5, 9.5, e), r1 = lerp(6.5, 13, e), op = (1 - p) * (s.state === 'done' ? k : 1);
      for (let i = 0; i < 8; i++) {
        const ang = 22.5 + i * 45;
        const [x0, y0] = g.polar(C, C, r0, ang), [x1, y1] = g.polar(C, C, r1, ang);
        g.line(x0, y0, x1, y1, { role: 'accent', weight: 0.75, opacity: op });
      }
    }
  },
});
