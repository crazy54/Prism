// heart — like / favorite. off: an outline. on: the heart fills in the accent with one beat (it swells
// past its size and settles); turning off, the fill drains away.
import { defineGlyph } from '../_glyph.js';
import { arrive, outBack, clamp, lerp } from '../../scene/easing.js';

const HEART = 'M24 38.5C24 38.5 8 29.5 8 18.5C8 13.5 11.8 10 16.2 10C19.5 10 22.4 12 24 14.8C25.6 12 28.5 10 31.8 10C36.2 10 40 13.5 40 18.5C40 29.5 24 38.5 24 38.5Z';

export default defineGlyph({
  id: 'heart',
  title: 'Like',
  category: 'productivity',
  tags: ['heart', 'like', 'liked', 'love', 'favorite', 'save', 'follow'],
  states: { off: 'idle', on: 'active' },
  hue: 12, // a red heart
  draw(g, s) {
    const on = s.state === 'on';
    if (!on) {
      const f = 1 - arrive(s.since, 0.3);
      if (f > 0.02) g.path(HEART, { role: 'accent', fill: true, opacity: 0.9 * f });
      g.path(HEART, { role: 'line', join: 'round' });
      return;
    }
    const b = outBack(clamp(s.since / 0.45), 3);
    g.group({ scale: Math.max(0.01, lerp(0.7, 1, b)), origin: [24, 25] }, () => {
      g.path(HEART, { role: 'accent', fill: true, opacity: 0.9 });
      g.path(HEART, { role: 'accent', join: 'round' });
    });
  },
});
