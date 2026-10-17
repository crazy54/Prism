// arrow-left — a plain arrow (Arrow Left). Arriving, it slides in along its direction; a press nudges it on.
import { defineGlyph } from '../_glyph.js';
import { drawArrow } from './_arrow.js';

export default defineGlyph({
  id: 'arrow-left',
  title: 'Arrow Left',
  category: 'nav',
  tags: ['left', 'previous', 'arrow', 'move left', 'navigation'],
  draw(g, s) { drawArrow(g, s, 270); },
});
