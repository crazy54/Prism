// keyboard — a keyboard: two rows of keys and the space bar. Arriving, the keys light in a ripple from
// the left; a press taps one key.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { press } from '../_tools.js';

export default defineGlyph({
  id: 'keyboard',
  title: 'Keyboard',
  category: 'productivity',
  tags: ['keyboard', 'keys', 'shortcuts', 'hotkeys', 'keybindings', 'type', 'input'],
  draw(g, s) {
    const p = press(s, 0.35);
    g.rect(6.5, 13, 35, 22.5, { r: 4 });
    [12.5, 18.5, 24.5, 30.5, 35.5].forEach((x, i) => {
      for (const [j, y] of [[0, 19.5], [1, 24.5]]) {
        const k = clamp((s.since - (i + j) * 0.05) / 0.25);
        const hit = i === 2 && j === 0 && p > 0.3;
        g.circle(x, y, 1.45, { role: hit ? 'accent' : 'fill', fill: true, opacity: lerp(0.2, 1, k) });
      }
    });
    g.line(16.5, 30, 31.5, 30, { role: 'line' });
  },
});
