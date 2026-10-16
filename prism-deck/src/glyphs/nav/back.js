// back — a return arrow that loops back on itself. It slides in from the right as the
// key arrives; a press pulls it back toward where you came from, and it springs home.
import { defineGlyph } from '../_glyph.js';
import { arrive, outExpo, clamp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'back',
  title: 'Back',
  category: 'nav',
  tags: ['back', 'return', 'previous', 'undo', 'exit', 'navigation', 'folder up'],
  draw(g, s) {
    const k = arrive(s.since, 0.45);
    const pull = s.pressed ? 1 : s.pressAge < 0.45 ? 1 - outExpo(clamp(s.pressAge / 0.45)) : 0;
    const dx = 4 * (1 - k) - 2.5 * pull;
    g.group({ x: dx, opacity: 0.3 + 0.7 * k }, () => {
      g.path('M11 19H27.5A9 9 0 0 1 27.5 37H19.5');
      g.polyline([[18, 11.5], [10.5, 19], [18, 26.5]], { role: pull > 0.3 ? 'accent' : 'line', join: 'round' });
    });
  },
});
