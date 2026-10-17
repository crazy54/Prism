// Shared drawing for the build glyphs (the Coaster Console and world-building tools): track seen
// from above (two rails on ties), track seen from the side (rail over its spine), the cross-section
// seen head-on (a tie with two rail heads), and the spirit level that marks "level / flat".
import { lerp, clamp, outCubic, inOutSine } from '../../scene/easing.js';
import { alongPolyline } from '../system/_kit.js';
import { n } from '../../scene/svg.js';
import { xfPts, mirrorX, chevron } from '../_tools.js';

const RAD = Math.PI / 180;

/**
 * Track from above along a centerline sampler: rails at ±gauge/2, ties every `pitch` units with
 * `over` overhang. `run` (0–1) slides the ties along by a pitch (the track running), m mirrors x.
 */
export function topTrack(g, centerAt, length, { gauge = 12, pitch = 7.3, over = 2, run = 0, m = null, opacity = 1, ends = [1.5, 1.5] } = {}) {
  const T = (pts) => (m ? xfPts(pts, m) : pts);
  const off = (u, d) => { const { x, y, a } = centerAt(u); return [x + Math.cos(a) * d, y + Math.sin(a) * d]; }; // a = normal angle
  // rails: sampled densely so curves stay curves
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 48; i++) pts.push(off((i / 48) * length, side * gauge / 2));
    g.polyline(T(pts), { role: 'line', join: 'round', opacity });
  }
  const h = gauge / 2 + over;
  for (let u = (run % 1) * pitch + pitch * 0.5; u < length; u += pitch) {
    if (u < ends[0] || u > length - ends[1]) continue;
    const fade = Math.min(1, (u - ends[0]) / 2.5, (length - ends[1] - u) / 2.5);
    g.line(...T([off(u, -h)])[0], ...T([off(u, h)])[0], { role: 'dim', weight: 0.85, opacity: opacity * Math.max(0, fade) });
  }
}

/** Straight vertical centerline sampler (bottom → top) at x, from y0 down to y1. */
export const straightAt = (x, y0) => (u) => ({ x, y: y0 - u, a: 0 });

/**
 * A 90° left-hand curve: up from (cx, yb) to (cx, ya), then an arc of radius rc turning left, then a
 * straight exit to x = xe. Returns { at(u), length }.
 */
export function curveLeft({ cx = 33, yb = 39, ya = 28, rc = 12, xe = 7 } = {}) {
  const L1 = yb - ya, L2 = (Math.PI / 2) * rc, ox = cx - rc, oy = ya, L3 = ox - xe;
  const at = (u) => {
    if (u <= L1) return { x: cx, y: yb - u, a: 0 };                        // normal = +x (right)
    if (u <= L1 + L2) {
      const th = (u - L1) / rc;                                              // 0 → π/2, turning left
      return { x: ox + rc * Math.cos(th), y: oy - rc * Math.sin(th), a: -th };
    }
    return { x: ox - (u - L1 - L2), y: oy - rc, a: -Math.PI / 2 };
  };
  return { at, length: L1 + L2 + L3 };
}

/** Side-view track: the rail (line) over its spine (dim) from p0 to p1; returns the travel angle (deg, 0 = up). */
export function sideTrack(g, p0, p1, { gap = 4, opacity = 1, spine = true } = {}) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L; // normal, pointing "below" the rail for left → right travel
  const s = ny < 0 ? -1 : 1;       // keep the spine underneath
  g.line(p0[0], p0[1], p1[0], p1[1], { role: 'line', weight: 1.05, opacity });
  if (spine) {
    g.line(p0[0] + nx * gap * s + dx / L * 2, p0[1] + ny * gap * s + dy / L * 2, p1[0] + nx * gap * s - dx / L * 2, p1[1] + ny * gap * s - dy / L * 2, { role: 'dim', opacity });
    // braces between rail and spine
    for (let i = 1; i < 4; i++) {
      const f = i / 4, x = p0[0] + dx * f, y = p0[1] + dy * f;
      g.line(x, y, x + nx * gap * s, y + ny * gap * s, { role: 'dim', weight: 0.75, opacity });
    }
  }
  return Math.atan2(dx, -dy) / RAD;
}

/** The cross-section of the track seen head-on: a tie with two rail heads, tilted `deg` about (cx, cy). */
export function crossSection(g, cx, cy, deg, { half = 13, rail = 7.5, opacity = 1 } = {}) {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
  const P = (u, v) => [cx + u * c - v * s, cy + u * s + v * c];
  g.line(...P(-half, 0), ...P(half, 0), { role: 'line', weight: 1.1, opacity });
  for (const u of [-rail, rail]) { const [x, y] = P(u, -3.2); g.circle(x, y, 2.3, { role: 'fill', opacity }); }
}

/** The horizon (the level reference for pitch): a dim line. */
export const horizon = (g, y, x0 = 7, x1 = 41, opacity = 1) => g.line(x0, y, x1, y, { role: 'dim', opacity });

/** The spirit level: a vial with its bubble centered between two marks. bubble 0 = centered. */
export function spiritLevel(g, cy, { k = 1, bubble = 0 } = {}) {
  g.rect(13, cy - 4.5, 22, 9, { r: 4.5 });
  g.line(20, cy - 4.5, 20, cy + 4.5, { role: 'dim', weight: 0.8 });
  g.line(28, cy - 4.5, 28, cy + 4.5, { role: 'dim', weight: 0.8 });
  g.circle(24 + bubble, cy, 2.4, { role: 'accent', fill: true, opacity: lerp(0.4, 1, k) });
}

/** Arc arrow (deg, 0 = up, clockwise) from a0 to a1 with a head at a1; ccw when a1 < a0. */
export function arcArrow(g, cx, cy, r, a0, a1, { role = 'accent', size = 4.2, weight = 1, opacity = 1 } = {}) {
  if (Math.abs(a1 - a0) < 1) return;
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  g.arc(cx, cy, r, lo, hi, { role, weight, opacity });
  const dir = a1 > a0 ? 90 : -90;
  const [x, y] = [cx + r * Math.sin(a1 * RAD), cy - r * Math.cos(a1 * RAD)];
  g.polyline(chevron([x + Math.sin((a1 + dir) * RAD) * 1, y - Math.cos((a1 + dir) * RAD) * 1], a1 + dir, size, 48), { role, weight, join: 'round', opacity });
}

/** A spark riding a polyline for `dur` s after a release (the train on loop / special). */
export function ride(g, s, pts, dur = 1.1) {
  if (s.pressed || !(s.pressAge < dur)) return;
  const u = clamp(s.pressAge / dur);
  const [x, y] = alongPolyline(pts, inOutSine(u));
  g.dot(x, y, 2.4, { opacity: 1 - outCubic(clamp((u - 0.85) / 0.15)) });
}

export { mirrorX, n };
