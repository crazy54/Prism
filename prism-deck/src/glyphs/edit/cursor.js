// cursor — multiple text cursors: three lines of text, an I-beam caret standing at the end of each.
// Arriving, the carets drop in one after the other; afterwards they blink together.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter } from '../_tools.js';
import { blink } from '../system/_kit.js';

const ROWS = [[13, 24], [24, 33], [35, 19]];   // [y, where the text ends]

export default defineGlyph({
  id: 'cursor',
  title: 'Cursors',
  category: 'edit',
  tags: ['cursor', 'cursors', 'multi-cursor', 'caret', 'add next', 'select matches', 'text'],
  loop: 1.2,
  draw(g, s) {
    const on = 0.25 + 0.75 * blink(s.phase(1.2), 0.6, 0.1);
    ROWS.forEach(([y, x1], i) => {
      g.line(8.5, y, x1, y, { role: 'dim' });
      const k = enter({ since: s.since - i * 0.08 }, 0.4);
      const op = k * lerp(1, on, clamp((s.since - 0.6) / 0.1)), dy = lerp(-2.5, 0, k), cx = x1 + 4.5;
      g.line(cx, y - 4.5 + dy, cx, y + 4.5 + dy, { role: 'accent', weight: 1.05, opacity: op });
      g.line(cx - 2.2, y - 4.5 + dy, cx + 2.2, y - 4.5 + dy, { role: 'accent', weight: 0.75, opacity: op });
      g.line(cx - 2.2, y + 4.5 + dy, cx + 2.2, y + 4.5 + dy, { role: 'accent', weight: 0.75, opacity: op });
    });
  },
});
