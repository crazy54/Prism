// view-icons — big icons view: a 2 × 2 grid of tiles. Arriving, the tiles pop in one after another; a
// press lights the first tile.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'view-icons',
  title: 'Icons View',
  category: 'window',
  tags: ['icons', 'big icons', 'grid', 'thumbnails', 'tiles', 'view', 'icon size'],
  draw(g, s) {
    const p = press(s, 0.4);
    [[9, 9], [26, 9], [9, 26], [26, 26]].forEach(([x, y], i) => {
      const k = enter({ since: s.since - i * 0.07 }, 0.4), h = lerp(4.5, 0, k);
      g.rect(x + h, y + h, 13 - 2 * h, 13 - 2 * h, { r: 3, role: i === 0 && p > 0.3 ? 'accent' : 'line', opacity: lerp(0.2, 1, k) });
    });
  },
});
