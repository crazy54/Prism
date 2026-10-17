// fullscreen — four corner brackets. off: they sit out at the corners (enter full screen). on: they
// turn inward, pointing at the center (exit full screen); the change animates both ways and the
// brackets light while on.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';

const L = 9;   // bracket arm length

export default defineGlyph({
  id: 'fullscreen',
  title: 'Full Screen',
  category: 'nav',
  tags: ['fullscreen', 'full screen', 'maximize', 'expand', 'theater', 'exit full screen', 'video'],
  states: { off: 'idle', on: 'active' },
  draw(g, s) {
    const on = s.state === 'on';
    const m = arrive(s.since, 0.4);
    const k = on ? m : 1 - m;                         // 0 = corners out, 1 = corners in
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      // out: the bracket's corner sits at the glyph corner, arms run along the edges toward the center;
      // in: the corner sits L in from the edges, arms run back out toward the edges
      const cx = 24 + sx * lerp(15.5, 7.5, k), cy = 24 + sy * lerp(15.5, 7.5, k);
      const ax = lerp(-sx, sx, k) * L, ay = lerp(-sy, sy, k) * L;
      g.polyline([[cx + ax, cy], [cx, cy], [cx, cy + ay]], { role: on ? 'accent' : 'line', join: 'round', weight: 1.05 });
    }
  },
});
