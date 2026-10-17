// height — a vertical dimension: a double arrow between two stops beside the block it measures, over
// the ground line. Arriving, the block rises and the arrow stretches with it; a press raises it a touch.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

const BASE = 38.5;

export default defineGlyph({
  id: 'height',
  title: 'Height',
  category: 'game',
  tags: ['height', 'altitude', 'elevation', 'raise', 'lower', 'vertical', 'measure', 'path height'],
  draw(g, s) {
    const k = enter(s, 0.55), p = press(s, 0.45);
    const top = lerp(26, 11, k) - 1.5 * p;
    g.line(8, BASE, 40, BASE, { role: 'dim' });
    g.rect(24, top, 13, BASE - top, { r: 3 });
    g.line(9.5, top, 18.5, top, { role: 'dim' });
    g.line(15, top + 3.5, 15, BASE - 3.5, { role: 'accent' });
    g.polyline(chevron([15, top + 2.5], 0, 4.8, 45), { role: 'accent', join: 'round' });
    g.polyline(chevron([15, BASE - 2.5], 180, 4.8, 45), { role: 'accent', join: 'round' });
  },
});
