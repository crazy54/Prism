// clear — an eraser on its edge, the cleared line behind it. Arriving, the eraser sweeps in and wipes
// the line clean; a press wipes again.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, xf, rot } from '../_tools.js';

const M = rot(-40, [24, 24]);
const BODY = xf('M12 18H33A3.5 3.5 0 0 1 36.5 21.5V28.5A3.5 3.5 0 0 1 33 32H12A3.5 3.5 0 0 1 8.5 28.5V21.5A3.5 3.5 0 0 1 12 18Z', M);
const SPLIT = xf('M20 18V32', M);
const SPLIT_FILL = xf('M12 18H20V32H12A3.5 3.5 0 0 1 8.5 28.5V21.5A3.5 3.5 0 0 1 12 18Z', M);

export default defineGlyph({
  id: 'clear',
  title: 'Clear',
  category: 'edit',
  tags: ['clear', 'eraser', 'erase', 'wipe', 'clean', 'reset', 'clear formatting'],
  draw(g, s) {
    const k = enter(s, 0.55), p = press(s, 0.45);
    const dx = lerp(-6, 0, k) + 2 * p;
    g.line(8, 39.5, lerp(8, 23, k), 39.5, { role: 'dim' });
    g.group({ x: dx, y: -dx * 0.3, opacity: lerp(0.3, 1, k) }, () => {
      g.path(SPLIT_FILL, { role: 'accent', fill: true, opacity: 0.85 });
      g.path(BODY, { join: 'round' });
      g.path(SPLIT, { role: 'line', weight: 0.85 });
    });
  },
});
