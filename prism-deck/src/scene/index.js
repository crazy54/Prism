// The scene API — one import for facet, theme and glyph authors:
//
//   import { surface, path, rect, P, url, linearGradient, textPath, lerp, phase } from '../../scene/index.js';
//
// Everything here is pure (no DOM, no Node built-ins), deterministic, and emits the
// deck SVG subset (scene/validate.js), so frames look identical in the Stream Deck
// app, browsers and the raster backend.

export { surface, KeySurface, PanelSurface, metricsFor } from './surface.js';
export { compose, keyInto } from './compose.js';
export {
  n, esc, attrs, el, g, defs, rect, circle, ellipse, line, path, polyline, polygon, points, url,
  linearGradient, radialGradient, fill, stroke, translate, rotate, scale, P, roundRectPath,
  svgDoc, SvgCanvas, svgInner, svgWindow, suffixIds, base64, svgDataUrl,
} from './svg.js';
export { textPath, textOutline, measureText, fitText, wrapText, ellipsize, capHeight, xHeight, compact, pad2, clockText, layout as textLayout } from './text.js';
export { polar, arcPath, sectorPath, arc, ring, spectrumArc, ticks, needle, sparkPoints, sparkPath, sparkHead, sparkline, bars, segments, hairline, spectrumStops, glowStops } from './shapes.js';
export { parseHex, toHex, hexToOklab, oklabToHex, hexToOklch, oklch, mix, shade, saturate, luminance, contrast, bestInk, lambdaOf, hueRamp } from './color.js';
export * from './easing.js';
export { rng, hash, noise1, noise2, fbm1, metric, series } from './noise.js';
export { parsePath, flattenPath, pathBounds, insidePolys, distToPolys, transformPath } from './geom.js';
export { toDeviceSvg } from './qt.js';
