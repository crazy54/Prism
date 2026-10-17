// captions — closed captions: a screen frame holding two C marks. off: outlined. on: frame and marks
// light and the caption bar draws in under the frame (no tint behind the marks: they must read in
// themes that paint every role in one ink).
import { defineGlyph } from '../_glyph.js';
import { arrive } from '../../scene/easing.js';

export default defineGlyph({
  id: 'captions',
  title: 'Captions',
  category: 'productivity',
  tags: ['captions', 'subtitles', 'cc', 'closed captions', 'transcript', 'accessibility', 'video'],
  states: { off: 'idle', on: 'active' },
  draw(g, s) {
    const on = s.state === 'on';
    const k = arrive(s.since, 0.35);
    g.rect(6.5, 10.5, 35, 24, { r: 4, role: on ? 'accent' : 'line' });
    g.arc(18.5, 22.5, 5.2, 135, 405, { role: on ? 'accent' : 'line', weight: 1.05 });
    g.arc(30.5, 22.5, 5.2, 135, 405, { role: on ? 'accent' : 'line', weight: 1.05 });
    if (on && k > 0.02) g.line(24 - 9 * k, 40, 24 + 9 * k, 40, { role: 'accent', weight: 1.05 });
  },
});
