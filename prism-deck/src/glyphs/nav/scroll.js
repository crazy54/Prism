// scroll — a mouse with its wheel (scroll up / down). The wheel sits in the button split; its tread
// mark rolls with level, so a dial turn reads as the wheel turning. A press clicks the wheel.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'scroll',
  title: 'Scroll',
  category: 'nav',
  tags: ['scroll', 'mouse', 'wheel', 'page', 'scroll up', 'scroll down', 'navigation'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    g.rect(13.5, 7.5, 21, 33, { r: 10.5 });
    g.line(13.5, 21.5, 34.5, 21.5, { role: 'dim' });
    g.line(24, 7.5, 24, 12, { role: 'dim' });
    g.rect(21.5, 12 + 0.6 * p, 5, 7.5, { r: 2.5, role: p > 0.3 ? 'accent' : 'line', opacity: lerp(0.4, 1, k) });
    const tread = lerp(14, 17.5, clamp(s.level));
    g.line(23, tread, 25, tread, { role: 'accent', weight: 0.7, opacity: k });
  },
});
