// snap-right — snap the window to the right half: that half lit, an arrow pushing toward it.
import { defineGlyph } from '../_glyph.js';
import { drawSnap } from './_snap.js';

export default defineGlyph({
  id: 'snap-right',
  title: 'Snap Right',
  category: 'window',
  tags: ['snap', 'snap right', 'right half', 'tile', 'arrange', 'window'],
  draw(g, s) { drawSnap(g, s, 1); },
});
