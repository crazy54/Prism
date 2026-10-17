// minimize — the window with a down chevron dropping onto a bar (send it to the taskbar). Arriving,
// the chevron drops onto the bar; a press drops it further and it springs back.
import { defineGlyph } from '../_glyph.js';
import { chevron } from '../_tools.js';
import { frame, header, motion, lerp } from './_frame.js';

export default defineGlyph({
  id: 'minimize',
  title: 'Minimize',
  category: 'window',
  tags: ['minimize', 'hide', 'taskbar', 'shrink', 'window', 'iconify'],
  draw(g, s) {
    const { k, p } = motion(s);
    frame(g);
    header(g);
    const y = lerp(20.5, 27, k) + 1.5 * p;
    g.polyline(chevron([24, y], 180, 8, 45), { role: 'accent', join: 'round', weight: 1.05, opacity: lerp(0.3, 1, k) });
    g.line(17, 33, 31, 33, { role: 'accent', weight: 1.05 });
  },
});
