// fan — three swept blades around a hub. on: the blades turn at one of four speeds
// set by `level` (1–4 blade-steps per 1.2 s loop, so every speed loops seamlessly),
// trailing speed arcs that grow with the speed — so a still frame reads fast or slow too.
import { defineGlyph } from '../_glyph.js';
import { arrive, phase, clamp } from '../../scene/easing.js';
import { polar, arcPath } from '../../scene/shapes.js';
import { smoothClosed } from '../time/_dial.js';

const C = 24;
// one blade as (radius, degrees from the blade's axis): a leaf whose tip sweeps back
const BLADE = [[4.6, 34], [10, 27], [15.2, 11], [16.6, -3], [14.8, -14], [9.5, -14], [5, -6]];
const blade = (a) => smoothClosed(BLADE.map(([r, d]) => polar(C, C, r, a + d)));

export default defineGlyph({
  id: 'fan',
  title: 'Fan',
  category: 'home',
  tags: ['fan', 'air', 'cooling', 'ventilation', 'speed', 'climate', 'home'],
  states: { off: 'off', on: 'active' },
  hue: 205, // moving air
  loop: 1.2,
  draw(g, s) {
    const on = s.state === 'on';
    const speed = 1 + Math.min(3, Math.floor(clamp(s.level) * 4)); // 1…4
    const rot = on ? phase(s.t, 1.2) * 120 * speed : 0;
    const k = on ? arrive(s.since, 0.6) : 0;
    // all three blades as one solid path, all speed arcs as one path: lean keys in layered themes
    const angles = [0, 120, 240].map((d) => rot + d);
    const blades = angles.map(blade).join('');
    g.path(blades, { role: 'fill', join: 'round' });
    if (on && k > 0.02) {
      // speed arcs trail each blade tip (the blades turn clockwise)
      const len = (8 + 9 * speed) * k;
      g.path(angles.map((a) => arcPath(C, C, 18.2, a - 14 - len, a - 14)).join(''), { role: 'accent', weight: 0.7, opacity: 0.3 + 0.12 * speed });
    }
    g.circle(C, C, 2.6, { role: on ? 'spark' : 'dim', fill: true });
  },
});
