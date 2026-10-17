// Shared drawing for step-into / step-out (the debugger): an arrow and the dot of the current line.
// into: the arrow comes down into the dot; out: it climbs up away from it. Arriving, the arrow
// travels its way; a press steps it again.
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';

export function drawStep(g, s, dir) {
  const k = enter(s, 0.45), p = press(s, 0.4);
  const d = lerp(-4, 0, k) + 1.8 * p;
  g.circle(24, 35.5, 4, { role: 'accent', weight: 1.05 });
  if (dir > 0) {
    // into: shaft from the top down, head just above the dot
    g.line(24, 10.5 + d, 24, 26 + d);
    g.polyline(chevron([24, 27 + d], 180, 8, 45), { role: 'line', join: 'round' });
  } else {
    // out: shaft from just above the dot up to the head
    g.line(24, 28 - d, 24, 10 - d);
    g.polyline(chevron([24, 9 - d], 0, 8, 45), { role: 'line', join: 'round' });
  }
}
