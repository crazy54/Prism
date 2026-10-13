// Gray-Scott reaction-diffusion: two chemicals, U fed in and V feeding on it
// (U + 2V → 3V), diffusing at different rates. The feed and kill rates drift
// slowly between the "mitosis", "coral" and "maze" regimes, so spots divide,
// then grow into coral, then wind into labyrinths. V is shaded as a lit relief
// so the patterns read like living tissue.
import { NONE, mix } from '../../color.js';

// [feed, kill] presets (Karl Sims' parameterisation: Du = 1, Dv = 0.5, dt = 1),
// with diffusion scaled by DS so features stay a few cells wide at terminal size.
const DS = 0.32;
const REGIMES = [[0.0367, 0.0649], [0.0545, 0.062], [0.029, 0.057]];
const HOLD = 14;

export default {
  title: 'Reaction-Diffusion',
  gallery: 'sim',
  category: 'Life & Flocking',
  kind: 'scene',
  tags: ['gray-scott', 'reaction diffusion', 'turing', 'morphogenesis', 'pattern'],
  order: 20,
  description: 'Gray-Scott reaction-diffusion drifting from dividing spots to coral to mazes, shaded as a lit living relief.',
  size: { w: 60, h: 22 },
  minSize: { w: 20, h: 7 },
  loop: HOLD * REGIMES.length,
  canvas: 'field',
  palette: 'aurora',
  params: { speed: { default: 1, min: 0.25, max: 3, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const W = cv.width, H = cv.height, px = cv.px, th = ctx.theme, rand = ctx.rng;
    const pal = ctx.palette();
    const rate = 260 * ctx.param('speed', 1); // solver steps per second
    const N = W * H;
    let U = new Float32Array(N).fill(1), V = new Float32Array(N);
    let U2 = new Float32Array(N), V2 = new Float32Array(N);
    const xm = new Int32Array(W), xp = new Int32Array(W);
    for (let x = 0; x < W; x++) { xm[x] = (x - 1 + W) % W; xp[x] = (x + 1) % W; }
    const seed = (count) => {
      for (let k = 0; k < count; k++) {
        const cx = Math.floor(rand() * W), cy = Math.floor(rand() * H), r = 1;
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
          const i = ((y + H) % H) * W + ((x + W) % W);
          U[i] = 0.5; V[i] = 0.25 + rand() * 0.1;
        }
      }
    };
    seed(Math.max(4, Math.round(N / 120)));
    let acc = 0;
    const step = (F, K) => {
      for (let y = 0; y < H; y++) {
        const r0 = ((y - 1 + H) % H) * W, r1 = y * W, r2 = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const a = xm[x], b = xp[x], i = r1 + x;
          // 9-point Laplacian (0.2 edges, 0.05 corners, -1 center).
          const lu = 0.2 * (U[r0 + x] + U[r2 + x] + U[r1 + a] + U[r1 + b]) + 0.05 * (U[r0 + a] + U[r0 + b] + U[r2 + a] + U[r2 + b]) - U[i];
          const lv = 0.2 * (V[r0 + x] + V[r2 + x] + V[r1 + a] + V[r1 + b]) + 0.05 * (V[r0 + a] + V[r0 + b] + V[r2 + a] + V[r2 + b]) - V[i];
          const u = U[i], v = V[i], uvv = u * v * v;
          U2[i] = u + (DS * lu - uvv + F * (1 - u));
          V2[i] = v + (0.5 * DS * lv + uvv - (K + F) * v);
        }
      }
      [U, U2] = [U2, U]; [V, V2] = [V2, V];
    };

    return (t, dt) => {
      // Parameters ease from one regime to the next over the last third of each hold.
      const cyc = ((t / HOLD) % REGIMES.length + REGIMES.length) % REGIMES.length;
      const k = Math.floor(cyc), f = cyc - k, m = f < 0.66 ? 0 : (f - 0.66) / 0.34;
      const s = m * m * (3 - 2 * m), A = REGIMES[k], B = REGIMES[(k + 1) % REGIMES.length];
      const F = A[0] + (B[0] - A[0]) * s, K = A[1] + (B[1] - A[1]) * s;
      acc += Math.min(0.25, Math.max(0, dt)) * rate;
      let n = 0;
      for (; acc >= 1 && n < 24; acc--, n++) step(F, K);
      if (acc > 24) acc = 0;
      // Keep it alive: if V has nearly vanished, seed fresh droplets.
      if (n) { let sum = 0; for (let i = 0; i < N; i += 7) sum += V[i]; if (sum < N * 0.0005) seed(6); }
      for (let y = 0; y < H; y++) {
        const r0 = ((y - 1 + H) % H) * W, r2 = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const i = y * W + x, v = V[i];
          if (v < 0.04) { px[i] = NONE; continue; }
          // Relief lighting from the V gradient (light from the upper left).
          const gx = V[y * W + xp[x]] - V[y * W + xm[x]], gy = V[r2 + x] - V[r0 + x];
          const light = Math.max(0, Math.min(1.4, 0.8 + (gx + gy) * 3));
          const c = pal(Math.min(1, 0.35 + v * 1.9));
          const lit = mix(mix(0x000000, c, Math.min(1, light)), 0xffffff, Math.max(0, light - 1) * 0.6);
          px[i] = mix(th.bg, lit, Math.min(1, (v - 0.04) / 0.12));
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
