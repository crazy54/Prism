// clock — an analog face. Shows params.h / params.m when given; otherwise the minute hand sweeps once per loop.
import { defineGlyph } from '../_glyph.js';

export default defineGlyph({
  id: 'clock',
  title: 'Clock',
  category: 'time',
  tags: ['clock', 'time', 'hour', 'analog'],
  loop: 12,
  draw(g, s) {
    g.circle(24, 24, 17);
    for (const a of [0, 90, 180, 270]) {
      const [x1, y1] = g.polar(24, 24, 13, a), [x2, y2] = g.polar(24, 24, 15.5, a);
      g.line(x1, y1, x2, y2, { role: 'dim' });
    }
    const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
    const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
    const hand = (deg, len, opts) => { const [x, y] = g.polar(24, 24, len, deg); g.line(24, 24, x, y, opts); };
    hand(h * 30, 8.5, { role: 'line', weight: 1.1 });
    hand(m * 6, 12.5, { role: 'accent' });
    g.dot(24, 24, 1.8);
  },
});
