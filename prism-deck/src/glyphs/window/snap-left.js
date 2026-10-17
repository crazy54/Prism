// snap-left — snap the window to the left half: that half lit, an arrow pushing toward it.
import { defineGlyph } from '../_glyph.js';
import { drawSnap } from './_snap.js';

export default defineGlyph({
  id: 'snap-left',
  title: 'Snap Left',
  category: 'window',
  tags: ['snap', 'snap left', 'left half', 'tile', 'arrange', 'window'],
  draw(g, s) { drawSnap(g, s, -1); },
});
