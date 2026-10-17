// replace — swap one thing for another: an outlined block top-left, a solid one bottom-right, and the
// arrow that carries the first into the second. Arriving, the arrow swings round; a press swaps in
// a fresh block (it pops in the accent).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { arcHead } from '../system/_kit.js';

export default defineGlyph({
  id: 'replace',
  title: 'Replace',
  category: 'edit',
  tags: ['replace', 'swap', 'find and replace', 'substitute', 'exchange'],
  draw(g, s) {
    const k = enter(s, 0.55), p = press(s, 0.45);
    g.rect(8, 8, 15, 15, { r: 3.5, role: 'dim' });
    g.rect(25, 25, 15, 15, { r: 3.5, role: p > 0.3 ? 'accent' : 'fill', fill: true, opacity: lerp(0.4, 1, k) });
    // the carry: a quarter arc from the top block's right side down to the bottom block's top
    const end = lerp(20, 82, k);
    g.arc(26, 22, 10, 0, end, { role: 'line' });
    g.polyline(arcHead(26, 22, 10, end, { size: 4.2 }), { role: 'line', join: 'round' });
  },
});
