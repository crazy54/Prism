// Shared drawing for frame-next / frame-prev: a film frame (sprocket holes top and bottom) with a
// step mark beside it, a bar and a small triangle (one frame on / back). Arriving, the frame slides
// one step; a press steps it again.
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export function drawFrameStep(g, s, dir) {
  const k = enter(s, 0.45), p = press(s, 0.4);
  const X = (x) => (dir > 0 ? x : 48 - x);
  const dx = (lerp(-3.5, 0, k) + 1.5 * p) * dir;
  g.group({ x: dx }, () => {
    const x0 = Math.min(X(7.5), X(29.5));
    g.rect(x0, 11, 22, 26, { r: 3.5 });
    for (const y of [14.5, 33.5]) for (const i of [0, 1, 2]) g.circle(x0 + 5.5 + i * 5.5, y, 1.1, { role: 'dim', fill: true });
    g.line(x0, 18.5, x0 + 22, 18.5, { role: 'dim' });
    g.line(x0, 29.5, x0 + 22, 29.5, { role: 'dim' });
  });
  g.polygon([[X(34), 18], [X(40.5), 24], [X(34), 30]], { role: p > 0.3 ? 'accent' : 'fill', join: 'round' });
}
