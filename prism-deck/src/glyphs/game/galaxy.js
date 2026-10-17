// galaxy — a spiral galaxy: two arms winding out of a bright core, a few stars scattered round it.
// Arriving, the arms wind into place around the core and the stars come out.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter } from '../_tools.js';
import { smooth } from '../time/_dial.js';

/** One arm: a spiral from the core outward, starting at angle a0 (degrees), squashed a little (tilted disc). */
function arm(a0) {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10, r = lerp(3, 15.5, u), a = ((a0 + u * 200) * Math.PI) / 180;
    pts.push([24 + r * Math.sin(a), 24 - r * Math.cos(a) * 0.82]);
  }
  return pts;
}
const ARMS = [arm(0), arm(180)];
const STARS = [[10.5, 13, 1.1], [37.5, 35.5, 1.2], [38.5, 12.5, 0.9]];

export default defineGlyph({
  id: 'galaxy',
  title: 'Galaxy Map',
  category: 'game',
  tags: ['galaxy', 'galaxy map', 'star map', 'spiral', 'space', 'navigate', 'universe'],
  draw(g, s) {
    const k = enter(s, 0.7);
    g.group({ rotate: lerp(-40, 0, k), opacity: lerp(0.3, 1, k) }, () => {
      for (const a of ARMS) g.path(smooth(a), { role: 'line' });
    });
    g.circle(24, 24, 3, { role: 'accent', fill: true });
    for (const [x, y, r] of STARS) g.dot(x, y, r, { opacity: k });
  },
});
