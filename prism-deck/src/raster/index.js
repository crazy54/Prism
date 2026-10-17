// prism-deck raster backend — zero dependencies (PNG compression uses node:zlib when present).
//
//   rasterize(svg, w?, h?, opts?)        → { data: RGBA, w, h }   the deck SVG subset, anti-aliased
//   encodePNG(img, opts?)                → Uint8Array             icon packs, previews, goldens
//   encodeGIF(frames, opts?)             → Uint8Array             animated icon packs (ship a PNG twin)
//   encodeJPEG(img, quality?, opts?)     → Uint8Array             gen-2 hidraw keys / strips / screens
//   encodeBMP(img, variant?, opts?)      → Uint8Array             gen-1 hidraw keys (2017 original, Mini family)
//   encodeKeyImage(img, model)           → Uint8Array             one call for a hidraw model { fmt, xf, ppm, quality }
//   transformImage(img, xf)              → img                    none | rot180 | mirrorX | ccw90 (| mirrorY | cw90)
//   decodePNG / decodeGIF / decodeJPEG / decodeBMP, diffImages, flattenImage

export { rasterize, parseSvg, RasterError, SUBSET_ELEMENTS, SUBSET_ATTRIBUTES } from './rasterize.js';
export { encodePNG, decodePNG, crc32 } from './png.js';
export { encodeGIF, decodeGIF } from './gif.js';
export { encodeJPEG, decodeJPEG } from './jpeg.js';
export { encodeBMP, decodeBMP, BMP_PRESETS } from './bmp.js';
export { transformImage, flattenImage, diffImages, diffImage, TRANSFORMS } from './image.js';
export { buildPalette } from './quantize.js';

import { encodeJPEG } from './jpeg.js';
import { encodeBMP } from './bmp.js';
import { transformImage } from './image.js';

/**
 * Encode a rendered key / strip / screen image the way a hidraw model expects it.
 * model: { fmt: 'jpeg' | 'bmp', xf: 'none' | 'rot180' | 'mirrorX' | 'ccw90', ppm?, quality? (90), subsampling? ('444') }
 * — the same shape as the MODELS table in linux.md §2.8 (its `lcd` entries work too).
 */
export function encodeKeyImage(img, model = {}) {
  const fmt = model.fmt || 'jpeg', xf = model.xf || 'none';
  if (fmt === 'bmp') return encodeBMP(img, xf, { ppm: model.ppm });
  if (fmt !== 'jpeg') throw new Error(`encodeKeyImage: unknown format "${fmt}"`);
  return encodeJPEG(xf === 'none' ? img : transformImage(img, xf), model.quality ?? 90, { subsampling: model.subsampling || '444' });
}
