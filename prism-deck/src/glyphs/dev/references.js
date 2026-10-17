// references — find references: three arrows converging on one symbol (everything that points at it).
// Arriving, the arrows run in one after another; a press lights the symbol.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

const C = [33.5, 24];
const FROM = [[11.5, 11.5], [10.5, 24], [11.5, 36.5]];

export default defineGlyph({
  id: 'references',
  title: 'References',
  category: 'dev',
  tags: ['references', 'find references', 'usages', 'callers', 'who uses', 'code', 'navigate'],
  draw(g, s) {
    const p = press(s, 0.4);
    g.circle(C[0], C[1], 5, { role: p > 0.3 ? 'accent' : 'line' });
    g.dot(C[0], C[1], 1.8);
    FROM.forEach(([x, y], i) => {
      const k = enter({ since: s.since - i * 0.08 }, 0.4);
      const dx = C[0] - x, dy = C[1] - y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const tip = [C[0] - ux * 8, C[1] - uy * 8];
      const end = [lerp(x, tip[0], k), lerp(y, tip[1], k)];
      g.line(x, y, end[0] - ux, end[1] - uy, { role: 'dim', opacity: lerp(0.2, 1, k) });
      g.polyline(chevron(end, (Math.atan2(ux, -uy) * 180) / Math.PI, 4.5, 45), { role: 'line', join: 'round', opacity: k });
    });
  },
});
