// info — a ring with the information mark. On arrival the stem rises and the dot drops
// into place with a small settle; afterwards the dot glows softly, like a status light.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp, outBack, pulse } from '../../scene/easing.js';

export default defineGlyph({
  id: 'info',
  title: 'Info',
  category: 'status',
  tags: ['info', 'information', 'about', 'help', 'details', 'notice'],
  states: { info: 'info' },
  loop: 2.4,
  draw(g, s) {
    g.circle(24, 24, 16.5);
    const k = arrive(s.since, 0.4);
    g.line(24, 33, 24, lerp(33, 22.5, k), { role: 'accent', weight: 1.1 });
    const d = arrive(Math.max(0, s.since - 0.12), 0.45, outBack);
    g.dot(24, lerp(10.5, 16, d), 2.3, { opacity: (0.7 + 0.3 * pulse(s.t, 2.4)) * Math.min(1, d * 1.5) });
  },
});
