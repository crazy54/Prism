// rotate — a three-quarter turn arrow around a tilted square (rotate the object about its pivot).
// Arriving, the square turns into its tilt as the arrow fades up; a press turns the square on by
// a quarter.
import { defineGlyph } from '../_glyph.js';
import { lerp, outBack, clamp } from '../../scene/easing.js';
import { enter, press, xf, rot } from '../_tools.js';
import { arcHead } from '../system/_kit.js';

export default defineGlyph({
  id: 'rotate',
  title: 'Rotate',
  category: 'edit',
  tags: ['rotate', 'turn', 'spin', 'rotate 90', 'orientation', 'pivot'],
  draw(g, s) {
    const k = enter(s, 0.55), p = press(s, 0.45);
    const end = 318, op = lerp(0.3, 1, k);
    g.arc(24, 24, 15, 42, end, { role: 'line', opacity: op });
    g.polyline(arcHead(24, 24, 15, end, { size: 4.4 }), { role: 'line', join: 'round', opacity: op });
    const turn = lerp(-30, 0, k) + 90 * (s.pressed ? 0 : s.pressAge < 0.5 ? outBack(clamp(s.pressAge / 0.5)) - 1 : 0) + 15;
    g.path(xf('M19.5 17H28.5A2.5 2.5 0 0 1 31 19.5V28.5A2.5 2.5 0 0 1 28.5 31H19.5A2.5 2.5 0 0 1 17 28.5V19.5A2.5 2.5 0 0 1 19.5 17Z', rot(turn)), { role: p > 0.3 ? 'accent' : 'dim', join: 'round' });
  },
});
