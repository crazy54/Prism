// stop — the transport stop square. Ready it sits in ink; when the transport is
// stopped it lights in the key's hue, and four corner marks converge onto it
// (Refraction's arrival: things resolve into focus).
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'stop',
  title: 'Stop',
  category: 'media',
  tags: ['stop', 'transport', 'media', 'end', 'halt'],
  states: { ready: 'idle', stopped: 'active' },
  draw(g, s) {
    const stopped = s.state === 'stopped';
    const k = arrive(s.since, 0.42);
    // the square settles from a slightly larger size into place
    const h = lerp(stopped ? 14.5 : 13.5, 13, k); // half-size: 24 ± 13 → 11..37
    g.rect(24 - h, 24 - h, h * 2, h * 2, { r: 4.5, role: stopped ? 'accent' : 'fill', fill: true });
    if (stopped && k < 0.999) {
      // corner marks converge onto the square and fade as it locks
      const o = lerp(4.5, 1.5, k), L = 5, op = 1 - k;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = 24 + sx * (13 + o), cy = 24 + sy * (13 + o);
        g.polyline([[cx, cy - sy * L], [cx, cy], [cx - sx * L, cy]], { role: 'accent', opacity: op, weight: 0.8 });
      }
    }
  },
});
