// close — the close cross. Arriving, its two strokes draw in from the center out; a press pulls them
// in toward the center (the click) and lights them.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'close',
  title: 'Close',
  category: 'nav',
  tags: ['close', 'x', 'dismiss', 'exit', 'close tab', 'close window', 'cancel', 'kill'],
  draw(g, s) {
    const k = enter(s, 0.4), p = press(s, 0.4);
    const h = lerp(3, 13, k) - 1.5 * p;              // half-extent of each stroke
    const role = p > 0.3 ? 'accent' : 'line';
    g.line(24 - h, 24 - h, 24 + h, 24 + h, { role, weight: 1.05 });
    g.line(24 + h, 24 - h, 24 - h, 24 + h, { role, weight: 1.05 });
  },
});
