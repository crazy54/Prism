// track-curve-right — track seen from above turning 90° to the right (mirror of curve-left).
import { defineGlyph } from '../_glyph.js';
import { drawCurve } from './_curve.js';

export default defineGlyph({
  id: 'track-curve-right',
  title: 'Curve Right',
  category: 'build',
  tags: ['track', 'curve', 'turn', 'right', 'coaster', 'piece', 'build'],
  draw(g, s) { drawCurve(g, s, 1); },
});
