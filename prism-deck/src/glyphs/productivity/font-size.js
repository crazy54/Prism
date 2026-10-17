// font-size — text size: a large A beside a small A. Arriving, the large one grows up from the
// baseline; a press grows it a touch more (and lights it).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

const BASE = 37.5;
/** An A of height h with its left foot at x (stroke letter: two legs and a bar). */
function A(g, x, h, o) {
  const w = h * 0.68, top = BASE - h;
  g.polyline([[x, BASE], [x + w / 2, top], [x + w, BASE]], { join: 'round', ...o });
  g.line(x + w * 0.2, BASE - h * 0.33, x + w * 0.8, BASE - h * 0.33, o);
}

export default defineGlyph({
  id: 'font-size',
  title: 'Font Size',
  category: 'productivity',
  tags: ['font size', 'text size', 'zoom text', 'bigger', 'smaller', 'font', 'type'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    A(g, 7.5, lerp(18, 26, k) + 1.5 * p, { role: p > 0.3 ? 'accent' : 'line', weight: 1.1 });
    A(g, 29, 14, { role: 'line', weight: 0.95 });
  },
});
