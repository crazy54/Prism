// home — a house: the roof settles onto the walls as the key arrives (Refraction:
// things converge into focus). A press lights the doorway, and it fades as you let go.
import { defineGlyph } from '../_glyph.js';
import { arrive, outExpo, clamp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'home',
  title: 'Home',
  category: 'nav',
  tags: ['home', 'house', 'start', 'main', 'navigation', 'back to top'],
  draw(g, s) {
    const k = arrive(s.since, 0.5);
    const glow = s.pressed ? 1 : s.pressAge < 0.6 ? 1 - outExpo(clamp(s.pressAge / 0.6)) : 0;
    // walls, open at the top where the roof sits
    g.path('M13 21V35.5A3 3 0 0 0 16 38.5H32A3 3 0 0 0 35 35.5V21');
    // the door: arched, lit while pressed
    if (glow > 0.01) g.path('M20.5 38.5V31.5A3.5 3.5 0 0 1 27.5 31.5V38.5Z', { role: 'accent', fill: true, opacity: 0.85 * glow });
    g.path('M20.5 38.5V31.5A3.5 3.5 0 0 1 27.5 31.5V38.5', { role: glow > 0.5 ? 'accent' : 'dim' });
    // the roof converges from above
    g.group({ y: -3.5 * (1 - k), opacity: 0.35 + 0.65 * k }, () => {
      g.polyline([[8.5, 23.5], [24, 10], [39.5, 23.5]], { role: 'line', join: 'round', weight: 1.08 });
    });
  },
});
