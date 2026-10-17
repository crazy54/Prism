// Shared drawing for the figure glyphs (walk · jump · crouch): a stick pictogram (head + limbs as
// strokes), posed by joint lists and blended between poses for motion.
import { lerp } from '../../scene/easing.js';

/** pose: { head: [x, y], spine: [[x, y], [x, y]], arms: [[...pts], [...pts]], legs: [[...pts], [...pts]] } */
export function figure(g, pose, { role = 'line', opacity = 1 } = {}) {
  g.circle(pose.head[0], pose.head[1], 3.4, { role: 'fill', opacity });
  g.polyline(pose.spine, { role, weight: 1.15, join: 'round', opacity });
  for (const limb of [...pose.arms, ...pose.legs]) g.polyline(limb, { role, weight: 1.1, join: 'round', opacity });
}

/** Blend two poses with the same structure (t = 0 → a, 1 → b). */
export function blend(a, b, t) {
  const P = (p, q) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  const L = (x, y) => x.map((p, i) => P(p, y[i]));
  return { head: P(a.head, b.head), spine: L(a.spine, b.spine), arms: a.arms.map((x, i) => L(x, b.arms[i])), legs: a.legs.map((x, i) => L(x, b.legs[i])) };
}
