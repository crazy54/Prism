// A torus knot as a braille wire tube with true hidden-line removal: the tube
// surface is rasterized into a depth buffer first, then only the wire points
// that survive the depth test are plotted — rings around the tube and strands
// along it, rainbow along the knot and depth-cued. It morphs (eased) through
// the (2,3) trefoil, (2,5), (3,4) and (3,5) knots while it turns.
import { zbuffer, tri, perspective, rotX, rotY, rotZ, mul, apply, norm, cross } from './_raster.js';
import { easing } from '../../easing.js';
import { scale as dim } from '../../color.js';

const KNOTS = [[2, 3], [2, 5], [3, 4], [3, 5]];
const HOLD = 3, MORPH = 1.5;
const SEG = 240, SIDES = 8, TUBE = 0.1;

const knot = ([p, q], u) => {
  const r = 2 + Math.cos(q * u);
  return [(r * Math.cos(p * u)) / 3.2, (r * Math.sin(p * u)) / 3.2, -Math.sin(q * u) / 3.2];
};

export default {
  title: 'Torus Knot',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['knot', 'torus', 'wireframe', 'braille', 'hidden-line', 'morph'],
  order: 20,
  description: 'A braille wire tube with true hidden-line removal, morphing through the (2,3), (2,5), (3,4) and (3,5) torus knots.',
  size: { w: 48, h: 22 },
  minSize: { w: 16, h: 7 },
  loop: KNOTS.length * (HOLD + MORPH),
  canvas: 'line',
  palette: 'prism',
  params: { rings: { default: 4, min: 1, max: 8, label: 'Ring spacing (segments)' } },
  setup(ctx) {
    const cv = ctx.canvas('line');
    const z = zbuffer(cv);
    const W = cv.width, H = cv.height;
    const scratch = { width: W, height: H, px: new Int32Array(W * H) };
    const pal = ctx.palette();
    const every = Math.max(1, Math.round(ctx.param('rings', 4)));
    const dist = 3.6;
    const project = perspective(cv, { distance: dist, fill: 0.46 });
    const period = KNOTS.length * (HOLD + MORPH);
    const centre = new Array(SEG);
    const proj = Array.from({ length: SEG }, () => new Array(SIDES));

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      const tl = ((t % period) + period) % period;
      const k = Math.floor(tl / (HOLD + MORPH)), f = tl - k * (HOLD + MORPH);
      const m = f < HOLD ? 0 : easing.inOutCubic((f - HOLD) / MORPH);
      const A = KNOTS[k], B = KNOTS[(k + 1) % KNOTS.length];
      // Mostly face-on (tilted, wobbling) and spinning in its own plane, so the
      // crossings stay readable instead of collapsing edge-on.
      const R = mul(rotX(0.45 + Math.sin(t * 0.4) * 0.2), mul(rotY(Math.sin(t * 0.27) * 0.4), rotZ(t * 0.25)));
      for (let i = 0; i < SEG; i++) {
        const u = (i / SEG) * Math.PI * 2;
        const a = knot(A, u), b = knot(B, u);
        centre[i] = apply(R, [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m]);
      }
      // Tube cross-sections from a smooth frame: T along the curve, N ⟂ T and z.
      let dmin = Infinity, dmax = -Infinity;
      for (let i = 0; i < SEG; i++) {
        const p0 = centre[(i + SEG - 1) % SEG], p1 = centre[(i + 1) % SEG], c = centre[i];
        const T = norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
        const N = norm(cross(T, [0.3, 0.2, 1])), Bn = cross(T, N);
        for (let s = 0; s < SIDES; s++) {
          const a = (s / SIDES) * Math.PI * 2, ca = Math.cos(a) * TUBE, sa = Math.sin(a) * TUBE;
          const v = [c[0] + N[0] * ca + Bn[0] * sa, c[1] + N[1] * ca + Bn[1] * sa, c[2] + N[2] * ca + Bn[2] * sa];
          const P = project(v);
          proj[i][s] = P;
          if (P[2] < dmin) dmin = P[2];
          if (P[2] > dmax) dmax = P[2];
        }
      }
      // Pass 1: the tube surface into the depth buffer only.
      for (let i = 0; i < SEG; i++) {
        const j = (i + 1) % SEG;
        for (let s = 0; s < SIDES; s++) {
          const s2 = (s + 1) % SIDES;
          tri(scratch, z, proj[i][s], proj[j][s], proj[j][s2], 0, 0, 0, () => 1);
          tri(scratch, z, proj[i][s], proj[j][s2], proj[i][s2], 0, 0, 0, () => 1);
        }
      }
      // Pass 2: wire points that pass the depth test.
      const span = Math.max(1e-6, dmax - dmin);
      const plot = (a, b, u) => {
        const n = Math.max(2, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 1.5));
        for (let q = 0; q < n; q++) {
          const f2 = q / n, x = a[0] + (b[0] - a[0]) * f2, y = a[1] + (b[1] - a[1]) * f2, d = a[2] + (b[2] - a[2]) * f2;
          const xi = Math.floor(x), yi = Math.floor(y);
          if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
          const idx = yi * W + xi;
          if (d > z[idx] + TUBE * 0.35) continue;
          cv.px[idx] = dim(pal(u), 1.05 - 0.6 * ((d - dmin) / span));
        }
      };
      for (let i = 0; i < SEG; i++) {
        const u = i / SEG, j = (i + 1) % SEG;
        if (i % every === 0) for (let s = 0; s < SIDES; s++) plot(proj[i][s], proj[i][(s + 1) % SIDES], u);
        for (let s = 0; s < SIDES; s += 2) plot(proj[i][s], proj[j][s], u);
      }
      cv.paint(ctx.buffer);
    };
  },
};
