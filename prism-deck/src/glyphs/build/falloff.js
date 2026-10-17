// falloff — a brush's falloff: the strength curve over its baseline, full at the center and easing
// off to the edges, the center marked. Arriving, the curve rises from the baseline.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'falloff',
  title: 'Falloff',
  category: 'build',
  tags: ['falloff', 'fall off', 'brush', 'softness', 'hardness', 'centre', 'even', 'curve'],
  draw(g, s) {
    const k = enter(s, 0.6), p = press(s, 0.45);
    const top = lerp(34, 12, k) + 3 * p, base = 36;
    g.path(`M7 ${base}C14 ${base} 16 ${top} 24 ${top}C32 ${top} 34 ${base} 41 ${base}`, { role: 'line' });
    g.line(7, base + 2.5, 41, base + 2.5, { role: 'dim' });
    g.line(24, top + 4, 24, base, { role: 'accent', dash: [2, 2.6], opacity: k });
  },
});
