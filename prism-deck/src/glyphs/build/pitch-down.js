// pitch-down — tip the track down: the side-view track dives off the horizontal, arrow at its head.
import { defineGlyph } from '../_glyph.js';
import { drawPitch } from './_pitch.js';

export default defineGlyph({
  id: 'pitch-down',
  title: 'Pitch Down',
  category: 'build',
  tags: ['pitch', 'down', 'dive', 'drop', 'slope', 'track', 'coaster', 'build'],
  draw(g, s) { drawPitch(g, s, -1); },
});
