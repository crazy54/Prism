// prism-deck/web — browser runtime: virtual devices and live tiles that play deck
// facets, plus an offline loader that runs everything straight from the
// #prism-deck-catalog JSON island (Prism.html). Browser-only, except core.js
// (pure helpers: dial math, gestures, fitting, labels, showcase layouts).

export { DeckView, KeyView, mountDevice, mountKey, setGlobalMotion, isGlobalMotionPaused, prefersReducedMotion, deckStats } from './player.js';
export { loadIsland, createModuleLoader } from './island.js';
export { createLinkBus } from '../scene/link.js';
export * from './core.js';
