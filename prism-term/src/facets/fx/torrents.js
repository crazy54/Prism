// Fire & Water — moving bodies of water: a full-height waterfall pounding into
// mist, a whirlpool spiralling down a dark throat, and a geyser on a strict
// eruption timetable.
import { mix, scale } from '../../color.js';
import { clamp, smoothstep } from '../../easing.js';

const TAU = Math.PI * 2;

export default [
  {
    id: 'fx-waterfall',
    since: '0.3.0',
    title: 'Waterfall',
    category: 'Fire & Water',
    kind: 'scene',
    tags: ['waterfall', 'water', 'mist', 'foam', 'spray', 'cascade'],
    order: 200,
    description: 'Streaked water pours past in distinct streams, bursts on the plunge pool and throws mist and arcing spray back up the face.',
    loop: 12,
    canvas: 'field',
    palette: 'ocean',
    params: { speed: { default: 1, min: 0.2, max: 3, label: 'Speed' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { noise2, noise3 } = ctx.noise;
      const { width: W, height: H, px } = cv;
      const rand = ctx.rng;
      const speed = ctx.param('speed', 1);
      const ys = H - Math.max(2, Math.round(H * 0.2)); // waterline row
      const mh = Math.max(2, Math.round(H * 0.14));    // mist band above it
      const ve = new Float32Array(W);                  // static per-stream weight
      for (let x = 0; x < W; x++) ve[x] = 0.72 + 0.28 * (0.5 + 0.5 * noise2(x * 0.17, 3.3));
      const drops = [];
      const nd = Math.max(8, Math.min(26, Math.round(W / 6)));
      for (let i = 0; i < nd; i++) {
        drops.push({
          x0: rand() * W, o: rand(), dx: (rand() - 0.5) * W * 0.12,
          h: (0.5 + rand() * 0.9) * Math.max(2, H * 0.14), p: 1.1 + rand() * 0.5,
        });
      }
      const white = pal(0.96), mist = pal(0.9);
      return (t) => {
        const tt = t * speed;
        for (let y = 0, i = 0; y < H; y++) {
          if (y < ys) {
            const fy1 = y * 0.045 - tt * 2.6, fy2 = y * 0.09 - tt * 4.0;
            const fall = y / ys;
            for (let x = 0; x < W; x++, i++) {
              const v1 = 0.5 + 0.5 * noise3(x * 0.34, fy1, 1.5);
              const v2 = 0.5 + 0.5 * noise3(x * 0.74, fy2, 4.2);
              const w = (v1 * 0.62 + v2 * 0.38) * ve[x] + fall * 0.1;
              let c = pal(0.28 + 0.6 * clamp(w));
              if (w > 0.8) c = mix(c, white, Math.min(1, (w - 0.8) * 4));
              if (y >= ys - mh) {
                const env = 1 - (ys - y) / mh;
                const m = (0.5 + 0.5 * noise3(x * 0.1, y * 0.14 + tt * 0.9, 7.7)) * env;
                c = mix(c, mist, m * 0.5);
              }
              px[i] = c;
            }
          } else {
            const depth = (y - ys) / Math.max(1, H - 1 - ys);
            const wl = 1 - depth;
            for (let x = 0; x < W; x++, i++) {
              const fo = 0.5 + 0.5 * noise3(x * 0.26, tt * 1.5, 12 + y * 0.3);
              const base = pal(0.33 - 0.16 * depth);
              px[i] = mix(base, white, clamp(fo * (0.18 + 0.52 * wl)));
            }
          }
        }
        for (const d of drops) {
          const age = ((tt / d.p + d.o) % 1 + 1) % 1;
          const ax = d.x0 + d.dx * age;
          const ay = ys - d.h * 4 * age * (1 - age);
          cv.blend(ax, ay, white, (1 - age) * 0.7);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-whirlpool',
    since: '0.3.0',
    title: 'Whirlpool',
    category: 'Fire & Water',
    kind: 'scene',
    tags: ['whirlpool', 'vortex', 'spiral', 'water', 'maelstrom', 'foam'],
    order: 210,
    description: 'A maelstrom seen from above: foam-laced spiral bands accelerate into a dark throat while debris bubbles ride the current down.',
    loop: 8,
    canvas: 'field',
    palette: 'ocean',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { width: W, height: H, px, aspect } = cv;
      const rand = ctx.rng;
      const cx = W / 2, cy = H / 2;
      const RMAX = Math.max(4, Math.min(W, H * aspect)) * 0.52;
      const N = W * H;
      const RD = new Float32Array(N), THV = new Float32Array(N), LG = new Float32Array(N);
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const dx = x - cx + 0.5, dy = (y - cy + 0.5) * aspect;
          const r = Math.sqrt(dx * dx + dy * dy) / RMAX;
          RD[i] = r;
          THV[i] = Math.atan2(dy, dx);
          LG[i] = Math.log(r + 0.04);
        }
      }
      const bubbles = [];
      const nb = Math.max(12, Math.min(36, Math.round((W * H) / 420)));
      for (let i = 0; i < nb; i++) {
        bubbles.push({ o: rand(), th0: rand() * TAU, spr: 0.55 + rand() * 0.42 });
      }
      const throat = pal(0.03), foamC = pal(0.95), rim = pal(0.2);
      return (t) => {
        const tt = TAU * (t / 8); // whole turns per loop: everything closes
        for (let i = 0; i < N; i++) {
          const r = RD[i];
          if (r > 1) {
            px[i] = scale(rim, 0.84 + 0.1 * Math.sin(3 * THV[i] + 5.5 * LG[i] - 2 * tt));
            continue;
          }
          const band = Math.sin(3 * THV[i] + 5.5 * LG[i] - 2 * tt);
          const sw = 0.5 + 0.5 * Math.sin(9 * r - 3 * tt + THV[i]);
          let c = pal(clamp(0.16 + 0.4 * r + 0.1 * band));
          c = mix(c, throat, smoothstep(0.3, 0.07, r));
          const bp = band > 0 ? band * band * band : 0;
          const foam = bp * clamp(4 * r * (1 - r)) * (0.55 + 0.45 * sw);
          px[i] = mix(c, foamC, Math.min(0.85, foam));
        }
        for (const b of bubbles) {
          const age = ((t / 8 + b.o) % 1 + 1) % 1;
          const rr = b.spr * (1 - 0.88 * age);
          const ang = b.th0 + 2.4 * age / (0.18 + rr) + tt * 0.5;
          const bx = cx + Math.cos(ang) * rr * RMAX;
          const by = cy + (Math.sin(ang) * rr * RMAX) / aspect;
          cv.blend(bx, by, foamC, Math.sin(Math.PI * age) * 0.8);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-geyser',
    since: '0.3.0',
    title: 'Geyser',
    category: 'Fire & Water',
    kind: 'scene',
    tags: ['geyser', 'eruption', 'water', 'steam', 'spray', 'thermal', 'spring'],
    order: 220,
    description: 'A thermal spring on a timetable: the pool shivers, the column bursts skyward with ballistic spray, then drifts away as steam.',
    loop: 14,
    canvas: 'field',
    palette: 'ice',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { noise3 } = ctx.noise;
      const { width: W, height: H, px } = cv;
      const rand = ctx.rng;
      const ys = Math.max(2, Math.min(H - 2, Math.round(H * 0.74)));
      const cx = W * 0.5;
      const poolH = H - ys;
      const jetHmax = (ys - 1) * 0.92;
      const w0 = Math.max(1.2, W * 0.025);
      const spray = [];
      const np = Math.max(16, Math.min(48, Math.round((W * H) / 320)));
      for (let i = 0; i < np; i++) {
        spray.push({
          l: 0.36 + rand() * 0.3, tf: 0.9 + rand() * 1.1,
          vx: (rand() - 0.5) * W * 0.09, top: (0.55 + rand() * 0.4),
          vy: (0.4 + rand() * 0.5) * jetHmax,
        });
      }
      const gg = Math.max(2, jetHmax * 1.4);
      const white = pal(0.97), steamC = pal(0.9), reflC = pal(0.8);
      return (t) => {
        const p = ((t / 14) % 1 + 1) % 1;
        const zc = Math.cos(TAU * p), zs = Math.sin(TAU * p);
        const e = smoothstep(0.3, 0.4, p) * (1 - smoothstep(0.6, 0.76, p));
        const rumble = smoothstep(0.2, 0.36, p) * (1 - smoothstep(0.38, 0.46, p));
        const mistE = smoothstep(0.58, 0.72, p) * (1 - smoothstep(0.85, 0.99, p));
        const jetH = e * jetHmax;
        const steamA = 0.16 + 0.55 * mistE + 0.12 * rumble;
        const span = Math.max(2, W * 0.32);
        for (let y = 0, i = 0; y < H; y++) {
          if (y < ys) {
            const grad = pal(0.05 + 0.13 * (1 - y / ys));
            for (let x = 0; x < W; x++, i++) {
              const xf = 1 - Math.abs(x - cx) / span;
              if (xf <= 0) { px[i] = grad; continue; }
              const wisp = noise3(x * 0.085, y * 0.13, zc * 0.6 + zs * 0.4 + 2);
              const m = clamp(wisp) * steamA * xf * (0.35 + 0.65 * (y / ys));
              px[i] = m > 0.01 ? mix(grad, steamC, m) : grad;
            }
          } else {
            const depth = (y - ys) / Math.max(1, poolH - 1);
            const amp = 0.05 + 0.1 * rumble + 0.05 * e;
            for (let x = 0; x < W; x++, i++) {
              const b = 0.3 - 0.12 * depth + amp * Math.sin(x * 0.4 + TAU * 3 * p + depth * 5);
              let c = pal(clamp(b));
              const rr = Math.abs(x - cx);
              const ring = Math.max(0, Math.sin(rr * 0.55 - TAU * 4 * p));
              c = mix(c, white, ring * ring * ring * (e + mistE * 0.5) * clamp(1 - rr / (W * 0.5)) * 0.5);
              const refl = e * (1 - depth) * clamp(1 - rr / (w0 * 2.2));
              px[i] = mix(c, reflC, refl * 0.55);
            }
          }
        }
        if (jetH >= 1) {
          const rows = Math.floor(jetH);
          for (let k = 0; k <= rows; k++) {
            const yq = ys - 1 - k;
            if (yq < 0) break;
            const q = k / jetHmax;
            const tear = 1 + 0.32 * noise3(k * 0.14, 11, zc * 0.8 + zs * 0.5);
            const wq = w0 * (0.55 + 0.6 * q + 2.0 * q * q * q * q) * tear * clamp((jetH - k) / 3 + 0.25);
            const xoff = 1.2 * Math.sin(q * 5 + TAU * 2 * p) * q;
            for (let dx = -Math.ceil(wq); dx <= Math.ceil(wq); dx++) {
              const s = Math.min(1, Math.abs(dx) / Math.max(0.6, wq));
              cv.blend(cx + xoff + dx, yq, mix(white, pal(0.5), s * s), 0.92 - 0.4 * s);
            }
          }
        }
        for (const sp of spray) {
          let a = p - sp.l;
          if (a < 0) a += 1;
          const sec = a * 14;
          if (sec >= sp.tf) continue;
          const sy = ys - sp.top * jetHmax * 0.9 - sp.vy * sec + 0.5 * gg * sec * sec;
          cv.blend(cx + sp.vx * sec, sy, white, (1 - sec / sp.tf) * 0.85 * Math.max(e, 0.2));
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
