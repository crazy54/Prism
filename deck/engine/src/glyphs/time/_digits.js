// Instrument digits for glyphs that show a number (calendar date, thermostat setpoint).
//
// A 3 × 5 stroke numeral drawn with rounded corners on a 2.4-unit lattice whose nodes
// are the cell centers of the deck's 15 × 15 pixel matrix (x = 7.2 + 2.4 · col). In
// vector themes it reads as a rounded LCD / instrument face; pixel and phosphor
// themes rasterize the same strokes into a clean 3 × 5 bitmap numeral instead of
// mush. Strings center on x = 24 (col 7) exactly: n digits span 4n − 1 cells.
import { P } from '../../scene/svg.js';

const K = 2 / 3; // quadratic → cubic control-point factor

const PITCH = 2.4, ORIGIN = 7.2;
export const col = (c) => ORIGIN + PITCH * c;
export const row = (r) => ORIGIN + PITCH * r;

// strokes per digit: lists of [x, y, cornerRadius] in lattice units (x 0–2, y 0–4); 'z' closes
const D = {
  0: [['z', [0, 0, 1], [2, 0, 1], [2, 4, 1], [0, 4, 1]]],
  1: [[[0, 1, 0], [1, 0, 0.35], [1, 4, 0]]],
  2: [[[0, 0, 0], [2, 0, 1], [2, 2, 1], [0, 2, 1], [0, 4, 0], [2, 4, 0]]],
  3: [[[0, 0, 0], [2, 0, 1], [2, 4, 1], [0, 4, 0]], [[1, 2, 0], [2, 2, 0]]],
  4: [[[0, 0, 0], [0, 2, 0.6], [2, 2, 0]], [[2, 0, 0], [2, 4, 0]]],
  5: [[[2, 0, 0], [0, 0, 0], [0, 2, 0], [2, 2, 1], [2, 4, 1], [0, 4, 0]]],
  6: [[[2, 0, 0], [0, 0, 1], [0, 4, 1], [2, 4, 1], [2, 2, 1], [0, 2, 0]]],
  7: [[[0, 0, 0], [2, 0, 0.3], [1, 2.6, 0.6], [1, 4, 0]]],
  8: [['z', [0, 0, 1], [2, 0, 1], [2, 2, 1], [0, 2, 1]], ['z', [0, 2, 1], [2, 2, 1], [2, 4, 1], [0, 4, 1]]],
  9: [[[0, 4, 0], [2, 4, 1], [2, 0, 1], [0, 0, 1], [0, 2, 1], [2, 2, 0]]],
};

function strokePath(list, ox, oy) {
  const closed = list[0] === 'z';
  const pts = (closed ? list.slice(1) : list).map(([x, y, r]) => [ox + x * PITCH, oy + y * PITCH, (r || 0) * PITCH]);
  const N = pts.length, p = P();
  const cut = (a, b, r) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, f = Math.min(r, l / 2) / l; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  for (let i = 0; i < N; i++) {
    const c = pts[i], r = c[2];
    const prev = closed ? pts[(i + N - 1) % N] : pts[i - 1], next = closed ? pts[(i + 1) % N] : pts[i + 1];
    if (!prev || !next || r < 0.01) { if (i === 0) p.M(c[0], c[1]); else p.L(c[0], c[1]); continue; }
    const a = cut(c, prev, r), b = cut(c, next, r);
    if (i === 0) p.M(...a); else p.L(...a);
    p.C(a[0] + (c[0] - a[0]) * K, a[1] + (c[1] - a[1]) * K, b[0] + (c[0] - b[0]) * K, b[1] + (c[1] - b[1]) * K, b[0], b[1]); // a rounded corner as a cubic (no Q: themes read Q as lettering)
  }
  if (closed) { const c = pts[0], r = c[2]; if (r >= 0.01) { const a = cut(c, pts[N - 1], r); p.L(...a); } p.Z(); }
  return p.d;
}

/** Draw a numeral string (digits only) centered on x = 24, top at lattice row `top`. */
export function digits(g, str, { top = 8, role = 'line', weight = 0.85, opacity = 1 } = {}) {
  const s = String(str).replace(/[^0-9]/g, '');
  const c0 = 7 - (4 * s.length - 1 - 1) / 2; // first digit's left column
  [...s].forEach((ch, i) => {
    for (const st of D[ch]) g.path(strokePath(st, col(c0 + i * 4), row(top)), { role, weight, opacity, join: 'round', cap: 'round', fill: false });
  });
}
