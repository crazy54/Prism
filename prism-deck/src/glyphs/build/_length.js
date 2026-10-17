// Shared drawing for length-plus / length-minus: a dimension line (end stops, a double arrow) under
// a plus or minus. Arriving, the arrows open out to the stops; a press stretches (plus) or squeezes
// (minus) the span, and the sign lights.
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

const Y = 31, X0 = 8, X1 = 40;

export function drawLength(g, s, sign) {
  const k = enter(s, 0.55), p = press(s, 0.45);
  const pull = lerp(5, 0, k) - sign * 1.8 * p;        // how far the arrowheads sit inside the stops
  g.line(X0, Y - 6, X0, Y + 6, { role: 'dim' });
  g.line(X1, Y - 6, X1, Y + 6, { role: 'dim' });
  const a = X0 + 3.5 + pull, b = X1 - 3.5 - pull;
  g.line(a, Y, b, Y);
  g.polyline(chevron([a, Y], 270, 5.5, 45), { join: 'round' });
  g.polyline(chevron([b, Y], 90, 5.5, 45), { join: 'round' });
  const role = p > 0.3 ? 'accent' : 'accent';
  g.line(18, 14, 30, 14, { role, weight: 1.15, opacity: lerp(0.5, 1, k) });
  if (sign > 0) g.line(24, 8, 24, 20, { role, weight: 1.15, opacity: lerp(0.5, 1, k) });
}
