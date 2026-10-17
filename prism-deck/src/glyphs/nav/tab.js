// tab — a browser tab: the window frame with a tab row along its top; the front tab is open into the
// page (no line under it) and tinted, the next tab sits beside it. Arriving, the front tab slides in
// from the left; a press lights it.
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { P } from '../../scene/svg.js';

const X0 = 7, Y0 = 9.5, X1 = 41, Y1 = 38.5, R = 4.5, ROW = 17;

export default defineGlyph({
  id: 'tab',
  title: 'Tab',
  category: 'nav',
  tags: ['tab', 'tabs', 'switch tab', 'tab 1', 'browser', 'page', 'navigation'],
  draw(g, s) {
    const k = enter(s, 0.5), p = press(s, 0.4);
    const w = lerp(6, 14, k);                         // the front tab's width
    g.path(P().M(X0 + w, ROW).V(Y0).H(X0 + R).A(R, R, 0, 0, 0, X0, Y0 + R).V(ROW).Z().d, { role: 'accent', fill: true, opacity: lerp(0.25, 0.4, p) });
    g.rect(X0, Y0, X1 - X0, Y1 - Y0, { r: R });
    g.line(X0 + w, ROW, X1, ROW, { role: 'line' });
    g.line(X0 + w, Y0, X0 + w, ROW, { role: p > 0.3 ? 'accent' : 'line' });
    g.line(X0 + w + 11, Y0 + 2.5, X0 + w + 11, ROW - 2.5, { role: 'dim', opacity: k });
    g.line(12, 24.5, 30, 24.5, { role: 'dim', opacity: k });
  },
});
