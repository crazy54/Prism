// Shared drawing for zoom-in / zoom-out / zoom-reset: the search magnifier (same lens, same handle)
// carrying a plus, a minus or a 1:1. Arriving, the mark grows into the lens; a press pulses the lens
// in or out.
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';
import { digits } from '../time/_digits.js';

const CX = 21, CY = 21, R = 11.5;

export function drawZoom(g, s, mode) {
  const k = enter(s, 0.45), p = press(s, 0.4);
  const r = R + (mode === 'out' ? -0.8 : 0.8) * p;
  g.circle(CX, CY, r);
  const [x0, y0] = g.polar(CX, CY, r + 1.6, 135), [x1, y1] = g.polar(CX, CY, 24.5, 135);
  g.line(x0, y0, x1, y1, { role: 'line', weight: 1.25 });
  const h = lerp(1.5, 5, k), role = 'accent';
  if (mode === 'in' || mode === 'out') g.line(CX - h, CY, CX + h, CY, { role, weight: 1.05 });
  if (mode === 'in') g.line(CX, CY - h, CX, CY + h, { role, weight: 1.05 });
  if (mode === 'reset') g.group({ x: CX - 24, y: 0, opacity: k }, () => {
    // "1:1" on the instrument lattice: two 1s and a colon (rows 4–8 → y 16.8–26.4)
    digits(g, '11', { top: 4, role: 'accent', weight: 0.85 });
    g.circle(22.8, 19.6, 1.2, { role: 'accent', fill: true });
    g.circle(22.8, 23.6, 1.2, { role: 'accent', fill: true });
  });
}
