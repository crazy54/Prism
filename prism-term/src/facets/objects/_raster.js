// Shared software-3D helpers for the objects/sim/lab galleries: a z-buffered
// triangle rasterizer with interpolated intensity (flat or Gouraud), a mesh
// drawer with camera-facing lighting normals, an analytic lit sphere, and a
// deterministic star backdrop. Everything writes straight into a Canvas.

import { NONE, luminance } from '../../color.js';

export function zbuffer(cv) {
  const z = new Float32Array(cv.width * cv.height);
  z.fill(Infinity);
  return z;
}

/**
 * Fill a triangle. a/b/c are projected [x, y, depth] (smaller depth = nearer);
 * ia/ib/ic are per-vertex values interpolated into shade(value, x, y) → color.
 */
export function tri(cv, z, a, b, c, ia, ib, ic, shade) {
  const W = cv.width, H = cv.height, px = cv.px;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (!(Math.abs(area) > 1e-9) || x0 > x1 || y0 > y1) return;
  const inv = 1 / area;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const pxc = x + 0.5;
      const w0 = ((b[0] - pxc) * (c[1] - py) - (b[1] - py) * (c[0] - pxc)) * inv;
      const w1 = ((c[0] - pxc) * (a[1] - py) - (c[1] - py) * (a[0] - pxc)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const d = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const i = y * W + x;
      if (d >= z[i]) continue;
      const col = shade(w0 * ia + w1 * ib + w2 * ic, x, y);
      if (col === NONE) continue;
      z[i] = d;
      px[i] = col;
    }
  }
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export { sub, cross, dot, norm };

/**
 * Draw a polygon mesh. `transform` maps model → camera space (camera at
 * z = -distance looking +z), `project` maps camera space → [x, y, depth].
 * Normals are oriented towards the camera, which for a closed mesh behind a
 * z-buffer is the outward normal of every visible face.
 *   light      unit vector pointing *towards* the light, camera space
 *   shade(i, faceIndex, x, y) → color, with i the lit intensity in 0..1+
 *   normals    optional per-vertex model normals → Gouraud shading
 */
export function drawMesh(cv, z, mesh, { transform, project, light, shade, ambient = 0.16, specular = 0, shininess = 24, camera = [0, 0, -3.2], normals = null, faces = null }) {
  const V = mesh.vertices.map(transform);
  const P = V.map(project);
  const lit = (n, p) => {
    let l = Math.max(0, dot(n, light));
    let s = 0;
    if (specular > 0) {
      const v = norm(sub(camera, p));
      const h = norm([light[0] + v[0], light[1] + v[1], light[2] + v[2]]);
      s = specular * Math.pow(Math.max(0, dot(n, h)), shininess);
    }
    return ambient + (1 - ambient) * l + s;
  };
  const VN = normals ? normals.map((n) => norm(sub(transform(n), transform([0, 0, 0])))) : null;
  const list = faces || mesh.faces;
  list.forEach((f, fi) => {
    const a = V[f[0]], b = V[f[1]], c = V[f[2]];
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (dot(n, sub(a, camera)) > 0) n = [-n[0], -n[1], -n[2]];
    const flat = lit(n, a);
    for (let k = 1; k + 1 < f.length; k++) {
      const i0 = f[0], i1 = f[k], i2 = f[k + 1];
      let ia = flat, ib = flat, ic = flat;
      if (VN) {
        const o = (i) => (dot(VN[i], n) < 0 ? [-VN[i][0], -VN[i][1], -VN[i][2]] : VN[i]);
        ia = lit(o(i0), V[i0]); ib = lit(o(i1), V[i1]); ic = lit(o(i2), V[i2]);
      }
      tri(cv, z, P[i0], P[i1], P[i2], ia, ib, ic, (i, x, y) => shade(i, fi, x, y));
    }
  });
  return P;
}

/**
 * Analytic sphere at canvas (cx, cy) with radius r (horizontal pixels).
 * shade(nx, ny, nz, x, y) gets the camera-space unit normal (nz < 0 faces the
 * viewer) and returns a color (or NONE to leave the pixel). zr is the radius
 * in depth units, so overlapping spheres intersect correctly in the z-buffer.
 */
export function sphere(cv, z, cx, cy, r, depth, shade, zr = r * 0.01) {
  const W = cv.width, H = cv.height, px = cv.px, asp = cv.aspect;
  const ry = r / asp;
  const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) {
    const ny = ((y + 0.5 - cy) * asp) / r;
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / r;
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      const nz = -Math.sqrt(1 - q);
      const d = depth + nz * zr;
      const i = y * W + x;
      if (z && d >= z[i]) continue;
      const col = shade(nx, ny, nz, x, y);
      if (col === NONE) continue;
      if (z) z[i] = d;
      px[i] = col;
    }
  }
}

/** Deterministic twinkling stars; call draw(cv, t) each frame (before the subject). */
export function starfield(rng, n, tint = 0xc8d4ff) {
  const stars = Array.from({ length: n }, () => ({ x: rng(), y: rng(), b: 0.25 + rng() * 0.75, ph: rng() * 6.28, sp: 0.6 + rng() * 2.4 }));
  // bg: pass the theme background — stars fade in from it, and on a light
  // theme (a daylight sky) only the brightest show, as faint gray specks.
  return (cv, t, strength = 1, bg = 0x000000) => {
    const day = luminance(bg) > 0.5;
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
      const k = s.b * tw * strength;
      if (day && k < 0.6) continue;
      cv.set(s.x * cv.width, s.y * cv.height, day ? blend(bg, 0x7a8494, (k - 0.6) * 0.8) : blend(bg, tint, k));
    }
  };
}

/** Scale a packed color, saturating. */
export function lit(c, k) {
  if (c === NONE) return NONE;
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return (r << 16) | (g << 8) | (b | 0);
}

/** Linear mix of two packed colors, t clamped to [0, 1] (no NONE handling — callers pass real colors). */
export function blend(a, b, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (r << 16) | (g << 8) | (bl | 0);
}

/** Rotation matrix helpers (row-major 3×3 arrays). */
export function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
export function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
export function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
export function mul(A, B) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return out;
}
export function apply(M, p) { return [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]]; }
export function transpose(M) { return [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]; }

/** Perspective projector onto a canvas: unit radius ≈ fill × the shorter visual side. */
export function perspective(cv, { distance = 3.2, fill = 0.42, cx, cy } = {}) {
  const W = cv.width, H = cv.height, asp = cv.aspect;
  const s = Math.min(W, H * asp) * fill * distance;
  const ox = cx ?? W / 2, oy = cy ?? H / 2;
  return (p) => { const d = p[2] + distance; const k = s / Math.max(0.05, d); return [ox + p[0] * k, oy + (p[1] * k) / asp, d]; };
}

/**
 * Scanline-fill a polygon ([[x,y],…], even-odd) calling fn(x, y, old) → color
 * for every covered pixel — for blended/glassy fills that need the pixel below.
 */
export function fillPoly(cv, pts, fn) {
  if (pts.length < 3) return;
  const W = cv.width, H = cv.height, px = cv.px;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const ya = Math.max(0, Math.ceil(minY - 0.5)), yb = Math.min(H - 1, Math.floor(maxY - 0.5));
  const xs = [];
  for (let y = ya; y <= yb; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > sy) !== (yj > sy)) xs.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) {
        const i = y * W + x;
        const c = fn(x, y, px[i]);
        if (c !== NONE) px[i] = c;
      }
    }
  }
}

/**
 * Soft elliptical floor shadow. `under` is the color behind transparent
 * pixels (pass ctx.theme.bg) so the shadow darkens the real background.
 */
export function shadow(cv, cx, cy, rx, ry, strength, under) {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(cv.width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(cv.height - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const q = dx * dx + dy * dy;
    if (q >= 1) continue;
    const a = strength * (1 - q) * (1 - q);
    const i = y * cv.width + x;
    const old = cv.px[i] === NONE ? under : cv.px[i];
    cv.px[i] = blend(old, 0x000000, a);
  }
}
