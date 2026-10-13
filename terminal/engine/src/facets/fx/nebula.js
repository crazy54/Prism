// Deep field: a domain-warped emission nebula with dark dust lanes, painted
// once into a texture larger than the screen, then slowly turned and breathed
// through. Twinkling stars in front, a few bright ones with diffraction spikes.
import { lerpc, clamp01, hash2 } from '../retro/_kit.js';

const LOOP = 40;

export default {
  title: 'Nebula',
  gallery: 'fx',
  category: 'Light & Sky',
  kind: 'scene',
  tags: ['nebula', 'space', 'stars', 'cosmos', 'galaxy', 'deep field', 'ambient'],
  order: 80,
  description: 'A domain-warped emission nebula with dust lanes, slowly turning, with twinkling stars and diffraction spikes.',
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 6 },
  loop: LOOP,
  canvas: 'field',
  palette: 'magma',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette(undefined, { size: 512 });
    const { fbm } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    const VH = H * aspect;
    // Texture in visual units: a square that covers the screen at any rotation.
    // It's smooth, so it's painted at most 200 texels across and sampled bilinearly.
    const T = Math.ceil(Math.hypot(W, VH) * 1.15), S = Math.min(W, VH);
    const N = Math.min(T, 200), q = T / N;
    const R = new Float32Array(N * N), G = new Float32Array(N * N), B = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = ((x * q) / S) * 1.6, v = ((y * q) / S) * 1.6;
      const wx = fbm(u + 3.1, v + 1.7, 0.5, 4), wy = fbm(u - 2.3, v + 4.4, 1.5, 4);
      const gas = fbm(u + wx * 1.4, v + wy * 1.4, 2.5, 5) * 0.5 + 0.5;
      const dust = clamp01(fbm(u * 2.2 + wy, v * 2.2 - wx, 7.5, 4) * 1.8 + 0.1);
      const glow = Math.pow(clamp01(gas * 1.25 - 0.18), 1.6);
      const c = pal(clamp01(glow * 0.95 + 0.04));
      const o = lerpc(c, 0x000000, clamp01(dust * 0.85) * clamp01(glow * 2)), j = y * N + x;
      R[j] = (o >> 16) & 255; G[j] = (o >> 8) & 255; B[j] = o & 255;
    }
    const sample = (tx, ty) => {
      const fx = Math.min(N - 1.001, Math.max(0, tx / q)), fy = Math.min(N - 1.001, Math.max(0, ty / q));
      const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy, j = iy * N + ix;
      const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
      const r = R[j] * w00 + R[j + 1] * w10 + R[j + N] * w01 + R[j + N + 1] * w11;
      const g = G[j] * w00 + G[j + 1] * w10 + G[j + N] * w01 + G[j + N + 1] * w11;
      const b = B[j] * w00 + B[j + 1] * w10 + B[j + N] * w01 + B[j + N + 1] * w11;
      return (r << 16) | (g << 8) | b;
    };
    const stars = Array.from({ length: Math.round(W * H * 0.02) }, (_, i) => [hash2(i, 1), hash2(i, 2), hash2(i, 3)]);
    const bright = Array.from({ length: Math.max(2, Math.round((W * H) / 900)) }, (_, i) => [hash2(i, 11) * W, hash2(i, 12) * H, hash2(i, 13)]);
    return (t) => {
      const u = (t / LOOP) * Math.PI * 2;
      const rot = Math.sin(u) * 0.12, zoom = 1 + 0.06 * Math.sin(u * 2 + 1);
      const cr = Math.cos(rot) / zoom, sr = Math.sin(rot) / zoom;
      const ox = T / 2 + Math.cos(u) * S * 0.04, oy = T / 2 + Math.sin(u) * S * 0.03;
      for (let y = 0, i = 0; y < H; y++) {
        const vy = (y + 0.5) * aspect - VH / 2;
        for (let x = 0; x < W; x++, i++) {
          const vx = x + 0.5 - W / 2;
          px[i] = sample(ox + vx * cr - vy * sr, oy + vx * sr + vy * cr);
        }
      }
      for (const [sx, sy, k] of stars) {
        const tw = 0.55 + 0.45 * Math.sin((t * Math.PI * 2 * (1 + Math.floor(k * 4))) / 8 + k * 50);
        cv.add(sx * W, sy * H, lerpc(0x000000, k > 0.7 ? 0xbfd8ff : 0xfff0d8, tw * (0.35 + k * 0.6)));
      }
      for (const [bx, by, k] of bright) {
        const tw = 0.75 + 0.25 * Math.sin((t * Math.PI * 2) / 4 + k * 20);
        const c = lerpc(0x000000, 0xffffff, tw), arm = Math.max(2, Math.round(Math.min(W, H) * 0.05));
        cv.set(bx, by, 0xffffff);
        for (let d = 1; d <= arm; d++) {
          const a = tw * (1 - d / (arm + 1));
          cv.blend(bx + d, by, c, a); cv.blend(bx - d, by, c, a);
          cv.blend(bx, by + d / aspect, c, a); cv.blend(bx, by - d / aspect, c, a);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
