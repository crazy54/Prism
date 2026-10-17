// pin — a push pin. unpinned: it leans over, outlined. pinned: it stands up, pushed in, its head
// lit (keep on top / pinned); the change animates both ways.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';
import { xf, rot } from '../_tools.js';

const HEAD = 'M17 8.5H31M19.5 8.5V18.5L14 25.5H34L28.5 18.5V8.5';
const HEAD_FILL = 'M19.5 8.5H28.5V18.5L34 25.5H14L19.5 18.5Z';

export default defineGlyph({
  id: 'pin',
  title: 'Pin',
  category: 'nav',
  tags: ['pin', 'pinned', 'keep on top', 'always on top', 'stick', 'favorite', 'tack'],
  states: { unpinned: 'idle', pinned: 'active' },
  draw(g, s) {
    const on = s.state === 'pinned';
    const m = arrive(s.since, 0.4);
    const k = on ? m : 1 - m;                         // 0 leaning, 1 upright and pushed in
    const M = rot(lerp(30, 0, k), [24, 30]);
    const dy = lerp(0, 2, k);
    const T = (d) => xf(d, [M[0], M[1], M[2], M[3], M[4], M[5] + dy]);
    if (k > 0.02) g.path(T(HEAD_FILL), { role: 'accent', fill: true, opacity: 0.85 * k });
    g.path(T(HEAD), { role: on ? 'accent' : 'line', join: 'round' });
    g.path(T(`M24 25.5V${lerp(39.5, 37.5, k)}`), { role: 'line', weight: 1.05 });
  },
});
