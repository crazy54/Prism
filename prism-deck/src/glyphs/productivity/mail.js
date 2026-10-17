// mail — an envelope. read: closed and quiet. unread: a badge pops onto the corner
// (the envelope's edge opens around it, so it reads in any material) and breathes.
import { defineGlyph } from '../_glyph.js';
import { arrive, outBack, clamp, pulse } from '../../scene/easing.js';

const BX = 37, BY = 13, BR = 4.2;

export default defineGlyph({
  id: 'mail',
  title: 'Mail',
  category: 'productivity',
  tags: ['mail', 'email', 'inbox', 'message', 'unread', 'envelope', 'letter'],
  states: { read: 'idle', unread: 'active' },
  loop: 1.6,
  draw(g, s) {
    const unread = s.state === 'unread';
    const drop = arrive(s.since, 0.45);
    g.group({ y: unread ? 0 : -2.5 * (1 - drop) }, () => {
      if (unread) {
        // the edge breaks around the badge
        g.path('M30 13H11.5A4 4 0 0 0 7.5 17V32A4 4 0 0 0 11.5 36H36.5A4 4 0 0 0 40.5 32V19.5');
        g.polyline([[9.5, 15.5], [24, 26], [32.8, 19.6]], { role: 'line', join: 'round' });
      } else {
        g.rect(7.5, 13, 33, 23, { r: 4 });
        g.polyline([[9.5, 15.5], [24, 26], [38.5, 15.5]], { role: 'line', join: 'round' });
      }
    });
    if (unread) {
      const pop = outBack(clamp(s.since / 0.42), 2.2);
      const r = BR * pop * (1 + 0.07 * pulse(s.t, 1.6));
      if (r > 0.05) g.circle(BX, BY, r, { role: 'spark' });
    }
  },
});
