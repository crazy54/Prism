// chapter-next — Next Chapter: see _chapter.js for the drawing and motion.
import { defineGlyph } from '../_glyph.js';
import { drawChapter } from './_chapter.js';

export default defineGlyph({
  id: 'chapter-next',
  title: 'Next Chapter',
  category: 'media',
  tags: ['next chapter', 'chapter', 'chapters', 'skip', 'section', 'timeline', 'video'],
  draw(g, s) { drawChapter(g, s, 1); },
});
