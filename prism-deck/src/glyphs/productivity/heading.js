// heading — a heading: a stroke-drawn H beside two lines of body text. Arriving, the H settles into
// place; a press lights it.
import { defineGlyph } from '../_glyph.js';
import { typeGlyph } from './_type.js';

export default defineGlyph({
  id: 'heading',
  title: 'Heading',
  category: 'productivity',
  tags: ['heading', 'title', 'h1', 'h2', 'header', 'outline', 'text style'],
  draw(g, s) {
    typeGlyph(g, s, (role) => {
      g.line(9.5, 11, 9.5, 37, { role, weight: 1.15 });
      g.line(24.5, 11, 24.5, 37, { role, weight: 1.15 });
      g.line(9.5, 24, 24.5, 24, { role, weight: 1.15 });
    });
    g.line(31, 26.5, 39.5, 26.5, { role: 'dim' });
    g.line(31, 34, 37, 34, { role: 'dim' });
  },
});
