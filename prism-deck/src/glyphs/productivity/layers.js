// layers — a stack of three sheets seen at an angle (order / arrange / layers). Arriving, the sheets
// fan apart from one; a press lifts the top sheet (bring to front) and it settles back.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

const SHEET = (y) => `M24 ${y - 8.5}L40 ${y}L24 ${y + 8.5}L8 ${y}Z`;

export default defineGlyph({
  id: 'layers',
  title: 'Layers',
  category: 'productivity',
  tags: ['layers', 'order', 'arrange', 'stack', 'bring to front', 'send to back', 'z-order'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    const gap = lerp(0, 7, k);
    g.path(SHEET(24 + gap), { role: 'dim', join: 'round' });
    g.path(SHEET(24), { role: 'line', join: 'round' });
    g.path(SHEET(24 - gap - 2.5 * p), { role: p > 0.3 ? 'accent' : 'line', join: 'round' });
  },
});
