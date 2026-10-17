// chapter-prev — Previous Chapter: see _chapter.js for the drawing and motion.
import { defineGlyph } from '../_glyph.js';
import { drawChapter } from './_chapter.js';

export default defineGlyph({
  id: 'chapter-prev',
  title: 'Previous Chapter',
  category: 'media',
  tags: ['previous chapter', 'chapter', 'chapters', 'back', 'section', 'timeline', 'video'],
  draw(g, s) { drawChapter(g, s, -1); },
});
