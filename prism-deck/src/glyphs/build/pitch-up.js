// pitch-up — tip the track up: the side-view track climbs off the horizontal, arrow at its head.
import { defineGlyph } from '../_glyph.js';
import { drawPitch } from './_pitch.js';

export default defineGlyph({
  id: 'pitch-up',
  title: 'Pitch Up',
  category: 'build',
  tags: ['pitch', 'up', 'climb', 'slope', 'incline', 'track', 'coaster', 'build'],
  draw(g, s) { drawPitch(g, s, 1); },
});
