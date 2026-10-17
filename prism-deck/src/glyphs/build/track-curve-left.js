// track-curve-left — track seen from above turning 90° to the left. Ties run along it as the key
// arrives; a press runs the curve on by one tie.
import { defineGlyph } from '../_glyph.js';
import { drawCurve } from './_curve.js';

export default defineGlyph({
  id: 'track-curve-left',
  title: 'Curve Left',
  category: 'build',
  tags: ['track', 'curve', 'turn', 'left', 'coaster', 'piece', 'build'],
  draw(g, s) { drawCurve(g, s, -1); },
});
