// delete — a trash can with its lid. Arriving, the lid drops onto the can; a press tips the lid
// open (something goes in) and it clunks shut as you let go. armed: the can lights (a delete that
// waits for confirmation).
import { defineGlyph } from '../_glyph.js';
import { lerp } from '../../scene/easing.js';
import { enter, press } from '../_tools.js';

export default defineGlyph({
  id: 'delete',
  title: 'Delete',
  category: 'edit',
  tags: ['delete', 'trash', 'bin', 'remove', 'discard', 'demolish', 'erase'],
  states: { ready: 'idle', armed: 'warn' },
  draw(g, s) {
    const armed = s.state === 'armed';
    const k = enter(s, 0.45), p = press(s, 0.45);
    // the can
    g.path('M12.5 16.5L14.3 36.5A3.5 3.5 0 0 0 17.8 39.5H30.2A3.5 3.5 0 0 0 33.7 36.5L35.5 16.5', { role: armed ? 'accent' : 'line', join: 'round' });
    g.line(20.5, 21.5, 21, 34, { role: 'dim' });
    g.line(27.5, 21.5, 27, 34, { role: 'dim' });
    // the lid: drops in on arrival, tips open on a press (hinged at its left end)
    g.group({ y: lerp(-3, 0, k), rotate: -16 * p, origin: [9.5, 12], opacity: lerp(0.3, 1, k) }, () => {
      g.line(9.5, 12, 38.5, 12, { role: 'line' });
      g.path('M19 12V10A2 2 0 0 1 21 8H27A2 2 0 0 1 29 10V12', { role: 'line', join: 'round' });
    });
  },
});
