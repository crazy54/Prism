// sidebar — the frame with a sidebar down its left side. hidden: the sidebar is folded away (a dim
// edge); shown: it slides open, tinted. The change animates both ways.
import { defineGlyph } from '../_glyph.js';
import { arrive } from '../../scene/easing.js';
import { frame, region, lerp, X0, Y0, Y1 } from './_frame.js';

export default defineGlyph({
  id: 'sidebar',
  title: 'Sidebar',
  category: 'window',
  tags: ['sidebar', 'side bar', 'explorer', 'toggle sidebar', 'panel', 'navigation pane', 'drawer'],
  states: { shown: 'active', hidden: 'idle' },
  draw(g, s) {
    const m = arrive(s.since, 0.4);
    const k = s.state === 'shown' ? m : 1 - m;       // 0 folded, 1 open
    const x = lerp(X0 + 1.5, 18.5, k);
    if (k > 0.02) g.path(region(X0, Y0, x, Y1), { role: 'accent', fill: true, opacity: 0.28 * k });
    frame(g);
    g.line(x, Y0, x, Y1, { role: k > 0.5 ? 'line' : 'dim' });
  },
});
