// indent — lines of text, the middle two pushed in, an arrow pointing into the indent. Arriving, the
// middle lines slide in to their indent; a press pushes them a little further.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'indent',
  title: 'Indent',
  category: 'productivity',
  tags: ['indent', 'tab in', 'increase indent', 'outdent', 'nest', 'format', 'text'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    const x = lerp(8.5, 21, k) + 1.5 * p;
    g.line(8.5, 11, 39.5, 11, { role: 'line' });
    g.line(x, 20, 39.5, 20, { role: 'dim' });
    g.line(x, 28, 39.5, 28, { role: 'dim' });
    g.line(8.5, 37, 39.5, 37, { role: 'line' });
    g.polyline([[9, 18.5], [14.5, 24], [9, 29.5]], { role: 'accent', join: 'round', opacity: k });
  },
});
