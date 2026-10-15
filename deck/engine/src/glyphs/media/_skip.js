// Shared drawing for skip-next / skip-prev: two solid triangles and a bar (▶▶| / |◀◀).
// Pressing shoves the triangles toward the bar and fires a ghost of the lead
// triangle through it (the skip); entering the key slides them in from behind.
import { arrive, outExpo, clamp, lerp } from '../../scene/easing.js';

const TRI_A = [[9, 13], [21, 24], [9, 35]];
const TRI_B = [[21, 13], [33, 24], [21, 35]];

/** dir = 1 for next (pointing right), -1 for previous (mirrored). */
export function drawSkip(g, s, dir) {
  const X = (x) => (dir > 0 ? x + 0.5 : 48 - (x + 0.5));
  const enter = arrive(s.since, 0.4);
  const pressK = s.pressed ? 1 : s.pressAge < 0.5 ? 1 - outExpo(clamp(s.pressAge / 0.5)) : 0;
  const shove = -3 * (1 - enter) + 2 * pressK; // + toward the bar
  const pts = (tri, dx) => tri.map(([x, y]) => [X(x + dx), y]);
  // the bar (fixed)
  g.rect(Math.min(X(34), X(38)), 13, 4, 22, { r: 1.6, role: 'fill' });
  g.polygon(pts(TRI_A, shove), { role: 'fill', opacity: lerp(0.4, 1, enter) });
  g.polygon(pts(TRI_B, shove), { role: 'fill', opacity: lerp(0.4, 1, enter) });
  // the skip: on release a ghost of the lead triangle fires through the bar and fades
  if (!s.pressed && s.pressAge < 0.45) {
    const e = outExpo(clamp(s.pressAge / 0.45));
    g.polygon(pts(TRI_B, 2 + 6 * e), { role: 'fill', opacity: 0.6 * (1 - e) });
  }
}
