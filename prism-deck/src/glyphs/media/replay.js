// replay — a circular arrow holding its mark (Replay). Arriving, the arrow winds round to its head; a press spins it on.
import { defineGlyph } from '../_glyph.js';
import { drawSeek } from './_seek.js';

export default defineGlyph({
  id: 'replay',
  title: 'Replay',
  category: 'media',
  tags: ['replay', 'instant replay', 'replay buffer', 'save replay', 'again', 'clip', 'media'],
  draw(g, s) { drawSeek(g, s, -1, 'play'); },
});
