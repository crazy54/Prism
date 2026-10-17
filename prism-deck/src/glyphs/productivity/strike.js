// strike — strikethrough: a stroke-drawn S with a line through it in the accent. Arriving, the S
// settles and the strike draws across it.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { typeGlyph } from './_type.js';

export default defineGlyph({
  id: 'strike',
  title: 'Strikethrough',
  category: 'productivity',
  tags: ['strikethrough', 'strike', 'cross out', 'delete text', 'format', 'text style'],
  draw(g, s) {
    const { k } = typeGlyph(g, s, (role) => {
      g.path('M32.5 15.5C31 12.3 27.8 10.5 24 10.5C19 10.5 15.5 13.2 15.5 17C15.5 21.3 19.6 22.8 24 24C28.4 25.2 32.5 26.7 32.5 31C32.5 35 29 37.5 24 37.5C20 37.5 16.8 35.8 15.5 32.5', { role, weight: 1.1 });
    });
    g.line(9, 24, lerp(9, 39, k), 24, { role: 'accent', weight: 1.05 });
  },
});
