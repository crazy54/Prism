// scroll-top — an arrow against its stop bar (Scroll to Top). Arriving, the arrow slides toward the bar; a press nudges it home.
import { defineGlyph } from '../_glyph.js';
import { drawArrow } from './_arrow.js';

export default defineGlyph({
  id: 'scroll-top',
  title: 'Scroll to Top',
  category: 'nav',
  tags: ['top', 'scroll to top', 'page top', 'first', 'home', 'navigation'],
  draw(g, s) { drawArrow(g, s, 0, { bar: true }); },
});
