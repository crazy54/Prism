// Sculpted solids — five shaded bodies for the 3D Solids shelf: a support-
// function morph through all five Platonic solids, a superquadric that bends
// between sphere, cube, diamond and barrel, an icosphere blooming through its
// subdivision levels, a Möbius band with a runner proving its one edge, and a
// spinning top holding itself up by precession.
import { meshes } from '../../math3d.js';
import { zbuffer, drawMesh, perspective, shadow, rotX, rotY, rotZ, mul, apply, norm, blend } from './_raster.js';
import { easing } from '../../easing.js';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;

/** Icosahedron subdivided `freq` times per edge, projected to the unit sphere. */
function icosphere(freq) {
  const ico = meshes.icosahedron();
  const verts = [], index = new Map(), faces = [];
  const vid = (p) => {
    const n = norm(p), key = `${Math.round(n[0] * 1e4)},${Math.round(n[1] * 1e4)},${Math.round(n[2] * 1e4)}`;
    if (!index.has(key)) { index.set(key, verts.length); verts.push(n); }
    return index.get(key);
  };
  for (const [ia, ib, ic] of ico.faces) {
    const A = ico.vertices[ia], B = ico.vertices[ib], C = ico.vertices[ic];
    const P = (i, j) => { const k = freq - i - j; return vid([A[0] * k + B[0] * i + C[0] * j, A[1] * k + B[1] * i + C[1] * j, A[2] * k + B[2] * i + C[2] * j]); };
    for (let i = 0; i < freq; i++) for (let j = 0; i + j < freq; j++) {
      faces.push([P(i, j), P(i + 1, j), P(i, j + 1)]);
      if (i + j + 2 <= freq) faces.push([P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
    }
  }
  return { verts, faces };
}

// ---------------------------------------------------------------------------
// Platonic Morph — one convex body flowing through all five Platonic solids.
// Each solid is the intersection of half-spaces, so its radius along any ray
// is min(1 / dot(ray, face normal)); morphing those radii on a fixed geodesic
// tessellation turns flat faces and sharp edges into each other continuously.
const HOLD_P = 2.2, MORPH_P = 1.2, SOLIDS = 5;

const platonicMorph = {
  id: 'objects-platonic-morph',
  since: '0.3.0',
  title: 'Platonic Morph',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['platonic', 'polyhedra', 'morph', 'tetrahedron', 'dodecahedron', '3d', 'shaded'],
  order: 200,
  description: 'One shaded body flowing tetrahedron → cube → octahedron → dodecahedron → icosahedron, faces flattening out of the morph.',
  size: { w: 52, h: 24 },
  minSize: { w: 16, h: 7 },
  loop: SOLIDS * (HOLD_P + MORPH_P),
  canvas: 'field',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const pal = ctx.palette();
    const th = ctx.theme;
    const geo = icosphere(4);
    const ico = meshes.icosahedron();
    // Face-normal sets: tetra, cube, octa, dodeca (= icosa verts), icosa (= face centroids).
    const sets = [
      [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(norm),
      [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
      [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]].map(norm),
      ico.vertices,
      ico.faces.map(([a, b, c]) => norm([ico.vertices[a][0] + ico.vertices[b][0] + ico.vertices[c][0], ico.vertices[a][1] + ico.vertices[b][1] + ico.vertices[c][1], ico.vertices[a][2] + ico.vertices[b][2] + ico.vertices[c][2]])),
    ];
    const radii = sets.map((planes) => {
      const r = new Float32Array(geo.verts.length);
      let max = 0;
      for (let i = 0; i < geo.verts.length; i++) {
        const u = geo.verts[i];
        let best = Infinity;
        for (const n of planes) { const d = u[0] * n[0] + u[1] * n[1] + u[2] * n[2]; if (d > 1e-6) best = Math.min(best, 1 / d); }
        r[i] = best;
        if (best > max) max = best;
      }
      for (let i = 0; i < r.length; i++) r[i] /= max;
      return r;
    });
    const verts = geo.verts.map(() => [0, 0, 0]);
    const mesh = { vertices: verts, faces: geo.faces };
    const dist = 4;
    const project = perspective(cv, { distance: dist, fill: 0.3, cy: cv.height * 0.46 });
    const light = norm([-0.5, -0.8, -0.5]);
    const period = SOLIDS * (HOLD_P + MORPH_P);
    const span = Math.min(cv.width, cv.height * cv.aspect);

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      const tl = ((t % period) + period) % period;
      const k = Math.floor(tl / (HOLD_P + MORPH_P)), f = tl - k * (HOLD_P + MORPH_P);
      const m = f < HOLD_P ? 0 : easing.inOutCubic((f - HOLD_P) / MORPH_P);
      const rA = radii[k], rB = radii[(k + 1) % SOLIDS];
      for (let i = 0; i < verts.length; i++) {
        const r = rA[i] + (rB[i] - rA[i]) * m, u = geo.verts[i], v = verts[i];
        v[0] = u[0] * r; v[1] = u[1] * r; v[2] = u[2] * r;
      }
      const M = mul(rotX(0.42 + 0.1 * Math.sin((tl / period) * TAU)), rotY((tl / period) * TAU * 2));
      const hue = (k + m) / SOLIDS;
      const base = blend(pal(0.1 + hue * 0.8), th.ink, 0.12);
      const floorY = project([0, 1.35, 0])[1];
      shadow(cv, cv.width / 2, floorY, span * 0.3, Math.max(1.2, (span * 0.07) / cv.aspect), 0.55, th.bg);
      drawMesh(cv, z, mesh, {
        transform: (p) => apply(M, p),
        project, light, camera: [0, 0, -dist], specular: 0.4, shininess: 20, ambient: 0.3,
        shade: (i) => (i <= 1 ? blend(0x000000, base, Math.max(0.08, i)) : blend(base, 0xffffff, Math.min(1, i - 1))),
      });
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Superellipsoid — a superquadric sweeping its two exponents between sphere,
// rounded cube, sharp diamond and barrel, Gouraud-shaded from the closed-form
// superquadric normal, hue wrapped around its equator.
const SE_KEYS = [[1, 1], [0.24, 0.24], [2.4, 2.4], [0.3, 1.6]];
const HOLD_S = 1.6, MORPH_S = 1.4;

const superellipsoid = {
  id: 'objects-superellipsoid',
  since: '0.3.0',
  title: 'Superellipsoid',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['superellipsoid', 'superquadric', 'morph', 'sphere', 'cube', '3d', 'gouraud'],
  order: 210,
  description: 'A superquadric morphing its exponents — sphere to rounded cube to sharp diamond to barrel — with smooth analytic shading.',
  size: { w: 50, h: 22 },
  minSize: { w: 16, h: 7 },
  loop: SE_KEYS.length * (HOLD_S + MORPH_S),
  canvas: 'field',
  palette: 'ocean',
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const pal = ctx.palette();
    const th = ctx.theme;
    const LAT = 14, LON = 26;
    const eta = Array.from({ length: LAT + 1 }, (_, i) => -Math.PI / 2 + (i / LAT) * Math.PI);
    const om = Array.from({ length: LON }, (_, j) => (j / LON) * TAU);
    const verts = [], normals = [], faces = [], faceHue = [];
    for (let i = 0; i <= LAT; i++) for (let j = 0; j < LON; j++) { verts.push([0, 0, 0]); normals.push([0, 1, 0]); }
    for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
      const a = i * LON + j, b = (i + 1) * LON + j, c = (i + 1) * LON + ((j + 1) % LON), d = i * LON + ((j + 1) % LON);
      faces.push([a, b, c, d]);
      faceHue.push(((j + 0.5) / LON) % 1);
    }
    const mesh = { vertices: verts, faces };
    const sgnPow = (v, e) => (v < 0 ? -Math.pow(-v, e) : Math.pow(v, e));
    const dist = 4;
    const project = perspective(cv, { distance: dist, fill: 0.3 });
    const light = norm([-0.55, -0.7, -0.5]);
    const period = SE_KEYS.length * (HOLD_S + MORPH_S);

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      const tl = ((t % period) + period) % period;
      const k = Math.floor(tl / (HOLD_S + MORPH_S)), f = tl - k * (HOLD_S + MORPH_S);
      const m = f < HOLD_S ? 0 : easing.inOutCubic((f - HOLD_S) / MORPH_S);
      const A = SE_KEYS[k], B = SE_KEYS[(k + 1) % SE_KEYS.length];
      const e1 = lerp(A[0], B[0], m), e2 = lerp(A[1], B[1], m);
      for (let i = 0; i <= LAT; i++) {
        const ce = Math.cos(eta[i]), se = Math.sin(eta[i]);
        const cp = sgnPow(ce, e1), sp = sgnPow(se, e1);
        const cn = sgnPow(ce, 2 - e1), sn = sgnPow(se, 2 - e1);
        for (let j = 0; j < LON; j++) {
          const co = Math.cos(om[j]), so = Math.sin(om[j]);
          const v = verts[i * LON + j], n = normals[i * LON + j];
          v[0] = 0.86 * cp * sgnPow(co, e2); v[1] = 0.86 * sp; v[2] = 0.86 * cp * sgnPow(so, e2);
          n[0] = cn * sgnPow(co, 2 - e2); n[1] = sn; n[2] = cn * sgnPow(so, 2 - e2);
          const l = Math.hypot(n[0], n[1], n[2]) || 1;
          n[0] /= l; n[1] /= l; n[2] /= l;
        }
      }
      const M = mul(rotX(0.42 + 0.12 * Math.sin((tl / period) * TAU)), rotY((tl / period) * TAU * 2));
      drawMesh(cv, z, mesh, {
        transform: (p) => apply(M, p),
        project, light, camera: [0, 0, -dist], normals, specular: 0, ambient: 0.26,
        shade: (i, fi) => {
          const c = blend(pal(0.25 + faceHue[fi] * 0.6), th.ink, 0.08);
          return i <= 1 ? blend(0x000000, c, Math.max(0.08, i)) : blend(c, 0xffffff, Math.min(1, i - 1));
        },
      });
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Icosphere Bloom — an icosahedron subdividing live: each level's new vertices
// are born flat on the previous surface at edge midpoints, then bloom outward
// to the sphere; after the finest level the ball collapses and the raw
// icosahedron springs back.
function subdivideLevel(prev) {
  const verts = prev.verts.map((v) => v.slice());
  const start = prev.verts.map((v) => v.slice());
  const faces = [];
  const mids = new Map();
  const getMid = (a, b) => {
    const key = a < b ? a * 65536 + b : b * 65536 + a;
    if (mids.has(key)) return mids.get(key);
    const va = prev.verts[a], vb = prev.verts[b];
    const m = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
    const id = verts.length;
    verts.push(norm(m));
    start.push(m);
    mids.set(key, id);
    return id;
  };
  for (const [a, b, c] of prev.faces) {
    const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
    faces.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
  }
  return { verts, start, faces };
}

const SEG_B = 3.5, LEVELS_B = 4;

const icosphereBloom = {
  id: 'objects-icosphere-bloom',
  since: '0.3.0',
  title: 'Icosphere Bloom',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['icosphere', 'subdivision', 'icosahedron', 'tessellation', 'sphere', '3d'],
  order: 220,
  description: 'An icosahedron subdividing live — each level is born flat at edge midpoints and blooms out to the sphere, 20 to 1280 faces.',
  size: { w: 50, h: 24 },
  minSize: { w: 16, h: 7 },
  loop: LEVELS_B * SEG_B,
  canvas: 'field',
  palette: 'ice',
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const pal = ctx.palette();
    const th = ctx.theme;
    const ico = meshes.icosahedron();
    const levels = [{ verts: ico.vertices.map((v) => v.slice()), start: ico.vertices.map((v) => v.slice()), faces: ico.faces }];
    for (let i = 1; i < LEVELS_B; i++) levels.push(subdivideLevel(levels[i - 1]));
    const scratch = levels.map((lv) => ({ vertices: lv.verts.map(() => [0, 0, 0]), faces: lv.faces }));
    const dist = 4;
    const project = perspective(cv, { distance: dist, fill: 0.3, cy: cv.height * 0.47 });
    const light = norm([-0.5, -0.75, -0.55]);
    const period = LEVELS_B * SEG_B;
    const span = Math.min(cv.width, cv.height * cv.aspect);

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      const tl = ((t % period) + period) % period;
      const k = Math.floor(tl / SEG_B), f = tl - k * SEG_B;
      const lv = levels[k], sc = scratch[k];
      const bloom = easing.inOutCubic(Math.min(1, f / 0.9));
      // Final level: collapse in the last 0.6 s so level 0 can spring back in.
      const tail = k === LEVELS_B - 1 ? Math.max(0, (f - (SEG_B - 0.6)) / 0.6) : 0;
      const scale = (k === 0 ? 0.3 + 0.7 * easing.outBack(Math.min(1, f / 0.8)) : 1) * (1 - easing.inCubic(tail) * 0.97);
      for (let i = 0; i < lv.verts.length; i++) {
        const s = lv.start[i], e = lv.verts[i], v = sc.vertices[i];
        v[0] = lerp(s[0], e[0], bloom) * scale;
        v[1] = lerp(s[1], e[1], bloom) * scale;
        v[2] = lerp(s[2], e[2], bloom) * scale;
      }
      const M = mul(rotX(0.4 + 0.08 * Math.sin((tl / period) * TAU)), rotY((tl / period) * TAU * 2));
      const base = blend(pal(0.45 + k * 0.12), th.ink, 0.1);
      const floorY = project([0, 1.3, 0])[1];
      shadow(cv, cv.width / 2, floorY, span * 0.28 * scale, Math.max(1.2, (span * 0.06 * scale) / cv.aspect), 0.5, th.bg);
      drawMesh(cv, z, sc, {
        transform: (p) => apply(M, p),
        project, light, camera: [0, 0, -dist], specular: 0.35, shininess: 18, ambient: 0.3,
        shade: (i) => (i <= 1 ? blend(0x000000, base, Math.max(0.08, i)) : blend(base, 0xffffff, Math.min(1, i - 1))),
      });
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Möbius Strip — a shaded half-twist band, and the proof it has one edge: a
// bright runner that must go around twice (720°) before its trail closes.
const moebiusStrip = {
  id: 'objects-moebius-strip',
  since: '0.3.0',
  title: 'Möbius Strip',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['moebius', 'mobius', 'topology', 'band', 'one-sided', '3d'],
  order: 230,
  description: 'A shaded half-twist Möbius band with a glowing runner tracing its single edge — two full laps before the loop closes.',
  size: { w: 54, h: 22 },
  minSize: { w: 16, h: 7 },
  loop: 16,
  canvas: 'field',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const pal = ctx.palette();
    const th = ctx.theme;
    const SEG = 84, SW = 5, WH = 0.42;
    const pt = (u, s) => {
      const ph = u / 2, r = 1 + s * WH * Math.cos(ph);
      return [r * Math.cos(u) * 0.78, s * WH * Math.sin(ph) * 0.78, r * Math.sin(u) * 0.78];
    };
    const verts = [], normals = [], faces = [], faceU = [];
    for (let i = 0; i < SEG; i++) {
      const u = (i / SEG) * TAU;
      for (let j = 0; j < SW; j++) {
        const s = -1 + (2 * j) / (SW - 1);
        verts.push(pt(u, s));
        const du = [pt(u + 0.01, s), pt(u - 0.01, s)], ds = [pt(u, s + 0.01), pt(u, s - 0.01)];
        const a = [du[0][0] - du[1][0], du[0][1] - du[1][1], du[0][2] - du[1][2]];
        const b = [ds[0][0] - ds[1][0], ds[0][1] - ds[1][1], ds[0][2] - ds[1][2]];
        normals.push(norm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]));
      }
    }
    // Ring i joins ring i+1; the final ring joins ring 0 with the band flipped.
    for (let i = 0; i < SEG; i++) {
      const i2 = (i + 1) % SEG, flip = i === SEG - 1;
      for (let j = 0; j + 1 < SW; j++) {
        const j2 = flip ? SW - 1 - j : j, j3 = flip ? SW - 2 - j : j + 1;
        faces.push([i * SW + j, i2 * SW + j2, i2 * SW + j3, i * SW + j + 1]);
        faceU.push(i / SEG);
      }
    }
    const mesh = { vertices: verts, faces };
    const dist = 4;
    const project = perspective(cv, { distance: dist, fill: 0.36 });
    const light = norm([-0.45, -0.7, -0.6]);
    const TRAIL = 30;

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      const M = mul(rotX(0.6 + 0.18 * Math.sin((t / 16) * TAU)), rotY((t / 16) * TAU));
      const tf = (p) => apply(M, p);
      drawMesh(cv, z, mesh, {
        transform: tf, project, light, camera: [0, 0, -dist], normals, specular: 0.3, shininess: 14, ambient: 0.3,
        shade: (i, fi) => {
          const c = blend(pal(faceU[fi]), th.ink, 0.14);
          return i <= 1 ? blend(0x000000, c, Math.max(0.1, i)) : blend(c, 0xffffff, Math.min(1, i - 1));
        },
      });
      // The edge runner: u covers 4π per loop — one circuit of the single edge.
      const head = (t / 16) * 2 * TAU;
      for (let k = TRAIL; k >= 0; k--) {
        const P = project(tf(pt(head - k * 0.1, 1)));
        const x = Math.floor(P[0]), y = Math.floor(P[1]);
        if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) continue;
        const idx = y * cv.width + x;
        if (P[2] > z[idx] + 0.07) continue;
        const glow = 1 - k / (TRAIL + 1);
        cv.px[idx] = blend(th.accent2, 0xffffff, glow * glow);
      }
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Spinning Top — a lathed top spinning fast on its tip while the lean axis
// precesses around the vertical, with nutation wobble, the knob tracing a
// fading circle in the air and a contact shadow pinned at the tip.
const gyroTop = {
  id: 'objects-gyro-top',
  since: '0.3.0',
  title: 'Spinning Top',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['top', 'precession', 'gyroscope', 'physics', 'spin', '3d'],
  order: 240,
  description: 'A lathed top spinning on its tip, lean axis precessing with a nutation wobble while the knob traces a fading halo.',
  size: { w: 50, h: 24 },
  minSize: { w: 16, h: 8 },
  loop: 12,
  canvas: 'field',
  palette: 'sunset',
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const pal = ctx.palette();
    const th = ctx.theme;
    const SIDES = 18;
    // Profile from the tip (y = 0) up the body (−y): [radius, y, zone].
    const prof = [[0, 0, 0], [0.07, -0.12, 0], [0.3, -0.44, 1], [0.56, -0.74, 1], [0.58, -0.88, 1], [0.3, -0.98, 1], [0.11, -1.05, 2], [0.1, -1.3, 2], [0.16, -1.4, 2], [0.05, -1.52, 2]];
    const verts = [], faces = [], faceSec = [], faceZone = [];
    for (let p = 0; p < prof.length; p++)
      for (let s = 0; s < SIDES; s++) {
        const a = (s / SIDES) * TAU;
        verts.push([prof[p][0] * Math.cos(a), prof[p][1], prof[p][0] * Math.sin(a)]);
      }
    for (let p = 0; p + 1 < prof.length; p++)
      for (let s = 0; s < SIDES; s++) {
        const s2 = (s + 1) % SIDES;
        faces.push([p * SIDES + s, (p + 1) * SIDES + s, (p + 1) * SIDES + s2, p * SIDES + s2]);
        faceSec.push(s / SIDES);
        faceZone.push(prof[p + 1][2]);
      }
    const mesh = { vertices: verts, faces };
    const dist = 4.4;
    const project = perspective(cv, { distance: dist, fill: 0.3, cy: cv.height * 0.56 });
    const light = norm([-0.5, -0.75, -0.55]);
    const TIP = [0, 0.92, 0];
    const pose = (tt) => {
      const theta = 0.46 + 0.06 * Math.sin((tt / 12) * TAU * 3);
      return mul(rotY((tt / 12) * TAU * 2), mul(rotZ(theta), rotY((tt / 12) * TAU * 22)));
    };
    const span = Math.min(cv.width, cv.height * cv.aspect);

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      const M = pose(t);
      const tf = (p) => { const q = apply(M, p); return [q[0] + TIP[0], q[1] + TIP[1], q[2] + TIP[2]]; };
      // Knob halo: the precession circle the knob rides, plus a comet trail.
      const knob = [0, -1.52, 0];
      for (let k = 0; k < 90; k++) {
        const P = project(tf2(pose(t - (k / 90) * 6), knob, TIP));
        const fade = k < 26 ? 1 - k / 26 : 0;
        const c = fade > 0 ? blend(blend(th.bg, th.accent2, 0.3), 0xffffff, fade * fade * 0.9) : blend(th.bg, th.dim, 0.5);
        cv.set(P[0], P[1], c);
      }
      const floorY = project([0, TIP[1] + 0.06, 0])[1];
      shadow(cv, project(tf([0, -0.7, 0]))[0], floorY, span * 0.2, Math.max(1.2, (span * 0.05) / cv.aspect), 0.55, th.bg);
      drawMesh(cv, z, mesh, {
        transform: tf, project, light, camera: [0, 0, -dist], specular: 0.5, shininess: 26, ambient: 0.32,
        shade: (i, fi) => {
          const zone = faceZone[fi];
          const c = zone === 1 ? blend(pal(0.25 + faceSec[fi] * 0.6), th.ink, 0.1) : zone === 2 ? blend(th.muted, th.ink, 0.45) : blend(th.ink, 0xffffff, 0.2);
          return i <= 1 ? blend(0x000000, c, Math.max(0.1, i)) : blend(c, 0xffffff, Math.min(1, i - 1));
        },
      });
      cv.paint(ctx.buffer);
    };
  },
};

/** Apply pose M to model point p and translate by tip offset. */
function tf2(M, p, tip) { const q = apply(M, p); return [q[0] + tip[0], q[1] + tip[1], q[2] + tip[2]]; }

export default [platonicMorph, superellipsoid, icosphereBloom, moebiusStrip, gyroTop];
