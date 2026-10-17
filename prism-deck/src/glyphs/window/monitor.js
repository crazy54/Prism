// monitor — a display on its stand. Arriving, the screen lights from the top down (a dim glow line
// sweeps it); a press flashes the screen (identify / move to this display).
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'monitor',
  title: 'Monitor',
  category: 'window',
  tags: ['monitor', 'display', 'screen', 'next monitor', 'move to monitor', 'desktop', 'output'],
  draw(g, s) {
    const k = enter(s, 0.6), p = press(s, 0.45);
    if (p > 0.02) g.rect(7, 9, 34, 23, { r: 4, role: 'accent', fill: true, opacity: 0.3 * p });
    g.rect(7, 9, 34, 23, { r: 4 });
    g.line(24, 32, 24, 37.5, { role: 'line' });
    g.line(16, 38.5, 32, 38.5, { role: 'line' });
    const y = lerp(13, 28, clamp(k));
    if (k < 0.99) g.line(11.5, y, 36.5, y, { role: 'accent', weight: 0.7, opacity: 1 - k });
    g.line(11.5, 13.5, 16.5, 13.5, { role: 'dim', opacity: k });
  },
});
