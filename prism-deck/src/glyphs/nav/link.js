// link — the chain link: two open links on the diagonal joined by a bar. Arriving, the links slide in
// onto the bar; a press tugs them apart a little and they snap back (the right one lights).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, xf, rot } from '../_tools.js';

const M = rot(-45);

export default defineGlyph({
  id: 'link',
  title: 'Link',
  category: 'nav',
  tags: ['link', 'url', 'hyperlink', 'chain', 'copy link', 'insert link', 'attach'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    const o = lerp(3.5, 0, k) + 1.4 * p;             // how far each link sits out from home
    const op = lerp(0.35, 1, k);
    g.path(xf(`M${21 - o} 17H${14.5 - o}A7 7 0 0 0 ${14.5 - o} 31H${21 - o}`, M), { role: 'line', opacity: op });
    g.path(xf(`M${27 + o} 17H${33.5 + o}A7 7 0 0 1 ${33.5 + o} 31H${27 + o}`, M), { role: p > 0.3 ? 'accent' : 'line', opacity: op });
    g.path(xf('M18.5 24H29.5', M), { role: 'line', weight: 1.05 });
  },
});
