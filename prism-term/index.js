// prism-term — public API.
//
// Layers, bottom to top:
//   color / caps / ansi / width      terminal facts: colors, capabilities, escapes, glyph widths
//   CellBuffer / View                the in-memory screen
//   Canvas                           sub-cell pixels → braille | sextant | quad | half | ascii
//   Screen                           flicker-free diff renderer (fullscreen or inline)
//   facets / play / gallery          the terminal catalog and the interactive player
//   ascii                            7-bit folding for terminals without Unicode
//   widgets / spinners / inline      dashboards and CLI feedback (spinner, progress, tasks)
//   text                             bitmap fonts, banners, text effects
//   export                           frames → self-contained HTML (back into Prism)

export * from './src/color.js';
export { detect, withOverrides } from './src/caps.js';
export { reset, cursor, screen as screenCodes, title, stripAnsi } from './src/ansi.js';
export { charWidth, stringWidth, truncate, wrap } from './src/width.js';
export { CellBuffer, View, Surface, ATTR, parseAttr } from './src/buffer.js';
export { Canvas, MODES, MODE_NAMES, pickMode, ASCII_RAMP } from './src/canvas.js';
export { Screen } from './src/screen.js';
export { ticker, sleep } from './src/loop.js';
export { easing, clamp, lerp, smoothstep, fract, remap, pingpong, tween, rng } from './src/easing.js';
export { createNoise, noise2, noise3, fbm } from './src/noise.js';
export { v3, rotate, projector, meshes } from './src/math3d.js';
export { getTheme, listThemes, THEME_IDS, DEFAULT_THEME_ID, PALETTES, PALETTE_NAMES, palette, defaultThemeId, terminalScheme, fadeMark, legible, contrastRatio, TERMINAL_SCHEMES, SPECTRUM } from './src/palettes.js';
export { detectTheme, detectThemeSync, detectedTheme, queryBackground, parseColorFgBg, parseOscColor } from './src/theme-detect.js';
export { exportTheme, schemeFor, FORMATS, formatId, themeFileName } from './src/theme-export.js';
export { createContext } from './src/context.js';
export { foldChar, foldText, asciiSurface } from './src/ascii.js';
export { allFacets, findFacet, catalogTree, searchFacets, GALLERIES, getGallery } from './src/facets/index.js';
export { loadScenes, findScene } from './src/scenes/index.js';
export { renderScene, renderFrames } from './src/render.js';
export { toHtml, toAnimatedHtml, frameHtml } from './src/export.js';
export { play, createPlayer } from './src/player.js';
export { gallery } from './src/gallery.js';
export * from './src/widgets/index.js';
export { SPINNERS, SPINNER_NAMES, getSpinner, spinnerFrame, spinnerWidth, drawSpinner } from './src/spinners.js';
export { spinner, progress, tasks, thinking, typewrite, isInteractive, symbols } from './src/inline.js';
export {
  FONTS, FONT_NAMES, getFont, glyph, hasGlyph, defineFont,
  BANNER_MODES, banner, bannerCanvas, drawBanner, measureBanner, gradientText, layoutText, resolveFill,
  EFFECTS, EFFECT_NAMES, effectDuration, animateText,
} from './src/text/index.js';
// Individual text effects (typewriter, decrypt, glitch, wave, rainbow, shimmer, …) under one namespace.
export * as textEffects from './src/text/effects.js';
