// pip — picture in picture: a small solid player in the corner of the frame. off: it sits docked,
// outlined; on: it pops out, lit. The change animates both ways.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';
import { frame } from './_frame.js';

export default defineGlyph({
  id: 'pip',
  title: 'Picture in Picture',
  category: 'window',
  tags: ['pip', 'picture in picture', 'miniplayer', 'mini player', 'float', 'video', 'overlay'],
  states: { off: 'idle', on: 'active' },
  draw(g, s) {
    const on = s.state === 'on';
    const m = arrive(s.since, 0.4);
    const k = on ? m : 1 - m;
    frame(g);
    const w = lerp(11, 14, k), h = lerp(8, 10, k);
    g.rect(36.5 - w, 34 - h, w, h, { r: 2.5, role: on ? 'accent' : 'fill', fill: true, opacity: lerp(0.75, 1, k) });
  },
});
