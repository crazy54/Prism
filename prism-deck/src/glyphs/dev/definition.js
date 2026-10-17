// definition — go to definition: a jump arrow curving up into a source page, landing on the line that
// defines the name (lit). Arriving, the arrow sweeps in; a press jumps again.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

export default defineGlyph({
  id: 'definition',
  title: 'Definition',
  category: 'dev',
  tags: ['definition', 'go to definition', 'declaration', 'jump', 'navigate', 'code', 'peek'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    g.rect(19.5, 9, 21, 30, { r: 4 });
    g.line(24.5, 16, 35.5, 16, { role: 'dim' });
    g.line(24.5, 23, 35.5, 23, { role: 'accent', weight: 1.05 });
    g.line(24.5, 30, 32, 30, { role: 'dim' });
    const d = lerp(-3, 0, k) + 1.2 * p;
    g.path(`M8 38C8 29 10.5 23 ${15.5 + d} 23`, { role: 'line', opacity: lerp(0.3, 1, k) });
    g.polyline(chevron([16 + d, 23], 90, 5, 45), { role: 'line', join: 'round', opacity: lerp(0.3, 1, k) });
  },
});
