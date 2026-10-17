// Shared drawing for arrow-up / -down / -left / -right and scroll-top / -bottom: a shaft with the
// set's chevron head. Arriving, the arrow slides in along its own direction; a press nudges it on
// (the head lights) and it springs back.
import { lerp } from '../../scene/easing.js';
import { enter, press, chevron, xf, xfPts, rot } from '../_tools.js';

/** dir: 0 up, 90 right, 180 down, 270 left. bar: draw the stop bar at the head (scroll to top / bottom). */
export function drawArrow(g, s, dir, { bar = false } = {}) {
  const k = enter(s, 0.45), p = press(s, 0.45);
  const M = rot(dir);
  const d = lerp(-4, 0, k) + 2 * p;                 // travel along the arrow (up in local space)
  const top = bar ? 15.5 : 10.5;
  const [a, b] = xfPts([[24, 38.5 - d], [24, top + 1 - d]], M);
  g.line(a[0], a[1], b[0], b[1], { opacity: lerp(0.3, 1, k) });
  g.polyline(xfPts(chevron([24, top - d], 0, 11, 45), M), { role: p > 0.3 ? 'accent' : 'line', join: 'round', opacity: lerp(0.3, 1, k) });
  if (bar) g.path(xf('M11 9.5H37', M), { role: 'accent', weight: 1.05 });
}
