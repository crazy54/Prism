// Shared drawing for the type glyphs (heading · bold · italic · strike · font-size): letterforms drawn
// as strokes on the 48 grid (no font), so every theme paints them like any other line. Arriving, the
// letter settles down into place; a press lights it.
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

/** Draw fn(role, k) inside an arrival group; returns { k, p }. */
export function typeGlyph(g, s, fn) {
  const k = enter(s, 0.45), p = press(s, 0.4);
  g.group({ y: lerp(-3, 0, k), opacity: lerp(0.3, 1, k) }, () => fn(p > 0.3 ? 'accent' : 'line', k, p));
  return { k, p };
}
