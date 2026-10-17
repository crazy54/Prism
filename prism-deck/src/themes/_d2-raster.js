// Cell rasterizer for the `pixel` theme (and pixel-snapped helpers shared with
// `phosphor`). A glyph's safe area (grid units 6–42) is sampled onto a 15 × 15
// matrix — an odd count, so a glyph's center line lands on a cell, not between two —
// with pixel-art rules instead of plain thresholding:
//
//   strokes  walk the centerline cell by cell, then drop "L" corners on curves and
//            diagonals (the pixel-perfect rule), so lines are exactly one cell wide and
//            8-connected; axis-aligned corners (rects, frames) stay square
//   fills    cell centers inside the shape; a fill too small to cover any center
//            still lights the cell under its middle
//   opacity  quantized to palette steps (1 · 0.7 · 0.45 · 0.25); fainter is dropped
//
//   const R = rasterize(pen.flat(), styleOf);   // { n, cu, x0, cells: [{ i, x, y, color, q, role }] }
//   R.runs(colorOf)                               // horizontal runs per color → [{ color, runs: [[x, y, len]] }]

import { flattenPath, insidePolys, distToPolys, transformPath } from '../scene/geom.js';

export const MATRIX = Object.freeze({ n: 15, x0: 6, span: 36 });
export const LEVELS = [1, 0.7, 0.45, 0.25];

/** Apply a transform chain (translate / rotate / scale, as Pen.group emits) to path data. */
export function applyTf(d, tf) {
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  for (const [, fn, args] of tf.matchAll(/(translate|rotate|scale|matrix)\(([^)]*)\)/g)) {
    const v = args.trim().split(/[\s,]+/).map(Number);
    if (fn === 'translate') m = mul(m, [1, 0, 0, 1, v[0], v[1] || 0]);
    else if (fn === 'scale') m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
    else if (fn === 'matrix') m = mul(m, v);
    else { const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0; m = mul(m, [1, 0, 0, 1, cx, cy]); m = mul(m, [c, s, -s, c, 0, 0]); m = mul(m, [1, 0, 0, 1, -cx, -cy]); }
  }
  return transformPath(d, m, (x) => +x.toFixed(3));
}

export const flatD = (p) => (p.transforms?.length ? p.transforms.reduceRight((acc, tf) => applyTf(acc, tf), p.d) : p.d);

export function quantize(op, levels = LEVELS) {
  if (op < levels[levels.length - 1] * 0.5) return 0;
  let best = levels[0];
  for (const l of levels) if (Math.abs(l - op) < Math.abs(best - op)) best = l;
  return best;
}

/** Cell index for a coordinate; ties on a cell boundary go to the cell nearer the glyph center (24). */
function cellOf(v, x0, cu) {
  const f = (v - x0) / cu, r = Math.round(f);
  if (Math.abs(f - r) < 1e-6) return v < 24 ? r : r - 1;
  return Math.floor(f);
}

function strokeCells(polys, n, x0, cu) {
  const out = new Set();
  for (const pl of polys) {
    const pts = pl.closed && pl.pts.length > 2 ? [...pl.pts, pl.pts[0]] : pl.pts;
    const seq = [];
    if (pts.length === 1) { const cx = cellOf(pts[0][0], x0, cu), cy = cellOf(pts[0][1], x0, cu); seq.push([cx, cy, false]); }
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(len / (cu * 0.2)));
      const axis = Math.abs(bx - ax) < 1e-6 || Math.abs(by - ay) < 1e-6;
      for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
        const t = s / steps;
        const cx = cellOf(ax + (bx - ax) * t, x0, cu), cy = cellOf(ay + (by - ay) * t, x0, cu);
        const last = seq[seq.length - 1];
        if (last && last[0] === cx && last[1] === cy) { if (!axis) last[2] = true; continue; }
        seq.push([cx, cy, !axis]);
      }
    }
    // pixel-perfect: a → b → c turning an L where a and c touch diagonally drops b (on curves)
    const keep = [];
    for (const c of seq) {
      if (keep.length >= 2) {
        const a = keep[keep.length - 2], b = keep[keep.length - 1];
        const L = (a[0] === b[0] || a[1] === b[1]) && (b[0] === c[0] || b[1] === c[1]) && a[0] !== c[0] && a[1] !== c[1];
        if (L && (b[2] || a[2] || c[2])) keep.pop();
      }
      keep.push(c);
    }
    for (const [cx, cy] of keep) if (cx >= 0 && cy >= 0 && cx < n && cy < n) out.add(cy * n + cx);
  }
  return out;
}

function thickCells(polys, n, x0, cu, half) {
  const out = new Set();
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = x0 + (x + 0.5) * cu + 1e-4, py = x0 + (y + 0.5) * cu + 1e-4;
    if (distToPolys(px, py, polys) < half) out.add(y * n + x);
  }
  return out;
}

function fillCells(polys, n, x0, cu) {
  const out = new Set();
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const pl of polys) for (const [x, y] of pl.pts) { if (x < bx0) bx0 = x; if (y < by0) by0 = y; if (x > bx1) bx1 = x; if (y > by1) by1 = y; }
  if (bx0 === Infinity) return out;
  const i0 = Math.max(0, cellOf(bx0, x0, cu)), i1 = Math.min(n - 1, cellOf(bx1, x0, cu));
  const j0 = Math.max(0, cellOf(by0, x0, cu)), j1 = Math.min(n - 1, cellOf(by1, x0, cu));
  for (let y = j0; y <= j1; y++) for (let x = i0; x <= i1; x++) {
    const px = x0 + (x + 0.5) * cu + 1e-4, py = x0 + (y + 0.5) * cu + 1e-4;
    if (insidePolys(px, py, polys) || distToPolys(px, py, polys) < cu * 0.16) out.add(y * n + x);
  }
  if (!out.size) {
    const cx = cellOf((bx0 + bx1) / 2, x0, cu), cy = cellOf((by0 + by1) / 2, x0, cu);
    if (cx >= 0 && cy >= 0 && cx < n && cy < n) out.add(cy * n + cx);
  }
  return out;
}

/**
 * Rasterize flat glyph primitives. styleOf(p) → resolved role style { color, opacity, … }.
 * Later primitives paint over earlier ones (topmost wins, as in the vector glyph).
 */
export function rasterize(prims, styleOf, { n = MATRIX.n, x0 = MATRIX.x0, span = MATRIX.span, levels = LEVELS } = {}) {
  const cu = span / n;
  const grid = new Array(n * n).fill(null);
  prims.forEach((p, z) => {
    const st = styleOf(p);
    const q = quantize((st.opacity ?? 1) * (p.opacity ?? 1), levels);
    if (!q) return;
    const polys = flattenPath(flatD(p), 0.3);
    if (!polys.length) return;
    const hits = p.fill ? fillCells(polys, n, x0, cu) : (p.weight ?? 1) >= 1.45 ? thickCells(polys, n, x0, cu, cu * 0.78) : strokeCells(polys, n, x0, cu);
    // a fainter part never punches a dim hole into a brighter one beneath it (vector paint would blend)
    for (const i of hits) if (!grid[i] || q >= grid[i].q) grid[i] = { color: st.color, q, role: p.role, z };
  });
  const cells = [];
  grid.forEach((c, i) => { if (c) cells.push({ i, x: i % n, y: Math.floor(i / n), ...c }); });
  return {
    n, cu, x0, grid, cells,
    /** Horizontal runs grouped by the color colorOf(cell) returns (null = skip). → [{ color, runs: [[x, y, len]] }] (cell units) */
    runs(colorOf = (c) => c.color) {
      const by = new Map();
      for (let y = 0; y < n; y++) {
        let x = 0;
        while (x < n) {
          const c = grid[y * n + x];
          const col = c ? colorOf({ ...c, x, y }) : null;
          if (!col) { x++; continue; }
          let e = x;
          while (e + 1 < n && grid[y * n + e + 1] && colorOf({ ...grid[y * n + e + 1], x: e + 1, y }) === col) e++;
          if (!by.has(col)) by.set(col, []);
          by.get(col).push([x, y, e - x + 1]);
          x = e + 1;
        }
      }
      return [...by].map(([color, runs]) => ({ color, runs }));
    },
  };
}

/** Bayer 4 × 4 ordered-dither threshold (0–1) for a lattice cell. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** Path data for lattice runs [[x, y, len]] with cell size c px at origin (ox, oy). */
export function latticePath(runs, c, ox = 0, oy = 0, inset = 0) {
  let s = '';
  const f = (v) => +v.toFixed(3);
  for (const [x, y, len] of runs) s += `M${f(ox + x * c + inset)} ${f(oy + y * c + inset)}h${f(len * c - inset * 2)}v${f(c - inset * 2)}h${f(-(len * c - inset * 2))}Z`;
  return s;
}

/** Merge a set of lit lattice cells (Set of `${x},${y}` or an array of [x, y]) into runs. */
export function cellsToRuns(list) {
  const rows = new Map();
  for (const [x, y] of list) { if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
  const runs = [];
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    let s = xs[0], p = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === p + 1) { p = xs[i]; continue; }
      if (i < xs.length && xs[i] === p) continue;
      runs.push([s, y, p - s + 1]);
      if (i < xs.length) { s = xs[i]; p = xs[i]; }
    }
  }
  return runs;
}
