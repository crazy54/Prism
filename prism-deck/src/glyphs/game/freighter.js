// freighter — a capital ship in profile: a long wedge hull, the bridge tower on its back, the engine
// glowing at the stern. Arriving, it glides in from the right; idle, the engine glow breathes.
import { defineGlyph } from '../_glyph.js';
import { lerp, pulse } from '../../scene/easing.js';
import { enter } from '../_tools.js';

export default defineGlyph({
  id: 'freighter',
  title: 'Freighter',
  category: 'game',
  tags: ['freighter', 'capital ship', 'ship', 'fleet', 'summon freighter', 'mothership', 'space'],
  loop: 2.4,
  draw(g, s) {
    const k = enter(s, 0.8);
    g.group({ x: lerp(7, 0, k), opacity: lerp(0.25, 1, k) }, () => {
      g.path('M7 27.5L13 22H35L36.5 18H40V31.5H33L30 34H14Z', { join: 'round' });
      g.path('M24 22V15.5A1.5 1.5 0 0 1 25.5 14H29.5L31.5 17V22', { role: 'line', join: 'round' });
      g.line(13.5, 27.5, 31, 27.5, { role: 'dim' });
    });
    g.rect(40, 21, 2, 7, { r: 1, role: 'accent', fill: true, opacity: k * (0.45 + 0.55 * pulse(s.t, 2.4)) });
  },
});
