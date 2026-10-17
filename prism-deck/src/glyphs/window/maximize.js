// maximize — the window with an up chevron in its body (grow to fill the screen). Arriving, the
// chevron rises into place; a press lifts it further and it springs back.
import { defineGlyph } from '../_glyph.js';
import { chevron } from '../_tools.js';
import { frame, header, motion, lerp } from './_frame.js';

export default defineGlyph({
  id: 'maximize',
  title: 'Maximize',
  category: 'window',
  tags: ['maximize', 'enlarge', 'fill screen', 'restore', 'window', 'grow'],
  draw(g, s) {
    const { k, p } = motion(s);
    frame(g);
    header(g);
    const y = lerp(31.5, 23.5, k) - 1.8 * p;
    g.polyline(chevron([24, y], 0, 9, 45), { role: 'accent', join: 'round', weight: 1.05, opacity: lerp(0.3, 1, k) });
  },
});
