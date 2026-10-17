// diff — changes: a file with a plus over a minus (added / removed). Arriving, the marks pop into
// the file one after the other; a press flashes them.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'diff',
  title: 'Diff',
  category: 'dev',
  tags: ['diff', 'changes', 'compare', 'added', 'removed', 'show change', 'version control'],
  draw(g, s) {
    const p = press(s, 0.4);
    g.rect(10.5, 7.5, 27, 33, { r: 4 });
    const k1 = enter(s, 0.4), k2 = enter({ since: s.since - 0.1 }, 0.4);
    const h1 = lerp(1.5, 5.5, k1), h2 = lerp(1.5, 5.5, k2);
    g.line(24 - h1, 18.5, 24 + h1, 18.5, { role: 'accent', weight: 1.05 });
    g.line(24, 18.5 - h1, 24, 18.5 + h1, { role: 'accent', weight: 1.05 });
    g.line(24 - h2, 31, 24 + h2, 31, { role: p > 0.3 ? 'accent' : 'line', weight: 1.05 });
  },
});
