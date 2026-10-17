// heatmap — a 3 × 3 heat grid, the hottest cell lit. Arriving, the heat spreads out from the hot spot
// cell by cell; on: the hot spot breathes.
import { defineGlyph } from '../_glyph.js';
import { lerp, pulse, clamp } from '../../scene/easing.js';

const HEAT = [[0.18, 0.4, 0.55], [0.4, 0.8, 1], [0.22, 0.52, 0.7]];
const X = [8.5, 19.25, 30], S = 9.5;

export default defineGlyph({
  id: 'heatmap',
  title: 'Heatmap',
  category: 'build',
  tags: ['heatmap', 'heat', 'map', 'overlay', 'density', 'ratings', 'view', 'build'],
  states: { off: 'idle', on: 'active' },
  loop: 2.4,
  draw(g, s) {
    const on = s.state === 'on';
    HEAT.forEach((row, j) => row.forEach((h, i) => {
      const k = clamp((s.since - Math.hypot(i - 2, j - 1) * 0.09) / 0.35); // spreads from the hot spot
      const op = lerp(0.12, h, k) * (h === 1 && on ? 0.7 + 0.3 * pulse(s.t, 2.4) : 1);
      g.rect(X[i], X[j], S, S, { r: 2.5, role: h >= 0.5 ? 'accent' : 'dim', fill: true, opacity: op });
    }));
  },
});
