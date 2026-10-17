// emoji — a smiling face. Arriving, the smile widens into place; a press makes it wink.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'emoji',
  title: 'Emoji',
  category: 'productivity',
  tags: ['emoji', 'smile', 'smiley', 'face', 'reaction', 'react', 'emoticon'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.35);
    g.circle(24, 24, 16);
    const w = lerp(25, 62, k);
    g.arc(24, 24.5, 9.5, 180 - w, 180 + w, { role: 'accent', weight: 1.05 });
    g.circle(18.5, 19.5, 2.2, { role: 'fill' });
    if (p > 0.3) g.line(27.3, 19.5, 31.7, 19.5, { role: 'fill', weight: 1 });
    else g.circle(29.5, 19.5, 2.2, { role: 'fill' });
  },
});
