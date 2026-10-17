// scale — a small square in the corner of a dashed bound, an arrow pulling its far corner out to the
// bound's. Arriving, the square grows into place; a press stretches it toward the bound.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

export default defineGlyph({
  id: 'scale',
  title: 'Scale',
  category: 'edit',
  tags: ['scale', 'resize', 'size', 'grow', 'shrink', 'enlarge', 'transform'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.45);
    g.rect(8.5, 8.5, 31, 31, { r: 4, role: 'dim', dash: [2.4, 2.8] });
    const w = lerp(10, 15, k) + 4 * p;
    g.rect(8.5, 39.5 - w, w, w, { r: 3.5, role: 'line' });
    const a = 8.5 + w + 3, b = 39.5 - w - 3;           // the arrow leaves the square's far corner…
    g.line(a, b, 34.5, 13.5, { role: 'accent' });      // …for the bound's
    g.polyline(chevron([35.5, 12.5], 45, 7, 45), { role: 'accent', join: 'round' });
  },
});
