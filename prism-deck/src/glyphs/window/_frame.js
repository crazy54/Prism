// Shared geometry for the window glyphs: one app frame (the terminal glyph's proportions), its header
// line, and filled regions that follow the frame's rounded corners.
import { P } from '../../scene/svg.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export const X0 = 7, Y0 = 9.5, X1 = 41, Y1 = 38.5, R = 4.5, HEAD = 16;

export const frame = (g, o = {}) => g.rect(X0, Y0, X1 - X0, Y1 - Y0, { r: R, ...o });
export const header = (g, o = {}) => g.line(X0, HEAD, X1, HEAD, { role: 'dim', ...o });

/** A filled region of the frame: x0..x1 × y0..y1, rounding whichever corners touch the frame's. */
export function region(x0, y0, x1, y1) {
  const tl = x0 <= X0 && y0 <= Y0 ? R : 0, tr = x1 >= X1 && y0 <= Y0 ? R : 0;
  const br = x1 >= X1 && y1 >= Y1 ? R : 0, bl = x0 <= X0 && y1 >= Y1 ? R : 0;
  const p = P().M(x0 + tl, y0).H(x1 - tr);
  if (tr) p.A(tr, tr, 0, 0, 1, x1, y0 + tr);
  p.V(y1 - br);
  if (br) p.A(br, br, 0, 0, 1, x1 - br, y1);
  p.H(x0 + bl);
  if (bl) p.A(bl, bl, 0, 0, 1, x0, y1 - bl);
  p.V(y0 + tl);
  if (tl) p.A(tl, tl, 0, 0, 1, x0 + tl, y0);
  return p.Z().d;
}

/** The common motion: k = arrival (0 → 1), p = press envelope. */
export const motion = (s) => ({ k: enter(s, 0.5), p: press(s, 0.4) });
export { lerp };
