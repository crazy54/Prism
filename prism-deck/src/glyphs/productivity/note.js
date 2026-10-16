// note — a note sheet with a folded corner. Arriving, its lines write themselves in,
// one after another. editing: the last line types out behind a blinking caret, holds,
// then clears for the next one (a 3 s loop).
import { defineGlyph } from '../_glyph.js';
import { arrive, phase, clamp, smoothstep, lerp } from '../../scene/easing.js';

const LINES = [[15.5, 17.5, 32.5], [15.5, 23, 32.5], [15.5, 28.5, 26]];

export default defineGlyph({
  id: 'note',
  title: 'Note',
  category: 'productivity',
  tags: ['note', 'notes', 'memo', 'write', 'text', 'snippet', 'journal'],
  states: { idle: 'idle', editing: 'active' },
  loop: 3,
  draw(g, s) {
    const editing = s.state === 'editing';
    g.path('M13 9.5H35A3 3 0 0 1 38 12.5V30.5L30 38.5H13A3 3 0 0 1 10 35.5V12.5A3 3 0 0 1 13 9.5Z', { join: 'round' });
    g.path('M38 30.5H33A3 3 0 0 0 30 33.5V38.5', { role: 'line', weight: 0.9, join: 'round' });
    LINES.forEach(([x0, y, x1], i) => {
      let w = arrive(s.since - i * 0.12, 0.42);
      let op = 1;
      if (editing && i === LINES.length - 1) {
        // typing: write (0–55%), hold, fade, restart
        const p = phase(s.t, 3);
        w = smoothstep(0.04, 0.55, p);
        op = 1 - smoothstep(0.86, 0.98, p);
        const cx = lerp(x0, x1, w) + 2;
        const blink = p > 0.55 && p < 0.86 ? (phase(s.t, 0.5) < 0.5 ? 1 : 0) : 1;
        g.line(cx, y - 3.2, cx, y + 3.2, { role: 'accent', weight: 0.8, opacity: blink * clamp(1 - smoothstep(0.9, 1, p)) });
      }
      if (w > 0.02) g.line(x0, y, lerp(x0, x1, w), y, { role: editing && i === LINES.length - 1 ? 'line' : 'dim', opacity: op });
    });
  },
});
