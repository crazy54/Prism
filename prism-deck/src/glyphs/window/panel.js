// panel — the frame with a panel along its bottom (terminal / output / problems). hidden: folded
// away; shown: it slides up, tinted. The change animates both ways.
import { defineGlyph } from '../_glyph.js';
import { arrive } from '../../scene/easing.js';
import { frame, region, lerp, X0, X1, Y1 } from './_frame.js';

export default defineGlyph({
  id: 'panel',
  title: 'Panel',
  category: 'window',
  tags: ['panel', 'bottom panel', 'toggle panel', 'output', 'console', 'bottom', 'dock'],
  states: { shown: 'active', hidden: 'idle' },
  draw(g, s) {
    const m = arrive(s.since, 0.4);
    const k = s.state === 'shown' ? m : 1 - m;       // 0 folded, 1 open
    const y = lerp(Y1 - 1.5, 28.5, k);
    if (k > 0.02) g.path(region(X0, y, X1, Y1), { role: 'accent', fill: true, opacity: 0.28 * k });
    frame(g);
    g.line(X0, y, X1, y, { role: k > 0.5 ? 'line' : 'dim' });
  },
});
