// fit — fit to the frame: a double arrow spanning the frame wall to wall between two stops. Arriving,
// the arrows open out to the walls; a press pushes them against the walls.
import { defineGlyph } from '../_glyph.js';
import { chevron } from '../_tools.js';
import { frame, motion, lerp } from './_frame.js';

export default defineGlyph({
  id: 'fit',
  title: 'Fit',
  category: 'window',
  tags: ['fit', 'fit to screen', 'stretch', 'scale to fit', 'bounds', 'resize', 'transform'],
  draw(g, s) {
    const { k, p } = motion(s);
    frame(g, { role: 'dim' });
    const o = lerp(7, 0, k) - 1 * p;
    const a = 12.5 + o, b = 35.5 - o;
    g.line(a, 24, b, 24, { role: 'line' });
    g.polyline(chevron([a, 24], 270, 6, 45), { role: 'accent', join: 'round' });
    g.polyline(chevron([b, 24], 90, 6, 45), { role: 'accent', join: 'round' });
  },
});
