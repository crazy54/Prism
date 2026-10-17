// warp — the jump to light speed: star streaks rushing out from a bright center. Arriving, the streaks
// stretch out from points; warping: they stream outward continuously (a 0.8 s loop, seamless).
import { defineGlyph } from '../_glyph.js';
import { lerp, smoothstep } from '../../scene/easing.js';
import { enter } from '../_tools.js';

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => [a + (i % 2 ? 8 : -4), i % 2 ? 0.5 : 0]);

export default defineGlyph({
  id: 'warp',
  title: 'Warp',
  category: 'game',
  tags: ['warp', 'hyperdrive', 'jump', 'light speed', 'pulse', 'travel', 'space'],
  states: { ready: 'idle', warping: 'active' },
  loop: 0.8,
  draw(g, s) {
    const on = s.state === 'warping';
    const k = enter(s, 0.5);
    for (const [a, ph] of RAYS) {
      if (on) {
        const u = (s.phase(0.8) + ph) % 1;
        const r0 = lerp(5, 15, u), r1 = r0 + lerp(2.5, 6.5, u);
        const op = smoothstep(0, 0.15, u) * (1 - smoothstep(0.75, 1, u));
        const [x0, y0] = g.polar(24, 24, r0, a), [x1, y1] = g.polar(24, 24, Math.min(17.5, r1), a);
        g.line(x0, y0, x1, y1, { role: 'accent', opacity: op });
      } else {
        const r0 = ph ? 9 : 7, r1 = r0 + lerp(0.5, ph ? 6 : 9.5, k);
        const [x0, y0] = g.polar(24, 24, r0, a), [x1, y1] = g.polar(24, 24, r1, a);
        g.line(x0, y0, x1, y1, { role: ph ? 'dim' : 'line' });
      }
    }
    g.circle(24, 24, 2.6, { role: on ? 'accent' : 'fill', fill: true });
  },
});
