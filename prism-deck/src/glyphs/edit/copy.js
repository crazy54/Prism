// copy — two squares, one over the other (copy / duplicate). Arriving, the copy slides out from
// behind the original; a press stamps a fresh copy: it pops forward in the accent and settles back.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { P } from '../../scene/svg.js';

export default defineGlyph({
  id: 'copy',
  title: 'Copy',
  category: 'edit',
  tags: ['copy', 'duplicate', 'clone', 'dup', 'clipboard', 'copy shift'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.45);
    const o = lerp(0, 1, k) + 0.6 * p;                // how far the back square has slid out (1 = home)
    const bx = 9.5 + 8 * o, by = 17.5 - 8 * o;
    // the back square: only the edges that show above and right of the front one
    g.path(P().M(bx, 17.5).V(by + 4).A(4, 4, 0, 0, 1, bx + 4, by).H(bx + 17).A(4, 4, 0, 0, 1, bx + 21, by + 4).V(by + 17).A(4, 4, 0, 0, 1, bx + 17, by + 21).H(30.5).d, { role: p > 0.3 ? 'accent' : 'line', join: 'round', opacity: lerp(0.3, 1, k) });
    g.rect(9.5, 17.5, 21, 21, { r: 4 });
  },
});
