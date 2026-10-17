// D8 game pieces — pictograms on the 48-unit glyph grid (safe area 6–42), drawn with glyph roles so
// every theme paints them like its icons (k.pictogram / converge). Silhouettes are distinct by shape,
// not just color, so the games read in monochrome themes and for color-blind players.
//
//   PIECES[i](pen, { role })   19 symbols for memory pairs and slot reels
//   PADS[i](pen, o)            6 simple shapes that tell Echo's pads apart
//   arrow(pen, dir)            a solid direction arrow ('left' | 'right' | 'up' | 'down')
//   mark(pen, 'x' | 'o', u)    tic-tac-toe marks, drawn in as u runs 0 → 1

import { polar } from '../../scene/shapes.js';

const ACC = { role: 'accent', fill: true };
const star = (cx, cy, R, r, k = 5, rot = 0) => Array.from({ length: k * 2 }, (_, i) => { const p = polar(cx, cy, i % 2 ? r : R, rot + (i * 180) / k); return [p.x ?? p[0], p.y ?? p[1]]; });
const ngon = (cx, cy, R, k, rot = 0) => Array.from({ length: k }, (_, i) => { const p = polar(cx, cy, R, rot + (i * 360) / k); return [p.x ?? p[0], p.y ?? p[1]]; });

export const PIECE_NAMES = ['prism', 'ring', 'diamond', 'star', 'hex', 'moon', 'bolt', 'wave', 'drop', 'leaf', 'cross', 'orbit', 'heart', 'eye', 'sun', 'flag', 'crown', 'cube', 'spark'];

export const PIECES = [
  // prism: a solid triangle with a lit edge
  (p) => { p.polygon([[24, 8], [41, 38], [7, 38]], ACC); p.line(24, 15, 15.5, 31, { role: 'spark', weight: 0.6, opacity: 0.8 }); },
  (p) => { p.circle(24, 24, 14, { role: 'accent', weight: 1.7 }); p.dot(24, 24, 4.5); },
  (p) => { p.polygon([[24, 6.5], [40.5, 24], [24, 41.5], [7.5, 24]], ACC); },
  (p) => { p.polygon(star(24, 25.5, 18, 7.6), ACC); },
  (p) => { p.polygon(ngon(24, 24, 17, 6, 30), ACC); p.polygon(ngon(24, 24, 7, 6, 30), { role: 'spark' }); },
  (p) => { p.path('M28.5 8.4 A16 16 0 1 0 40.6 31 A12.5 12.5 0 1 1 28.5 8.4 Z', ACC); },
  (p) => { p.polygon([[29, 6], [12, 28], [23, 28], [19, 42], [37, 19], [26, 19]], ACC); },
  (p) => { p.path('M7 21 C11 12 16 12 19.5 21 C23 30 28 30 31.5 21 C35 12 39 12 41 17', { role: 'accent', weight: 1.5 }); p.path('M7 32 C11 23 16 23 19.5 32 C23 41 28 41 31.5 32 C35 23 39 23 41 28', { role: 'accent', weight: 1.5, opacity: 0.55 }); },
  (p) => { p.path('M24 6.5 C30 15 36.5 21.5 36.5 29 A12.5 12.5 0 0 1 11.5 29 C11.5 21.5 18 15 24 6.5 Z', ACC); p.dot(19, 29, 2.4); },
  (p) => { p.path('M9 39 C9 20 21 9 40 9 C40 28 28 39 9 39 Z', ACC); p.line(13, 35, 30, 18, { role: 'spark', weight: 0.6, opacity: 0.85 }); },
  (p) => { p.polygon([[18.5, 7], [29.5, 7], [29.5, 18.5], [41, 18.5], [41, 29.5], [29.5, 29.5], [29.5, 41], [18.5, 41], [18.5, 29.5], [7, 29.5], [7, 18.5], [18.5, 18.5]], ACC); },
  (p) => { p.group({ rotate: -28 }, (g) => g.ellipse(24, 24, 18, 7.5, { role: 'accent', weight: 1.3 })); p.circle(24, 24, 6, ACC); },
  (p) => { p.path('M24 40.5 C10 31 6.5 23 6.5 17.5 A9 9 0 0 1 24 13.5 A9 9 0 0 1 41.5 17.5 C41.5 23 38 31 24 40.5 Z', ACC); },
  (p) => { p.path('M6 24 C13 12.5 35 12.5 42 24 C35 35.5 13 35.5 6 24 Z', { role: 'accent', weight: 1.3 }); p.circle(24, 24, 6.5, ACC); p.dot(26.5, 21.5, 1.8); },
  (p) => { p.circle(24, 24, 8.5, ACC); for (let i = 0; i < 8; i++) { const a = polar(24, 24, 12.5, i * 45), b = polar(24, 24, 17.5, i * 45); p.line(a.x ?? a[0], a.y ?? a[1], b.x ?? b[0], b.y ?? b[1], { role: 'accent', weight: 1.1 }); } },
  (p) => { p.line(13, 7, 13, 42, { role: 'accent', weight: 1.2 }); p.polygon([[13, 8], [39, 15.5], [13, 26]], ACC); },
  (p) => { p.polygon([[7, 37], [7, 14], [16, 24], [24, 9], [32, 24], [41, 14], [41, 37]], ACC); },
  (p) => { p.polygon(ngon(24, 24, 17.5, 6, 0), { role: 'accent', weight: 1.2 }); p.polyline([[24, 24], [24, 41.5]], { role: 'accent', weight: 1.1 }); p.polyline([[8.8, 15.2], [24, 24], [39.2, 15.2]], { role: 'accent', weight: 1.1 }); p.polygon([[24, 6.5], [39.2, 15.2], [24, 24], [8.8, 15.2]], { role: 'accent', fill: true, opacity: 0.6 }); },
  (p) => { p.path('M24 6 C25.5 17 31 22.5 42 24 C31 25.5 25.5 31 24 42 C22.5 31 17 25.5 6 24 C17 22.5 22.5 17 24 6 Z', ACC); },
];

/** Echo's pad shapes (one per pad, so pads differ by shape as well as by hue). */
export const PADS = [
  (p, o = {}) => p.circle(24, 24, 13, { role: 'accent', fill: !!o.fill, weight: 1.2 }),
  (p, o = {}) => p.polygon([[24, 9.5], [38.5, 36], [9.5, 36]], { role: 'accent', fill: !!o.fill, weight: 1.2, join: 'round' }),
  (p, o = {}) => p.rect(11.5, 11.5, 25, 25, { role: 'accent', fill: !!o.fill, weight: 1.2, r: 3 }),
  (p, o = {}) => p.polygon([[24, 8], [40, 24], [24, 40], [8, 24]], { role: 'accent', fill: !!o.fill, weight: 1.2, join: 'round' }),
  (p, o = {}) => p.polygon(ngon(24, 24, 15, 6, 30), { role: 'accent', fill: !!o.fill, weight: 1.2, join: 'round' }),
  (p, o = {}) => p.polygon(star(24, 25, 16, 7, 5), { role: 'accent', fill: !!o.fill, weight: 1.1, join: 'round' }),
];

const ARROWS = { up: [[24, 11], [38, 33], [10, 33]], down: [[24, 37], [38, 15], [10, 15]], left: [[11, 24], [33, 10], [33, 38]], right: [[37, 24], [15, 10], [15, 38]] };
/** A solid direction arrow. */
export function arrow(p, dir, o = {}) { p.polygon(ARROWS[dir], { role: o.role || 'line', fill: true, join: 'round', opacity: o.opacity }); }

/** Tic-tac-toe marks drawn in (u 0 → 1): X as two crossing beams, O as a ring that closes. */
export function mark(p, kind, u = 1) {
  if (kind === 'x') {
    const a = Math.min(1, u * 2), b = Math.max(0, u * 2 - 1);
    if (a > 0) p.line(12, 12, 12 + 24 * a, 12 + 24 * a, { role: 'accent', weight: 1.55 });
    if (b > 0) p.line(36, 12, 36 - 24 * b, 12 + 24 * b, { role: 'accent', weight: 1.55 });
  } else if (u >= 0.999) p.circle(24, 24, 12.5, { role: 'accent', weight: 1.55 });
  else if (u > 0.01) p.arc(24, 24, 12.5, 0, Math.max(1, 359.9 * u), { role: 'accent', weight: 1.55 });
}
