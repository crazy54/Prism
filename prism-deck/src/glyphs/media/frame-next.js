// frame-next — Next Frame: see _frame-step.js for the drawing and motion.
import { defineGlyph } from '../_glyph.js';
import { drawFrameStep } from './_frame-step.js';

export default defineGlyph({
  id: 'frame-next',
  title: 'Next Frame',
  category: 'media',
  tags: ['next frame', 'frame', 'step', 'frame advance', 'film', 'video'],
  draw(g, s) { drawFrameStep(g, s, 1); },
});
