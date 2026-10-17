// step-out — the debugger's Step Out: an arrow and the current-line dot (see _step.js).
import { defineGlyph } from '../_glyph.js';
import { drawStep } from './_step.js';

export default defineGlyph({
  id: 'step-out',
  title: 'Step Out',
  category: 'dev',
  tags: ['step out', 'debug', 'debugger', 'step', 'return', 'call'],
  draw(g, s) { drawStep(g, s, -1); },
});
