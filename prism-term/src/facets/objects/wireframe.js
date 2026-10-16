// Rotating polyhedra in braille: cube → icosahedron → torus → octahedron, each
// handing off with a shrink/spring crossfade. Edges are depth-cued along their
// length, vertices glow, and a tilted orbit ring of dust circles the solid.
import { meshes, rotate } from '../../math3d.js';
import { easing } from '../../easing.js';
import { fadeMark } from '../../palettes.js';

export default {
  title: 'Wireframe Solids',
  gallery: 'objects',
  category: 'Wireframes',
  kind: 'scene',
  tags: ['wireframe', 'polyhedra', '3d', 'braille'],
  order: 20,
  description: 'Braille wireframes morphing cube → icosahedron → torus → octahedron with depth-cued edges and glowing vertices.',
  canvas: 'line',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const hold = ctx.param('hold', 6);
    const { width: W, height: H, aspect } = cv;
    const shapes = [meshes.cube(), meshes.icosahedron(), meshes.torus(0.72, 0.3, 20, 10), meshes.octahedron()];
    const dist = 3.4;
    const scale = Math.min(W, H * aspect) * 0.3 * dist;
    const dust = Array.from({ length: 90 }, (_, i) => ({ a: (i / 90) * Math.PI * 2 + ctx.rng() * 0.05, r: 1.45 + ctx.rng() * 0.12, y: (ctx.rng() - 0.5) * 0.05 }));

    const project = (p) => {
      const d = p[2] + dist;
      const k = scale / Math.max(0.3, d);
      return [W / 2 + p[0] * k, H / 2 + (p[1] * k) / aspect, d];
    };

    // Depth cue: toward black on glass; on light pages far edges fade into the page.
    const day = ctx.theme.mode === 'light';
    const spark = day ? ctx.theme.ink : 0xffffff;
    const shade = (c, k) => {
      if (day) return fadeMark(ctx.theme, c, Math.min(1, k));
      const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
      return ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | (b > 255 ? 255 : b | 0);
    };

    const line3 = (a, b, ca, cb) => {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
      for (let s = 0; s <= n; s++) {
        const u = s / n;
        const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
        const ra = (ca >> 16) & 255, ga = (ca >> 8) & 255, ba = ca & 255;
        const c = ((ra + (((cb >> 16) & 255) - ra) * u) << 16) | ((ga + (((cb >> 8) & 255) - ga) * u) << 8) | ((ba + ((cb & 255) - ba) * u) | 0);
        cv.set(x, y, c);
      }
    };

    const drawMesh = (m, t, alpha, size) => {
      if (alpha <= 0.01 || size <= 0.01) return;
      const ax = t * 0.53, ay = t * 0.71, az = t * 0.29;
      const pts = m.vertices.map((v) => project(rotate([v[0] * size, v[1] * size, v[2] * size], ax, ay, az)));
      const depthK = (d) => Math.max(0.3, Math.min(1, (dist + 1.3 - d) / 2.2)) * alpha;
      const hue = t * 0.04;
      const cols = pts.map((p, i) => shade(pal(hue + (i / pts.length) * 0.5), depthK(p[2]) * 1.1));
      for (const [a, b] of m.edges) line3(pts[a], pts[b], cols[a], cols[b]);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const g = depthK(p[2]);
        if (g < 0.45) continue;
        const c = shade(spark, g);
        cv.set(p[0], p[1], c); cv.set(p[0] + 1, p[1], c); cv.set(p[0] - 1, p[1], c);
        cv.set(p[0], p[1] + 1, c); cv.set(p[0], p[1] - 1, c);
      }
    };

    return (t) => {
      cv.clear();
      const cycle = t / hold;
      const idx = Math.floor(cycle) % shapes.length;
      const f = cycle - Math.floor(cycle);
      const trans = 0.22; // fraction of each hold spent crossfading into the next shape
      if (f > 1 - trans) {
        const u = (f - (1 - trans)) / trans;
        drawMesh(shapes[idx], t, 1 - u, 1 - easing.inCubic(u) * 0.7);
        drawMesh(shapes[(idx + 1) % shapes.length], t, u, easing.outBack(u));
      } else drawMesh(shapes[idx], t, 1, 1);

      // Orbit ring: tilted, slowly precessing dust; far side dimmer.
      const tilt = 0.42 + Math.sin(t * 0.3) * 0.1;
      for (const d of dust) {
        const a = d.a + t * 0.35;
        const p = project(rotate([Math.cos(a) * d.r, d.y, Math.sin(a) * d.r], tilt, 0, 0.18));
        const k = Math.max(0.15, Math.min(1, (dist + 1.6 - p[2]) / 3.2));
        cv.set(p[0], p[1], shade(pal(a / (Math.PI * 2) + t * 0.05), k * 0.8));
      }
      cv.paint(ctx.buffer);
    };
  },
};
