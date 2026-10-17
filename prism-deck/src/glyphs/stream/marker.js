// marker — a flag planted at the playhead of a timeline (drop a stream marker).
// ready: an outlined flag over the scrub bar. marked: the flag drops in, plants with a
// ripple on the timeline, fills with light and keeps a gentle wave.
import { defineGlyph } from '../_glyph.js';
import { arrive, lerp, clamp, outExpo } from '../../scene/easing.js';

const PX = 17, BASE = 38, TOP = 10;

export default defineGlyph({
  id: 'marker',
  title: 'Marker',
  category: 'stream',
  tags: ['marker', 'bookmark', 'flag', 'highlight', 'clip', 'timeline', 'stream'],
  states: { ready: 'idle', marked: 'ok' },
  loop: 2.4,
  draw(g, s) {
    const marked = s.state === 'marked';
    // the timeline: played part in ink, the rest dim
    g.line(8, BASE, PX, BASE, { role: 'line' });
    g.line(PX, BASE, 40, BASE, { role: 'dim' });
    const drop = marked ? outExpo(clamp(s.since / 0.45)) : 1;
    const wave = marked ? Math.sin((s.t / 2.4) * Math.PI * 2) * 0.9 : 0;
    g.group({ y: lerp(-6, 0, drop), opacity: lerp(0.2, 1, drop) }, () => {
      g.line(PX, BASE - 1.5, PX, TOP, { role: 'line' });
      const flag = [[PX, TOP], [36, TOP + wave], [31.5, 16.5 - wave * 0.4], [36, 23 + wave], [PX, 23]];
      if (marked) g.polygon(flag, { role: 'accent', fill: true, opacity: lerp(0.4, 1, drop) });
      g.polygon(flag, { role: marked ? 'accent' : 'line', join: 'round' });
    });
    if (marked && s.since < 0.9) {
      // the plant: a ripple spreads along the timeline from the pole's foot
      const e = outExpo(clamp((s.since - 0.18) / 0.7));
      if (e > 0) g.ellipse(PX, BASE, lerp(2, 11, e), lerp(0.8, 3.2, e), { role: 'accent', weight: 0.6, opacity: 1 - e });
    }
  },
});
