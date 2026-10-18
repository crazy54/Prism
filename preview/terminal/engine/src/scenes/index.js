// Back-compat shim: scenes are terminal facets now (src/facets/). Kept so code
// written against the original registry keeps working.
export { loadScenes, findScene, allFacets, findFacet } from '../facets/index.js?v=a917677388';
export const CATEGORY_ORDER = [];
