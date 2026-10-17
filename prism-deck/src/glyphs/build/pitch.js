// pitch — the pitch angle: the track seen from the side, climbing off a dashed horizontal with the
// angle marked between them (the dial that pitches the track).
import { defineGlyph } from '../_glyph.js';
import { drawPitch } from './_pitch.js';

export default defineGlyph({
  id: 'pitch',
  title: 'Pitch',
  category: 'build',
  tags: ['pitch', 'slope', 'incline', 'angle', 'track', 'coaster', 'build'],
  draw(g, s) { drawPitch(g, s, 0); },
});
