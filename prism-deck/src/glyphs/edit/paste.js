// paste — a clipboard with a sheet on it. Arriving, the sheet drops onto the board; a press drops it
// again and lights it (pasted).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'paste',
  title: 'Paste',
  category: 'edit',
  tags: ['paste', 'clipboard', 'insert', 'paste shift', 'clip'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.45);
    g.path('M17.5 11H14A3.5 3.5 0 0 0 10.5 14.5V36.5A3.5 3.5 0 0 0 14 40H34A3.5 3.5 0 0 0 37.5 36.5V14.5A3.5 3.5 0 0 0 34 11H30.5', { join: 'round' });
    g.rect(17.5, 7.5, 13, 7, { r: 2.5, role: 'line' });
    const dy = lerp(-5, 0, k) - 2.5 * p;
    g.group({ y: dy, opacity: lerp(0, 1, k) }, () => {
      g.line(16.5, 22.5, 31.5, 22.5, { role: p > 0.3 ? 'accent' : 'dim' });
      g.line(16.5, 28, 31.5, 28, { role: p > 0.3 ? 'accent' : 'dim' });
      g.line(16.5, 33.5, 26, 33.5, { role: p > 0.3 ? 'accent' : 'dim' });
    });
  },
});
