// viewers — the audience: a front viewer with a back row that fills in by level
// (1 → 3 people). live: the front viewer lights and breathes, and the back row
// gathers in from the edges.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse, lerp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'viewers',
  title: 'Viewers',
  category: 'stream',
  tags: ['viewers', 'audience', 'people', 'watching', 'users', 'stream', 'count'],
  states: { offline: 'idle', live: 'active' },
  loop: 2.4,
  draw(g, s) {
    const live = s.state === 'live';
    const k = live ? arrive(s.since, 0.5) : 1;
    const crowd = s.level > 0.66 ? 3 : s.level > 0.33 ? 2 : 1;
    const ox = crowd === 2 ? -3 : 0; // a pair sits off-center so the two read as one group
    // the back row: smaller, higher, dim — a solid head and a shoulder arc that stops short of the front viewer
    const back = (side) => {
      const cx = 24 + side * 12.5 + ox;
      g.group({ x: side * lerp(2.5, 0, k), opacity: k }, () => {
        g.circle(cx, 13.5, 3.75, { role: 'dim', fill: true });
        g.arc(cx, 25, 5.25, side < 0 ? 270 : 315, side < 0 ? 405 : 450, { role: 'dim' });
      });
    };
    if (crowd >= 2) back(1);
    if (crowd >= 3) back(-1);
    // the front viewer
    if (live) g.circle(24 + ox, 21.5, 4.75, { role: 'accent', fill: true, opacity: (0.55 + 0.45 * pulse(s.t, 2.4)) * k });
    g.circle(24 + ox, 21.5, 4.75, { role: 'line' });
    g.path(`M${14.5 + ox} 39A9.5 8.5 0 0 1 ${33.5 + ox} 39`, { role: 'line' });
  },
});
