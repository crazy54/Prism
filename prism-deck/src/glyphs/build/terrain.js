// terrain — two peaks on the ground line, a snowline on the taller. Arriving, the land rises from the
// ground; a press raises it a touch (the terrain tool at work).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { roundPoly } from '../system/_kit.js';

const BASE = 37.5;
const LAND = [[6.5, BASE], [17, 21.5], [22.5, 29], [29.5, 14], [41.5, BASE]];
const SNOW = [[25.9, 21.7], [28, 24], [30, 21.9], [31.7, 24], [33.4, 21.9]];

export default defineGlyph({
  id: 'terrain',
  title: 'Terrain',
  category: 'build',
  tags: ['terrain', 'land', 'mountain', 'raise', 'lower', 'sculpt', 'landscape', 'build'],
  draw(g, s) {
    const k = enter(s, 0.6), p = press(s, 0.5);
    const h = lerp(0.35, 1, k) * (1 + 0.06 * p);
    const up = (pts) => pts.map(([x, y]) => [x, BASE - (BASE - y) * h]);
    g.path(roundPoly(up(LAND), [1, 2.5, 2, 2.5, 1]), { join: 'round' });
    g.polyline(up(SNOW), { role: 'dim', join: 'round', opacity: k });
  },
});
