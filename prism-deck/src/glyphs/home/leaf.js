// leaf — efficiency / eco: a leaf with its vein. on: it greens (lit) and sways gently (a 2.4 s loop);
// off: still, outlined. Turning on, it unfurls from its stem.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';

const LEAF = 'M10.5 37.5C10.5 21 20 10.5 38 9.5C38.5 27.5 28 37.5 12.5 37.5Z';

export default defineGlyph({
  id: 'leaf',
  title: 'Efficiency',
  category: 'home',
  tags: ['leaf', 'eco', 'efficiency', 'efficiency mode', 'green', 'power saver', 'battery saver'],
  states: { off: 'idle', on: 'active' },
  hue: 150,
  loop: 2.4,
  draw(g, s) {
    const on = s.state === 'on';
    const k = arrive(s.since, 0.5);
    const sway = on ? 3 * Math.sin(s.phase(2.4) * Math.PI * 2) * k : 0;
    g.group({ rotate: sway + (on ? lerp(-12, 0, k) : 0), origin: [10.5, 37.5] }, () => {
      if (on) g.path(LEAF, { role: 'accent', fill: true, opacity: 0.35 * k });
      g.path(LEAF, { role: on ? 'accent' : 'line', join: 'round' });
      g.path('M10.5 37.5C17 29 23.5 22.5 31 16.5', { role: on ? 'line' : 'dim' });
    });
  },
});
