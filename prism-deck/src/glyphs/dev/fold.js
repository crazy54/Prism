// fold — fold a region: two chevrons closing in on the fold line. folded: they meet the line and it
// lights; unfolded: they stand back from it. The change animates both ways.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'fold',
  title: 'Fold',
  category: 'dev',
  tags: ['fold', 'collapse', 'unfold', 'expand', 'outline', 'region', 'code folding'],
  states: { unfolded: 'idle', folded: 'active' },
  draw(g, s) {
    const m = arrive(s.since, 0.4);
    const k = s.state === 'folded' ? m : 1 - m;       // 0 apart, 1 closed onto the line
    const o = lerp(11, 6.5, k);
    g.polyline([[15, 24 - o - 5.5], [24, 24 - o], [33, 24 - o - 5.5]], { role: 'line', join: 'round' });
    g.polyline([[15, 24 + o + 5.5], [24, 24 + o], [33, 24 + o + 5.5]], { role: 'line', join: 'round' });
    g.line(9, 24, 39, 24, { role: k > 0.5 ? 'accent' : 'dim', weight: k > 0.5 ? 1.05 : 1 });
  },
});
