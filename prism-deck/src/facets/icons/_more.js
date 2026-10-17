// Icons for the glyph families added in the Prism Play glyph pass (build · edit · window · game).
// Same as iconFacet; a glyph whose category has no Icons gallery category yet (galleries.js
// GLYPH_CATEGORIES) is filed under the nearest existing one until the gallery grows its own. They sort
// after the original set within each category (order 60), so showcases and pickers lead with the originals.
//
//   // src/facets/icons/loop.js
//   import { moreIcon } from './_more.js';
//   export default moreIcon('loop');
import { iconFacet } from './_icon.js';
import { getGlyph } from '../../glyphs/_registry.js';
import { GLYPH_CATEGORIES } from '../galleries.js';

const NEAREST = { build: 'Productivity', edit: 'Productivity', window: 'System', game: 'Navigation' };

export function moreIcon(glyphId, extra = {}) {
  const f = iconFacet(glyphId, { order: 60, ...extra });
  const cat = getGlyph(glyphId).category;
  return GLYPH_CATEGORIES[cat] || !NEAREST[cat] ? f : { ...f, category: NEAREST[cat] };
}
