// D6's wall kit — ambient walls (span-*) and living keys (idle-*).
//
// The lab's rules shape everything here (DECK.md › Hardware truths):
//   · ≈ 200 key updates/s for the whole app, < 300 elements a frame, send only changed keys.
//   · So walls are drawn PER KEY CELL and merged by paint: `Batch` files every primitive
//     under the set of keys it touches + its paint and emits one <path> per bucket — a key
//     whose own pixels didn't change stays byte-identical, and a key never carries more
//     than a handful of elements however busy the scene is. Primitives that only touch
//     the bezel gaps are dropped (nobody can see them).
//   · Time comes from D3's `frameClock` (quantized to the device budget), so a whole-wall
//     scene moves at 1–4 fps and a sparse one (fireflies, constellations) runs faster.
//
//   Batch              merge primitives per (touched keys, paint) → few elements per key
//   fillP / strokeP    paint attribute strings (opacity quantized so more paths merge)
//   dotD / rectD / ellipseD / polyD / starD / flakeD   path data for one primitive
//   backdrop(k, …)     one userSpace gradient shared by a rect per key (the scene's sky / water)
//   isoPaths(…)        marching squares: closed outlines of {f ≥ level} inside a rect (lava, caustics)
//   clipPoly(pts, cell) a polygon cut to one key (big shapes stay per key)
//   lit(T), shadeOf    the emissive "light" color of a theme (white by night, ink by day)

import { n, linearGradient, radialGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
export { BUDGET, frameClock, materials, cellAt, half, spectrumHue, inCell } from './_d3-span.js';

/** One decimal: walls are drawn on device px, so 0.1 px is plenty and keeps slices small. */
export const f1 = (v) => n(v, 1);
/** Quantize an opacity (0–1) to steps so identical paints merge into one path. */
export const qo = (o, steps = 20) => Math.max(0, Math.min(1, Math.round(o * steps) / steps));

// ── path data for one primitive ─────────────────────────────────────────────
// a dot; below ~2 px across it's drawn as a square (same pixels, half the bytes, no arcs to parse)
export const dotD = (x, y, r) => { const R = Math.max(0.3, r); if (R < 1.05) { const d = R * 1.8; return `M${f1(x - d / 2)} ${f1(y - d / 2)}h${f1(d)}v${f1(d)}h${f1(-d)}Z`; } return `M${f1(x - R)} ${f1(y)}a${f1(R)} ${f1(R)} 0 1 0 ${f1(2 * R)} 0a${f1(R)} ${f1(R)} 0 1 0 ${f1(-2 * R)} 0Z`; };
export const ellipseD = (x, y, rx, ry) => `M${f1(x - rx)} ${f1(y)}a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(2 * rx)} 0a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(-2 * rx)} 0Z`;
export const rectD = (x, y, w, h) => `M${f1(x)} ${f1(y)}h${f1(w)}v${f1(h)}h${f1(-w)}Z`;
export const polyD = (pts, close = true) => pts.map(([x, y], i) => `${i ? (i === 1 ? 'L' : ' ') : 'M'}${f1(x)} ${f1(y)}`).join('') + (close ? 'Z' : '');
export const lineD = (x0, y0, x1, y1) => `M${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}`;
/** A four-point sparkle (twinkle) centered on (x, y). */
export const starD = (x, y, r, w = 0.22) => polyD([[x, y - r], [x + r * w, y - r * w], [x + r, y], [x + r * w, y + r * w], [x, y + r], [x - r * w, y + r * w], [x - r, y], [x - r * w, y - r * w]]);
/** A six-armed snow crystal as strokes (three crossing bars + barbs). */
export function flakeD(x, y, r, rot = 0) {
  let d = '';
  for (let i = 0; i < 3; i++) {
    const a = rot + (i * Math.PI) / 3, c = Math.cos(a) * r, s = Math.sin(a) * r;
    d += lineD(x - c, y - s, x + c, y + s);
  }
  return d;
}

/** Sutherland–Hodgman: clip a polygon to a cell rect (each slice then holds only its own sliver). */
export function clipPoly(pts, c) {
  const edges = [[(p) => p[0] >= c.x, (a, b) => ix(a, b, 0, c.x)], [(p) => p[0] <= c.x + c.w, (a, b) => ix(a, b, 0, c.x + c.w)], [(p) => p[1] >= c.y, (a, b) => ix(a, b, 1, c.y)], [(p) => p[1] <= c.y + c.h, (a, b) => ix(a, b, 1, c.y + c.h)]];
  let out = pts;
  for (const [inside, cut] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      if (inside(a)) { out.push(a); if (!inside(b)) out.push(cut(a, b)); } else if (inside(b)) out.push(cut(a, b));
    }
    if (!out.length) return out;
  }
  return out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}
function ix(a, b, axis, v) { const f = (v - a[axis]) / (b[axis] - a[axis]); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }

// ── paints ──────────────────────────────────────────────────────────────────
export const fillP = (color, o = 1, rule) => `fill="${color}"${o < 1 ? ` fill-opacity="${n(qo(o), 2)}"` : ''}${rule ? ` fill-rule="${rule}"` : ''}`;
export const strokeP = (color, w, o = 1, cap = 'round') => `fill="none" stroke="${color}" stroke-width="${f1(Math.max(0.5, w))}"${o < 1 ? ` stroke-opacity="${n(qo(o), 2)}"` : ''} stroke-linecap="${cap}" stroke-linejoin="round"`;

/**
 * Merge primitives by (the keys they touch, paint, layer). Each bucket becomes one <path>,
 * emitted layer by layer in insertion order. add() returns false when the primitive only
 * touches bezel gaps (it's dropped).
 */
export class Batch {
  constructor(grid, pad = 0) { this.cells = grid.cells; this.pad = pad; this.m = new Map(); }
  touched(x0, y0, x1, y1) {
    const p = this.pad, out = [];
    for (const c of this.cells) if (x1 >= c.x - p && x0 <= c.x + c.w + p && y1 >= c.y - p && y0 <= c.y + c.h + p) out.push(c.i);
    return out;
  }
  add(box, paint, d, layer = 0) {
    if (!d) return false;
    const cells = this.touched(box[0], box[1], box[2], box[3]);
    if (!cells.length) return false;
    const key = `${layer}|${cells.join('.')}|${paint}`;
    const e = this.m.get(key);
    if (e) e.d += d; else this.m.set(key, { layer, paint, d });
    return true;
  }
  /** An element that must stay on its own (its own gradient, transform …), kept in layer order. */
  raw(box, markup, layer = 0) {
    if (!markup || !this.touched(box[0], box[1], box[2], box[3]).length) return false;
    this.m.set(`raw${this.m.size}`, { layer, markup });
    return true;
  }
  /** Shorthands: a filled dot / a stroked segment. */
  dot(x, y, r, paint, layer = 0) { return this.add([x - r, y - r, x + r, y + r], paint, dotD(x, y, r), layer); }
  seg(x0, y0, x1, y1, w, paint, layer = 0) { return this.add([Math.min(x0, x1) - w, Math.min(y0, y1) - w, Math.max(x0, x1) + w, Math.max(y0, y1) + w], paint, lineD(x0, y0, x1, y1), layer); }
  poly(pts, paint, layer = 0, close = true) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return this.add([x0, y0, x1, y1], paint, polyD(pts, close), layer);
  }
  emit(k) {
    const all = [...this.m.values()].map((e, i) => ({ ...e, i })).sort((a, b) => a.layer - b.layer || a.i - b.i);
    let out = '';
    for (const e of all) out += e.markup || `<path d="${e.d}" ${e.paint}/>`;
    if (out) k.add(out);
    this.m.clear();
  }
}

/**
 * A backdrop gradient shared by every key: one userSpace gradient def + one rect per key
 * (so each slice carries just its own rect). stops: [[offset, '#hex', opacity]].
 */
export function backdrop(k, stops, { id = 'bd', x1 = 0, y1 = 0, x2 = 0, y2 = k.h, radial, cells = k.ctx.grid.cells } = {}) {
  const gid = k.id(id);
  if (radial) k.def(radialGradient(gid, stops, { cx: f1(radial.cx), cy: f1(radial.cy), r: f1(radial.r), fx: f1(radial.cx), fy: f1(radial.cy), gradientUnits: 'userSpaceOnUse' }));
  else k.def(linearGradient(gid, stops, { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2), gradientUnits: 'userSpaceOnUse' }));
  let s = '';
  for (const c of cells) s += `<rect x="${f1(c.x)}" y="${f1(c.y)}" width="${f1(c.w)}" height="${f1(c.h)}" fill="${url(gid)}"/>`;
  k.add(s);
  return gid;
}

/** The emissive color of a theme: the beam by night, ink by day. */
export const lit = (T) => (T.dark ? (T.colors.beam || '#ffffff') : T.colors.ink);
/** Mix toward a theme's background (0 = color, 1 = bg). */
export const toBg = (T, c, f) => mix(c, T.colors.bg, f);
/** Mono (and other 1-bit) themes paint the whole Spectrum one color: walls lean on value instead. */
export const isFlat = (T) => T.spectral(30) === T.spectral(220);

/**
 * Marching squares over rect r (sampled every `step` px, padded so every outline closes):
 * for each level, the closed outlines of {f(x, y) ≥ level} as path data (fill-rule evenodd).
 */
export function isoPaths(f, r, step, levels) {
  const nx = Math.max(2, Math.ceil(r.w / step)) + 2, ny = Math.max(2, Math.ceil(r.h / step)) + 2;
  const sx = r.w / (nx - 2), sy = r.h / (ny - 2);
  const X = (i) => r.x + (i - 1) * sx, Y = (j) => r.y + (j - 1) * sy;
  const W = nx + 1;
  const v = new Float64Array(W * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * W + i] = i === 0 || j === 0 || i === nx || j === ny ? -1e9 : f(X(i), Y(j));
  return levels.map((L) => contour(v, W, nx, ny, X, Y, L));
}

function contour(v, W, nx, ny, X, Y, L) {
  // edge ids: horizontal (i, j)→(i+1, j) = 2·(j·W + i); vertical (i, j)→(i, j+1) = 2·(j·W + i) + 1
  const pt = new Map();
  const point = (e) => {
    let p = pt.get(e);
    if (p) return p;
    const idx = e >> 1, i = idx % W, j = (idx - i) / W;
    const a = v[idx], b = e & 1 ? v[idx + W] : v[idx + 1];
    const t = Math.max(0, Math.min(1, (L - a) / (b - a || 1e-9)));
    p = e & 1 ? [X(i), Y(j) + (Y(j + 1) - Y(j)) * t] : [X(i) + (X(i + 1) - X(i)) * t, Y(j)];
    pt.set(e, p);
    return p;
  };
  const adj = new Map();
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const tl = v[j * W + i] >= L, tr = v[j * W + i + 1] >= L, br = v[(j + 1) * W + i + 1] >= L, bl = v[(j + 1) * W + i] >= L;
    const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
    if (c === 0 || c === 15) continue;
    const T = 2 * (j * W + i), B = 2 * ((j + 1) * W + i), Lf = 2 * (j * W + i) + 1, R = 2 * (j * W + i + 1) + 1;
    switch (c) {
      case 1: case 14: link(Lf, B); break;
      case 2: case 13: link(B, R); break;
      case 3: case 12: link(Lf, R); break;
      case 4: case 11: link(T, R); break;
      case 6: case 9: link(T, B); break;
      case 7: case 8: link(Lf, T); break;
      case 5: case 10: {
        const mid = (v[j * W + i] + v[j * W + i + 1] + v[(j + 1) * W + i + 1] + v[(j + 1) * W + i]) / 4 >= L;
        if ((c === 5) === mid) { link(Lf, T); link(B, R); } else { link(Lf, B); link(T, R); }
        break;
      }
    }
  }
  let d = '';
  const seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      loop.push(point(cur));
      const nb = adj.get(cur);
      const next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur;
      cur = next;
    }
    if (loop.length > 2) d += simplify(loop);
  }
  return d;
}

/** Drop near-collinear points (keeps outlines smooth but small). */
function simplify(pts, tol = 0.35) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const cross = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    if (cross / len > tol) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return polyD(out);
}
