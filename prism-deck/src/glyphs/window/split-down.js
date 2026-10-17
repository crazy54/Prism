// split-down — split top and bottom: the frame divided across, the new pane below. Arriving, the
// divider slides up from the bottom edge; a press lights the new pane.
import { defineGlyph } from '../_glyph.js';
import { frame, region, motion, lerp, X0, X1, Y1 } from './_frame.js';

export default defineGlyph({
  id: 'split-down',
  title: 'Split Down',
  category: 'window',
  tags: ['split', 'split down', 'horizontal split', 'pane', 'rows', 'stack'],
  draw(g, s) {
    const { k, p } = motion(s);
    const y = lerp(33.5, 24, k);
    if (p > 0.02) g.path(region(X0, y, X1, Y1), { role: 'accent', fill: true, opacity: 0.3 * p });
    frame(g);
    g.line(X0, y, X1, y, { role: 'line' });
  },
});
