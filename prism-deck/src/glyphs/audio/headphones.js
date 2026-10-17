// headphones — a band over two solid ear cups. on: the cups light and beat in stereo
// (left and right half a beat apart); turning on, the band draws out from its crown.
import { defineGlyph } from '../_glyph.js';
import { arrive, pulse, lerp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'headphones',
  title: 'Headphones',
  category: 'audio',
  tags: ['headphones', 'headset', 'monitor', 'listen', 'audio', 'output'],
  states: { off: 'idle', on: 'active' },
  loop: 1.2,
  draw(g, s) {
    const on = s.state === 'on';
    const k = on ? arrive(s.since, 0.45) : 1;
    // band: a half-circle crown (r 14.5 about 24,26) dropping into the cups
    const sweep = lerp(24, 90, k);
    g.arc(24, 26, 14.5, 360 - sweep, 360, { role: 'line' });
    g.arc(24, 26, 14.5, 0, sweep, { role: 'line' });
    if (k > 0.98) { g.line(9.5, 26, 9.5, 28); g.line(38.5, 26, 38.5, 28); }
    // ear cups: solid; on, they beat in stereo
    const cup = (x, beat) => {
      if (on) {
        g.rect(x, 25.5, 9, 14, { r: 3.5, role: 'accent', fill: true, opacity: 0.7 + 0.3 * beat });
        g.rect(x + 2.75, 29, 3.5, 7, { r: 1.75, role: 'line', fill: true, opacity: 0.15 + 0.55 * beat });
      } else g.rect(x, 25.5, 9, 14, { r: 3.5, role: 'fill' });
    };
    cup(6.5, on ? pulse(s.t, 1.2) * k : 0);
    cup(32.5, on ? pulse(s.t + 0.6, 1.2) * k : 0);
  },
});
