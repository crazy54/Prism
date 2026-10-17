// boost — speed up: two chevrons stacked pointing up, the lead one lit. boosting: they pulse upward
// in turn (a 0.6 s loop); a press kicks them up once.
import { defineGlyph } from '../_glyph.js';
import { lerp, pulse } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

export default defineGlyph({
  id: 'boost',
  title: 'Boost',
  category: 'game',
  tags: ['boost', 'sprint', 'speed', 'accelerate', 'thrust', 'afterburner', 'run'],
  states: { idle: 'idle', boosting: 'active' },
  loop: 0.6,
  draw(g, s) {
    const on = s.state === 'boosting';
    const k = enter(s, 0.45), p = press(s, 0.4);
    [[13, 'accent', 0], [25.5, 'line', 0.5]].forEach(([y, role, ph]) => {
      const lift = on ? 1.6 * pulse(s.t + ph * 0.6, 0.6) : 0;
      g.polyline(chevron([24, y - lift - 2 * p + lerp(4, 0, k)], 0, 13, 45), { role, join: 'round', weight: 1.1, opacity: lerp(0.3, 1, k) });
    });
  },
});
