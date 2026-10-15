// skip-prev — |◀◀ : the mirror of skip-next (a press shoves the triangles back to the bar).
import { defineGlyph } from '../_glyph.js';
import { drawSkip } from './_skip.js';

export default defineGlyph({
  id: 'skip-prev',
  title: 'Previous Track',
  category: 'media',
  tags: ['previous', 'skip', 'back', 'rewind', 'track', 'transport', 'media'],
  draw(g, s) { drawSkip(g, s, -1); },
});
