// radial — a radial menu: four segments round a center button, one picked. Arriving, the segments
// open out from the center; a press moves the pick to the next segment.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter } from '../_tools.js';

export default defineGlyph({
  id: 'radial',
  title: 'Radial Menu',
  category: 'nav',
  tags: ['radial', 'radial menu', 'pie menu', 'wheel', 'quick menu', 'ring', 'select'],
  draw(g, s) {
    const k = enter(s, 0.5);
    const pick = !s.pressed && s.pressAge < 0.6 ? 1 : 0;
    const r = lerp(8, 15, k);
    [0, 90, 180, 270].forEach((a, i) => {
      const lit = i === pick;
      g.arc(24, 24, r, a - 33, a + 33, { role: lit ? 'accent' : 'line', weight: lit ? 1.15 : 1 });
    });
    g.circle(24, 24, 4.5, { role: 'line' });
  },
});
