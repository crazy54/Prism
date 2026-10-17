// smooth — terrain smoothing: a rough surface on the left eases into a smooth swell on the right,
// over the ground line. Arriving, the roughness relaxes; a press relaxes it further.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { smooth as smoothPath } from '../time/_dial.js';

const ROUGH = [[7, 29], [10, 23.5], [13.5, 30], [17, 22.5], [20.5, 28], [24, 24.5]];
const CALM = [[7, 27], [10, 26.4], [13.5, 26], [17, 25.6], [20.5, 25.2], [24, 24.5]];
const TAIL = [[24, 24.5], [29.5, 21.8], [35, 22.6], [41, 26]];

export default defineGlyph({
  id: 'smooth',
  title: 'Smooth',
  category: 'build',
  tags: ['smooth', 'soften', 'flatten', 'terrain', 'sculpt', 'brush', 'build'],
  draw(g, s) {
    const k = enter(s, 0.7), p = press(s, 0.5);
    const rough = lerp(1, 0.75, k) * (1 - 0.45 * p);   // how rough the left part still is
    g.polyline(ROUGH.map(([x, y], i) => [x, lerp(CALM[i][1], y, rough)]), { role: 'line', join: 'round' });
    g.path(smoothPath(TAIL), { role: 'line' });
    g.line(7, 37.5, 41, 37.5, { role: 'dim' });
  },
});
