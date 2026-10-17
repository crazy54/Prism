// bank-left — roll the track to the left: the cross-section tips left, the arrow sweeps over it.
import { defineGlyph } from '../_glyph.js';
import { drawBank } from './_bank.js';

export default defineGlyph({
  id: 'bank-left',
  title: 'Bank Left',
  category: 'build',
  tags: ['bank', 'left', 'roll', 'tilt', 'track', 'coaster', 'build'],
  draw(g, s) { drawBank(g, s, -1); },
});
