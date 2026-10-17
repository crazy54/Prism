// Shared geometry for the I3 glyph families (time · nav · productivity · home).
// Pure path math in grid units — no roles, no colors.
import { P } from '../../scene/svg.js';

const K = 2 / 3; // quadratic → cubic control-point factor
import { polar } from '../../scene/shapes.js';

/** A pie wedge from the center (degrees, 0 = 12 o'clock, clockwise a0 → a1). '' when empty. */
export function wedge(cx, cy, r, a0, a1) {
  const span = a1 - a0;
  if (span <= 0.25) return '';
  if (span >= 359.75) return P().M(cx, cy - r).A(r, r, 0, 0, 1, cx, cy + r).A(r, r, 0, 0, 1, cx, cy - r).Z().d;
  const [ax, ay] = polar(cx, cy, r, a0), [bx, by] = polar(cx, cy, r, a1);
  return P().M(cx, cy).L(ax, ay).A(r, r, 0, span > 180, true, bx, by).Z().d;
}

/** A smooth open path through points (Catmull-Rom → cubic), for wisps and cords. */
export function smooth(pts) {
  const p = P().M(...pts[0]);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i - 1] || pts[i], b = pts[i], c = pts[i + 1], d = pts[i + 2] || c;
    p.C(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]);
  }
  return p.d;
}

/** Point along a polyline at u (0–1 by length). */
export function along(pts, u) {
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  let d = Math.max(0, Math.min(1, u)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) { const f = seg[i] ? Math.min(1, d / seg[i]) : 0; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]; }
    d -= seg[i];
  }
  return pts[pts.length - 1];
}

/** Sample an arc into points (for along()). */
export function arcPoints(cx, cy, r, a0, a1, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, i) => polar(cx, cy, r, a0 + ((a1 - a0) * i) / steps));
}

/** A closed polygon with rounded corners (radius per corner, or one radius for all). */
export function roundedPoly(pts, radii) {
  const N = pts.length, rs = Array.isArray(radii) ? radii : pts.map(() => radii || 0);
  const p = P();
  const cut = (a, b, r) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, f = Math.min(r, l / 2) / l; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; };
  for (let i = 0; i < N; i++) {
    const prev = pts[(i + N - 1) % N], c = pts[i], next = pts[(i + 1) % N], r = rs[i];
    const a = cut(c, prev, r), b = cut(c, next, r);
    if (i === 0) p.M(...a); else p.L(...a);
    if (r > 0.01) p.C(a[0] + (c[0] - a[0]) * K, a[1] + (c[1] - a[1]) * K, b[0] + (c[0] - b[0]) * K, b[1] + (c[1] - b[1]) * K, b[0], b[1]); // a rounded corner as a cubic (no Q: themes read Q as lettering)
  }
  return p.Z().d;
}

/** A smooth closed path through points (closed Catmull-Rom → cubic). */
export function smoothClosed(pts) {
  const N = pts.length, p = P().M(...pts[0]);
  for (let i = 0; i < N; i++) {
    const a = pts[(i + N - 1) % N], b = pts[i], c = pts[(i + 1) % N], d = pts[(i + 2) % N];
    p.C(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]);
  }
  return p.Z().d;
}
