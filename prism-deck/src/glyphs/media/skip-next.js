// skip-next — ▶▶| : a press shoves the triangles to the bar and fires a ghost through it.
import { defineGlyph } from '../_glyph.js';
import { drawSkip } from './_skip.js';

export default defineGlyph({
  id: 'skip-next',
  title: 'Next Track',
  category: 'media',
  tags: ['next', 'skip', 'forward', 'track', 'transport', 'media'],
  draw(g, s) { drawSkip(g, s, 1); },
});
