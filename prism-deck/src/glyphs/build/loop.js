// loop — a vertical loop seen from the side: the track runs in along the ground, climbs around the
// loop and runs out the other side. Arriving, the track draws itself through the loop; a train
// (a spark) rides it once after each press.
import { defineGlyph } from '../_glyph.js';
import { flattenPath } from '../../scene/geom.js';
import { enter } from '../_tools.js';
import { partialPolyline } from '../system/_kit.js';
import { ride } from './_track.js';

const D = 'M7 37.5H20C29 37.5 35 31 35 22.5C35 16 30 11 24 11C18 11 13 16 13 22.5C13 31 19 37.5 28 37.5H41';
const PTS = flattenPath(D, 0.2)[0].pts;


export default defineGlyph({
  id: 'loop',
  title: 'Loop',
  category: 'build',
  tags: ['loop', 'vertical loop', 'inversion', 'element', 'track', 'coaster', 'build'],
  draw(g, s) {
    const k = enter(s, 0.7);
    const pts = k > 0.999 ? PTS : partialPolyline(PTS, k);
    if (pts.length > 1) g.polyline(pts, { role: 'line', join: 'round', weight: 1.05 });
    ride(g, s, PTS);
  },
});
