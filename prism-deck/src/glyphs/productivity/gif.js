// gif — an animated picture: a frame with GIF set in it. The letters cycle a soft shimmer left to
// right (a 1.8 s loop), so the key reads as moving; a press lights the frame.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { bump } from '../system/_kit.js';

export default defineGlyph({
  id: 'gif',
  title: 'GIF',
  category: 'productivity',
  tags: ['gif', 'animated', 'animation', 'image', 'reaction', 'chat', 'media'],
  loop: 1.8,
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    g.rect(6.5, 13, 35, 22, { r: 4, role: p > 0.3 ? 'accent' : 'line' });
    const ph = s.phase(1.8);
    // G, I, F as strokes so they match the set's line weight
    const op = (i) => lerp(0.3, 1, k) * (0.65 + 0.35 * bump(ph, i / 3 + 0.16, 0.3, true));
    g.path('M21 19.2C20.2 18.4 19 18 17.8 18C15.2 18 13 20.2 13 24C13 27.8 15.2 30 17.8 30C19.8 30 21.3 29 21.5 26.5V24.8H18', { role: 'line', join: 'round', opacity: op(0) });
    g.line(26, 18, 26, 30, { role: 'line', opacity: op(1) });
    g.polyline([[37, 18], [31, 18], [31, 30]], { role: 'line', join: 'round', opacity: op(2) });
    g.line(31, 24, 35.5, 24, { role: 'line', opacity: op(2) });
  },
});
