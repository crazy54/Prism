// pitch-level — flatten the track: the side-view track settles flat under the spirit level, whose
// bubble slides home between its marks.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { spiritLevel } from './_track.js';

export default defineGlyph({
  id: 'pitch-level',
  title: 'Flatten',
  category: 'build',
  tags: ['flat', 'level', 'pitch', 'flatten', 'reset', 'track', 'coaster', 'build'],
  draw(g, s) {
    const k = enter(s, 0.6), p = press(s, 0.5);
    const lift = lerp(7, 0, k) + 2.5 * p;     // the right end settles down onto the level
    spiritLevel(g, 16.5, { k, bubble: lerp(6, 0, k) });
    g.line(8.5, 32.5, 39.5, 32.5 - lift, { role: 'line', weight: 1.1 });
    g.dot(8.5, 32.5, 2.2, { role: 'fill' });
    g.dot(39.5, 32.5 - lift, 2.2, { role: 'fill' });
  },
});
