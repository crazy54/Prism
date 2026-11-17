// Fields — three ways a flat plane comes alive: fbm folded through itself
// (ink-marble domain warping), a live Gray–Scott reaction–diffusion dish,
// and layered silk ribbons carrying a travelling sheen.
import { mix, scale } from '../../color.js';
import { clamp } from '../../easing.js';

const TAU = Math.PI * 2;

export default [
  {
    id: 'fx-domain-warp',
    since: '0.3.0',
    title: 'Domain Warp',
    category: 'Fields',
    kind: 'scene',
    tags: ['noise', 'fbm', 'domain warp', 'marble', 'ink', 'veins', 'flow'],
    order: 200,
    description: 'fbm fed through itself twice: ink-marble veins fold and drift, lit where the warp dragged the field furthest.',
    loop: 24,
    canvas: 'field',
    palette: 'aurora',
    credits: 'after Inigo Quilez',
    params: { speed: { default: 1, min: 0.1, max: 4, label: 'Speed' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { fbm } = ctx.noise;
      const { width: W, height: H, px, aspect } = cv;
      const speed = ctx.param('speed', 1);
      const S = Math.max(8, Math.min(W, H * aspect));
      // The field is smooth, so sample fbm on a coarse lattice and lerp per pixel.
      const g = W * H > 12000 ? 3 : W * H > 5000 ? 2 : 1;
      const GW = Math.ceil(W / g) + 2, GH = Math.ceil(H / g) + 2;
      const V = new Float32Array(GW * GH);
      const Q = new Float32Array(GW * GH);
      const R = new Float32Array(GW * GH);
      const lp = (A, x, y) => {
        const gx = x / g, gy = y / g, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, j = iy * GW + ix;
        return (A[j] * (1 - fx) + A[j + 1] * fx) * (1 - fy) + (A[j + GW] * (1 - fx) + A[j + GW + 1] * fx) * fy;
      };
      return (t) => {
        const u = ((t * speed) / 24) * TAU; // one slow orbit per loop
        const ca = Math.cos(u), sa = Math.sin(u);
        for (let gy = 0; gy < GH; gy++) {
          for (let gx = 0; gx < GW; gx++) {
            const j = gy * GW + gx;
            const x = (gx * g * 2.6) / S, y = (gy * g * aspect * 2.6) / S;
            const qx = fbm(x + ca * 0.9, y + sa * 0.9, 0, 3);
            const qy = fbm(x + 5.2 + sa * 0.7, y + 1.3 + ca * 0.7, 2.1, 3);
            const rx = fbm(x + 1.7 * qx + 9.2, y + 1.7 * qy + 2.8, 4.4 + sa * 0.3, 3);
            const ry = fbm(x + 1.7 * qx + 3.1, y + 1.7 * qy + 7.6, 1.9 - ca * 0.3, 3);
            V[j] = fbm(x + 1.9 * rx, y + 1.9 * ry, 6.5, 3);
            Q[j] = qx * qx + qy * qy;
            R[j] = rx * rx + ry * ry;
          }
        }
        const breath = 0.07 * sa;
        for (let y = 0, i = 0; y < H; y++) {
          for (let x = 0; x < W; x++, i++) {
            const v = lp(V, x, y), q = lp(Q, x, y), r = lp(R, x, y);
            const vein = Math.pow(clamp(1 - Math.abs(v) * 2.1), 3);
            let c = pal(clamp(0.2 + 0.58 * (v * 0.5 + 0.5) + breath));
            c = mix(c, pal(clamp(0.9 + breath)), vein * clamp(q * 1.5) * 0.85);
            px[i] = scale(c, 0.68 + 0.52 * clamp(r));
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-reaction-diffusion',
    since: '0.3.0',
    title: 'Turing Bloom',
    category: 'Fields',
    kind: 'scene',
    tags: ['reaction diffusion', 'gray-scott', 'turing', 'pattern', 'coral', 'mitosis', 'cells'],
    order: 210,
    description: 'A live Gray–Scott dish: spots split, worms crawl and coral fronts advance down a feed-rate gradient, lit by concentration slope.',
    loop: 30,
    canvas: 'field',
    palette: 'viridis',
    credits: 'after Gray & Scott; parameter sweep after Karl Sims',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { width: W, height: H, px } = cv;
      const N = W * H;
      let U = new Float32Array(N).fill(1), Vc = new Float32Array(N);
      let U2 = new Float32Array(N), V2 = new Float32Array(N);
      const rand = ctx.rng;
      // Seed a few dots of catalyst around the dish (lightly, so small dishes survive).
      const blobs = Math.max(2, Math.round(N / 1400));
      for (let b = 0; b < blobs; b++) {
        const bx = Math.floor(rand() * W), by = Math.floor(rand() * H);
        const rr = N < 600 ? 1 : 1 + Math.floor(rand() * 2.4);
        for (let dy = -rr; dy <= rr; dy++) {
          for (let dx = -rr; dx <= rr; dx++) {
            if (dx * dx + dy * dy > rr * rr) continue;
            const j = ((by + dy + H) % H) * W + ((bx + dx + W) % W);
            Vc[j] = 0.9; U[j] = 0.4;
          }
        }
      }
      // Feed/kill sweep down the dish crosses several Pearson regimes.
      const FR = new Float32Array(H), KR = new Float32Array(H);
      for (let y = 0; y < H; y++) {
        const yn = H > 1 ? y / (H - 1) : 0;
        FR[y] = 0.030 + 0.028 * yn;
        KR[y] = 0.057 + 0.006 * yn;
      }
      // Petri-dish lighting baked per pixel, so the field reads even where the
      // chemistry has gone quiet.
      const vign = new Float32Array(N);
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const dx = (x / Math.max(1, W - 1)) * 2 - 1, dy = (y / Math.max(1, H - 1)) * 2 - 1;
          vign[i] = 0.78 + 0.22 * clamp(1 - (dx * dx + dy * dy) * 0.55);
        }
      }
      const step = () => {
        for (let y = 0; y < H; y++) {
          const up = (y ? y - 1 : H - 1) * W, dn = (y + 1 < H ? y + 1 : 0) * W, ro = y * W;
          const f = FR[y], k = KR[y];
          for (let x = 0; x < W; x++) {
            const l = x ? x - 1 : W - 1, r = x + 1 < W ? x + 1 : 0;
            const i = ro + x;
            const u = U[i], v = Vc[i];
            const lu = 0.2 * (U[up + x] + U[dn + x] + U[ro + l] + U[ro + r])
              + 0.05 * (U[up + l] + U[up + r] + U[dn + l] + U[dn + r]) - u;
            const lv = 0.2 * (Vc[up + x] + Vc[dn + x] + Vc[ro + l] + Vc[ro + r])
              + 0.05 * (Vc[up + l] + Vc[up + r] + Vc[dn + l] + Vc[dn + r]) - v;
            const uvv = u * v * v;
            U2[i] = u + (lu - uvv + f * (1 - u));
            V2[i] = v + (0.5 * lv + uvv - (f + k) * v);
          }
        }
        let s = U; U = U2; U2 = s;
        s = Vc; Vc = V2; V2 = s;
      };
      for (let n = 0; n < 180; n++) step(); // arrive with the colony already alive
      let acc = 0;
      return (t, dt) => {
        acc += dt * 90; // simulation steps per second
        let n = 0;
        while (acc >= 1 && n < 4) { step(); acc -= 1; n++; }
        if (acc > 4) acc = 0;
        const breath = 0.04 * Math.sin((t / 30) * TAU);
        for (let y = 0, i = 0; y < H; y++) {
          const yd = y + 1 < H ? y + 1 : y;
          for (let x = 0; x < W; x++, i++) {
            const v = Vc[i];
            const gx = Vc[y * W + (x + 1 < W ? x + 1 : x)] - v;
            const gy = Vc[yd * W + x] - v;
            const lit = clamp(0.5 + (gx - gy) * 5.5);
            const c = pal(clamp(v * 2.4, 0, 0.92) + breath + 0.04);
            px[i] = scale(c, (0.55 + 0.75 * lit) * vign[i]);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-silk-ribbons',
    since: '0.3.0',
    title: 'Silk Ribbons',
    category: 'Fields',
    kind: 'scene',
    tags: ['silk', 'ribbon', 'fabric', 'sheen', 'wave', 'layers', 'translucent'],
    order: 220,
    description: 'Layered silk bands ripple across a dim stage, round in cross-section, translucent at the hems, each chased by a specular sheen.',
    loop: 12,
    canvas: 'field',
    palette: 'synthwave',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { noise2 } = ctx.noise;
      const { width: W, height: H, px } = cv;
      const rand = ctx.rng;
      const n = Math.max(2, Math.min(6, Math.floor(H / 13) + 2));
      const base = TAU / 12; // every rate a whole multiple of the loop
      const ribs = [];
      for (let r = 0; r < n; r++) {
        ribs.push({
          cy: H * (0.16 + 0.68 * ((r + 0.5) / n)),
          hue: clamp(0.3 + 0.62 * ((r + rand() * 0.5) / n), 0.12, 0.97),
          k1: ((1.4 + rand() * 1.5) * TAU) / Math.max(24, W),
          k2: ((3 + rand() * 2.4) * TAU) / Math.max(24, W),
          w1: base * (1 + (r % 3)),
          w2: base * (2 + (r % 2) * 3),
          hk: ((0.8 + rand()) * TAU) / Math.max(24, W),
          ph: rand() * TAU,
          ph2: rand() * TAU,
          amp: H * (0.055 + rand() * 0.07),
          th: Math.max(1.1, H * (0.05 + rand() * 0.05)),
          dir: r % 2 ? 1 : -1,
        });
      }
      const bgA = scale(pal(0.04), 0.8), bgB = pal(0.13);
      return (t) => {
        for (let y = 0, i = 0; y < H; y++) {
          const c = mix(bgA, bgB, H > 1 ? y / (H - 1) : 0);
          for (let x = 0; x < W; x++, i++) px[i] = c;
        }
        for (let r = 0; r < n; r++) {
          const R = ribs[r];
          const col = pal(R.hue);
          const hi = mix(col, 0xffffff, 0.72);
          const lo = scale(col, 0.32);
          for (let x = 0; x < W; x++) {
            const yC = R.cy
              + R.amp * Math.sin(x * R.k1 + R.ph + R.dir * R.w1 * t)
              + R.amp * 0.5 * Math.sin(x * R.k2 + R.ph2 - R.dir * R.w2 * t)
              + 1.2 * noise2(x * 0.03, r * 9.1); // static waviness, loop-safe
            const th = R.th * (0.75 + 0.25 * Math.sin(x * R.k2 * 0.7 - R.dir * R.w1 * t + R.ph2));
            const sheen = Math.pow(0.5 + 0.5 * Math.sin(x * R.hk - R.dir * base * 3 * t + R.ph), 10);
            const y0 = Math.max(0, Math.ceil(yC - th)), y1 = Math.min(H - 1, Math.floor(yC + th));
            for (let y = y0; y <= y1; y++) {
              const s = (y - yC) / th;
              const shade = 1 - s * s;
              let c = mix(lo, col, shade);
              c = mix(c, hi, sheen * shade * 0.9);
              const edge = Math.min(1, (1 - Math.abs(s)) * th * 1.8);
              cv.blend(x, y, c, 0.84 * Math.min(1, edge + 0.22));
            }
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
