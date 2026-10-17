// artist — a performer: a person with a music note beside them. Arriving, the note rises in; a press
// makes the note hop.
import { defineGlyph } from '../_glyph.js';
import { lerp, clamp } from '../../scene/easing.js';
import { enter } from '../_tools.js';

export default defineGlyph({
  id: 'artist',
  title: 'Artist',
  category: 'media',
  tags: ['artist', 'artists', 'musician', 'singer', 'performer', 'band', 'music'],
  draw(g, s) {
    const k = enter(s, 0.5);
    const hop = !s.pressed && s.pressAge < 0.4 ? -2.5 * Math.sin(Math.PI * clamp(s.pressAge / 0.4)) : 0;
    g.circle(19.5, 17.5, 6);
    g.path('M8 39.5A11.5 11 0 0 1 31 39.5', { role: 'line' });
    g.group({ y: lerp(4, 0, k) + hop, opacity: k }, () => {
      g.line(37.5, 9.5, 37.5, 22, { role: 'accent', weight: 0.95 });
      g.path('M37.5 9.5C39 11.5 41 12 41 15', { role: 'accent', weight: 0.85 });
      g.ellipse(35, 22.5, 2.9, 2.3, { role: 'accent', fill: true });
    });
  },
});
