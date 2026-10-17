// pages — a page with another behind it (switch page / profile pages). Arriving, the
// back page fans out from behind the front one; a press turns the page: the front
// slides away to the left as the one behind steps forward, then both settle back.
import { defineGlyph } from '../_glyph.js';
import { arrive, outExpo, clamp, lerp } from '../../scene/easing.js';
import { P } from '../../scene/svg.js';

export default defineGlyph({
  id: 'pages',
  title: 'Pages',
  category: 'nav',
  tags: ['pages', 'page', 'next page', 'profile', 'switch', 'documents', 'navigation'],
  draw(g, s) {
    const fan = arrive(s.since, 0.5);
    const turn = s.pressed ? 1 : s.pressAge < 0.5 ? 1 - outExpo(clamp(s.pressAge / 0.5)) : 0;
    // the page behind: only its top and right edges show
    const bx = lerp(-6, 0, fan) - 2.5 * turn, by = lerp(4.5, 0, fan) + 1.5 * turn;
    g.group({ x: bx, y: by, opacity: lerp(0.4, 1, fan) }, () => {
      g.path(P().M(16.5, 9.5).H(34).A(3.5, 3.5, 0, 0, 1, 37.5, 13).V(32.5).d, { role: turn > 0.4 ? 'accent' : 'dim' });
    });
    // the front page with its lines
    g.group({ x: -3 * turn, opacity: 1 - 0.45 * turn }, () => {
      g.rect(10.5, 14, 22, 26, { r: 3.5 });
      g.line(15.5, 21.5, 27.5, 21.5, { role: 'dim' });
      g.line(15.5, 26.5, 27.5, 26.5, { role: 'dim' });
      g.line(15.5, 31.5, 22.5, 31.5, { role: 'dim' });
    });
  },
});
