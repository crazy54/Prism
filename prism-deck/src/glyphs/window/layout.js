// layout — snap layouts: the frame divided into three zones, one of them lit (where the window goes).
// Arriving, the dividers slide into place; a press steps the lit zone on to the next.
import { defineGlyph } from '../_glyph.js';
import { frame, region, motion, lerp, X0, X1, Y0, Y1 } from './_frame.js';

const XS = 22, YS = 24;
const ZONES = [[X0, Y0, XS, Y1], [XS, Y0, X1, YS], [XS, YS, X1, Y1]];

export default defineGlyph({
  id: 'layout',
  title: 'Snap Layout',
  category: 'window',
  tags: ['layout', 'snap layout', 'snap', 'arrange', 'tile', 'zones', 'placer', 'window'],
  draw(g, s) {
    const { k } = motion(s);
    const lit = !s.pressed && s.pressAge < 0.6 ? 2 : 0;
    g.path(region(...ZONES[lit]), { role: 'accent', fill: true, opacity: 0.32 * k });
    frame(g);
    const x = lerp(X1 - 2, XS, k), y = lerp(Y1 - 2, YS, k);
    g.line(x, Y0, x, Y1, { role: 'line' });
    g.line(x, y, X1, y, { role: 'line' });
  },
});
