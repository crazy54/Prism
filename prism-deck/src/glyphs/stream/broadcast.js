// broadcast — on air: a lit core with waves rippling outward while live.
import { defineGlyph } from '../_glyph.js';

export default defineGlyph({
  id: 'broadcast',
  title: 'Broadcast',
  category: 'stream',
  tags: ['live', 'on air', 'broadcast', 'stream', 'podcast'],
  states: { offline: 'idle', live: 'alert' },
  loop: 1.8,
  draw(g, s) {
    const live = s.state === 'live';
    g.circle(24, 24, 3.8, { role: live ? 'accent' : 'fill', fill: true });
    [9, 15.5].forEach((r, i) => {
      const ph = live ? (s.phase(1.8) + i * 0.5) % 1 : 0;
      const op = live ? 0.3 + 0.7 * (1 - Math.abs(ph - 0.5) * 2) : 0.8;
      g.arc(24, 24, r, 42, 138, { role: i ? 'dim' : 'line', opacity: op });
      g.arc(24, 24, r, 222, 318, { role: i ? 'dim' : 'line', opacity: op });
    });
  },
});
