// folder — a tabbed folder. closed: the front pocket sits flush. open: the front
// tilts forward and a lit sheet rises out of it; the change animates both ways.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';
import { P } from '../../scene/svg.js';
import { roundedPoly } from '../time/_dial.js';

const L = 8.5, TOP = 11, TAB = 14, BOT = 38;

export default defineGlyph({
  id: 'folder',
  title: 'Folder',
  category: 'nav',
  tags: ['folder', 'directory', 'files', 'open', 'browse', 'navigation', 'profile'],
  states: { closed: 'idle', open: 'active' },
  draw(g, s) {
    const m = arrive(s.since, 0.42);
    const k = s.state === 'open' ? m : 1 - m; // 0 closed … 1 open
    // the back panel with its tab; its right side ends behind the front
    const xr = lerp(39.5, 36.5, k), yb = lerp(21, 24, k);
    g.path(P().M(L, BOT - 3).V(TAB).A(3, 3, 0, 0, 1, L + 3, TOP).H(18.4).A(2, 2, 0, 0, 1, 20, TOP + 0.8).L(22.5, TAB).H(xr - 3).A(3, 3, 0, 0, 1, xr, TAB + 3).V(yb).d);
    // a sheet rises out of the open folder
    if (k > 0.02) {
      const st = lerp(24, 18.5, k);
      g.path(P().M(13.5, 24).V(st + 1.5).A(1.5, 1.5, 0, 0, 1, 15, st).H(30.5).A(1.5, 1.5, 0, 0, 1, 32, st + 1.5).V(24).d, { role: 'accent', weight: 0.85, opacity: k });
    }
    // the front: flush (a pocket line at 18.5) → tilted forward
    const fy = lerp(18.5, 23.5, k);
    const front = [[L, fy], [lerp(39.5, 40.5, k), fy], [lerp(39.5, 36.5, k), BOT], [lerp(L, L, k), BOT]];
    front[0][0] = lerp(L, 12.5, k);
    g.path(roundedPoly(front, [lerp(0, 2, k), lerp(0, 2, k), 3, 3]), { role: 'line', join: 'round' });
  },
});
