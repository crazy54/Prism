// Shared kit for the tool / window / build / game glyph families (Prism Play glyph pass, 2026-10).
// Pure geometry and timing in 48-unit grid space: no colors, no roles.
//
//   xf(d, rot(45))          rotate path data about the grid center (exact: the result is absolute
//                           path data, so the conformance test still checks it against the safe area)
//   xf(d, mirrorX())        mirror left ↔ right (arc sweeps flip with it)
//   enter(s), press(s)      the set's arrival (outExpo) and press envelopes
//   chevron(tip, dir, arm)  an arrowhead polyline pointing along dir (degrees, 0 = up, clockwise)

import { transformPath } from '../scene/geom.js';
import { arrive, clamp, outExpo } from '../scene/easing.js';
import { n } from '../scene/svg.js';

const RAD = Math.PI / 180;

/** Rotation matrix (degrees, clockwise on screen) about origin [ox, oy]. */
export function rot(deg, [ox, oy] = [24, 24]) {
  const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
  return [c, s, -s, c, ox - c * ox + s * oy, oy - s * ox - c * oy];
}
/** Mirror matrices: left ↔ right about x = cx, top ↔ bottom about y = cy. */
export const mirrorX = (cx = 24) => [-1, 0, 0, 1, 2 * cx, 0];
export const mirrorY = (cy = 24) => [1, 0, 0, -1, 0, 2 * cy];
/** Translation matrix. */
export const shift = (dx, dy = 0) => [1, 0, 0, 1, dx, dy];
/** Transform path data by a matrix → absolute path data. */
export const xf = (d, m) => transformPath(String(d), m);
/** Transform a point list by a matrix. */
export const xfPts = (pts, m) => pts.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);

/** Arrival 0 → 1 (Refraction: things converge into focus, outExpo). */
export const enter = (s, dur = 0.45) => arrive(s.since, dur);
/** Press envelope: 1 while held, then decays to 0 over dur after release. */
export const press = (s, dur = 0.45) => (s.pressed ? 1 : s.pressAge < dur ? 1 - outExpo(clamp(s.pressAge / dur)) : 0);

/** Arrowhead polyline: tip point, direction of travel (deg, 0 = up, clockwise), arm length, half-angle. */
export function chevron([x, y], dir, arm = 7.5, half = 45) {
  const back = (a) => [x - arm * Math.sin((dir + a) * RAD), y + arm * Math.cos((dir + a) * RAD)];
  return [back(-half), [x, y], back(half)];
}

/** Capsule (stadium) outline between two centers, radius r → closed path data. */
export function capsule([x0, y0], [x1, y1], r) {
  const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a) * r, ny = Math.cos(a) * r;
  return `M${n(x0 + nx)} ${n(y0 + ny)}L${n(x1 + nx)} ${n(y1 + ny)}A${n(r)} ${n(r)} 0 0 0 ${n(x1 - nx)} ${n(y1 - ny)}L${n(x0 - nx)} ${n(y0 - ny)}A${n(r)} ${n(r)} 0 0 0 ${n(x0 + nx)} ${n(y0 + ny)}Z`;
}

/** Points on a polyline path → path data (open). */
export const polyD = (pts, close = false) => pts.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])} ${n(p[1])}`).join('') + (close ? 'Z' : '');
