// rewind-10 — a circular arrow holding its mark (Back 10 s). Arriving, the arrow winds round to its head; a press spins it on.
import { defineGlyph } from '../_glyph.js';
import { drawSeek } from './_seek.js';

export default defineGlyph({
  id: 'rewind-10',
  title: 'Back 10 s',
  category: 'media',
  tags: ['rewind 10', 'back 10', 'skip back', 'seek back', 'rewind', '10 seconds', 'media'],
  draw(g, s) { drawSeek(g, s, -1, '10'); },
});
