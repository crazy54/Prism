// Scene context — everything a scene's setup() receives.
//
// Scene contract (src/scenes/*.js default-export):
//   {
//     id, title, category, description,
//     canvas:  default canvas kind for ctx.canvas(): 'field' | 'line' | 'hires' | a mode name
//     palette: default palette name for ctx.palette()
//     order:   sort key within its category (optional)
//     setup(ctx) → frame(t, dt)   // frame draws the whole picture into ctx.buffer
//   }
// The runner clears ctx.buffer to ctx.bg before every frame, and re-runs setup()
// on resize / theme / mode changes, so scenes never handle those themselves.

import { NONE } from './color.js';
import { Canvas, pickMode, ASCII_RAMP, MONO_RAMP } from './canvas.js';
import { getTheme, palette as makePalette } from './palettes.js';
import { rng } from './easing.js';
import { createNoise } from './noise.js';
import { asciiSurface } from './ascii.js';

/**
 * @param {object} o { scene, buffer, caps, theme, mode, transparent, params, seed }
 */
export function createContext({ scene = {}, buffer, caps = {}, theme, mode = null, transparent = false, params = {}, seed = 7 }) {
  const th = getTheme(theme);
  // Mono depth: canvases painted into this buffer (also ones a facet builds itself)
  // shade by luminance instead of color (src/canvas.js monoHint / _paintMono).
  const monoPaint = caps.depth === 'mono' ? { ramp: caps.unicode === false ? ASCII_RAMP : MONO_RAMP, ref: th.bg } : null;
  if (buffer) buffer.monoPaint = monoPaint;
  // Light terminal (Day themes): at 16 colors white / bright-white text stays off the default
  // background (src/color.js ansi16Text). The serializers read it from the root buffer.
  let root = buffer;
  for (let i = 0; root && (root.parent || root.inner) && i < 16; i++) root = root.parent || root.inner;
  if (root) root.light16 = th.mode === 'light';
  // --transparent: the terminal's background shows through, so body text (ink) is sent as the
  // terminal's own foreground (SGR 39): readable whatever the background (src/buffer.js defaultInk).
  if (root) root.inkAsDefault = transparent ? th.ink : null;
  // On terminals without Unicode every glyph a facet draws is folded to 7-bit
  // ASCII on the way in (src/ascii.js), so no facet can break a TERM=linux console.
  if (caps.unicode === false) buffer = asciiSurface(buffer);
  const ctx = {
    width: buffer.width,
    height: buffer.height,
    buffer,
    theme: th,
    caps,
    mode,
    params,
    seed,
    bg: transparent ? NONE : th.bg,
    rng: rng(seed),
    noise: createNoise(seed),
    /** Full-screen (or cols×rows) canvas in the user's forced mode, else the best mode for `kind`. */
    canvas(kind = scene.canvas || 'field', opts = {}) {
      const { cols = ctx.width, rows = ctx.height, ...rest } = opts;
      const m = mode || pickMode(kind, caps);
      // A color field forced into braille would be a wall of ⣿ — ordered dithering
      // turns brightness into dot density instead, which reads as halftone shading.
      const dither = m === 'braille' && (kind === 'field' || kind === 'hires');
      // Mono depth: no color to carry the picture, so block modes paint a luminance
      // ramp instead of half-block / mosaic shapes (src/canvas.js _paintMono).
      return new Canvas(cols, rows, { mode: m, dither, mono: monoPaint, ...rest });
    },
    /** Gradient: `--set palette=…` beats the scene default. */
    palette(name, opts) {
      return makePalette(params.palette || name || scene.palette || 'prism', th, opts);
    },
    /** Numeric/string param with default: ctx.param('speed', 1). */
    param(key, def) {
      if (!(key in params)) return def;
      const v = params[key];
      return typeof def === 'number' ? Number(v) : typeof def === 'boolean' ? !/^(0|false|no|off)$/i.test(v) : v;
    },
  };
  return ctx;
}
