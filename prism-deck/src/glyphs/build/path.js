// path — a footpath running away into the park: two edges in perspective, a dashed center line.
// Arriving, the dashes run up the path; a press runs them on by one dash.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'path',
  title: 'Path',
  category: 'build',
  tags: ['path', 'footpath', 'walkway', 'road', 'join', 'queue', 'build'],
  draw(g, s) {
    const k = enter(s, 0.6), p = press(s, 0.5);
    g.line(9.5, 39.5, 19.5, 8.5);
    g.line(38.5, 39.5, 28.5, 8.5);
    // center dashes, shrinking with distance; they run up the path on arrival and on a press
    const run = (1 - k) + p;
    for (let i = -1; i < 4; i++) {
      const u = (i + (run % 1)) / 4;                  // 0 near, 1 far
      if (u < 0 || u > 0.92) continue;
      const y0 = lerp(37, 10, u), len = lerp(6, 2.2, u);
      g.line(24, y0, 24, y0 - len, { role: 'dim', opacity: Math.min(1, (0.92 - u) / 0.15) });
    }
  },
});
