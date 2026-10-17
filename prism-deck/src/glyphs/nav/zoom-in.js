// zoom-in — the magnifier carrying its mark (Zoom In). Arriving, the mark grows into the lens; a press pulses the lens.
import { defineGlyph } from '../_glyph.js';
import { drawZoom } from './_zoom.js';

export default defineGlyph({
  id: 'zoom-in',
  title: 'Zoom In',
  category: 'nav',
  tags: ['zoom in', 'zoom', 'magnify', 'enlarge', 'bigger', 'plus'],
  draw(g, s) { drawZoom(g, s, 'in'); },
});
