// forward — the return arrow turned the other way (redo / forward), the mirror of back. It slides in
// from the left as the key arrives; a press pushes it on toward where you're going, and it springs home.
import { defineGlyph } from '../_glyph.js';
import { arrive, outExpo, clamp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'forward',
  title: 'Forward',
  category: 'edit',
  tags: ['forward', 'redo', 'next', 'repeat', 'navigation', 'forward message'],
  draw(g, s) {
    const k = arrive(s.since, 0.45);
    const push = s.pressed ? 1 : s.pressAge < 0.45 ? 1 - outExpo(clamp(s.pressAge / 0.45)) : 0;
    const dx = -4 * (1 - k) + 2.5 * push;
    g.group({ x: dx, opacity: 0.3 + 0.7 * k }, () => {
      g.path('M37 19H20.5A9 9 0 0 0 20.5 37H28.5');
      g.polyline([[30, 11.5], [37.5, 19], [30, 26.5]], { role: push > 0.3 ? 'accent' : 'line', join: 'round' });
    });
  },
});
