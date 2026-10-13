// prism-term/web — browser runtime: a pixel-exact terminal renderer and a
// live facet player. Browser-only (uses Canvas2D, requestAnimationFrame and
// IntersectionObserver); the engine modules it imports are shared with Node.

export { TermCanvas, renderToCanvas, fitCells, FONT_STACK } from './renderer.js';
export { FacetPlayer, mountFacet, setGlobalMotion, isGlobalMotionPaused, prefersReducedMotion, playerStats, WEB_CAPS } from './player.js';
export { parseAnsi } from './ansi.js';
export { glyphClass, blockGeometry, brailleDots, sextantCells, boxGeometry } from './glyphs.js';
