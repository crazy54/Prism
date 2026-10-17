// zoom-out — the magnifier carrying its mark (Zoom Out). Arriving, the mark grows into the lens; a press pulses the lens.
import { defineGlyph } from '../_glyph.js';
import { drawZoom } from './_zoom.js';

export default defineGlyph({
  id: 'zoom-out',
  title: 'Zoom Out',
  category: 'nav',
  tags: ['zoom out', 'zoom', 'shrink', 'smaller', 'minus'],
  draw(g, s) { drawZoom(g, s, 'out'); },
});
