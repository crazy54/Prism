// view-details — details view: rows of a list, each a small icon and its text. Arriving, the rows
// write in top to bottom; a press lights the first row.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'view-details',
  title: 'Details View',
  category: 'window',
  tags: ['details', 'list', 'list view', 'rows', 'columns', 'view'],
  draw(g, s) {
    const p = press(s, 0.4);
    [12.5, 24, 35.5].forEach((y, i) => {
      const k = enter({ since: s.since - i * 0.08 }, 0.4);
      g.rect(8, y - 3, 6, 6, { r: 1.8, role: i === 0 && p > 0.3 ? 'accent' : 'fill', fill: true, opacity: lerp(0.2, 1, k) });
      g.line(19, y, lerp(19, [40, 35, 38][i], k), y, { role: i === 0 && p > 0.3 ? 'accent' : 'line' });
    });
  },
});
