// snap — snap to grid: a block seated exactly on a dot grid. on: the block lights and the dots
// under its corners glint; turning on, the block slides the last bit into place (the snap).
import { defineGlyph } from '../_glyph.js';
import { lerp, outBack, clamp } from '../../scene/easing.js';

const G = [9, 19, 29, 39];      // grid lines (dots at their crossings)

export default defineGlyph({
  id: 'snap',
  title: 'Snap',
  category: 'edit',
  tags: ['snap', 'grid', 'grid snap', 'angle snap', 'align', 'magnet', 'guides'],
  states: { off: 'idle', on: 'active' },
  draw(g, s) {
    const on = s.state === 'on';
    const k = on ? outBack(clamp(s.since / 0.4), 2.2) : clamp(s.since / 0.3);
    for (const y of G) for (const x of G) {
      if ((x === 19 || x === 39) && (y === 19 || y === 39)) continue;    // under the block's corners
      g.circle(x, y, 1.45, { role: 'dim', fill: true });
    }
    const o = on ? lerp(-3.5, 0, k) : 0;
    g.rect(19 + o, 19 + o, 20, 20, { r: 3.5, role: on ? 'accent' : 'line', opacity: on ? 1 : 0.4 + 0.6 * k });
    if (on) for (const [x, y] of [[19, 19], [39, 19], [19, 39], [39, 39]]) g.dot(x + o, y + o, 1.5, { opacity: clamp(k) });
  },
});
