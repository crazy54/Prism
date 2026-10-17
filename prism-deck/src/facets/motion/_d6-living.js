// D6's living-key kit (idle-candle, idle-snowglobe, idle-firefly, idle-lava).
//
// Living keys are single keys that never stop being alive — a candle, a snow globe, a pair of
// fireflies, a lava lamp — so they're built for the hardware's per-key ceiling: ≤ 8 fps,
// a handful of elements, and (on the pixel theme) motion that steps on the theme's lattice.
//
//   dots(k, pts, paint)       merge many small dots into one path (squares on the pixel lattice)
//   glow(k, x, y, r, color, o) a soft radial light (one gradient, one element)
//
// Path helpers come from the wall kit (../spans/_d6-wall.js).

import { radialGradient, url, n } from '../../scene/index.js';
import { cellOf, themeBox, squaresPath, glyphId, litState, restState, glyphTime } from './_d2-motion.js';
import { dotD, ellipseD, polyD, rectD, lineD, f1, fillP, strokeP, qo, isoPaths } from '../spans/_d6-wall.js';

export { cellOf, themeBox, squaresPath, glyphId, litState, restState, glyphTime, dotD, ellipseD, polyD, rectD, lineD, f1, fillP, strokeP, qo, isoPaths };

/** Many small dots as one path; on the pixel theme each becomes a lattice square. */
export function dots(k, pts, paint, cell = 0) {
  if (!pts.length) return;
  let d = '';
  if (cell) {
    const seen = new Set();
    for (const [x, y] of pts) {
      const gx = Math.round(x / cell - 0.5) * cell, gy = Math.round(y / cell - 0.5) * cell, key = `${gx},${gy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      d += squaresPath([[gx, gy]], cell);
    }
  } else for (const [x, y, r] of pts) d += dotD(x, y, r);
  if (d) k.add(`<path d="${d}" ${paint}/>`);
}

/** A soft radial light centered on (x, y): one gradient def + one element. */
export function glow(k, x, y, r, color, o = 1, name = 'glow', stops = [[0, 0.55], [0.35, 0.22], [1, 0]]) {
  if (o <= 0.01) return;
  const id = k.id(name);
  k.def(radialGradient(id, stops.map(([s, a]) => [s, color, n(a * Math.min(1, o), 2)])));
  k.add(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${url(id)}"/>`);
}
