// theater — theater mode: a wide player frame with the play mark, arrows reaching out to its sides.
// off: the arrows rest inside; on: they push out to the edges and the frame lights.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';
import { chevron } from '../_tools.js';

export default defineGlyph({
  id: 'theater',
  title: 'Theater Mode',
  category: 'window',
  tags: ['theater', 'theater mode', 'wide', 'cinema', 'wide player', 'video'],
  states: { off: 'idle', on: 'active' },
  draw(g, s) {
    const on = s.state === 'on';
    const m = arrive(s.since, 0.4);
    const k = on ? m : 1 - m;
    g.rect(6.5, 13, 35, 22, { r: 4, role: on ? 'accent' : 'line' });
    g.polygon([[21.5, 19], [29.5, 24], [21.5, 29]], { role: 'fill', join: 'round' });
    const o = lerp(0, 2.5, k);
    g.polyline(chevron([12 - o, 24], 270, 4.5, 45), { role: 'dim', join: 'round' });
    g.polyline(chevron([36 + o, 24], 90, 4.5, 45), { role: 'dim', join: 'round' });
  },
});
