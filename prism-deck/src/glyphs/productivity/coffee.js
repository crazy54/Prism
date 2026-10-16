// coffee — a mug on a saucer (break / away / brew). hot: three wisps of steam rise
// and sway, each on its own phase of a seamless 2.4 s loop; they fade in as the cup
// turns hot. cold: still.
import { defineGlyph } from '../_glyph.js';
import { arrive, phase, smoothstep } from '../../scene/easing.js';
import { smooth } from '../time/_dial.js';

const WISPS = [[16.5, 0], [21.75, 0.35], [27, 0.68]];

export default defineGlyph({
  id: 'coffee',
  title: 'Coffee',
  category: 'productivity',
  tags: ['coffee', 'break', 'away', 'cafe', 'mug', 'tea', 'brb'],
  states: { cold: 'idle', hot: 'active' },
  hue: 55, // warm: crema and lamplight
  loop: 2.4,
  draw(g, s) {
    const hot = s.state === 'hot';
    g.path('M11 19.5H32V29A7 7 0 0 1 25 36H18A7 7 0 0 1 11 29Z', { join: 'round' });
    g.path('M32 22.5H34A4.5 4.5 0 0 1 34 31.5H31.5', { role: 'line' });
    g.line(9, 40, 34, 40, { role: 'dim' });
    g.line(14.5, 23.5, 28.5, 23.5, { role: hot ? 'accent' : 'dim', weight: 0.8, opacity: hot ? 0.9 : 0.6 });
    if (!hot) return;
    const k = arrive(s.since, 0.9);
    for (const [x, off] of WISPS) {
      const p = phase(s.t / 2.4 + off, 1);
      // a travelling wave: the sway climbs the wisp; the wisp breathes taller and shorter
      const top = 7.5 + 2.5 * (0.5 + 0.5 * Math.cos(p * Math.PI * 2));
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const y = 16 - (16 - top) * (i / 6);
        const sway = 1.6 * Math.sin((i / 6) * Math.PI * 1.6 - p * Math.PI * 2) * (0.35 + 0.65 * (i / 6));
        pts.push([x + sway, y]);
      }
      const op = k * (0.55 + 0.45 * smoothstep(0, 1, 0.5 + 0.5 * Math.sin(p * Math.PI * 2)));
      g.path(smooth(pts), { role: 'accent', weight: 0.8, opacity: op });
    }
  },
});
