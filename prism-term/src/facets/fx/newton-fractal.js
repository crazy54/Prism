// Newton's method as art: every point is a guess that slides toward one of a
// polynomial's roots. Color says which root it reaches, shade says how fast.
// The roots orbit and breathe, so the fractal basin boundaries writhe.
import { lerpc } from '../retro/_kit.js';

export default {
  title: 'Newton Basins',
  gallery: 'fx',
  category: 'Fractals',
  kind: 'scene',
  tags: ['newton', 'fractal', 'basins', 'roots', 'complex', 'polynomial'],
  order: 60,
  description: "Newton's method basins for a polynomial whose roots orbit and breathe — color by root, shade by speed.",
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 6 },
  loop: 24,
  canvas: 'field',
  palette: 'prism',
  params: { roots: { default: 3, min: 3, max: 6, label: 'Roots' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { width: W, height: H, px, aspect } = cv;
    const n = Math.max(3, Math.min(6, Math.round(ctx.param('roots', 3))));
    const colors = Array.from({ length: n }, (_, k) => pal(k / n));
    const dark = lerpc(ctx.theme.bg, 0x000000, 0.4);
    const rr = new Float64Array(n), ri = new Float64Array(n);
    const MAX = 28;
    return (t) => {
      const u = (t / 24) * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + u * 0.5, m = 1 + 0.28 * Math.sin(u * (k % 2 ? 1 : 2) + k);
        rr[k] = Math.cos(a) * m; ri[k] = Math.sin(a) * m;
      }
      const unit = 3.4 / Math.min(W, H * aspect * 1.4);
      for (let y = 0, i = 0; y < H; y++) {
        const y0 = (y - H / 2 + 0.5) * aspect * unit;
        for (let x = 0; x < W; x++, i++) {
          let zr = (x - W / 2 + 0.5) * unit, zi = y0, it = 0, hit = -1, near = 1;
          for (; it < MAX; it++) {
            // z ← z − 1 / Σ 1/(z − r_k)
            let sr = 0, si = 0;
            for (let k = 0; k < n; k++) {
              const dr = zr - rr[k], di = zi - ri[k], d = dr * dr + di * di;
              if (d < 1e-6) { hit = k; near = d; break; }
              sr += dr / d; si -= di / d;
            }
            if (hit >= 0) break;
            const s2 = sr * sr + si * si;
            if (s2 < 1e-12) break;
            zr -= sr / s2; zi += si / s2;
          }
          if (hit < 0) { px[i] = dark; continue; }
          // Smooth the iteration count with the last step's distance.
          const f = (it + Math.log(-Math.log(near + 1e-12) + 1) * 0.1) / MAX;
          px[i] = lerpc(colors[hit], dark, Math.min(0.92, Math.pow(f, 0.55) * 1.05));
        }
      }
      // Root markers.
      for (let k = 0; k < n; k++) cv.set(W / 2 + rr[k] / unit, H / 2 + ri[k] / unit / aspect, 0xffffff);
      cv.paint(ctx.buffer);
    };
  },
};
