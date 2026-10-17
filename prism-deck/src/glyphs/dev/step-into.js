// step-into — the debugger's Step Into: an arrow and the current-line dot (see _step.js).
import { defineGlyph } from '../_glyph.js';
import { drawStep } from './_step.js';

export default defineGlyph({
  id: 'step-into',
  title: 'Step Into',
  category: 'dev',
  tags: ['step into', 'debug', 'debugger', 'step', 'breakpoint', 'call'],
  draw(g, s) { drawStep(g, s, 1); },
});
