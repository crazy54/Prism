// bank-right — roll the track to the right (mirror of bank-left).
import { defineGlyph } from '../_glyph.js';
import { drawBank } from './_bank.js';

export default defineGlyph({
  id: 'bank-right',
  title: 'Bank Right',
  category: 'build',
  tags: ['bank', 'right', 'roll', 'tilt', 'track', 'coaster', 'build'],
  draw(g, s) { drawBank(g, s, 1); },
});
