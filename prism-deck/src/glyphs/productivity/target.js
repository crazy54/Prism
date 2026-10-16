// target — rings and a center. off: at rest. focus: four sight marks draw in onto the
// rings, the center swells, and a ripple of light runs from the center to the outer ring.
import { defineGlyph } from '../_glyph.js';
import { arrive, outBack, clamp, phase, lerp, smoothstep } from '../../scene/easing.js';

const C = 24;

export default defineGlyph({
  id: 'target',
  title: 'Target',
  category: 'productivity',
  tags: ['target', 'goal', 'focus', 'aim', 'objective', 'do not disturb', 'bullseye'],
  states: { off: 'idle', focus: 'active' },
  loop: 2,
  draw(g, s) {
    const focus = s.state === 'focus';
    const k = arrive(s.since, 0.5);
    g.circle(C, C, 15);
    g.circle(C, C, 8.5, { role: 'dim' });
    // sight marks: drawn in from outside the ring on focus
    if (focus) {
      for (const a of [0, 90, 180, 270]) {
        const [x0, y0] = g.polar(C, C, lerp(18, 11.5, k), a), [x1, y1] = g.polar(C, C, 18, a);
        if (k > 0.02) g.line(x0, y0, x1, y1, { role: 'accent', weight: 0.9 });
      }
      // ripple: center → outer ring, fading as it goes
      const p = phase(s.t, 2), r = lerp(4, 15, smoothstep(0, 1, p));
      g.circle(C, C, r, { role: 'accent', weight: 0.6, opacity: k * 0.85 * (1 - p) * smoothstep(0, 0.12, p) });
    }
    const pop = focus ? outBack(clamp(s.since / 0.45), 2.4) : 1;
    g.circle(C, C, 3 + (focus ? 0.8 * pop : 0), { role: focus ? 'accent' : 'fill', fill: true });
  },
});
