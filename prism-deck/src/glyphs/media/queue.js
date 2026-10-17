// queue — up next: a list of tracks with the playing one at the bottom, its play mark beside it.
// Arriving, the rows slide up into the list one after another; a press moves the queue on a row.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'queue',
  title: 'Queue',
  category: 'media',
  tags: ['queue', 'up next', 'playlist', 'list', 'next up', 'tracks', 'music'],
  draw(g, s) {
    const p = press(s, 0.45);
    [[12, 40], [20, 40], [28, 30]].forEach(([y, x1], i) => {
      const k = enter({ since: s.since - i * 0.07 }, 0.4);
      g.line(8, y + lerp(3, 0, k) - 2 * p, x1, y + lerp(3, 0, k) - 2 * p, { role: 'dim', opacity: lerp(0.2, 1, k) });
    });
    g.line(8, 36, 24, 36, { role: 'line' });
    g.polygon([[30, 31], [38.5, 36], [30, 41]], { role: p > 0.3 ? 'accent' : 'fill', join: 'round' });
  },
});
