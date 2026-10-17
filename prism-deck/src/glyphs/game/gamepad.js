// gamepad — a generic game controller (no vendor shape): body with two grips, a d-pad and two face
// buttons. Arriving, the buttons light in turn; a press taps a face button.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { press } from '../_tools.js';

const BODY = 'M15 15H33C37.2 15 39.6 18.2 40 22.5L40.6 30.5C40.9 34 38.8 36.5 36 36.5C34 36.5 32.8 35.3 31.9 33.4L30.8 31H17.2L16.1 33.4C15.2 35.3 14 36.5 12 36.5C9.2 36.5 7.1 34 7.4 30.5L8 22.5C8.4 18.2 10.8 15 15 15Z';

export default defineGlyph({
  id: 'gamepad',
  title: 'Gamepad',
  category: 'game',
  tags: ['gamepad', 'controller', 'game', 'game bar', 'joypad', 'play', 'console'],
  draw(g, s) {
    const p = press(s, 0.35);
    g.path(BODY, { join: 'round' });
    g.line(12.5, 23.5, 19.5, 23.5, { role: 'line' });
    g.line(16, 20, 16, 27, { role: 'line' });
    [[31.5, 21.5], [35, 25.5]].forEach(([x, y], i) => {
      const k = clamp((s.since - i * 0.12) / 0.3);
      g.circle(x, y, 2, { role: i === 0 && p > 0.3 ? 'accent' : 'fill', fill: true, opacity: lerp(0.25, 1, k) });
    });
  },
});
