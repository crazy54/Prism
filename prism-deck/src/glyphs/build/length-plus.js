// length-plus — make the piece longer: a dimension span under a plus.
import { defineGlyph } from '../_glyph.js';
import { drawLength } from './_length.js';

export default defineGlyph({
  id: 'length-plus',
  title: 'Longer',
  category: 'build',
  tags: ['length', 'longer', 'extend', 'plus', 'size', 'track', 'path', 'build'],
  draw(g, s) { drawLength(g, s, 1); },
});
