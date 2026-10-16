// plug — a smart plug on its cord. off: dark. on: the plug seats itself (a small push
// up), a bolt lights on its face and current runs up the cord into it (1.6 s loop).
import { defineGlyph } from '../_glyph.js';
import { arrive, outBack, clamp, phase, smoothstep } from '../../scene/easing.js';
import { along } from '../time/_dial.js';

// cord centerline (for the running spark): from the free end up into the plug
const CORD = [[35, 38.5], [27.5, 38.5], [24.7, 37.4], [23.5, 34.5], [23.5, 30.5]];

export default defineGlyph({
  id: 'plug',
  title: 'Smart Plug',
  category: 'home',
  tags: ['plug', 'outlet', 'socket', 'power', 'smart home', 'switch', 'energy'],
  states: { off: 'off', on: 'active' },
  hue: 150, // live current
  loop: 1.6,
  draw(g, s) {
    const on = s.state === 'on';
    const k = arrive(s.since, 0.35);
    const seat = on ? -1.6 * Math.sin(Math.PI * clamp(s.since / 0.35)) : 0;
    g.group({ y: seat }, () => {
      g.line(19, 8.5, 19, 16.5, { role: on ? 'accent' : 'line' });
      g.line(28, 8.5, 28, 16.5, { role: on ? 'accent' : 'line' });
      g.path('M13.5 16.5H33.5V22.5A8 8 0 0 1 25.5 30.5H21.5A8 8 0 0 1 13.5 22.5Z', { join: 'round' });
      if (on) {
        const b = outBack(clamp(s.since / 0.4), 2);
        g.group({ scale: Math.max(0.01, b), origin: [23.5, 23.5] }, () => {
          g.polygon([[24.8, 18.6], [20.3, 24.4], [23.3, 24.4], [22.2, 28.4], [26.7, 22.6], [23.7, 22.6]], { role: 'accent', fill: true, join: 'round' });
        });
      }
    });
    g.path('M23.5 30.5V34.5A4 4 0 0 0 27.5 38.5H35', { role: on ? 'line' : 'dim' });
    if (on) {
      const p = phase(s.t, 1.6), [x, y] = along(CORD, p);
      g.dot(x, y, 1.5, { opacity: k * smoothstep(0, 0.12, p) * (1 - smoothstep(0.82, 1, p)) });
    }
  },
});
