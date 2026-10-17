// station — the ride's station: a canopy on two posts over the platform, a car waiting under it.
// Arriving, the car rolls in and stops under the canopy; a press lights it (dispatch).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

// a coaster car in profile: low nose on the left, the seat back stepping up behind it
const CAR = 'M15.5 34.5V31.5A2.5 2.5 0 0 1 18 29H24.5L26.5 26H30A2.5 2.5 0 0 1 32.5 28.5V34.5Z';

export default defineGlyph({
  id: 'station',
  title: 'Station',
  category: 'build',
  tags: ['station', 'platform', 'queue', 'dispatch', 'entrance', 'ride', 'coaster', 'build'],
  draw(g, s) {
    const k = enter(s, 0.7), p = press(s, 0.5);
    g.path('M8 17L12.5 10.5H35.5L40 17Z', { join: 'round' });
    g.line(12.5, 17, 12.5, 37.5, { role: 'dim' });
    g.line(35.5, 17, 35.5, 37.5, { role: 'dim' });
    g.line(7.5, 37.5, 40.5, 37.5, { role: 'line' });
    g.group({ x: lerp(-7, 0, k) + 2.5 * p, opacity: k }, () => g.path(CAR, { role: p > 0.3 ? 'accent' : 'line', join: 'round' }));
  },
});
