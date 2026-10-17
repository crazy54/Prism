// stairs — a flight of stairs climbing to the right, the handrail above. Arriving, the steps build up
// one after another; a press lights the rail.
import { defineGlyph } from '../_glyph.js';
import { clamp } from '../../scene/easing.js';
import { press } from '../_tools.js';

export default defineGlyph({
  id: 'stairs',
  title: 'Stairs',
  category: 'build',
  tags: ['stairs', 'steps', 'staircase', 'gate', 'queue', 'climb', 'path'],
  draw(g, s) {
    const p = press(s, 0.4);
    const pts = [[8, 39]];
    for (let i = 0; i < 4; i++) {
      const k = clamp((s.since - i * 0.08) / 0.3);
      const x = 8 + i * 7.5, y = 39 - i * 7;
      if (k <= 0.02) break;
      pts.push([x, y - 7 * k], [x + 7.5 * k, y - 7 * k]);
    }
    if (pts.length > 1) g.polyline(pts, { role: 'line', join: 'round' });
    g.line(9, 26, 27, 9.2, { role: p > 0.3 ? 'accent' : 'dim' });
  },
});
