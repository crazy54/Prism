// italic — a slanted stroke-drawn I with its serifs. Arriving, it settles into place; a press lights it.
import { defineGlyph } from '../_glyph.js';
import { typeGlyph } from './_type.js';

export default defineGlyph({
  id: 'italic',
  title: 'Italic',
  category: 'productivity',
  tags: ['italic', 'emphasis', 'slant', 'oblique', 'format', 'text style', 'i'],
  draw(g, s) {
    typeGlyph(g, s, (role) => {
      g.line(21, 10.5, 34, 10.5, { role, weight: 1.1 });
      g.line(14, 37.5, 27, 37.5, { role, weight: 1.1 });
      g.line(27.5, 10.5, 20.5, 37.5, { role, weight: 1.1 });
    });
  },
});
