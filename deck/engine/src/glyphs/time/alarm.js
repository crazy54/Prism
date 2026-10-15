// alarm — a twin-bell alarm clock. off: quiet. set: the hands light, the hammer rests.
// ringing: the clock shakes in bursts, the hammer strikes bell to bell and the air
// beside it trembles (1.5 s loop: a one-second burst, half a second's breath).
import { defineGlyph } from '../_glyph.js';
import { arrive, phase, smoothstep } from '../../scene/easing.js';
import { P } from '../../scene/svg.js';
import { polar } from '../../scene/shapes.js';

const CX = 24, CY = 27, R = 12;

/** A bell dome facing direction `deg`, its flat side toward the clock. */
function bell(deg) {
  const b = polar(CX, CY, 15.5, deg);
  const [x0, y0] = polar(b[0], b[1], 5, deg - 90), [x1, y1] = polar(b[0], b[1], 5, deg + 90);
  return P().M(x0, y0).A(5, 5, 0, 0, 1, x1, y1).Z().d;
}

export default defineGlyph({
  id: 'alarm',
  title: 'Alarm',
  category: 'time',
  tags: ['alarm', 'wake', 'ring', 'reminder', 'bell', 'clock', 'time'],
  states: { off: 'off', set: 'active', ringing: 'alert' },
  loop: 1.5,
  draw(g, s) {
    const ringing = s.state === 'ringing', set = s.state !== 'off';
    const p = phase(s.t, 1.5);
    const env = ringing ? smoothstep(0, 0.06, p) * (1 - smoothstep(0.6, 0.68, p)) : 0;
    const shake = 7 * Math.sin((s.t / 0.25) * Math.PI * 2) * env;
    const k = arrive(s.since, 0.4);

    g.group({ rotate: shake, origin: [CX, CY] }, () => {
      g.path(bell(-42), { role: 'fill', opacity: 0.92 });
      g.path(bell(42), { role: 'fill', opacity: 0.92 });
      // hammer: rests upright; strikes left / right while ringing
      const swing = ringing ? 24 * Math.sin((s.t / 0.25) * Math.PI * 2 + Math.PI / 2) * env : 0;
      g.group({ rotate: swing, origin: [CX, CY - R] }, () => {
        g.line(CX, CY - R, CX, 10.5, { role: 'line', weight: 0.9 });
        g.dot(CX, 9.5, 1.7, { role: ringing ? 'spark' : 'fill' });
      });
      g.circle(CX, CY, R);
      // legs
      for (const a of [145, 215]) {
        const [x0, y0] = polar(CX, CY, R + 0.5, a), [x1, y1] = polar(CX, CY, 16.2, a);
        g.line(x0, y0, x1, y1, { role: 'line' });
      }
      // hands at ten past ten; set lights the minute hand
      const [hx, hy] = polar(CX, CY, 6, 300), [mx, my] = polar(CX, CY, 8.5 * (set ? 0.75 + 0.25 * k : 1), 60);
      g.line(CX, CY, hx, hy, { role: 'line' });
      g.line(CX, CY, mx, my, { role: set ? 'accent' : 'dim' });
      g.dot(CX, CY, 1.7, { role: 'fill' });
    });
    if (ringing && env > 0.01) {
      // the air trembles beside the clock
      const flick = 0.45 + 0.55 * Math.abs(Math.sin((s.t / 0.25) * Math.PI * 2));
      for (const [a0, a1] of [[248, 292], [68, 112]]) g.arc(CX, CY, 16.5, a0, a1, { role: 'accent', weight: 0.75, opacity: env * flick });
    }
  },
});
