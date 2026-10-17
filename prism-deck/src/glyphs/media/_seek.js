// Shared drawing for forward-10 / rewind-10 / replay: a circular arrow (open at the top, head pointing
// the way time goes) holding a mark: "10" in the instrument digits, or a play triangle. Arriving, the
// arrow winds round to its head; a press spins it a little further along.
import { lerp, clamp, outExpo } from '../../scene/easing.js';
import { enter } from '../_tools.js';
import { arcHead } from '../system/_kit.js';
import { digits } from '../time/_digits.js';

const R = 13.5;

/** dir 1 = clockwise (forward), -1 = counterclockwise (back). mark: '10' | 'play'. */
export function drawSeek(g, s, dir, mark) {
  const k = enter(s, 0.5);
  const spin = s.pressed ? 0 : s.pressAge < 0.45 ? 1 - outExpo(clamp(s.pressAge / 0.45)) : 0;
  const head = dir > 0 ? 360 : 0, tail = head - dir * lerp(150, 300, k);
  const turn = dir * 24 * spin;
  g.group({ rotate: turn, origin: [24, 24] }, () => {
    g.arc(24, 24, R, Math.min(head, tail), Math.max(head, tail), { role: 'line' });
    g.polyline(arcHead(24, 24, R, head, { size: 4.2, dir }), { role: spin > 0.3 ? 'accent' : 'line', join: 'round' });
  });
  if (mark === 'play') g.polygon([[21, 18.5], [30, 24], [21, 29.5]], { role: 'fill', join: 'round', opacity: lerp(0.3, 1, k) });
  else digits(g, mark, { top: 5, role: 'accent', weight: 0.85, opacity: lerp(0.3, 1, k) });
}
