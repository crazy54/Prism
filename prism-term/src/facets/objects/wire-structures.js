// Wire structures — four braille wireframe machines: a dodecahedron carrying
// its counter-rotating icosahedral dual, a three-ring gimbal gyroscope, a
// pagoda of twisting stacked frustums, and a tesseract turning through its
// two 4D rotation planes.
import { meshes } from '../../math3d.js';
import { projector } from '../../math3d.js';
import { rotX, rotY, rotZ, mul, apply, norm, blend } from './_raster.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Depth-cued segment between projected points [x, y, depth]. */
function wire(cv, a, b, ca, cb, bg, dist) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  for (let s = 0; s <= n; s++) {
    const u = s / n;
    const d = a[2] + (b[2] - a[2]) * u;
    const k = clamp01((dist + 1.5 - d) / 2.6);
    cv.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, blend(bg, blend(ca, cb, u), 0.2 + 0.8 * k * k));
  }
}

/** Bright vertex spark with a one-pixel cross. */
function spark(cv, p, c) {
  cv.set(p[0], p[1], c);
  cv.set(p[0] + 1, p[1], c); cv.set(p[0] - 1, p[1], c);
  cv.set(p[0], p[1] + 1, c); cv.set(p[0], p[1] - 1, c);
}

// ---------------------------------------------------------------------------
// Dodecahedron & Dual — the dodecahedron with its icosahedral dual nested
// inside, counter-rotating; the dual breathes out until its vertices kiss the
// dodecahedron's face centers.
function dodecahedron() {
  const PHI = (1 + Math.sqrt(5)) / 2, inv = 1 / PHI;
  const v = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  for (const a of [-inv, inv]) for (const b of [-PHI, PHI]) { v.push([0, a, b]); v.push([a, b, 0]); v.push([b, 0, a]); }
  const verts = v.map(norm);
  let min = Infinity;
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) {
    const d = Math.hypot(verts[i][0] - verts[j][0], verts[i][1] - verts[j][1], verts[i][2] - verts[j][2]);
    if (d < min - 1e-9) min = d;
  }
  const edges = [];
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) {
    const d = Math.hypot(verts[i][0] - verts[j][0], verts[i][1] - verts[j][1], verts[i][2] - verts[j][2]);
    if (d < min + 1e-6) edges.push([i, j]);
  }
  return { verts, edges };
}

const dodecaDual = {
  id: 'objects-dodeca-dual',
  since: '0.3.0',
  title: 'Dodecahedron Dual',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['dodecahedron', 'icosahedron', 'dual', 'polyhedra', 'wireframe', 'braille'],
  order: 200,
  description: 'A wire dodecahedron with its icosahedral dual counter-rotating inside, breathing out to kiss the pentagon face centers.',
  size: { w: 48, h: 22 },
  minSize: { w: 14, h: 7 },
  loop: 12,
  canvas: 'line',
  palette: 'theme',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const dod = dodecahedron();
    const ico = meshes.icosahedron();
    // Dual scale: distance from centre to a dodecahedron face centre.
    let s = 0;
    for (const v of dod.verts) s = Math.max(s, v[0] * ico.vertices[0][0] + v[1] * ico.vertices[0][1] + v[2] * ico.vertices[0][2]);
    const dist = 3.4;
    const project = projector(cv, { distance: dist, fill: 0.42 });
    const cOut = th.accent, cIn = th.info;

    return (t) => {
      cv.clear();
      const ph = (t / 12) * TAU;
      const MO = mul(rotX(0.38 + 0.12 * Math.sin(ph)), rotY(ph));
      const MI = mul(rotX(0.38 + 0.12 * Math.sin(ph)), rotY(-2 * ph));
      const breathe = s * (0.84 + 0.16 * (0.5 + 0.5 * Math.sin(2 * ph)));
      const PO = dod.verts.map((v) => project(apply(MO, v)));
      const PI = ico.vertices.map((v) => project(apply(MI, [v[0] * breathe, v[1] * breathe, v[2] * breathe])));
      for (const [a, b] of ico.edges) wire(cv, PI[a], PI[b], cIn, cIn, th.bg, dist);
      for (const [a, b] of dod.edges) wire(cv, PO[a], PO[b], cOut, cOut, th.bg, dist);
      for (const p of PO) if (p[2] < dist) spark(cv, p, blend(cOut, 0xffffff, 0.55));
      for (const p of PI) if (p[2] < dist - 0.2) cv.set(p[0], p[1], blend(cIn, 0xffffff, 0.6));
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Gyroscope — three nested gimbal rings on chained pivots and a spoked rotor
// spinning fast in the innermost frame, pivot pins picked out where the
// frames connect.
const gyroscope = {
  id: 'objects-gyroscope',
  since: '0.3.0',
  title: 'Gyroscope',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['gyroscope', 'gimbal', 'rings', 'rotor', 'wireframe', 'braille'],
  order: 210,
  description: 'Three nested gimbal rings turning on chained pivots while a spoked rotor spins fast at the heart of the frame.',
  size: { w: 48, h: 22 },
  minSize: { w: 14, h: 7 },
  loop: 12,
  canvas: 'line',
  palette: 'theme',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const dist = 3.4;
    const project = projector(cv, { distance: dist, fill: 0.42 });
    const N = 72;
    const ringPts = (r, plane) => Array.from({ length: N }, (_, i) => {
      const a = (i / N) * TAU, c = Math.cos(a) * r, sn = Math.sin(a) * r;
      return plane === 'xy' ? [c, sn, 0] : plane === 'xz' ? [c, 0, sn] : [0, c, sn];
    });
    const R1 = ringPts(1, 'xy'), R2 = ringPts(0.76, 'xz'), R3 = ringPts(0.52, 'xy');
    const SPOKES = 6;

    const drawRing = (pts, M, col) => {
      let prev = project(apply(M, pts[N - 1]));
      for (let i = 0; i < N; i++) {
        const p = project(apply(M, pts[i]));
        wire(cv, prev, p, col, col, th.bg, dist);
        prev = p;
      }
    };

    return (t) => {
      cv.clear();
      const ph = (t / 12) * TAU;
      const view = rotX(0.35);
      const M1 = mul(view, rotY(ph));
      const M2 = mul(M1, rotX(1.15 * Math.sin(2 * ph)));
      const M3 = mul(M2, rotZ(10 * ph));
      drawRing(R1, M1, th.accent);
      drawRing(R2, M2, th.info);
      drawRing(R3, M3, th.warn);
      // Rotor spokes and axle along the innermost frame's z axis.
      for (let s = 0; s < SPOKES; s++) {
        const a = (s / SPOKES) * TAU;
        const rim = project(apply(M3, [Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0]));
        wire(cv, project(apply(M3, [0, 0, 0])), rim, blend(th.warn, 0xffffff, 0.3), th.warn, th.bg, dist);
      }
      wire(cv, project(apply(M2, [0, 0, -0.62])), project(apply(M2, [0, 0, 0.62])), th.muted, th.muted, th.bg, dist);
      // Pivot pins: outer on the vertical axis, middle on the shared x axis, axle caps.
      for (const p of [apply(M1, [0, 1, 0]), apply(M1, [0, -1, 0]), apply(M2, [0.76, 0, 0]), apply(M2, [-0.76, 0, 0]), apply(M2, [0, 0, 0.62]), apply(M2, [0, 0, -0.62])]) {
        spark(cv, project(p), blend(th.ink, 0xffffff, 0.4));
      }
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Pagoda Stack — five stacked wire frustums twisting with a phase lag so a
// shear wave climbs the tower, a beacon pulsing at the apex.
const pagodaStack = {
  id: 'objects-pagoda-stack',
  since: '0.3.0',
  title: 'Pagoda Stack',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['pyramid', 'stack', 'tower', 'twist', 'frustum', 'wireframe', 'braille'],
  order: 220,
  description: 'A tower of five wire frustums twisting with a phase lag — a shear wave climbing to a pulsing beacon at the apex.',
  size: { w: 44, h: 24 },
  minSize: { w: 14, h: 8 },
  loop: 10,
  canvas: 'line',
  palette: 'theme',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const dist = 3.8;
    const project = projector(cv, { distance: dist, fill: 0.44, cy: cv.height * 0.52 });
    const LV = 5, BASE = 1.05, TOP = 0.18, H = 2.1;
    const sizes = Array.from({ length: LV + 1 }, (_, k) => BASE - (BASE - TOP) * (k / LV));
    const ys = Array.from({ length: LV + 1 }, (_, k) => 1.05 - H * (k / LV));
    const square = (s, y, yaw) => [0, 1, 2, 3].map((c) => {
      const a = yaw + (c / 4) * TAU + TAU / 8;
      return [Math.cos(a) * s, y, Math.sin(a) * s];
    });

    return (t) => {
      cv.clear();
      const ph = (t / 10) * TAU;
      const view = mul(rotX(0.42), rotY(ph));
      const yaw = (k) => 0.55 * Math.sin(2 * ph - k * 0.95) * (k / LV);
      let below = square(sizes[0], ys[0], yaw(0)).map((p) => project(apply(view, p)));
      for (let k = 0; k < LV; k++) {
        const above = square(sizes[k + 1], ys[k + 1], yaw(k + 1)).map((p) => project(apply(view, p)));
        const col = blend(th.accent, th.info, k / (LV - 1));
        for (let c = 0; c < 4; c++) {
          wire(cv, below[c], below[(c + 1) % 4], col, col, th.bg, dist);
          wire(cv, below[c], above[c], blend(col, th.ink, 0.25), blend(col, th.ink, 0.25), th.bg, dist);
        }
        below = above;
      }
      for (let c = 0; c < 4; c++) wire(cv, below[c], below[(c + 1) % 4], th.info, th.info, th.bg, dist);
      // Apex beacon: a pulse rising off the top of the tower.
      const apex = project(apply(view, [0, ys[LV] - 0.12, 0]));
      const pulse = (t * 2 / 10) % 1;
      spark(cv, apex, blend(th.warn, 0xffffff, 0.5));
      cv.circle(apex[0], apex[1], 1.5 + pulse * 5, blend(th.bg, th.warn, 1 - pulse));
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Tesseract — the 4-cube under a double rotation in the xw and yz planes,
// projected 4D → 3D → 2D; edges shade warm → cool by w, so the inner cube
// turns itself inside out as the cells trade places.
const tesseract = {
  id: 'objects-tesseract',
  since: '0.3.0',
  title: 'Tesseract',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['tesseract', 'hypercube', '4d', 'projection', 'wireframe', 'braille'],
  order: 230,
  description: 'A hypercube in double rotation through the xw and yz planes, w-shaded so the inner cell turns itself inside out.',
  size: { w: 46, h: 22 },
  minSize: { w: 14, h: 7 },
  loop: 16,
  canvas: 'line',
  palette: 'theme',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const verts4 = [];
    for (let i = 0; i < 16; i++) verts4.push([(i & 1 ? 1 : -1), (i & 2 ? 1 : -1), (i & 4 ? 1 : -1), (i & 8 ? 1 : -1)]);
    const edges = [];
    for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) edges.push([i, j]); }
    const dist = 3.6;
    const project = projector(cv, { distance: dist, fill: 0.36 });
    const P = new Array(16);
    const WD = new Array(16);

    return (t) => {
      cv.clear();
      const a = (t / 16) * TAU, b2 = (t / 16) * TAU * 2;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b2), sb = Math.sin(b2);
      const view = mul(rotX(0.35), rotY(a));
      for (let i = 0; i < 16; i++) {
        const [x, y, zc, w] = verts4[i];
        const xr = x * ca - w * sa, wr = x * sa + w * ca;
        const yr = y * cb - zc * sb, zr = y * sb + zc * cb;
        const k = 1.35 / (2.6 - wr);
        P[i] = project(apply(view, [xr * k * 1.6, yr * k * 1.6, zr * k * 1.6]));
        WD[i] = (wr + 1) / 2;
      }
      for (const [i, j] of edges) {
        const ci = blend(th.info, th.warn, WD[i]), cj = blend(th.info, th.warn, WD[j]);
        wire(cv, P[i], P[j], ci, cj, th.bg, dist);
      }
      for (let i = 0; i < 16; i++) cv.set(P[i][0], P[i][1], blend(blend(th.info, th.warn, WD[i]), 0xffffff, 0.35 + WD[i] * 0.3));
      cv.paint(ctx.buffer);
    };
  },
};

export default [dodecaDual, gyroscope, pagodaStack, tesseract];
