// select — a dashed selection marquee with the pointer at its corner. Arriving, the marquee opens out
// from the pointer; a press clicks the pointer and the marquee lights.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

const POINTER = [[23.5, 21], [23.5, 39], [28, 34.8], [31.3, 41], [34.6, 39.4], [31.4, 33.3], [37.4, 33.3]];

export default defineGlyph({
  id: 'select',
  title: 'Select',
  category: 'edit',
  tags: ['select', 'selection', 'marquee', 'pick', 'select all', 'multi-select', 'add', 'subtract'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    const w = lerp(12, 26, k), h = lerp(10, 22, k);
    g.rect(8, 8, w, h, { r: 3, role: p > 0.3 ? 'accent' : 'dim', dash: [2.6, 2.6] });
    g.group({ x: 1 * p, y: 1 * p }, () => g.polygon(POINTER, { role: 'line', join: 'round' }));
  },
});
