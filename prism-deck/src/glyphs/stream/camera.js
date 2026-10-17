// camera — a video camera (body + lens hood). on: the hood lights and a tally spark
// breathes in the body's corner; off: a strike draws through it, like the mic.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse } from '../../scene/easing.js';

export default defineGlyph({
  id: 'camera',
  title: 'Camera',
  category: 'stream',
  tags: ['camera', 'video', 'webcam', 'cam', 'meeting', 'call', 'stream'],
  states: { on: 'active', off: 'neg' },
  loop: 1.6,
  draw(g, s) {
    const on = s.state === 'on';
    const k = arrive(s.since, on ? 0.4 : 0.32);
    g.rect(7, 14, 23.5, 20, { r: 4.5 });
    g.polyline([[30.5, 20.5], [40.5, 15.5], [40.5, 32.5], [30.5, 27.5]], { role: on ? 'accent' : 'line', join: 'round' });
    if (on) {
      g.dot(13, 20, 2.1, { opacity: (0.45 + 0.55 * pulse(s.t, 1.6)) * k });
    } else if (k > 0.02) {
      g.line(9, 8.5, 9 + 30 * k, 8.5 + 31 * k, { role: 'accent', weight: 1.15 });
    }
  },
});
