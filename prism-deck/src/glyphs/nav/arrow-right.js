// arrow-right — a plain arrow (Arrow Right). Arriving, it slides in along its direction; a press nudges it on.
import { defineGlyph } from '../_glyph.js';
import { drawArrow } from './_arrow.js';

export default defineGlyph({
  id: 'arrow-right',
  title: 'Arrow Right',
  category: 'nav',
  tags: ['right', 'next', 'arrow', 'move right', 'navigation'],
  draw(g, s) { drawArrow(g, s, 90); },
});
