// Shared drawing kit for the system · status · dev glyphs (Deck Icon Designer I2).
// Pure geometry helpers in 48-unit grid space — no colors, no roles.

import { n } from '../../scene/svg.js';
import { arrive, clamp } from '../../scene/easing.js';

const pt = (p) => `${n(p[0])} ${n(p[1])}`;

/**
 * A quadratic curve p0 → p2 (control q) written as the equivalent cubic 'C' segment. Glyphs avoid
 * 'Q' on purpose: some material themes read quadratic paths as lettering and fill them.
 */
export function quadC(p0, q, p2) {
  const c1 = [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])];
  const c2 = [p2[0] + (2 / 3) * (q[0] - p2[0]), p2[1] + (2 / 3) * (q[1] - p2[1])];
  return `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
}
/** Open quadratic curve as path data (M + cubic). */
export const curve = (p0, q, p2) => `M${pt(p0)}${quadC(p0, q, p2)}`;

/** Closed polygon with rounded corners (a quadratic-shaped bend at each vertex) → path data. r: one radius or one per vertex. */
export function roundPoly(pts, r) {
  const N = pts.length;
  const cut = (a, b, rr) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, k = Math.min(rr / L, 0.5); return [a[0] + dx * k, a[1] + dy * k]; };
  let d = '';
  for (let i = 0; i < N; i++) {
    const v = pts[i], prev = pts[(i - 1 + N) % N], next = pts[(i + 1) % N];
    const rr = Array.isArray(r) ? r[i] : r;
    const a = cut(v, prev, rr), b = cut(v, next, rr);
    d += `${i ? 'L' : 'M'}${pt(a)}${quadC(a, v, b)}`;
  }
  return `${d}Z`;
}

/** Total length of a polyline. */
export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** The first fraction k (0–1) of a polyline, by length — for strokes that draw themselves in. */
export function partialPolyline(pts, k) {
  const total = polyLength(pts) * clamp(k);
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + L >= total) { const f = L ? (total - acc) / L : 0; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); return out; }
    out.push(b);
    acc += L;
  }
  return out;
}

/** Point at fraction u (0–1, by length) along a polyline. */
export function alongPolyline(pts, u) {
  const p = partialPolyline(pts, u);
  return p[p.length - 1];
}

/** Arrow chevron at the end of an arc (degrees, 0 = up, clockwise): tip slightly past the end, pointing along the sweep. */
export function arcHead(cx, cy, r, deg, { size = 4.5, dir = 1, lead = 1.2 } = {}) {
  const a = (deg * Math.PI) / 180;
  const P = [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const T = [Math.cos(a) * dir, Math.sin(a) * dir];   // clockwise tangent (× dir)
  const N = [Math.sin(a), -Math.cos(a)];              // outward normal
  const tip = [P[0] + T[0] * lead, P[1] + T[1] * lead];
  const back = [tip[0] - T[0] * size, tip[1] - T[1] * size];
  return [[back[0] + N[0] * size, back[1] + N[1] * size], tip, [back[0] - N[0] * size, back[1] - N[1] * size]];
}

/** The "off" strike shared by wifi / network / cloud: a diagonal that draws itself in over 0.32 s. */
export function strike(g, s, { from = [10.5, 10.5], to = [37.5, 37.5], role = 'accent', weight = 1.1, dur = 0.32 } = {}) {
  const k = arrive(s.since, dur);
  if (k <= 0.001) return;
  g.line(from[0], from[1], from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, { role, weight });
}

/** Triangle bump 0 → 1 → 0 over [c - w, c + w] (wrap-aware on a 0–1 circle when wrap = true). */
export function bump(x, c, w, wrap = false) {
  let d = Math.abs(x - c);
  if (wrap) d = Math.min(d, 1 - d);
  return d >= w ? 0 : 1 - d / w;
}

/** Smooth on/off square wave (0–1) for blinks: on for `duty` of the period, edges eased over `soft`. */
export function blink(p, duty = 0.5, soft = 0.08) {
  return p < duty ? Math.min(clamp(p / soft), clamp((duty - p) / soft)) : 0;
}

/** Horizontal extent [x0, x1] of a polygon on the scanline y (null when the line misses it). */
export function rowSpan(poly, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi <= y && yj >= y) || (yj <= y && yi >= y)) {
      if (yi === yj) { lo = Math.min(lo, xi, xj); hi = Math.max(hi, xi, xj); continue; }
      const x = xi + ((y - yi) / (yj - yi)) * (xj - xi);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
  }
  return lo === Infinity ? null : [lo, hi];
}

/**
 * A rect [x0, x1] × [y0, y1] with a window cut around a row-convex polygon (plus a margin),
 * returned as up to two closed path strings (left of the window, right of it). Used to seat
 * a symbol inside a fill so it reads in themes that paint every role in one color.
 */
export function rectAround(x0, x1, y0, y1, poly, margin = 1.4, step = 0.5) {
  if (x1 - x0 < 0.05) return [];
  const rows = [];
  for (let y = y0; y <= y1 + 1e-6; y += step) {
    let lo = Infinity, hi = -Infinity;
    for (const dy of [-margin, -margin / 2, 0, margin / 2, margin]) {
      const sp = rowSpan(poly, y + dy);
      if (sp) { lo = Math.min(lo, sp[0] - margin); hi = Math.max(hi, sp[1] + margin); }
    }
    if (lo === Infinity) lo = hi = x1; // the row misses the window: all of it belongs to the left part
    rows.push([Math.min(y, y1), lo, hi]);
  }
  const out = [];
  // left part: x from x0 to min(x1, lo)
  const left = rows.map(([y, lo]) => [y, Math.max(x0, Math.min(x1, lo))]);
  if (left.some(([, x]) => x > x0 + 0.05)) out.push(`M${n(x0)} ${n(y0)}${left.map(([y, x]) => `L${n(x)} ${n(y)}`).join('')}L${n(x0)} ${n(y1)}Z`);
  // right part: x from max(x0, hi) to x1
  const right = rows.map(([y, , hi]) => [y, Math.min(x1, Math.max(x0, hi))]);
  if (right.some(([, x]) => x < x1 - 0.05)) out.push(`M${n(x1)} ${n(y0)}${right.map(([y, x]) => `L${n(x)} ${n(y)}`).join('')}L${n(x1)} ${n(y1)}Z`);
  return out;
}
