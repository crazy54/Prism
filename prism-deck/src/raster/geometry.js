// Raster geometry: affine matrices, the transform list grammar, curve flattening
// with a device-space tolerance, the basic shapes as subpaths, and a stroker that
// turns a stroke into fill polygons (joins, caps, dashes) for the scan converter.
//
// Paths are parsed with scene/geom.js (`parsePath`), the same parser the engine
// uses; flattening is done here because the raster needs an error bound in
// *device* pixels (Wang's formula for Béziers, chord error for arcs).
//
// Matrices are [a, b, c, d, e, f]:  x' = a·x + c·y + e,  y' = b·x + d·y + f.
// Subpaths are { pts: [x0, y0, x1, y1, …], closed, segs } in user space
// (`segs` = the subpath has a drawing command after its moveto).

import { parsePath } from '../scene/geom.js';

export class RasterError extends Error {
  constructor(msg) { super(`raster: ${msg}`); this.name = 'RasterError'; }
}

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/** m · n (n is applied first). */
export function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return null;
  const id = 1 / det;
  return [m[3] * id, -m[1] * id, -m[2] * id, m[0] * id, (m[2] * m[5] - m[3] * m[4]) * id, (m[1] * m[4] - m[0] * m[5]) * id];
}

/** Largest singular value: how much the matrix can stretch a unit length. */
export function scaleOf(m) {
  const s1 = m[0] * m[0] + m[1] * m[1], s2 = m[2] * m[2] + m[3] * m[3], s12 = m[0] * m[2] + m[1] * m[3];
  const tr = s1 + s2, det = s1 * s2 - s12 * s12;
  return Math.sqrt(tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)));
}

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
/** Every number in a string (SVG list syntax: commas / whitespace / sign-separated). */
export function numbers(s) {
  const out = [];
  for (const m of String(s).matchAll(NUM)) out.push(+m[0]);
  return out;
}

const TF = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/y;
const ARGC = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1] };

/** The SVG transform list → one matrix. Throws RasterError on anything it can't read. */
export function parseTransform(src) {
  const s = String(src).trim();
  let m = IDENTITY, pos = 0;
  while (pos < s.length) {
    TF.lastIndex = pos;
    const r = TF.exec(s);
    if (!r) throw new RasterError(`bad transform "${s}"`);
    const fn = r[1], v = numbers(r[2]);
    if (!ARGC[fn].includes(v.length) || /[^\s,\d.eE+-]/.test(r[2])) throw new RasterError(`bad ${fn}() arguments in transform "${s}"`);
    let t;
    const rad = (deg) => (deg * Math.PI) / 180;
    switch (fn) {
      case 'matrix': t = v; break;
      case 'translate': t = [1, 0, 0, 1, v[0], v[1] ?? 0]; break;
      case 'scale': t = [v[0], 0, 0, v[1] ?? v[0], 0, 0]; break;
      case 'rotate': {
        const c = Math.cos(rad(v[0])), sn = Math.sin(rad(v[0]));
        t = [c, sn, -sn, c, 0, 0];
        if (v.length === 3) t = mul(mul([1, 0, 0, 1, v[1], v[2]], t), [1, 0, 0, 1, -v[1], -v[2]]);
        break;
      }
      case 'skewX': t = [1, 0, Math.tan(rad(v[0])), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan(rad(v[0])), 0, 1, 0, 0]; break;
    }
    m = mul(m, t);
    pos = TF.lastIndex;
  }
  return m;
}

// ── flattening ────────────────────────────────────────────────────────────────

const MAX_SEG = 2048;
const clampSeg = (n) => (n > MAX_SEG ? MAX_SEG : n < 1 ? 1 : Math.ceil(n));

/** Angle step that keeps a circle of radius r within `tol` of its chords. */
export function arcStep(r, tol) {
  if (!(r > tol)) return Math.PI / 2;
  return Math.min(Math.PI / 2, 2 * Math.acos(1 - tol / r));
}

/**
 * Chord flattening puts every chord inside the curve, which would bias edges inward by up to the
 * tolerance (visible on thin round strokes). Interior arc vertices are pushed out by this factor so
 * vertices and chord midpoints straddle the true radius ("error splitting").
 */
const splitK = (step) => 2 / (1 + Math.cos(step / 2));

/** Endpoint arc (SVG F.6.5) → points after the start, appended to `out`. */
function arcTo(out, x1, y1, rx, ry, phiDeg, fa, fs, x2, y2, tol) {
  if (x1 === x2 && y1 === y2) return;
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) { out.push(x2, y2); return; }
  const phi = (phiDeg * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const k = Math.sqrt(lam); rx *= k; ry *= k; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= Math.PI * 2; else if (fs && dt < 0) dt += Math.PI * 2;
  const n = clampSeg(Math.abs(dt) / arcStep(Math.max(rx, ry), tol));
  const kk = splitK(Math.abs(dt) / n);
  for (let k = 1; k < n; k++) {
    const t = t1 + (dt * k) / n, ct = Math.cos(t) * kk, st = Math.sin(t) * kk;
    out.push(cx + rx * ct * c - ry * st * s, cy + rx * ct * s + ry * st * c);
  }
  out.push(x2, y2);
}

/** Path data → flattened subpaths (user space) within `tol` user units. */
export function flattenPathData(d, tol) {
  let cmds;
  try { cmds = parsePath(d); } catch (e) { throw new RasterError(`bad path data${/[Aa]/.test(d) ? ' (arc flags must be 0 or 1, space-separated)' : ''}: ${e.message}`); }
  const subs = [];
  let cur = null, x = 0, y = 0, sx = 0, sy = 0;
  const start = () => { cur = { pts: [x, y], closed: false, segs: false }; subs.push(cur); };
  for (const { c, v } of cmds) {
    if (c === 'M') { x = sx = v[0]; y = sy = v[1]; start(); continue; }
    if (!cur) { x = sx; y = sy; start(); }
    cur.segs = true;
    const p = cur.pts;
    if (c === 'L') { p.push(v[0], v[1]); x = v[0]; y = v[1]; }
    else if (c === 'Q') {
      const ddx = x - 2 * v[0] + v[2], ddy = y - 2 * v[1] + v[3];
      const n = clampSeg(Math.sqrt(Math.hypot(ddx, ddy) / (4 * tol)));
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; p.push(u * u * x + 2 * u * t * v[0] + t * t * v[2], u * u * y + 2 * u * t * v[1] + t * t * v[3]); }
      x = v[2]; y = v[3];
    } else if (c === 'C') {
      const d1 = Math.hypot(x - 2 * v[0] + v[2], y - 2 * v[1] + v[3]), d2 = Math.hypot(v[0] - 2 * v[2] + v[4], v[1] - 2 * v[3] + v[5]);
      const n = clampSeg(Math.sqrt((0.75 * Math.max(d1, d2)) / tol));
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, cc = 3 * u * t * t, dd = t * t * t;
        p.push(a * x + b * v[0] + cc * v[2] + dd * v[4], a * y + b * v[1] + cc * v[3] + dd * v[5]);
      }
      x = v[4]; y = v[5];
    } else if (c === 'A') {
      if ((v[5] !== 0 && v[5] !== 1) || (v[6] !== 0 && v[6] !== 1)) throw new RasterError(`arc flags must be 0 or 1 (write them space-separated): "${String(d).slice(0, 60)}"`);
      arcTo(p, x, y, v[2], v[3], v[4], v[5], v[6], v[7], v[8], tol);
      x = v[7]; y = v[8];
    } else if (c === 'Z') { cur.closed = true; x = sx; y = sy; cur = null; }
  }
  return subs;
}

/** Ellipse as a closed subpath starting at 3 o'clock, sweeping toward +y (SVG 2 path equivalent). */
export function ellipseSub(cx, cy, rx, ry, tol) {
  let n = clampSeg((2 * Math.PI) / arcStep(Math.max(rx, ry), tol));
  n = Math.max(8, Math.ceil(n / 4) * 4);
  const pts = [], kk = splitK((2 * Math.PI) / n);
  for (let k = 0; k < n; k++) { const t = (2 * Math.PI * k) / n; pts.push(cx + rx * kk * Math.cos(t), cy + ry * kk * Math.sin(t)); }
  return { pts, closed: true, segs: true };
}

/** Rect (with corner radii) as a closed subpath starting at (x + rx, y), clockwise. */
export function rectSub(x, y, w, h, rx, ry, tol) {
  if (!rx || !ry) return { pts: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true, segs: true };
  const pts = [x + rx, y, x + w - rx, y];
  const n = clampSeg(Math.PI / 2 / arcStep(Math.max(rx, ry), tol));
  const kk = splitK(Math.PI / 2 / n);
  const corner = (cx, cy, a0) => { for (let k = 1; k <= n; k++) { const t = a0 + (Math.PI / 2) * (k / n), q = k < n ? kk : 1; pts.push(cx + rx * q * Math.cos(t), cy + ry * q * Math.sin(t)); } };
  corner(x + w - rx, y + ry, -Math.PI / 2);
  pts.push(x + w, y + h - ry);
  corner(x + w - rx, y + h - ry, 0);
  pts.push(x + rx, y + h);
  corner(x + rx, y + h - ry, Math.PI / 2);
  pts.push(x, y + ry);
  corner(x + rx, y + ry, Math.PI);
  return { pts, closed: true, segs: true };
}

/** Bounding box of subpaths: { x, y, w, h } (null when empty). */
export function subsBBox(subs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { pts } of subs) for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ── stroker ───────────────────────────────────────────────────────────────────
//
// A stroke becomes a union of small positively-oriented polygons — one quad per
// segment, a wedge / miter / bevel on the outer side of every join, and caps —
// filled with the nonzero rule. Overlaps are harmless (winding ≥ 1 is inside),
// there are no offset-curve self-intersection cases, and because every piece
// goes into ONE fill the seams between pieces get exact coverage.

function emitPoly(emit, p) {
  let area = 0;
  for (let i = 0, n = p.length, j = n - 2; i < n; j = i, i += 2) area += p[j] * p[i + 1] - p[i] * p[j + 1];
  if (Math.abs(area) < 1e-12) return;
  if (area < 0) { const r = []; for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]); emit(r); }
  else emit(p);
}

function arcFan(out, cx, cy, r, a0, sweep, tol) {
  const n = clampSeg(Math.abs(sweep) / arcStep(r, tol)), kk = splitK(Math.abs(sweep) / n);
  for (let k = 0; k <= n; k++) { const t = a0 + (sweep * k) / n, q = k && k < n ? r * kk : r; out.push(cx + q * Math.cos(t), cy + q * Math.sin(t)); }
}

function dedupe(pts, closed) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1];
    if (Math.abs(x - out[out.length - 2]) > 1e-9 || Math.abs(y - out[out.length - 1]) > 1e-9) out.push(x, y);
  }
  if (closed && out.length > 2 && Math.abs(out[0] - out[out.length - 2]) <= 1e-9 && Math.abs(out[1] - out[out.length - 1]) <= 1e-9) out.length -= 2;
  return out;
}

function capAt(emit, x, y, dx, dy, hw, cap, tol) {
  if (cap === 'butt') return;
  const nx = -dy * hw, ny = dx * hw;
  if (cap === 'square') { emitPoly(emit, [x + nx, y + ny, x + nx + dx * hw, y + ny + dy * hw, x - nx + dx * hw, y - ny + dy * hw, x - nx, y - ny]); return; }
  const p = [];
  arcFan(p, x, y, hw, Math.atan2(dy, dx) - Math.PI / 2, Math.PI, tol);
  emitPoly(emit, p);
}

function dotAt(emit, x, y, dx, dy, hw, cap, tol) {
  if (cap === 'butt') return;
  if (cap === 'square') {
    const ax = dx * hw, ay = dy * hw, nx = -ay, ny = ax;
    emitPoly(emit, [x - ax + nx, y - ay + ny, x + ax + nx, y + ay + ny, x + ax - nx, y + ay - ny, x - ax - nx, y - ay - ny]);
    return;
  }
  const p = [];
  arcFan(p, x, y, hw, 0, 2 * Math.PI, tol);
  p.length -= 2;
  emitPoly(emit, p);
}

function joinAt(emit, vx, vy, d0x, d0y, d1x, d1y, hw, join, miterLimit, tol) {
  const cross = d0x * d1y - d0y * d1x, dot = d0x * d1x + d0y * d1y;
  const turn = Math.atan2(cross, dot);
  if (Math.abs(turn) < 1e-9) return;
  const s = turn > 0 ? -hw : hw;
  const ax = vx - d0y * s, ay = vy + d0x * s, bx = vx - d1y * s, by = vy + d1x * s;
  if (join === 'round') {
    const p = [vx, vy];
    arcFan(p, vx, vy, hw, Math.atan2(ay - vy, ax - vx), turn, tol);
    emitPoly(emit, p);
    return;
  }
  if (join === 'miter' || join === 'miter-clip' || join === 'arcs') {
    const ratio = 1 / Math.sqrt(Math.max(1e-30, (1 + dot) / 2));
    if (ratio <= miterLimit) {
      const k = s / (1 + dot);
      emitPoly(emit, [vx, vy, ax, ay, vx + (-d0y - d1y) * k, vy + (d0x + d1x) * k, bx, by]);
      return;
    }
  }
  emitPoly(emit, [vx, vy, ax, ay, bx, by]);
}

function strokePolyline(emit, pts, closed, hw, cap, join, miterLimit, tol, dir) {
  const n = pts.length / 2;
  if (n === 1) { const [dx, dy] = dir || [1, 0]; dotAt(emit, pts[0], pts[1], dx, dy, hw, cap, tol); return; }
  const segs = closed ? n : n - 1;
  const ux = new Float64Array(segs), uy = new Float64Array(segs);
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * j], y1 = pts[2 * j + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const dx = (x1 - x0) / L, dy = (y1 - y0) / L;
    ux[i] = dx; uy[i] = dy;
    const nx = -dy * hw, ny = dx * hw;
    emitPoly(emit, [x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny]);
  }
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) {
    const a = (i - 1 + segs) % segs;
    joinAt(emit, pts[2 * i], pts[2 * i + 1], ux[a], uy[a], ux[i], uy[i], hw, join, miterLimit, tol);
  }
  if (!closed) {
    capAt(emit, pts[0], pts[1], -ux[0], -uy[0], hw, cap, tol);
    capAt(emit, pts[2 * n - 2], pts[2 * n - 1], ux[segs - 1], uy[segs - 1], hw, cap, tol);
  }
}

/** Split a polyline into dashes: [{ pts, dir }] (open polylines; dir = tangent, for zero-length dashes). */
export function dashPolyline(pts, closed, pattern, offset) {
  const total = pattern.reduce((a, b) => a + b, 0);
  const n = pts.length / 2, segs = closed ? n : n - 1;
  let idx = 0, rem = pattern[0];
  let off = ((offset % total) + total) % total;
  while (off > 0) {
    if (off >= rem) { off -= rem; idx = (idx + 1) % pattern.length; rem = pattern[idx]; }
    else { rem -= off; off = 0; }
  }
  const out = [];
  let cur = idx % 2 === 0 ? [pts[0], pts[1]] : null, dx = 1, dy = 0;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * j], y1 = pts[2 * j + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (!L) continue;
    dx = (x1 - x0) / L; dy = (y1 - y0) / L;
    let pos = 0;
    while (L - pos > rem) {
      pos += rem;
      const px = x0 + dx * pos, py = y0 + dy * pos;
      if (idx % 2 === 0) { cur.push(px, py); out.push({ pts: cur, dir: [dx, dy] }); cur = null; }
      else cur = [px, py];
      idx = (idx + 1) % pattern.length; rem = pattern[idx];
    }
    rem -= L - pos;
    if (cur) cur.push(x1, y1);
  }
  if (cur) out.push({ pts: cur, dir: [dx, dy] });
  return out;
}

/**
 * Stroke subpaths (user space) into fill polygons, handed to `emit(flatPts)` in user space.
 * st: { width, cap, join, miterLimit, dash (array | null), dashOffset }; tol in user units.
 */
export function strokeSubs(subs, st, tol, emit) {
  const hw = st.width / 2;
  if (!(hw > 0)) return;
  let dash = st.dash;
  if (dash) {
    const sum = dash.reduce((a, b) => a + b, 0);
    let len = 0;
    for (const { pts, closed } of subs) for (let i = 2; i <= pts.length - (closed ? 0 : 2); i += 2) {
      const j = i % pts.length;
      len += Math.hypot(pts[j] - pts[i - 2], pts[j + 1] - pts[i - 1]);
    }
    if (!(sum > 0) || dash.some((v) => v < 0) || len / sum > 200000) dash = null;
  }
  for (const sp of subs) {
    if (!sp.segs) continue;
    const pts = dedupe(sp.pts, sp.closed);
    if (dash) {
      for (const d of dashPolyline(pts, sp.closed && pts.length > 2, dash, st.dashOffset || 0)) {
        strokePolyline(emit, dedupe(d.pts, false), false, hw, st.cap, st.join, st.miterLimit, tol, d.dir);
      }
    } else strokePolyline(emit, pts, sp.closed && pts.length > 2, hw, st.cap, st.join, st.miterLimit, tol, null);
  }
}
