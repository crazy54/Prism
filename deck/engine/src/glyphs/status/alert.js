// alert — a warning triangle with its exclamation. warning: the triangle shakes once as
// the alert arrives, then the mark's dot breathes. critical: heavier, the mark blinks and
// the shake repeats every loop. clear: everything settles into dim.
import { defineGlyph } from '../_glyph.js';
import { clamp, pulse } from '../../scene/easing.js';
import { roundPoly, blink } from '../system/_kit.js';

const TRI = [[24, 6.5], [41, 37], [7, 37]];
const LOOP = 2.4;

/** A decaying shake (grid units) for the first `dur` seconds after a change. */
const shake = (since, dur = 0.5, amp = 1.8) => (since < 0 || since > dur ? 0 : amp * Math.sin(since * 46) * (1 - since / dur));

export default defineGlyph({
  id: 'alert',
  title: 'Alert',
  category: 'status',
  tags: ['alert', 'warning', 'caution', 'error', 'attention', 'problem'],
  states: { warning: 'warn', critical: 'crit', clear: 'idle' },
  loop: LOOP,
  draw(g, s) {
    const st = s.state;
    if (st === 'clear') {
      g.path(roundPoly(TRI, 4), { role: 'dim', join: 'round' });
      g.line(24, 17.5, 24, 26.5, { role: 'dim' });
      g.dot(24, 31.5, 1.9, { role: 'dim' });
      return;
    }
    const crit = st === 'critical';
    // warning shakes once on arrival; critical shakes at the top of every loop
    const dx = crit ? shake(Math.min(s.since, s.phase(LOOP) * LOOP), 0.5, 1.6) : shake(s.since);
    const tri = TRI.map(([x, y]) => [clamp(x + dx, 6.5, 41.5), y]);
    g.path(roundPoly(tri, 4), { role: crit ? 'accent' : 'line', weight: crit ? 1.15 : 1, join: 'round' });
    const on = crit ? 0.25 + 0.75 * blink(s.phase(0.8), 0.6, 0.1) : 1;
    g.line(24 + dx, 17.5, 24 + dx, 26.5, { role: crit ? 'line' : 'accent', weight: 1.1, opacity: on });
    g.dot(24 + dx, 31.5, 2.1, { opacity: crit ? on : 0.55 + 0.45 * pulse(s.t, 1.2) });
  },
});
