// Path geometry: parse SVG path data, flatten curves to polylines, bounds,
// point-in-polygon and distance — for themes that rework glyph geometry
// (pixelation, extrusion, outlines) and for the raster backend.

const RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

/** Path data → absolute commands: [{ c: 'M'|'L'|'C'|'Q'|'A'|'Z', v: [...] }] (H/V/S/T normalized to L/C/Q). */
export function parsePath(d) {
  const toks = [];
  const raw = [];
  for (const m of String(d).matchAll(RE)) { toks.push(m[1] || +m[2]); raw.push(m[2] ?? null); }
  const out = [];
  let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, lc = null, lq = null;
  const num = () => { const v = toks[i++]; if (typeof v !== 'number') throw new Error(`parsePath: expected number in "${String(d).slice(0, 40)}"`); return v; };
  // arc flags must be separate '0' / '1' tokens: compact forms ("a5 5 0 0110 10") are rejected
  // here, by scene/validate.js, and therefore by src/raster — one rule everywhere
  const flag = () => {
    const r = raw[i];
    if (r !== '0' && r !== '1') throw new Error(`parsePath: arc flags must be 0 or 1, space-separated, in "${String(d).slice(0, 40)}"`);
    i++;
    return +r;
  };
  while (i < toks.length) {
    if (typeof toks[i] === 'string') cmd = toks[i++];
    else if (!cmd) throw new Error('parsePath: path must start with a command');
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (C) {
      case 'M': x = ox + num(); y = oy + num(); sx = x; sy = y; out.push({ c: 'M', v: [x, y] }); cmd = rel ? 'l' : 'L'; lc = lq = null; break;
      case 'L': x = ox + num(); y = oy + num(); out.push({ c: 'L', v: [x, y] }); lc = lq = null; break;
      case 'H': x = (rel ? x : 0) + num(); out.push({ c: 'L', v: [x, y] }); lc = lq = null; break;
      case 'V': y = (rel ? y : 0) + num(); out.push({ c: 'L', v: [x, y] }); lc = lq = null; break;
      case 'C': { const v = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]; out.push({ c: 'C', v }); lc = [v[2], v[3]]; lq = null; x = v[4]; y = v[5]; break; }
      case 'S': { const c1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; const v = [c1[0], c1[1], ox + num(), oy + num(), ox + num(), oy + num()]; out.push({ c: 'C', v }); lc = [v[2], v[3]]; lq = null; x = v[4]; y = v[5]; break; }
      case 'Q': { const v = [ox + num(), oy + num(), ox + num(), oy + num()]; out.push({ c: 'Q', v }); lq = [v[0], v[1]]; lc = null; x = v[2]; y = v[3]; break; }
      case 'T': { const c1 = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y]; const v = [c1[0], c1[1], ox + num(), oy + num()]; out.push({ c: 'Q', v }); lq = [v[0], v[1]]; lc = null; x = v[2]; y = v[3]; break; }
      case 'A': { const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag(); const ex = ox + num(), ey = oy + num(); out.push({ c: 'A', v: [x, y, rx, ry, rot, large, sweep, ex, ey] }); x = ex; y = ey; lc = lq = null; break; }
      case 'Z': out.push({ c: 'Z', v: [] }); x = sx; y = sy; lc = lq = null; break;
      default: throw new Error(`parsePath: unknown command ${cmd}`);
    }
  }
  return out;
}

/** Endpoint-parameterized arc → center form points (SVG spec F.6.5). */
/** Center parametrization of an SVG arc (spec F.6.5): { cx, cy, rx, ry, c, s, t1, dt } or null for a degenerate arc. */
function arcCenter(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return null;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const c = Math.cos((phi * Math.PI) / 180), s = Math.sin((phi * Math.PI) / 180);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sign = fa === fs ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= Math.PI * 2; else if (fs && dt < 0) dt += Math.PI * 2;
  return { cx, cy, rx, ry, c, s, t1, dt };
}

/**
 * Exact bounding box of an SVG arc segment: its endpoints plus whichever of the
 * ellipse's x / y extrema the sweep passes. → [x0, y0, x1, y1]
 */
export function arcBounds(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  const pts = [[x1, y1], [x2, y2]];
  const A = arcCenter(x1, y1, rx, ry, phi, fa, fs, x2, y2);
  if (A) {
    const { cx, cy, c, s, t1, dt } = A;
    const at = (t) => [cx + A.rx * Math.cos(t) * c - A.ry * Math.sin(t) * s, cy + A.rx * Math.cos(t) * s + A.ry * Math.sin(t) * c];
    const tx = Math.atan2(-A.ry * s, A.rx * c), ty = Math.atan2(A.ry * c, A.rx * s);
    const lo = Math.min(t1, t1 + dt), hi = Math.max(t1, t1 + dt);
    for (const base of [tx, tx + Math.PI, ty, ty + Math.PI]) {
      for (let k = -2; k <= 2; k++) { const t = base + k * 2 * Math.PI; if (t > lo && t < hi) pts.push(at(t)); }
    }
  }
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const [x, y] of pts) { if (x < X0) X0 = x; if (y < Y0) Y0 = y; if (x > X1) X1 = x; if (y > Y1) Y1 = y; }
  return [X0, Y0, X1, Y1];
}

function arcPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2, tol) {
  if (!rx || !ry) return [[x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const c = Math.cos((phi * Math.PI) / 180), s = Math.sin((phi * Math.PI) / 180);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sign = fa === fs ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= Math.PI * 2; else if (fs && dt < 0) dt += Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(dt) * Math.max(rx, ry) / Math.max(0.25, tol * 4)));
  const pts = [];
  for (let k = 1; k <= steps; k++) { const t = t1 + (dt * k) / steps; pts.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]); }
  return pts;
}

/** Flatten path data (or parsed commands) into polylines: [{ pts: [[x, y]…], closed }]. tol = max deviation in user units. */
export function flattenPath(d, tol = 0.25) {
  const cmds = Array.isArray(d) ? d : parsePath(d);
  const out = [];
  let cur = null, x = 0, y = 0;
  const seg = (n0) => Math.max(1, Math.min(64, Math.ceil(n0)));
  for (const { c, v } of cmds) {
    if (c === 'M') { cur = { pts: [[v[0], v[1]]], closed: false }; out.push(cur); x = v[0]; y = v[1]; continue; }
    if (!cur) { cur = { pts: [[x, y]], closed: false }; out.push(cur); }
    if (c === 'L') { cur.pts.push([v[0], v[1]]); x = v[0]; y = v[1]; }
    else if (c === 'Q') {
      const n = seg(Math.sqrt(Math.hypot(v[0] - x, v[1] - y) + Math.hypot(v[2] - v[0], v[3] - v[1])) / Math.sqrt(tol));
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; cur.pts.push([u * u * x + 2 * u * t * v[0] + t * t * v[2], u * u * y + 2 * u * t * v[1] + t * t * v[3]]); }
      x = v[2]; y = v[3];
    } else if (c === 'C') {
      const L = Math.hypot(v[0] - x, v[1] - y) + Math.hypot(v[2] - v[0], v[3] - v[1]) + Math.hypot(v[4] - v[2], v[5] - v[3]);
      const n = seg(Math.sqrt(L / tol));
      for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; cur.pts.push([u * u * u * x + 3 * u * u * t * v[0] + 3 * u * t * t * v[2] + t * t * t * v[4], u * u * u * y + 3 * u * u * t * v[1] + 3 * u * t * t * v[3] + t * t * t * v[5]]); }
      x = v[4]; y = v[5];
    } else if (c === 'A') { for (const p of arcPoints(...v, tol)) cur.pts.push(p); x = v[7]; y = v[8]; }
    else if (c === 'Z') { cur.closed = true; const [sx, sy] = cur.pts[0]; x = sx; y = sy; cur = null; }
  }
  return out;
}

/** Bounding box of path data: { x, y, w, h }. */
export function pathBounds(d) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pl of flattenPath(d, 0.5)) for (const [x, y] of pl.pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return x0 === Infinity ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Nonzero winding test of a point against closed polylines. */
export function insidePolys(px, py, polys) {
  let wind = 0;
  for (const { pts } of polys) {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yj <= py) { if (yi > py && (xi - xj) * (py - yj) - (px - xj) * (yi - yj) > 0) wind++; }
      else if (yi <= py && (xi - xj) * (py - yj) - (px - xj) * (yi - yj) < 0) wind--;
    }
  }
  return wind !== 0;
}

/** Distance from a point to the nearest segment of polylines. */
export function distToPolys(px, py, polys) {
  let best = Infinity;
  for (const { pts, closed } of polys) {
    const n = pts.length;
    for (let i = 0; i < n - (closed ? 0 : 1); i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best) best = d;
    }
    if (n === 1) best = Math.min(best, Math.hypot(px - pts[0][0], py - pts[0][1]));
  }
  return best;
}

/** Apply an affine matrix [a b c d e f] to path data (returns absolute path data). */
export function transformPath(d, [a, b, c, dd, e, f], fmt = (v) => +v.toFixed(2)) {
  const T = (x, y) => [a * x + c * y + e, b * x + dd * y + f];
  let out = '';
  for (const { c: k, v } of parsePath(d)) {
    if (k === 'Z') { out += 'Z'; continue; }
    if (k === 'A') {
      // arcs: transform the endpoint; radii scale by the mean scale (exact for uniform scale + rotation)
      const s = Math.sqrt(Math.abs(a * dd - b * c));
      const [ex, ey] = T(v[7], v[8]);
      out += `A${fmt(v[2] * s)} ${fmt(v[3] * s)} ${fmt(v[4])} ${v[5]} ${a * dd - b * c < 0 ? 1 - v[6] : v[6]} ${fmt(ex)} ${fmt(ey)}`;
      continue;
    }
    const pts = [];
    for (let i = 0; i < v.length; i += 2) pts.push(...T(v[i], v[i + 1]).map(fmt));
    out += k + pts.join(' ');
  }
  return out;
}
