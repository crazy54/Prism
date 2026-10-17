// bold — a heavy stroke-drawn B. Arriving, it settles into place; a press lights it.
import { defineGlyph } from '../_glyph.js';
import { typeGlyph } from './_type.js';

export default defineGlyph({
  id: 'bold',
  title: 'Bold',
  category: 'productivity',
  tags: ['bold', 'strong', 'weight', 'format', 'text style', 'b'],
  draw(g, s) {
    typeGlyph(g, s, (role) => {
      g.path('M16 10.5H25.5A6.75 6.75 0 0 1 25.5 24H16ZM16 24H27A6.75 6.75 0 0 1 27 37.5H16Z', { role, weight: 1.4, join: 'round', fill: false });
    });
  },
});
