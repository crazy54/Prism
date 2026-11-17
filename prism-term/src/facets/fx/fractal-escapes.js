// Fractals as full-color fields: a seamless bitwise dive through the
// Sierpinski gasket, a drifting window over Markus–Lyapunov space, and the
// Ushiki phoenix set breathing through a slow zoom.
import { mix, scale } from '../../color.js';
import { clamp } from '../../easing.js';

const TAU = Math.PI * 2;

export default [
  {
    id: 'fx-sierpinski-zoom',
    since: '0.3.0',
    title: 'Sierpinski Dive',
    category: 'Fractals',
    kind: 'scene',
    tags: ['sierpinski', 'gasket', 'zoom', 'fractal', 'bitwise', 'self-similar', 'triangles'],
    order: 200,
    description: 'An endless dive into the Sierpinski gasket by bitwise AND: triangular holes stream outward in color bands, seamless every loop.',
    loop: 6,
    canvas: 'field',
    palette: 'prism',
    credits: 'after Wacław Sierpiński (and HAKMEM munching squares)',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { width: W, height: H, px, aspect } = cv;
      const S = Math.max(8, Math.min(W, H * aspect));
      const SC = 262144; // 2^18 — plenty of bits above and below the visible scales
      const inkTone = mix(ctx.theme.ink, pal(0.82), 0.4);
      return (t) => {
        const f = ((t / 6) % 1 + 1) % 1;
        const unit = 1.3 / (S * Math.pow(2, f)); // view halves each loop: ×2 dive, anchored at the corner
        for (let y = 0, i = 0; y < H; y++) {
          const iy = ((H - y - 0.5) * aspect * unit * SC) | 0;
          for (let x = 0; x < W; x++, i++) {
            const ix = ((x + 0.5) * unit * SC) | 0;
            const m = ix & iy;
            if (m === 0) { px[i] = inkTone; continue; } // on the gasket's lattice itself
            const d = 31 - Math.clz32(m); // coarsest colliding bit = the hole this point sits in
            const age = d + f;            // advances one band per loop, so color closes seamlessly
            const c = pal(age * 0.09);
            px[i] = scale(c, 0.52 + 0.45 * (0.5 + 0.5 * Math.sin(age * 1.9 - TAU * f)));
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-lyapunov-space',
    since: '0.3.0',
    title: 'Lyapunov Space',
    category: 'Fractals',
    kind: 'scene',
    tags: ['lyapunov', 'logistic map', 'chaos', 'markus', 'fractal', 'zircon', 'stability'],
    order: 210,
    description: 'A window drifting over Markus–Lyapunov space for sequence BBABA: golden ridges of stability swim through ink-blue chaos.',
    loop: 32,
    canvas: 'field',
    palette: 'gold',
    credits: 'after Mario Markus and Benno Hess',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { width: W, height: H, px, aspect } = cv;
      const S = Math.max(8, Math.min(W, H * aspect));
      const seq = [1, 1, 0, 1, 0]; // b b a b a
      const SL = seq.length;
      const chaos = mix(pal(0.08), ctx.theme.info, 0.5);
      const dark = pal(0.12);
      // Fixed per-pixel iteration count sized to the canvas, so cost stays bounded.
      const iters = Math.max(36, Math.min(80, Math.round(9e5 / Math.max(1, W * H))));
      const warm = 8, cnt = iters - warm;
      return (t) => {
        const u = (t / 32) * TAU;
        const ca = 3.52 + 0.22 * Math.cos(u), cb = 3.12 + 0.28 * Math.sin(u);
        for (let y = 0, i = 0; y < H; y++) {
          const nyv = ((y - H / 2 + 0.5) * aspect) / S;
          let b = cb + nyv * 0.52;
          b = b < 2.52 ? 2.52 : b > 3.985 ? 3.985 : b;
          for (let x = 0; x < W; x++, i++) {
            const nxv = (x - W / 2 + 0.5) / S;
            let a = ca + nxv * 0.52;
            a = a < 2.52 ? 2.52 : a > 3.985 ? 3.985 : a;
            let v = 0.5, si = 0;
            for (let n = 0; n < warm; n++) {
              v = (seq[si] ? b : a) * v * (1 - v);
              si = si + 1 === SL ? 0 : si + 1;
            }
            let prod = 1;
            for (let n = 0; n < cnt; n++) {
              const r = seq[si] ? b : a;
              si = si + 1 === SL ? 0 : si + 1;
              v = r * v * (1 - v);
              const dv = r * (1 - 2 * v);
              prod *= dv < 0 ? -dv : dv;
            }
            const la = Math.log(prod) / cnt; // one log per pixel instead of one per iteration
            px[i] = la < 0
              ? pal(0.3 + 0.68 * Math.pow(Math.min(1, -la * 0.75), 0.55))
              : mix(chaos, dark, Math.min(1, la * 1.6));
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-phoenix-fractal',
    since: '0.3.0',
    title: 'Phoenix Fractal',
    category: 'Fractals',
    kind: 'scene',
    tags: ['phoenix', 'julia', 'fractal', 'escape time', 'ushiki', 'feathers'],
    order: 220,
    description: 'The Ushiki phoenix set rendered wings-up, breathing through a slow zoom while its twin parameters circle the classic values.',
    loop: 28,
    canvas: 'field',
    palette: 'fire',
    credits: 'after Shigehiro Ushiki',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 1024 });
      const { width: W, height: H, px, aspect } = cv;
      const inside = ctx.theme.bg;
      const budget = 3.0e6; // iterations per frame, steered like the Mandelbrot dive
      let cap = 120;
      return (t) => {
        const u = (t / 28) * TAU;
        const p = -0.5 + 0.045 * Math.cos(u), q = 0.045 * Math.sin(u);
        const cr0 = 0.5667 + 0.012 * Math.sin(2 * u);
        const zoom = Math.exp(Math.log(3.2) * (1 - Math.cos(u)) / 2);
        const unit = 3.1 / (Math.max(8, Math.min(W, H * aspect)) * zoom);
        const maxIt = Math.max(26, Math.min(240, cap));
        const drift = 0.35 * Math.sin(2 * u);
        let work = 0;
        for (let y = 0, i = 0; y < H; y++) {
          const vy = (y - H / 2 + 0.5) * aspect * unit;
          for (let x = 0; x < W; x++, i++) {
            const vx = (x - W / 2 + 0.5) * unit;
            // Axes swapped so the bird stands upright.
            let zr = vy, zi = vx, pr = 0, pi = 0;
            let n = 0, r2 = 0, i2 = 0;
            while (n < maxIt) {
              r2 = zr * zr; i2 = zi * zi;
              if (r2 + i2 > 64) break;
              const nr = r2 - i2 + cr0 + p * pr - q * pi;
              const ni = 2 * zr * zi + p * pi + q * pr;
              pr = zr; pi = zi; zr = nr; zi = ni;
              n++;
            }
            work += n;
            if (n >= maxIt) { px[i] = inside; continue; }
            const mu = n + 1 - Math.log(Math.log(r2 + i2) * 0.5) / Math.LN2;
            const s = Math.log2(Math.max(1, mu) + 1) * 0.3 + drift;
            px[i] = pal(1 - Math.abs(((s % 2) + 2) % 2 - 1));
          }
        }
        if (work > budget) cap = Math.max(26, Math.floor(cap * 0.85));
        else if (work < budget * 0.6) cap = Math.min(240, Math.ceil(cap * 1.08) + 1);
        cv.paint(ctx.buffer);
      };
    },
  },
];
