// brake — the brake mark: a disc between two caliper arcs. Arriving, the calipers close in on the
// disc; on: they clamp tight and light; a press squeezes them.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'brake',
  title: 'Brakes',
  category: 'build',
  tags: ['brake', 'brakes', 'stop', 'slow', 'block', 'track', 'coaster', 'build'],
  states: { off: 'idle', on: 'active' },
  draw(g, s) {
    const on = s.state === 'on';
    const k = enter(s, 0.5), p = press(s, 0.4);
    const r = lerp(17.5, on ? 14.5 : 15.5, k) - 1.2 * p;
    g.circle(24, 24, 9.5);
    g.circle(24, 24, 2.6, { role: 'fill' });
    const role = on || p > 0.4 ? 'accent' : 'line';
    g.arc(24, 24, r, 222, 318, { role, weight: 1.05 });
    g.arc(24, 24, r, 42, 138, { role, weight: 1.05 });
  },
});
