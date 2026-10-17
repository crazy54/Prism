// Shared drawing for bank / bank-left / bank-right / bank-level: the bank horizon ball (the same
// instrument the Coaster Console's screen shows): a disc whose horizon rolls with the track, its
// ground half tinted, the car mark and the level marks fixed. bank-left / bank-right add the roll arrow over
// the top. Arriving, the horizon rolls from level to its bank; a press rolls it a little further.
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { n } from '../../scene/svg.js';
import { arcArrow } from './_track.js';

const CX = 24, CY = 26.5, R = 12.5, RAD = Math.PI / 180;

/** The ball with its horizon rolled `deg` (clockwise = right side down). */
export function ball(g, deg, { marks = 'dim' } = {}) {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
  const a = [CX - R * c, CY - R * s], b = [CX + R * c, CY + R * s];
  g.path(`M${n(a[0])} ${n(a[1])}L${n(b[0])} ${n(b[1])}A${R} ${R} 0 0 1 ${n(a[0])} ${n(a[1])}Z`, { role: 'dim', fill: true, opacity: 0.4 });
  g.circle(CX, CY, R);
  g.line(a[0], a[1], b[0], b[1], { role: 'line', weight: 1.05 });
  // the fixed car mark at the center (the instrument's reference, always level)
  g.polyline([[16.5, CY], [21, CY], [24, CY + 3], [27, CY], [31.5, CY]], { role: 'accent', weight: 0.9, join: 'round' });
  g.line(7, CY, 10, CY, { role: marks, weight: 1.05 });
  g.line(38, CY, 41, CY, { role: marks, weight: 1.05 });
}

/** side: -1 left, 1 right, 0 = the bank angle itself (the dial). */
export function drawBank(g, s, side) {
  const k = enter(s, 0.6), p = press(s, 0.5);
  const target = side === 0 ? -20 : side * 24;
  ball(g, lerp(0, target, k) + (side || -1) * 6 * p);
  if (side === 0) return;
  // the roll arrow over the top, pointing the way the track rolls
  const a0 = -side * 42, a1 = side * 42;
  arcArrow(g, CX, CY, 17.5, a0, lerp(a0, a1, 0.3 + 0.7 * k), { role: 'line', size: 4.4 });
}
