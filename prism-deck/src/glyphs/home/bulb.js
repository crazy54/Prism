// bulb — a light bulb; on, the filament glows and rays shimmer around the glass.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse } from '../../scene/easing.js';

export default defineGlyph({
  id: 'bulb',
  title: 'Light Bulb',
  category: 'home',
  tags: ['light', 'lamp', 'bulb', 'home', 'scene'],
  states: { off: 'off', on: 'active' },
  hue: 60.4, // amber — a lamp lights warm in every theme that uses the hue
  loop: 2.4,
  draw(g, s) {
    const on = s.state === 'on';
    g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
    g.line(19, 32.5, 19, 35.5);
    g.line(29, 32.5, 29, 35.5);
    g.line(19, 35.5, 29, 35.5);
    g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
    g.polyline([[20.5, 28], [22.5, 23.5], [24, 27], [25.5, 23.5], [27.5, 28]], { role: on ? 'accent' : 'dim', weight: 0.8 });
    if (on) {
      const k = arrive(s.since, 0.4);
      for (const a of [-60, -30, 0, 30, 60]) {
        const [x1, y1] = g.polar(24, 22.5, 13, a), [x2, y2] = g.polar(24, 22.5, 13 + 3 * k, a);
        g.line(x1, y1, x2, y2, { role: 'accent', opacity: (0.45 + 0.55 * pulse(s.t + a / 120, 2.4)) * k, weight: 0.8 });
      }
    }
  },
});
