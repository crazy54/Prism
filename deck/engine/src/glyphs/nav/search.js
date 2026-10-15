// search — a magnifier. idle: a glint rests on the lens. searching: the lens scans in
// a slow loop over the key while its glint wheels around the glass.
import { defineGlyph } from '../_glyph.js';
import { arrive, phase, lerp } from '../../scene/easing.js';

const CX = 21, CY = 21, R = 10.5;

export default defineGlyph({
  id: 'search',
  title: 'Search',
  category: 'nav',
  tags: ['search', 'find', 'magnifier', 'lookup', 'zoom', 'filter', 'navigation'],
  states: { idle: 'idle', searching: 'busy' },
  loop: 1.6,
  draw(g, s) {
    const busy = s.state === 'searching';
    const k = busy ? arrive(s.since, 0.5) : 0;
    const p = phase(s.t, 1.6);
    const ox = 2.2 * k * Math.sin(p * Math.PI * 2), oy = 1.6 * k * Math.sin(p * Math.PI * 4);
    g.group({ x: ox, y: oy }, () => {
      g.circle(CX, CY, R);
      const [x0, y0] = g.polar(CX, CY, R + 1.6, 135), [x1, y1] = g.polar(CX, CY, 23.5, 135);
      g.line(x0, y0, x1, y1, { role: 'line', weight: 1.25 });
      // the glint: rests at 10 o'clock, wheels around the glass while searching
      const a = busy ? lerp(-62, -62 + 360 * p, k) : -62;
      g.arc(CX, CY, 6.5, a - 32, a + 18, { role: busy ? 'accent' : 'dim', weight: 0.85 });
    });
  },
});
