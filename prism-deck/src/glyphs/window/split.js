// split — split side by side: the frame divided down the middle, the new pane on the right. Arriving,
// the divider slides in from the right edge; a press lights the new pane.
import { defineGlyph } from '../_glyph.js';
import { frame, region, motion, lerp, X1, Y0, Y1 } from './_frame.js';

export default defineGlyph({
  id: 'split',
  title: 'Split Right',
  category: 'window',
  tags: ['split', 'split right', 'split editor', 'side by side', 'pane', 'columns', 'split view'],
  draw(g, s) {
    const { k, p } = motion(s);
    const x = lerp(36, 24, k);
    if (p > 0.02) g.path(region(x, Y0, X1, Y1), { role: 'accent', fill: true, opacity: 0.3 * p });
    frame(g);
    g.line(x, Y0, x, Y1, { role: 'line' });
  },
});
