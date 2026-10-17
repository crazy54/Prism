// arrow-up — a plain arrow (Arrow Up). Arriving, it slides in along its direction; a press nudges it on.
import { defineGlyph } from '../_glyph.js';
import { drawArrow } from './_arrow.js';

export default defineGlyph({
  id: 'arrow-up',
  title: 'Arrow Up',
  category: 'nav',
  tags: ['up', 'raise', 'increase', 'higher', 'arrow', 'move up', 'navigation'],
  draw(g, s) { drawArrow(g, s, 0); },
});
