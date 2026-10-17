// bank — the bank angle: the track's cross-section rolled against a dashed horizon, the angle
// marked between them (the dial that rolls the track).
import { defineGlyph } from '../_glyph.js';
import { drawBank } from './_bank.js';

export default defineGlyph({
  id: 'bank',
  title: 'Bank',
  category: 'build',
  tags: ['bank', 'roll', 'tilt', 'angle', 'track', 'coaster', 'build'],
  draw(g, s) { drawBank(g, s, 0); },
});
