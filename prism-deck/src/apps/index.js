// Prism Deck apps — live data for facets, routing, and the app catalog. Browser-safe entry
// (Node-only live sources: ./sources/node.js → createNodeHub()).
//
//   import { createSimulatedHub, galleonPlan, planData, renderGalleon, APPS } from './src/apps/index.js';

import { allFacets } from '../facets/index.js';

export * from './sources/index.js';
export { GALLEON_SLOTS, DEFAULT_ROUTES, galleonPlan, planData, renderGalleon, composeScreen } from './routing.js';
export { WIDGETS, WIDGET_KINDS } from '../facets/apps/_widgets.js';

/** The apps gallery's facets, with the data keys each consumes. */
export const APPS = () => allFacets().filter((f) => f.gallery === 'apps').map((f) => ({ id: f.id, title: f.title, category: f.category, surface: f.surface, data: f.data || [] }));
