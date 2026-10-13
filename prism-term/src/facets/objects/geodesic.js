// A geodesic sphere: an icosahedron subdivided (class I, frequency 2 by
// default) and pushed out to the sphere, drawn as braille wire with hidden-line
// treatment — far edges dotted and dim, near edges solid and depth-cued — the
// twelve five-way vertices picked out, and a scan band sweeping over the dome.
import { meshes } from '../../math3d.js';
import { perspective, rotX, rotY, mul, apply, norm, blend } from './_raster.js';

function geodesic(freq) {
  const ico = meshes.icosahedron();
  const verts = [], index = new Map(), edges = new Set(), pent = new Set();
  const vid = (p) => {
    const n = norm(p), key = n.map((x) => Math.round(x * 1e4)).join(',');
    if (!index.has(key)) { index.set(key, verts.length); verts.push(n); }
    return index.get(key);
  };
  const edge = (a, b) => edges.add(a < b ? `${a},${b}` : `${b},${a}`);
  for (const [ia, ib, ic] of ico.faces) {
    const A = ico.vertices[ia], B = ico.vertices[ib], C = ico.vertices[ic];
    const P = (i, j) => { const k = freq - i - j; return vid([(A[0] * k + B[0] * i + C[0] * j) / freq, (A[1] * k + B[1] * i + C[1] * j) / freq, (A[2] * k + B[2] * i + C[2] * j) / freq]); };
    for (let i = 0; i < freq; i++) for (let j = 0; i + j < freq; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1);
      edge(a, b); edge(b, c); edge(c, a);
      if (i + j + 2 <= freq) { const d = P(i + 1, j + 1); edge(b, d); edge(d, c); }
    }
    pent.add(P(0, 0)); pent.add(P(freq, 0)); pent.add(P(0, freq));
  }
  return { verts, edges: [...edges].map((e) => e.split(',').map(Number)), pent: [...pent] };
}

export default {
  title: 'Geodesic Sphere',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['geodesic', 'icosahedron', 'dome', 'wireframe', 'braille', 'buckminster'],
  order: 30,
  description: 'A subdivided icosahedron in braille wire: far edges dotted, near edges depth-cued, pentagon vertices lit, a scan sweeping by.',
  size: { w: 44, h: 22 },
  minSize: { w: 14, h: 7 },
  loop: 12,
  canvas: 'line',
  palette: 'theme',
  params: { frequency: { default: 2, min: 1, max: 6, label: 'Subdivision frequency' } },
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const g = geodesic(Math.round(ctx.param('frequency', 2)));
    const dist = 3.4;
    const project = perspective(cv, { distance: dist, fill: 0.44 });
    const far = blend(th.bg, th.muted, 0.32);
    const accent = th.accent;

    return (t) => {
      cv.clear();
      const ph = (t / 12) * Math.PI * 2;
      const R = mul(rotX(0.35 + Math.sin(ph) * 0.15), rotY(ph));
      const V = g.verts.map((v) => apply(R, v));
      const P = V.map(project);
      const scan = Math.sin(ph * 2) * 1.1; // scan plane height, sweeping top ↔ bottom
      // Far edges first (dotted), then near edges (solid, depth-cued, scan-lit).
      const front = [], back = [];
      for (const e of g.edges) {
        const a = V[e[0]], b = V[e[1]];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        (m[0] * m[0] + m[1] * m[1] + m[2] * (m[2] + dist) < 0 ? front : back).push(e);
      }
      const plot = (e, dotted) => {
        const a = P[e[0]], b = P[e[1]];
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
        const ya = V[e[0]][1], yb = V[e[1]][1], za = V[e[0]][2], zb = V[e[1]][2];
        for (let s = 0; s <= n; s++) {
          if (dotted && s % 3) continue;
          const f = s / n, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
          if (dotted) { cv.set(x, y, far); continue; }
          const wy = ya + (yb - ya) * f, wz = za + (zb - za) * f;
          const lit = Math.exp(-(((wy - scan) / 0.12) ** 2));
          const near = (1 - wz) / 2;
          const c = blend(th.bg, blend(th.info, th.ink, 0.4 * near), 0.35 + 0.65 * near * near);
          cv.set(x, y, lit > 0.02 ? blend(c, 0xffffff, lit * 0.8) : c);
        }
      };
      for (const e of back) plot(e, true);
      for (const e of front) plot(e, false);
      for (const i of g.pent) {
        const v = V[i];
        if (v[0] * v[0] + v[1] * v[1] + v[2] * (v[2] + dist) >= 0) continue;
        const [x, y] = P[i];
        cv.circle(x, y, 1.6, accent, true);
      }
      cv.paint(ctx.buffer);
    };
  },
};
