// scene — a stacked frame with a picture (a scene in a switcher). preview: the frame
// takes the preview tally (ok); live: it is taken to program — the frame cuts forward
// from the stack and wears the on-air tally (alert); off: quiet.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp } from '../../scene/easing.js';

export default defineGlyph({
  id: 'scene',
  title: 'Scene',
  category: 'stream',
  tags: ['scene', 'switcher', 'program', 'preview', 'layout', 'stream'],
  states: { off: 'idle', preview: 'ok', live: 'alert' },
  loop: 1.2,
  draw(g, s) {
    const lit = s.state !== 'off';
    const k = arrive(s.since, 0.4);
    // the stack behind: the back frame's top + right edges, stopping short of the front frame
    g.path('M13.5 12.5V13A3 3 0 0 1 16.5 10H37A3 3 0 0 1 40 13V27A3 3 0 0 1 37 30H36.5', { role: 'dim' });
    // live: the front frame cuts forward out of the back position
    const dx = s.state === 'live' ? lerp(6, 0, k) : 0, dy = s.state === 'live' ? lerp(-5, 0, k) : 0;
    g.group({ x: dx, y: dy }, () => {
      g.rect(7, 15, 26.5, 20, { r: 3.5, role: lit ? 'accent' : 'line' });
      g.polyline([[11.5, 30.5], [17.5, 23.5], [21.5, 27.5], [24.5, 25], [29, 30.5]], { role: lit ? 'line' : 'dim', weight: 0.8 });
      g.dot(26.5, 20.5, 1.9, { role: lit ? 'spark' : 'dim' });
    });
  },
});
