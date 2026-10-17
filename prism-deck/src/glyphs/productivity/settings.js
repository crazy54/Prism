// settings — the gear: eight rounded teeth round a hub. Arriving, the gear turns into place; a press
// turns it on by one tooth (and lights the hub).
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp, outBack } from '../../scene/easing.js';
import { enter, press, xf, rot } from '../_tools.js';
import { roundPoly } from '../system/_kit.js';

const GEAR = (() => {
  const pts = [], P = (r, a) => [24 + r * Math.sin((a * Math.PI) / 180), 24 - r * Math.cos((a * Math.PI) / 180)];
  for (let i = 0; i < 8; i++) {
    const a = i * 45;
    pts.push(P(12, a - 14), P(16, a - 8.5), P(16, a + 8.5), P(12, a + 14));
  }
  return roundPoly(pts, 1.4);
})();

export default defineGlyph({
  id: 'settings',
  title: 'Settings',
  category: 'productivity',
  tags: ['settings', 'gear', 'preferences', 'options', 'configure', 'cog', 'setup'],
  draw(g, s) {
    const k = enter(s, 0.6), p = press(s, 0.4);
    const turn = lerp(-30, 0, k) + 45 * (s.pressed ? 0 : s.pressAge < 0.55 ? outBack(clamp(s.pressAge / 0.55)) - 1 : 0);
    g.path(xf(GEAR, rot(turn)), { join: 'round' });
    g.circle(24, 24, 5.5, { role: p > 0.3 ? 'accent' : 'line' });
  },
});
