// tab-group — a tab group, drawn like the tab glyph's window: in its tab row the group's color chip and
// two tabs sit over the group's underline (lit). Arriving, the underline draws along under the grouped
// tabs; a press lights the chip.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

const X0 = 7, Y0 = 9.5, X1 = 41, Y1 = 38.5, R = 4.5, ROW = 17.5, END = 31;

export default defineGlyph({
  id: 'tab-group',
  title: 'Tab Group',
  category: 'nav',
  tags: ['tab group', 'group tabs', 'new group', 'tabs', 'organize', 'browser'],
  draw(g, s) {
    const k = enter(s, 0.55), p = press(s, 0.4);
    g.rect(X0, Y0, X1 - X0, Y1 - Y0, { r: R });
    g.rect(10.5, 11.5, 5, 4, { r: 2, role: 'accent', fill: true, opacity: p > 0.3 ? 1 : 0.85 });
    g.line(22.5, Y0 + 2, 22.5, ROW - 2, { role: 'dim' });
    g.line(END, Y0, END, ROW, { role: 'line' });
    g.line(END, ROW, X1, ROW, { role: 'line' });
    g.line(X0, ROW, lerp(X0, END, k), ROW, { role: 'accent', weight: 1.1 });
    g.line(12, 25, 30, 25, { role: 'dim', opacity: k });
    g.line(12, 31.5, 24, 31.5, { role: 'dim', opacity: k });
  },
});
