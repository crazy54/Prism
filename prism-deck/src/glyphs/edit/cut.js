// cut — scissors, blades up. Arriving, the blades open out of a closed pair; a press snips them shut
// (they cross at the pivot) and they spring open again.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

const PIV = [24, 24];

export default defineGlyph({
  id: 'cut',
  title: 'Cut',
  category: 'edit',
  tags: ['cut', 'scissors', 'snip', 'trim', 'clip', 'transition'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.35);
    const open = lerp(4, 15, k) * (1 - 0.75 * p);   // half-angle between the blades, degrees
    for (const side of [-1, 1]) {
      g.group({ rotate: side * (open - 15), origin: PIV }, () => {
        // each blade runs from its finger ring (bottom, on its own side) through the pivot to the tip (other side)
        g.line(24 - side * 3.99, 31.22, 24 + side * 8, 9.5, { role: 'line' });
        g.circle(24 - side * 6.4, 35.6, 5, { role: 'line' });
      });
    }
    g.dot(PIV[0], PIV[1], 1.7, { role: 'fill' });
  },
});
