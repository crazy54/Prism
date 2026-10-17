// length-minus — make the piece shorter: a dimension span under a minus.
import { defineGlyph } from '../_glyph.js';
import { drawLength } from './_length.js';

export default defineGlyph({
  id: 'length-minus',
  title: 'Shorter',
  category: 'build',
  tags: ['length', 'shorter', 'shrink', 'minus', 'size', 'track', 'path', 'build'],
  draw(g, s) { drawLength(g, s, -1); },
});
