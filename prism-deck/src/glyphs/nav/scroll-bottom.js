// scroll-bottom — an arrow against its stop bar (Scroll to Bottom). Arriving, the arrow slides toward the bar; a press nudges it home.
import { defineGlyph } from '../_glyph.js';
import { drawArrow } from './_arrow.js';

export default defineGlyph({
  id: 'scroll-bottom',
  title: 'Scroll to Bottom',
  category: 'nav',
  tags: ['bottom', 'scroll to bottom', 'page bottom', 'last', 'end', 'navigation'],
  draw(g, s) { drawArrow(g, s, 180, { bar: true }); },
});
