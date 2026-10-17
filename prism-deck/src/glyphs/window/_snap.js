// Shared drawing for snap-left / snap-right: the frame with one half lit and an arrow pushing toward
// it. Arriving, the lit half slides in from its edge; a press nudges the arrow.
import { chevron } from '../_tools.js';
import { frame, region, motion, lerp, X0, X1, Y0, Y1 } from './_frame.js';

/** side -1 = left half, 1 = right half. */
export function drawSnap(g, s, side) {
  const { k, p } = motion(s);
  const w = lerp(4, 17, k);
  const [a, b] = side < 0 ? [X0, X0 + w] : [X1 - w, X1];
  g.path(region(a, Y0, b, Y1), { role: 'accent', fill: true, opacity: 0.38 });
  frame(g);
  g.line(side < 0 ? b : a, Y0, side < 0 ? b : a, Y1, { role: 'line' });
  // the arrow in the other half, pointing at the lit one
  const cx = 24 - side * 8.5 + side * 1.5 * p;
  g.polyline(chevron([cx + side * 2.5, 24], side < 0 ? 270 : 90, 6, 45), { role: 'line', join: 'round', opacity: k });
}
