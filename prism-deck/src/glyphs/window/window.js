// window — an app window: the frame, its header, two lines of content. Arriving, the content lines
// write in under the header; a press lights the header (the window comes to the front).
import { defineGlyph } from '../_glyph.js';
import { frame, header, motion, lerp } from './_frame.js';

export default defineGlyph({
  id: 'window',
  title: 'Window',
  category: 'window',
  tags: ['window', 'app', 'switch window', 'window 1', 'focus', 'task', 'desktop'],
  draw(g, s) {
    const { k, p } = motion(s);
    frame(g);
    header(g, { role: p > 0.3 ? 'accent' : 'line' });
    g.dot(11.5, 12.75, 1.3, { role: 'fill' });
    g.dot(15.5, 12.75, 1.3, { role: 'fill', opacity: 0.6 });
    g.line(12.5, 23.5, lerp(12.5, 33, k), 23.5, { role: 'dim' });
    g.line(12.5, 30.5, lerp(12.5, 26, k), 30.5, { role: 'dim' });
  },
});
