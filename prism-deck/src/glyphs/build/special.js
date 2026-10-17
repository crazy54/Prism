// special — a special element (a corkscrew / heartline roll) seen from the side: the track coils
// twice as it runs over the ground. Arriving, it draws itself through the coils; after a press a
// spark rides it.
import { defineGlyph } from '../_glyph.js';
import { enter } from '../_tools.js';
import { partialPolyline } from '../system/_kit.js';
import { ride } from './_track.js';

// a prolate cycloid: x = x0 + r·θ − d·sin θ, y = yc − d·cos θ, θ from π to 5π (two coils, in and out at the bottom)
const R = 2.05, DD = 7.2, YC = 23;
const PTS = (() => {
  const x0 = 24 - R * 3 * Math.PI, out = [[7, YC + DD]];
  for (let i = 0; i <= 120; i++) { const th = Math.PI + (4 * Math.PI * i) / 120; out.push([x0 + R * th - DD * Math.sin(th), YC - DD * Math.cos(th)]); }
  out.push([41, YC + DD]);
  return out;
})();

export default defineGlyph({
  id: 'special',
  title: 'Special Element',
  category: 'build',
  tags: ['special', 'corkscrew', 'roll', 'heartline', 'inversion', 'element', 'track', 'coaster', 'build'],
  draw(g, s) {
    const k = enter(s, 0.7);
    const pts = k > 0.999 ? PTS : partialPolyline(PTS, k);
    if (pts.length > 1) g.polyline(pts, { role: 'line', join: 'round', weight: 1.05 });
    g.line(9, 37, 39, 37, { role: 'dim', opacity: k });
    ride(g, s, PTS, 1.2);
  },
});
