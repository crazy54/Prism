// arrow-down — a plain arrow (Arrow Down). Arriving, it slides in along its direction; a press nudges it on.
import { defineGlyph } from '../_glyph.js';
import { drawArrow } from './_arrow.js';

export default defineGlyph({
  id: 'arrow-down',
  title: 'Arrow Down',
  category: 'nav',
  tags: ['down', 'lower', 'decrease', 'arrow', 'move down', 'navigation'],
  draw(g, s) { drawArrow(g, s, 180); },
});
