// mic — microphone; live shows voice waves breathing beside it, muted draws the strike.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse } from '../../scene/easing.js';

export default defineGlyph({
  id: 'mic',
  title: 'Microphone',
  category: 'audio',
  tags: ['mic', 'microphone', 'mute', 'voice', 'call', 'meeting'],
  states: { on: 'active', off: 'neg' },
  loop: 1.6,
  draw(g, s) {
    const on = s.state === 'on';
    g.rect(18.5, 6, 11, 20, { r: 5.5 });
    g.path('M12.5 21a11.5 11.5 0 0 0 23 0', { role: 'dim' });
    g.line(24, 32.5, 24, 39);
    g.line(18, 40, 30, 40);
    if (on) {
      // voice: two arcs each side, breathing out of phase
      const a = pulse(s.t, 1.6), b = pulse(s.t + 0.8, 1.6);
      g.arc(24, 16, 13.5, 60, 120, { role: 'accent', opacity: 0.35 + 0.65 * a, weight: 0.85 });
      g.arc(24, 16, 13.5, 240, 300, { role: 'accent', opacity: 0.35 + 0.65 * a, weight: 0.85 });
      g.arc(24, 16, 17.5, 64, 116, { role: 'accent', opacity: 0.2 + 0.6 * b, weight: 0.75 });
      g.arc(24, 16, 17.5, 244, 296, { role: 'accent', opacity: 0.2 + 0.6 * b, weight: 0.75 });
    } else {
      const k = arrive(s.since, 0.32); // the strike draws in (skip the zero-length first frame: its round cap would be a stray dot)
      if (k > 0.02) g.line(10, 8, 10 + 28 * k, 8 + 32 * k, { role: 'accent', weight: 1.15 });
    }
  },
});
