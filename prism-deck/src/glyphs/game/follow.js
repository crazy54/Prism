// follow — follow the target: a ship chevron on a dashed course behind a target ring. Arriving, the
// ship closes in along its course; following: it keeps station behind the target, the course
// dashes running toward it (a 1.2 s loop).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, chevron } from '../_tools.js';

export default defineGlyph({
  id: 'follow',
  title: 'Follow',
  category: 'game',
  tags: ['follow', 'pursue', 'chase', 'target', 'escort', 'track', 'lock on'],
  states: { idle: 'idle', following: 'active' },
  loop: 1.2,
  draw(g, s) {
    const on = s.state === 'following';
    const k = enter(s, 0.6);
    g.circle(33, 15, 6, { role: on ? 'accent' : 'line' });
    g.dot(33, 15, 1.8);
    // the course: dashes along the diagonal from the ship to the ring, running when following
    const off = on ? s.phase(1.2) : 0;
    for (let i = 0; i < 3; i++) {
      const u0 = (i + off) / 3.2, u1 = u0 + 0.14;
      if (u1 > 0.95) continue;
      g.line(lerp(18, 28.5, u0), lerp(30, 19.5, u0), lerp(18, 28.5, u1), lerp(30, 19.5, u1), { role: 'dim' });
    }
    const d = lerp(-4, 0, k);                       // the ship closes in along its course
    g.polyline(chevron([16.5 + 0.7 * d, 31.5 - 0.7 * d], 45, 7, 40), { role: 'line', join: 'round', weight: 1.1 });
  },
});
