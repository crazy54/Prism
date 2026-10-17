// zoom-reset — the magnifier carrying its mark (Actual Size). Arriving, the mark grows into the lens; a press pulses the lens.
import { defineGlyph } from '../_glyph.js';
import { drawZoom } from './_zoom.js';

export default defineGlyph({
  id: 'zoom-reset',
  title: 'Actual Size',
  category: 'nav',
  tags: ['zoom reset', 'actual size', '100%', '1:1', 'zoom', 'reset'],
  draw(g, s) { drawZoom(g, s, 'reset'); },
});
