// rename — a name field with its text selected and the caret at the end. Arriving, the text types in
// behind the caret; editing: the caret blinks while you type.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter } from '../_tools.js';
import { blink } from '../system/_kit.js';

export default defineGlyph({
  id: 'rename',
  title: 'Rename',
  category: 'edit',
  tags: ['rename', 'name', 'label', 'title', 'edit text', 'field', 'refactor'],
  states: { idle: 'idle', editing: 'active' },
  loop: 1.2,
  draw(g, s) {
    const on = s.state === 'editing';
    const k = enter(s, 0.55);
    g.rect(7, 15, 34, 18, { r: 4 });
    const end = lerp(13, 27, k);
    g.line(13, 24, end, 24, { role: on ? 'line' : 'dim', weight: 1.05 });
    const b = on ? 0.2 + 0.8 * blink(s.phase(1.2), 0.55, 0.08) : 1;
    g.line(end + 3.5, 19, end + 3.5, 29, { role: 'accent', weight: 1.05, opacity: b });
    g.line(end + 1, 19, end + 6, 19, { role: 'accent', weight: 0.75, opacity: b });
    g.line(end + 1, 29, end + 6, 29, { role: 'accent', weight: 0.75, opacity: b });
  },
});
