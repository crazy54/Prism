// align — align to a surface: two blocks of different heights drop onto a shared accent line.
// Arriving, they settle onto it one after the other; a press lifts them and drops them back.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'align',
  title: 'Align',
  category: 'build',
  tags: ['align', 'surface', 'height', 'snap to ground', 'arrange', 'layout', 'build'],
  draw(g, s) {
    const p = press(s, 0.5);
    const k1 = enter(s, 0.5), k2 = enter({ since: s.since - 0.1 }, 0.5);
    g.line(7.5, 38, 40.5, 38, { role: 'accent', weight: 1.05 });
    g.rect(11, 10 - lerp(3.5, 0, k1) - 2 * p, 10.5, 24, { r: 3, opacity: lerp(0.3, 1, k1) });
    g.rect(26.5, 19 - lerp(3.5, 0, k2) - 2 * p, 10.5, 15, { r: 3, opacity: lerp(0.3, 1, k2) });
  },
});
