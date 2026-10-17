// screenshot — capture the screen: four crop corners round a shutter aperture. Arriving, the corners
// close in on the frame; a press fires the shutter (the aperture flashes and the corners snap in).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'screenshot',
  title: 'Screenshot',
  category: 'stream',
  tags: ['screenshot', 'capture', 'snip', 'screen capture', 'grab', 'photo', 'clip'],
  draw(g, s) {
    const k = enter(s, 0.45), p = press(s, 0.4);
    const o = lerp(2, 0, k) - 1.2 * p, L = 8;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = 24 + sx * (16 + o), cy = 24 + sy * (14 + o);
      g.polyline([[cx, cy - sy * L], [cx, cy], [cx - sx * L, cy]], { role: 'line', join: 'round' });
    }
    g.circle(24, 24, 6.5, { role: p > 0.3 ? 'accent' : 'line' });
    if (p > 0.02) g.circle(24, 24, 3.2, { role: 'accent', fill: true, opacity: p });
    else g.dot(24, 24, 1.8, { role: 'fill' });
  },
});
