// prism-deck — Stream Deck facets from Prism: deterministic SVG for keys, spans of
// keys, touch strips, screens and whole devices; glyphs × themes; every device.
// Browser-safe: the same modules run in Node (plugin, tests, tools) and browsers.

export const API_VERSION = '1.6';

export { render, renderFacet, renderWithContext, renderKey, renderSpan, renderStrip, renderScreen, renderDeck, stillTime, nextState } from './src/render.js';
export { createContext, resolveParams, clockOf, screenTarget, SCREEN_TARGETS } from './src/scene/context.js';
export * from './src/devices.js';
export { allFacets, findFacet, catalogTree, searchFacets, GALLERIES, getGallery } from './src/facets/index.js';
export { SURFACES, PARAM_TYPES, DATA_KEYS, renderTargets, normalizeFacet, validateFacet } from './src/facets/schema.js';
export { allThemes, useTheme, themeRegistry, DEFAULT_THEME } from './src/themes/_registry.js';
export { defineTheme, helpers as themeHelpers } from './src/themes/_theme.js';
export { allGlyphs, getGlyph, glyphRegistry, glyphCategories } from './src/glyphs/_registry.js';
export { defineGlyph, drawGlyph, Pen, GRID, SAFE, ROLES } from './src/glyphs/_glyph.js';
export { validateSvg, parseXml } from './src/scene/validate.js';
export { toDeviceSvg } from './src/scene/qt.js';   // run every frame through it before setImage / setFeedback (Qt quirks)
export { createGameHost, replayGame, gameArgs, gameGrid, rngSeed, rngNext, rngInt, rngShuffle, mix32, isPlainJson, GAME_EVENTS, TICK_MAX_HZ, GAME_STATE_MAX, GAME_FPS, GAME_RESET_HOLD_S } from './src/scene/game.js';   // stateful facets (API 1.5)
export { createScheduler, effectiveFps, quantize, FPS_CAP, createChangeGovernor } from './src/scene/scheduler.js';
export { createLinkBus, linksOf, validateLink, readoutOf, LINK_CHANNELS } from './src/scene/link.js';   // linked state (API 1.6)
export { deviceMarkup, DEVICE_CSS, infobarSvg } from './src/scene/device-view.js';
export { TOKENS } from './src/scene/tokens.js';
export * as scene from './src/scene/index.js';
