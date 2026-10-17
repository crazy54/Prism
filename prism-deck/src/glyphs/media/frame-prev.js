// frame-prev — Previous Frame: see _frame-step.js for the drawing and motion.
import { defineGlyph } from '../_glyph.js';
import { drawFrameStep } from './_frame-step.js';

export default defineGlyph({
  id: 'frame-prev',
  title: 'Previous Frame',
  category: 'media',
  tags: ['previous frame', 'frame', 'step back', 'frame', 'film', 'video'],
  draw(g, s) { drawFrameStep(g, s, -1); },
});
