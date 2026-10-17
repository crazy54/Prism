// fade — the fade transition: a frame whose picture ramps from solid to clear across four bands.
// Arriving, the ramp sweeps in from the solid side; a press runs it again.
import { defineGlyph } from '../_glyph.js';
import { clamp, inOutSine } from '../../scene/easing.js';

const RAMP = [1, 0.62, 0.34, 0.14];

export default defineGlyph({
  id: 'fade',
  title: 'Fade',
  category: 'stream',
  tags: ['fade', 'crossfade', 'transition', 'dissolve', 'blend', 'scene', 'stream'],
  draw(g, s) {
    const run = s.pressed ? 0 : s.pressAge < 0.7 ? clamp(s.pressAge / 0.7) : clamp(s.since / 0.7);
    g.rect(7, 10.5, 34, 27, { r: 4 });
    RAMP.forEach((o, i) => {
      const k = inOutSine(clamp(run * 1.6 - i * 0.2));
      if (k > 0.02) g.rect(11 + i * 6.75, 14.5, 5.75, 19, { r: i === 0 ? 1.8 : 0.8, role: 'fill', opacity: o * k });
    });
  },
});
