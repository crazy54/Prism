// Shared drawing for pitch / pitch-up / pitch-down: the track seen from the side, leaving a level
// horizontal with the angle marked between them. Arriving, the track tips up (or down) from level;
// a press tips it a little further.
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron } from '../_tools.js';
import { horizon } from './_track.js';
import { wedge } from '../time/_dial.js';

const RAD = Math.PI / 180;
const L = 32;

/** dir: 1 up, -1 down, 0 = the pitch angle itself (no arrowhead). */
export function drawPitch(g, s, dir) {
  const k = enter(s, 0.6), p = press(s, 0.5);
  const up = dir >= 0;
  const deg = lerp(12, 32, k) + 5 * p;                 // the track's angle off the horizontal
  const x0 = 8.5, y0 = up ? 34 : 14;
  const x1 = x0 + L * Math.cos(deg * RAD), y1 = y0 + (up ? -1 : 1) * L * Math.sin(deg * RAD);
  horizon(g, y0, x0 + 3, 40);
  g.line(x0, y0, x1, y1, { role: 'line', weight: 1.1 });
  const a = up ? 90 - deg : 90 + deg;                // the track's heading (0 = up, clockwise)
  g.path(wedge(x0, y0, 11, Math.min(90, a), Math.max(90, a)), { role: 'dim', fill: true, opacity: 0.3 });
  g.arc(x0, y0, 13, Math.min(90, a), Math.max(90, a), { role: 'accent', weight: 0.95 });
  if (dir !== 0) g.polyline(chevron([x1, y1], a, 6.5, 45), { role: 'line', join: 'round', weight: 1.1 });
  else g.dot(x1, y1, 2.2, { role: 'fill' });
}
