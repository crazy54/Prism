// sun — the sun: a disc with eight rays (daylight / brightness / time of day). Arriving, the rays
// reach out from the disc; idle, the long rays breathe.
import { defineGlyph } from '../_glyph.js';
import { lerp, pulse } from '../../scene/easing.js';
import { enter } from '../_tools.js';

export default defineGlyph({
  id: 'sun',
  title: 'Sun',
  category: 'game',
  tags: ['sun', 'day', 'daylight', 'brightness', 'light', 'weather', 'time of day'],
  hue: 75, // warm daylight
  loop: 2.4,
  draw(g, s) {
    const k = enter(s, 0.55);
    g.circle(24, 24, 7);
    for (let i = 0; i < 8; i++) {
      const a = i * 45, long = i % 2 === 0;
      const r0 = 11, r1 = r0 + lerp(0.3, long ? 5.5 : 3.5, k) * (long ? 0.85 + 0.15 * pulse(s.t, 2.4) : 1);
      const [x0, y0] = g.polar(24, 24, r0, a), [x1, y1] = g.polar(24, 24, r1, a);
      g.line(x0, y0, x1, y1, { role: long ? 'accent' : 'line' });
    }
  },
});
