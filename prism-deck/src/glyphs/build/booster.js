// booster — a launch: three chevrons driving forward over the rail, brightening toward the front.
// Arriving, they fire in one after another; a press shoves them forward.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

export default defineGlyph({
  id: 'booster',
  title: 'Booster',
  category: 'build',
  tags: ['booster', 'boost', 'launch', 'speed', 'accelerate', 'track', 'coaster', 'build'],
  draw(g, s) {
    const p = press(s, 0.45);
    [19.5, 28.5, 37.5].forEach((x, i) => {
      const k = enter({ since: s.since - i * 0.09 }, 0.45);
      const dx = lerp(-3, 0, k) + 2.2 * p;
      g.polyline(chevron([x + dx, 22], 90, 12, 45), { role: i === 2 ? 'accent' : 'line', join: 'round', opacity: lerp(0, [0.45, 0.75, 1][i], k), weight: 1.05 });
    });
    g.line(8, 37.5, 40, 37.5, { role: 'dim' });
  },
});
