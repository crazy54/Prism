// move — the four-way move cross with a handle at its center. Arriving, the four heads converge onto
// the cross; a press pushes them outward (the move) and they spring back.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

export default defineGlyph({
  id: 'move',
  title: 'Move',
  category: 'edit',
  tags: ['move', 'drag', 'pan', 'nudge', 'position', 'translate', 'arrows'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.45);
    const R = lerp(17.5, 16, k) + 1.6 * p;              // tip distance from the center
    g.line(24, 24 - R + 1.5, 24, 24 + R - 1.5);
    g.line(24 - R + 1.5, 24, 24 + R - 1.5, 24);
    for (const dir of [0, 90, 180, 270]) {
      const tip = [24 + R * Math.sin((dir * Math.PI) / 180), 24 - R * Math.cos((dir * Math.PI) / 180)];
      g.polyline(chevron(tip, dir, 5.5, 45), { role: p > 0.3 ? 'accent' : 'line', join: 'round', opacity: lerp(0.3, 1, k) });
    }
    g.circle(24, 24, 3, { role: 'fill' });
  },
});
