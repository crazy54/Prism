import { __m as __bm } from '../../../facets.bundle.js';
// The simulated Game Link source: the demo round (src/facets/gamelink/_gl-sim.js) as a hub source, so the
// plugin shows it, tagged DEMO, while Game Link is off — exactly what a Game Link facet draws on its own when
// ctx.data.gamelink is absent. Browser-safe (the web catalog's createSimulatedHub() includes it).

import { simulatedSource } from './_source.js';
const { simGameLink } = __bm(608);

/** ctx.data.gamelink — the fictional demo round on the wall clock (rate Hz). */
export function simulatedGameLink({ rate = 10, seed = 7, now } = {}) {
  return simulatedSource({ id: 'gamelink', provides: ['gamelink'], rate, seed, now, compute: (t) => ({ gamelink: simGameLink(t) }) });
}
