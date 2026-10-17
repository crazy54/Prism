// star — star / favorite. off: an outline. on: it fills in the accent with a quick spin-in and a
// sparkle at its tip; turning off, the fill drains away.
import { defineGlyph } from '../_glyph.js';
import { arrive, outBack, clamp, lerp } from '../../scene/easing.js';
import { roundPoly } from '../system/_kit.js';

const STAR = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 7.4 : 16.5, a = (i * 36 * Math.PI) / 180;
    pts.push([24 + r * Math.sin(a), 25.5 - r * Math.cos(a)]);
  }
  return roundPoly(pts, [1.6, 0.6, 1.6, 0.6, 1.6, 0.6, 1.6, 0.6, 1.6, 0.6]);
})();

export default defineGlyph({
  id: 'star',
  title: 'Star',
  category: 'productivity',
  tags: ['star', 'starred', 'favorite', 'bookmark', 'rate', 'important', 'save'],
  states: { off: 'idle', on: 'active' },
  hue: 86.5, // gold
  draw(g, s) {
    const on = s.state === 'on';
    if (!on) {
      const f = 1 - arrive(s.since, 0.3);
      if (f > 0.02) g.path(STAR, { role: 'accent', fill: true, opacity: 0.9 * f });
      g.path(STAR, { role: 'line', join: 'round' });
      return;
    }
    const b = outBack(clamp(s.since / 0.45), 2.5);
    g.group({ scale: Math.max(0.01, lerp(0.6, 1, b)), rotate: lerp(-36, 0, clamp(s.since / 0.45)), origin: [24, 25.5] }, () => {
      g.path(STAR, { role: 'accent', fill: true, opacity: 0.9 });
      g.path(STAR, { role: 'accent', join: 'round' });
    });
  },
});
