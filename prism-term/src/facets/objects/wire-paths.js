// Wire paths — braille curves in motion: a Lissajous knot breathing through
// its phase space with comet heads on the wire, a coil spring bouncing under
// a block, and an endless ridge-terrain flyover down a canyon.
import { projector } from '../../math3d.js';
import { rotX, rotY, mul, apply, blend } from './_raster.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function seg(cv, a, b, ca, cb, bg, dist) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
  for (let s = 0; s <= n; s++) {
    const u = s / n;
    const d = a[2] + (b[2] - a[2]) * u;
    const k = clamp01((dist + 1.5 - d) / 2.6);
    cv.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, blend(bg, blend(ca, cb, u), 0.2 + 0.8 * k * k));
  }
}

// ---------------------------------------------------------------------------
// Lissajous Knot — the (3, 4, 7) Lissajous space curve, rainbow along its
// length, with one phase slowly breathing so the knot slides through its own
// crossings; three comet heads chase each other around the wire.
const lissajousKnot = {
  id: 'objects-lissajous-knot',
  since: '0.3.0',
  title: 'Lissajous Knot',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['lissajous', 'knot', 'curve', 'harmonic', 'wireframe', 'braille'],
  order: 240,
  description: 'The (3,4,7) Lissajous knot breathing through its phase space, rainbow-wired, with three comet heads racing the curve.',
  size: { w: 48, h: 22 },
  minSize: { w: 14, h: 7 },
  loop: 14,
  canvas: 'line',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const pal = ctx.palette();
    const dist = 3.6;
    const project = projector(cv, { distance: dist, fill: 0.44 });
    const N = Math.min(680, Math.max(180, Math.round(cv.width * 4)));
    const pts = new Array(N + 1);
    const knot = (u, px) => [0.78 * Math.cos(3 * u + px), 0.78 * Math.cos(4 * u + 0.3), 0.78 * Math.cos(7 * u)];

    return (t) => {
      cv.clear();
      const ph = (t / 14) * TAU;
      const px = 0.7 + 0.5 * Math.sin(ph);
      const M = mul(rotX(0.4 + 0.1 * Math.sin(ph)), rotY(ph));
      for (let i = 0; i <= N; i++) pts[i] = project(apply(M, knot((i / N) * TAU, px)));
      for (let i = 0; i < N; i++) {
        const u = i / N;
        seg(cv, pts[i], pts[i + 1], pal(u), pal(u + 1 / N), th.bg, dist);
      }
      for (let h = 0; h < 3; h++) {
        const hu = ((t / 14) * 2 + h / 3) % 1;
        for (let k = 0; k < 14; k++) {
          const P = project(apply(M, knot((hu - k * 0.0035) * TAU, px)));
          const g = 1 - k / 14;
          cv.set(P[0], P[1], blend(pal(hu), 0xffffff, g * g * 0.9));
          if (k === 0) { cv.set(P[0] + 1, P[1], 0xffffff); cv.set(P[0] - 1, P[1], 0xffffff); }
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Spring Coil — a helical spring bouncing a wire block: coils bunch and bulge
// as it compresses, the wire heating toward the warn color under load.
const springCoil = {
  id: 'objects-spring-coil',
  since: '0.3.0',
  title: 'Spring Coil',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['spring', 'coil', 'helix', 'bounce', 'physics', 'wireframe', 'braille'],
  order: 250,
  description: 'A helical wire spring bouncing a block — coils bunch and bulge under compression and the wire heats toward the warn tone.',
  size: { w: 40, h: 24 },
  minSize: { w: 14, h: 8 },
  loop: 8,
  canvas: 'line',
  palette: 'theme',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const dist = 4;
    const project = projector(cv, { distance: dist, fill: 0.4, cy: cv.height * 0.52 });
    const COILS = 6.5, SAMP = 230, BASE = 1.05;
    const box = [];
    for (const x of [-0.36, 0.36]) for (const y of [0, -0.5]) for (const z of [-0.36, 0.36]) box.push([x, y, z]);
    const boxEdges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

    return (t) => {
      cv.clear();
      const ph = (t / 8) * TAU;
      const len = 0.76 + 0.24 * Math.sin(2 * ph) + 0.05 * Math.sin(4 * ph + 1.1);
      const squish = clamp01((1.05 - len) / 0.55);
      const M = mul(rotX(0.3), rotY(ph));
      const height = 1.9 * len;
      const wireC = blend(th.accent, th.warn, squish);
      let prev = null;
      for (let i = 0; i <= SAMP; i++) {
        const s = i / SAMP;
        const a = COILS * TAU * s;
        const r = 0.42 * (1 + 0.3 * squish * Math.sin(Math.PI * s));
        const p = project(apply(M, [Math.cos(a) * r, BASE - height * s, Math.sin(a) * r]));
        if (prev) seg(cv, prev, p, wireC, wireC, th.bg, dist);
        prev = p;
      }
      // End plates and the bouncing block riding the top plate.
      const plate = (y, c) => {
        const q = [[-0.5, y, -0.5], [0.5, y, -0.5], [0.5, y, 0.5], [-0.5, y, 0.5]].map((p) => project(apply(M, p)));
        for (let i = 0; i < 4; i++) seg(cv, q[i], q[(i + 1) % 4], c, c, th.bg, dist);
      };
      plate(BASE, blend(th.muted, th.ink, 0.3));
      plate(BASE - height, th.info);
      const by = BASE - height;
      const B = box.map(([x, y, z]) => project(apply(M, [x, by + y - 0.02, z])));
      for (const [a, b] of boxEdges) seg(cv, B[a], B[b], th.info, th.info, th.bg, dist);
      // Ground ticks so the bounce reads against something still.
      const g = project(apply(M, [0, BASE, 0]));
      for (let x = -3; x <= 3; x++) {
        const p = project(apply(M, [x * 0.36, BASE + 0.06, 0]));
        cv.set(p[0], p[1], blend(th.bg, th.dim, 0.7));
      }
      cv.set(g[0], g[1] + 1, th.dim);
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Wire Terrain — an endless flyover down a ridge canyon: a perspective wire
// grid of periodic ridges scrolling under the camera, fog toward the horizon,
// snow catching the highest crests, stars above.
const wireTerrain = {
  id: 'objects-wire-terrain',
  since: '0.3.0',
  title: 'Wire Terrain',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['terrain', 'flyover', 'grid', 'mountains', 'canyon', 'wireframe', 'braille'],
  order: 260,
  description: 'An endless braille flyover down a ridge canyon — perspective wire grid, fog at the horizon, snow on the highest crests.',
  size: { w: 56, h: 22 },
  minSize: { w: 16, h: 7 },
  loop: 12,
  canvas: 'line',
  palette: 'theme',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const W = cv.width, H = cv.height;
    const COLS = Math.max(10, Math.min(38, Math.floor(W / 7)));
    const ROWS = Math.max(8, Math.min(22, Math.floor(H / 7) + 12));
    const PZ = 16, SPEED = PZ / 12;
    const hor = H * 0.3, camH = 1.7, K = W * 0.6, XW = 6.5;
    const kz = TAU / PZ;
    const hAt = (x, z) => {
      const a = Math.sin(x * 0.52 + Math.sin(z * kz) * 1.2);
      const b = Math.sin(z * kz * 2 + Math.sin(x * 0.37) * 1.4);
      const ridge = (1 - Math.abs(a)) * 0.75 + (1 - Math.abs(b)) * 0.45;
      const canyon = Math.min(1, Math.pow(Math.abs(x) / 2.6, 1.6));
      return ridge * canyon * 1.5;
    };
    const stars = Array.from({ length: Math.round(W / 6) }, () => ({ x: ctx.rng() * W, y: ctx.rng() * hor * 0.85, p: ctx.rng() * TAU }));
    const rowPts = Array.from({ length: 2 }, () => new Array(COLS + 1));
    const projXY = (x, h, d) => [W / 2 + (x * K) / d, hor + ((camH - h) * K * 0.55) / d / cv.aspect, d];

    return (t) => {
      cv.clear();
      for (const s of stars) cv.set(s.x, s.y, blend(th.bg, th.ink, 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.5 + s.p))));
      for (let x = 0; x < W; x += 2) cv.set(x, hor, blend(th.bg, th.accent2, 0.35));
      const camZ = t * SPEED;
      const base = Math.floor(camZ);
      const fr = camZ - base;
      let cur = 0;
      for (let k = ROWS; k >= 1; k--) {
        const zw = base + k + 1;
        const d = zw - camZ;
        const row = rowPts[cur];
        for (let c = 0; c <= COLS; c++) {
          const x = -XW + (2 * XW * c) / COLS;
          const h = hAt(x, zw);
          const p = projXY(x, h, d);
          p[3] = h;
          row[c] = p;
        }
        const fog = clamp01(1.15 - d / ROWS);
        for (let c = 0; c <= COLS; c++) {
          const p = row[c];
          const snow = p[3] > 1.05 ? clamp01((p[3] - 1.05) / 0.4) : 0;
          const colc = blend(blend(th.accent, th.info, clamp01(p[3] / 1.4)), 0xffffff, snow * 0.8);
          if (c > 0) {
            const q = row[c - 1];
            const n = Math.max(1, Math.ceil(Math.abs(p[0] - q[0])));
            for (let s = 0; s <= n; s++) {
              const u = s / n;
              cv.set(q[0] + (p[0] - q[0]) * u, q[1] + (p[1] - q[1]) * u, blend(th.bg, colc, 0.18 + 0.82 * fog * fog));
            }
          }
          if (k < ROWS) {
            const q = rowPts[1 - cur][c];
            const n = Math.max(1, Math.ceil(Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]))));
            for (let s = 0; s <= n; s++) {
              const u = s / n;
              cv.set(q[0] + (p[0] - q[0]) * u, q[1] + (p[1] - q[1]) * u, blend(th.bg, colc, (0.15 + 0.85 * fog * fog) * 0.7));
            }
          }
        }
        cur = 1 - cur;
      }
      cv.paint(ctx.buffer);
    };
  },
};

export default [lissajousKnot, springCoil, wireTerrain];
