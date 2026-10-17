// forward-10 — a circular arrow holding its mark (Forward 10 s). Arriving, the arrow winds round to its head; a press spins it on.
import { defineGlyph } from '../_glyph.js';
import { drawSeek } from './_seek.js';

export default defineGlyph({
  id: 'forward-10',
  title: 'Forward 10 s',
  category: 'media',
  tags: ['forward 10', 'skip forward', 'seek forward', 'fast forward', 'ff', '10 seconds', 'media'],
  draw(g, s) { drawSeek(g, s, 1, '10'); },
});
