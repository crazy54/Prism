// Fractals that grow instead of iterate: a Barnsley fern sprouting point by
// point, the Koch snowflake blooming a generation of spikes at a time, and a
// de Jong strange attractor smeared into glowing smoke.
import { mix, scale } from '../../color.js';
import { clamp, smoothstep } from '../../easing.js';

const TAU = Math.PI * 2;

export default [
  {
    id: 'fx-barnsley-fern',
    since: '0.3.0',
    title: 'Barnsley Fern',
    category: 'Fractals',
    kind: 'scene',
    tags: ['fern', 'ifs', 'barnsley', 'fractal', 'growth', 'plant', 'nature'],
    order: 230,
    description: 'An iterated-function-system fern that sprouts from the stem upward, sways in a breeze, then furls away to grow again.',
    loop: 16,
    canvas: 'field',
    palette: 'matrix',
    credits: 'after Michael Barnsley',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { width: W, height: H, px, aspect } = cv;
      const rand = ctx.rng;
      const M = Math.max(2500, Math.min(26000, Math.round(W * H * 1.8)));
      const wx = new Float32Array(M), wy = new Float32Array(M);
      let fx = 0, fy = 0;
      for (let i = 0; i < M; i++) {
        const r = rand();
        let nx, ny;
        if (r < 0.01) { nx = 0; ny = 0.16 * fy; }
        else if (r < 0.86) { nx = 0.85 * fx + 0.04 * fy; ny = -0.04 * fx + 0.85 * fy + 1.6; }
        else if (r < 0.93) { nx = 0.2 * fx - 0.26 * fy; ny = 0.23 * fx + 0.22 * fy + 1.6; }
        else { nx = -0.15 * fx + 0.28 * fy; ny = 0.26 * fx + 0.24 * fy + 0.44; }
        fx = nx; fy = ny;
        wx[i] = fx; wy[i] = fy;
      }
      // Growth order: sap rises — sort points bottom-up so the fern unfurls.
      const order = Array.from({ length: M }, (_, i) => i)
        .sort((a, b) => (wy[a] + Math.abs(wx[a]) * 0.35) - (wy[b] + Math.abs(wx[b]) * 0.35));
      const k2 = Math.max(0.3, Math.min((H - 1.5) / 10.3, (W * 0.95) / (5.6 * aspect)));
      const kx = k2 * aspect;
      const SX = new Float32Array(M), SY = new Float32Array(M), CI = new Uint8Array(M),
        WP = new Float32Array(M), PH = new Float32Array(M);
      for (let n = 0; n < M; n++) {
        const i = order[n];
        SX[n] = W * 0.5 + (wx[i] - 0.24) * kx;
        SY[n] = (H - 1) - wy[i] * k2;
        CI[n] = Math.max(0, Math.min(32, Math.round((wy[i] / 10) * 32)));
        WP[n] = (wy[i] / 10) * (wy[i] / 10);
        PH[n] = wy[i] * 0.55;
      }
      const cols = Array.from({ length: 33 }, (_, j) => pal(0.2 + (0.68 * j) / 32));
      const glow = Array.from({ length: 33 }, (_, j) => mix(pal(0.2 + (0.68 * j) / 32), pal(0.97), 0.65));
      const bgTop = scale(pal(0.05), 0.75), bgBot = pal(0.14);
      const amp = kx * 0.45;
      return (t) => {
        const u = ((t / 16) % 1 + 1) % 1;
        const frac = smoothstep(0.0, 0.58, u) * (1 - smoothstep(0.86, 0.995, u));
        const count = Math.min(M, Math.floor(M * frac));
        for (let y = 0, i = 0; y < H; y++) {
          const c = mix(bgTop, bgBot, H > 1 ? y / (H - 1) : 0);
          for (let x = 0; x < W; x++, i++) px[i] = c;
        }
        const st = TAU * 2 * (t / 16);
        const glowFrom = count - Math.max(40, M * 0.05);
        for (let n = 0; n < count; n++) {
          const sx = SX[n] + amp * Math.sin(st + PH[n]) * WP[n];
          cv.set(sx, SY[n], n > glowFrom ? glow[CI[n]] : cols[CI[n]]);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-koch-bloom',
    since: '0.3.0',
    title: 'Koch Bloom',
    category: 'Fractals',
    kind: 'scene',
    tags: ['koch', 'snowflake', 'fractal', 'bloom', 'ice', 'crystal', 'geometry'],
    order: 240,
    description: 'A triangle blooms into the Koch snowflake, each generation of spikes easing outward while frost sparkles breathe behind it.',
    loop: 10,
    canvas: 'field',
    palette: 'ice',
    credits: 'after Helge von Koch',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { width: W, height: H, px, aspect } = cv;
      const rand = ctx.rng;
      const S = Math.max(8, Math.min(W, H * aspect));
      const R = S * 0.4;
      const cx = W / 2, cyW = 0; // geometry in square world units centered on the canvas
      const maxD = S >= 60 ? 5 : S >= 30 ? 4 : 3;
      const nSpark = Math.max(8, Math.round((W * H) / 260));
      const spark = [];
      for (let i = 0; i < nSpark; i++) {
        spark.push({ x: rand() * W, y: rand() * H, ph: rand() * TAU, k: 1 + Math.floor(rand() * 3), s: 0.35 + rand() * 0.6 });
      }
      const bgA = new Int32Array(W * H);
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const dx = x - cx, dy = (y - H / 2) * aspect;
          const rr = Math.sqrt(dx * dx + dy * dy) / Math.max(1, S * 0.72);
          bgA[i] = pal(Math.max(0.02, 0.24 - rr * 0.2));
        }
      }
      const tcol = new Int32Array(maxD + 2);
      const plot = (x1, y1, x2, y2, col) => {
        const dx = x2 - x1, dy = y2 - y1;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy) / aspect) * 1.3));
        for (let k = 0; k <= n; k++) {
          const gx = x1 + (dx * k) / n, gy = y1 + (dy * k) / n;
          cv.add(cx + gx, H / 2 + (gy + cyW) / aspect, col);
        }
      };
      const emit = (x1, y1, x2, y2, depth, tint) => {
        if (depth <= 0) { plot(x1, y1, x2, y2, tcol[Math.min(tint, maxD + 1)]); return; }
        const dx = x2 - x1, dy = y2 - y1;
        const z = Math.min(1, depth);
        const h = z * z * (3 - 2 * z); // new spikes ease outward
        const ax = x1 + dx / 3, ay = y1 + dy / 3;
        const bx = x1 + (dx * 2) / 3, by = y1 + (dy * 2) / 3;
        const mx = x1 + dx / 2 + dy * 0.288675 * h, my = y1 + dy / 2 - dx * 0.288675 * h;
        const d2 = depth - 1;
        emit(x1, y1, ax, ay, d2, tint);
        emit(ax, ay, mx, my, d2, tint + 1);
        emit(mx, my, bx, by, d2, tint + 1);
        emit(bx, by, x2, y2, d2, tint);
      };
      return (t) => {
        const ph = ((t / 10) % 1 + 1) % 1;
        const half = ph < 0.5 ? ph * 2 : 2 - ph * 2;
        const dd = maxD * half * half * (3 - 2 * half);
        const rot = 0.35 * Math.sin(TAU * ph) - TAU / 4;
        for (let g = 0; g <= maxD + 1; g++) {
          tcol[g] = scale(pal(clamp(0.3 + g * 0.13 + 0.04 * Math.sin(TAU * 2 * ph + g))), 0.8);
        }
        px.set(bgA);
        for (const sp of spark) {
          const tw = 0.5 + 0.5 * Math.sin(TAU * sp.k * ph + sp.ph);
          cv.blend(sp.x, sp.y, pal(0.88), tw * sp.s * 0.55);
        }
        const vx = [], vy = [];
        for (let s = 0; s < 3; s++) {
          const ang = rot + (s * TAU) / 3;
          vx.push(R * Math.cos(ang)); vy.push(R * Math.sin(ang));
        }
        for (let s = 0; s < 3; s++) {
          const e = (s + 1) % 3;
          emit(vx[s], vy[s], vx[e], vy[e], dd, 0);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-strange-attractor',
    since: '0.3.0',
    title: 'Strange Attractor',
    category: 'Fractals',
    kind: 'scene',
    tags: ['attractor', 'de jong', 'chaos', 'phase space', 'density', 'orbit', 'smoke'],
    order: 250,
    description: 'A Peter de Jong attractor breathing through its parameter space, its orbit smeared into glowing smoke with fading trails.',
    loop: 24,
    canvas: 'field',
    palette: 'synthwave',
    credits: 'after Peter de Jong',
    params: { trail: { default: 0.88, min: 0.5, max: 0.97, label: 'Trail' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { width: W, height: H, aspect } = cv;
      const fadeK = clamp(ctx.param('trail', 0.88), 0.3, 0.97);
      const N = Math.max(4000, Math.min(22000, Math.round(W * H * 1.4)));
      const sc = Math.max(4, Math.min(W, H * aspect)) * 0.235;
      const cxp = W / 2, cyp = H / 2;
      const dim = new Int32Array(24);
      for (let j = 0; j < 24; j++) dim[j] = scale(pal(j / 23), 0.17);
      return (t) => {
        const u = (t / 24) * TAU;
        const a = 1.4 + 0.35 * Math.sin(u);
        const b = -2.3 + 0.3 * Math.sin(2 * u + 1.2);
        const c = 2.4 + 0.4 * Math.sin(u + 2.1);
        const d = -2.1 + 0.28 * Math.sin(3 * u + 0.7);
        cv.fade(fadeK, 8);
        let x = 0.12, y = 0.31;
        for (let i = 0; i < N; i++) {
          const nx = Math.sin(a * y) - Math.cos(b * x);
          const ny = Math.sin(c * x) - Math.cos(d * y);
          x = nx; y = ny;
          if (i < 40) continue; // let the orbit settle onto the attractor
          const hue = 0.5 + 0.5 * Math.sin(x * 1.3 + y * 0.9 + u);
          cv.add(cxp + x * sc, cyp + (y * sc) / aspect, dim[(hue * 23.99) | 0]);
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
