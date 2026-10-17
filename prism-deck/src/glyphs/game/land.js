// land — set down: an arrow descending onto a landing pad (the pad's marks either side). Arriving,
// the arrow comes down onto the pad; a press drops it again and the pad lights.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

export default defineGlyph({
  id: 'land',
  title: 'Land',
  category: 'game',
  tags: ['land', 'landing', 'touch down', 'exit ship', 'descend', 'pad', 'dock'],
  draw(g, s) {
    const k = enter(s, 0.55), p = press(s, 0.45);
    const d = lerp(-4, 0, k) + 2 * p;
    g.line(24, 10.5 + d, 24, 25.5 + d);
    g.polyline(chevron([24, 27 + d], 180, 8, 45), { role: 'line', join: 'round' });
    g.ellipse(24, 35.5, 14, 4, { role: p > 0.3 ? 'accent' : 'line' });
    g.line(7, 35.5, 8.5, 35.5, { role: 'dim' });
    g.line(39.5, 35.5, 41, 35.5, { role: 'dim' });
  },
});
