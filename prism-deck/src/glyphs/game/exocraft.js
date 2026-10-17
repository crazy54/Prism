// exocraft — a planetary rover: a cab on a chassis over three wheels, an antenna up top. Arriving, it
// rolls in from the left and its wheels turn; a press bumps it over a rock.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter } from '../_tools.js';

export default defineGlyph({
  id: 'exocraft',
  title: 'Exocraft',
  category: 'game',
  tags: ['exocraft', 'rover', 'vehicle', 'buggy', 'summon vehicle', 'drive', 'car'],
  draw(g, s) {
    const k = enter(s, 0.7);
    const bump = !s.pressed && s.pressAge < 0.4 ? -2 * Math.sin(Math.PI * clamp(s.pressAge / 0.4)) : 0;
    const x = lerp(-6, 0, k);
    g.group({ x, opacity: lerp(0.3, 1, k) }, () => {
      g.group({ y: bump }, () => {
        g.path('M7.5 29V25.5A2 2 0 0 1 9.5 23.5H16L20.5 16H31.5A2 2 0 0 1 33.3 17.2L36.5 23.5H38.5A2 2 0 0 1 40.5 25.5V29Z', { join: 'round' });
        g.line(24.5, 16, 24.5, 23.5, { role: 'dim' });
        g.line(29, 16, 31, 9.5, { role: 'line', weight: 0.85 });
        g.dot(31.2, 9, 1.5);
      });
      for (const cx of [12.5, 24, 35.5]) {
        g.circle(cx, 34, 4.5, { role: 'line' });
        // a spoke that turns as it rolls in
        const a = (1 - k) * -540 + cx * 9;
        const [sx, sy] = g.polar(cx, 34, 2.2, a);
        g.line(cx, 34, sx, sy, { role: 'dim', weight: 0.8 });
      }
    });
  },
});
