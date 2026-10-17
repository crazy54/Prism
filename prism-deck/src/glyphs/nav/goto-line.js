// goto-line — go to a line: lines of text with an arrow pointing in at one of them, which lights.
// Arriving, the arrow slides in to its line; a press jumps it in again.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

export default defineGlyph({
  id: 'goto-line',
  title: 'Go to Line',
  category: 'nav',
  tags: ['go to line', 'line', 'jump', 'line number', 'navigate', 'code'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    g.line(20, 12, 40, 12, { role: 'dim' });
    g.line(20, 24, 40, 24, { role: 'accent', weight: 1.05 });
    g.line(20, 36, 34, 36, { role: 'dim' });
    const x = lerp(12.5, 15, k) + 1.2 * p;
    g.line(x - 6, 24, x - 0.5, 24, { role: 'line', opacity: k });
    g.polyline(chevron([x, 24], 90, 5.5, 45), { role: 'line', join: 'round', opacity: k });
  },
});
