// comment — a line comment: two slashes and the comment's text. Arriving, the text writes in after
// the slashes; a press lights the slashes (toggle comment).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'comment',
  title: 'Comment',
  category: 'productivity',
  tags: ['comment', 'toggle comment', 'line comment', 'slashes', 'code', 'annotate', 'remark'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    const role = p > 0.3 ? 'accent' : 'line';
    g.line(9, 35, 15.5, 13, { role, weight: 1.1 });
    g.line(17.5, 35, 24, 13, { role, weight: 1.1 });
    g.line(29, 21, lerp(29, 39.5, k), 21, { role: 'dim' });
    g.line(29, 28.5, lerp(29, 36, k), 28.5, { role: 'dim' });
  },
});
