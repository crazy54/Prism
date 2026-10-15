// power — the power symbol; switching on sweeps the ring closed and lights the stem.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'power',
  title: 'Power',
  category: 'status',
  tags: ['power', 'on', 'off', 'toggle', 'switch'],
  states: { off: 'off', on: 'ok' },
  draw(g, s) {
    const on = s.state === 'on';
    const k = arrive(s.since, 0.45);
    const open = on ? lerp(150, 36, k) : 36; // the ring sweeps closed from the stem outward
    g.arc(24, 25.5, 14.5, open, 360 - open, { role: on ? 'line' : 'dim' });
    g.line(24, 8.5, 24, 24, { role: on ? 'accent' : 'line', weight: 1.1 });
    if (on) g.dot(24, 8.5, 1.5, { opacity: k });
  },
});
