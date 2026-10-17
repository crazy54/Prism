// track-straight — coaster track seen from above: two rails on ties. Arriving, the ties run toward
// you and settle; a press runs the track on by one tie (the piece is laid).
import { defineGlyph } from '../_glyph.js';
import { enter, press } from '../_tools.js';
import { topTrack, straightAt } from './_track.js';

export default defineGlyph({
  id: 'track-straight',
  title: 'Straight Track',
  category: 'build',
  tags: ['track', 'straight', 'straighten', 'rail', 'coaster', 'piece', 'build'],
  draw(g, s) {
    const k = enter(s, 0.55), p = press(s, 0.5);
    topTrack(g, straightAt(24, 40), 32, { gauge: 12, pitch: 8, over: 2.5, run: (1 - k) + p, opacity: 0.35 + 0.65 * k });
  },
});
