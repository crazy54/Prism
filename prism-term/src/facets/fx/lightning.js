// A thunderstorm over the hills: rolling cloud decks, slanting rain, and every
// few seconds a forked bolt built by midpoint displacement — it flickers two or
// three times, lighting the clouds from inside and the land beneath.
import { lerpc, clamp01, hash2 } from '../retro/_kit.js';

const LOOP = 24, EVERY = 3;

function bolt(k, W, top, bottom) {
  // Midpoint displacement from cloud base to ground, plus a few forks.
  let seed = 0;
  const r = () => hash2(k, seed++, 77);
  const x0 = W * (0.15 + r() * 0.7);
  let pts = [[x0, top], [x0 + (r() - 0.5) * W * 0.25, bottom]];
  for (let pass = 0; pass < 6; pass++) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      out.push([(ax + bx) / 2 + (r() - 0.5) * len * 0.55, (ay + by) / 2 + (r() - 0.5) * len * 0.1], pts[i]);
    }
    pts = out;
  }
  const forks = [];
  for (let f = 0; f < 3; f++) {
    const start = pts[Math.floor((0.15 + r() * 0.5) * pts.length)];
    let [x, y] = start;
    const dir = r() < 0.5 ? -1 : 1, seg = [];
    seg.push([x, y]);
    for (let i = 0; i < 10; i++) { x += dir * (0.6 + r() * 2.2); y += 0.8 + r() * 2.4; seg.push([x, y]); }
    forks.push(seg);
  }
  return { main: pts, forks, x: x0 };
}

export default {
  title: 'Thunderstorm',
  gallery: 'fx',
  category: 'Light & Sky',
  kind: 'scene',
  tags: ['lightning', 'storm', 'thunder', 'rain', 'clouds', 'weather', 'bolt'],
  order: 70,
  description: 'A thunderstorm: rolling clouds, slanting rain and forked bolts that flicker, lighting the clouds from inside.',
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: LOOP,
  canvas: 'field',
  palette: 'ice',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { fbm } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    const base = Math.floor(H * 0.42), ground = H * 0.82;
    // Cloud deck, tiled horizontally so it can roll forever.
    const cloud = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = x / W, f = (xx) => fbm(xx * 0.035, y * aspect * 0.06, 1.7, 5);
      cloud[y * W + x] = (f(x) * (1 - k) + f(x - W) * k) * 0.5 + 0.5;
    }
    const hills = new Float32Array(W);
    for (let x = 0; x < W; x++) hills[x] = ground + (Math.sin(x * 0.07 + 1) * 0.5 + Math.sin(x * 0.19) * 0.25) * H * 0.05;
    const drops = Array.from({ length: Math.round(W * H * 0.012) }, (_, i) => [hash2(i, 1), hash2(i, 2), 1 + Math.floor(hash2(i, 3) * 2)]);
    const skyDark = lerpc(pal(0.1), 0x000000, 0.2), cloudLit = pal(0.85), cloudDim = pal(0.34), boltC = 0xf4f8ff, glowC = pal(0.7);
    const land = lerpc(0x0a0f0a, pal(0.1), 0.3);
    let cacheK = -1, cache = null;
    return (t) => {
      const lt = t % LOOP;
      const k = Math.floor(lt / EVERY), at = k * EVERY + hash2(k, 5) * 0.8, age = lt - at;
      // Flash envelope: two or three quick pulses.
      let flash = 0;
      if (age >= 0 && age < 0.6) {
        const pulses = 2 + Math.floor(hash2(k, 6) * 2);
        for (let p = 0; p < pulses; p++) { const pt = p * 0.13, d = age - pt; if (d >= 0 && d < 0.09) flash = Math.max(flash, 1 - d / 0.09); }
        flash = Math.max(flash, Math.max(0, 0.25 - age * 0.4));
      }
      if (k !== cacheK) { cacheK = k; cache = bolt(k, W, base * 0.9, ground); }
      const roll = (lt / LOOP) * W;
      for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const cv0 = cloud[y * W + (Math.floor(x + roll) % W)];
        const depth = clamp01(1 - y / (base * 1.4));
        let c = lerpc(skyDark, cloudDim, clamp01((cv0 - 0.3) * 2.4) * (0.55 + depth * 0.45));
        if (flash > 0) {
          const near = Math.exp(-Math.pow((x - cache.x) / (W * 0.25), 2));
          c = lerpc(c, cloudLit, flash * clamp01(cv0 * 1.3 - 0.2) * (0.25 + 0.75 * near) * (0.4 + 0.6 * clamp01(1.6 - y / base)));
        }
        if (y >= hills[x]) c = lerpc(land, pal(0.5), flash * 0.25);
        px[i] = c;
      }
      // Rain: short slanting streaks, brighter during a flash.
      const rainC = lerpc(cloudDim, cloudLit, 0.25 + flash * 0.5);
      for (const [rx, ry, sp] of drops) {
        const y = ((ry + (lt / LOOP) * 12 * sp) % 1) * H, x = (rx * W + y * 0.35) % W;
        for (let j = 0; j < 2; j++) cv.blend(x - j * 0.35, y - j, rainC, 0.6);
      }
      // The bolt.
      if (age >= 0 && age < 0.55 && flash > 0.05) {
        const draw = (pts, c, w) => { for (let i = 1; i < pts.length; i++) { cv.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c); if (w) cv.line(pts[i - 1][0] + 1, pts[i - 1][1], pts[i][0] + 1, pts[i][1], lerpc(glowC, c, 0.4)); } };
        for (const f of cache.forks) draw(f, lerpc(glowC, boltC, flash * 0.7), false);
        draw(cache.main, lerpc(glowC, boltC, 0.5 + flash * 0.5), true);
      }
      cv.paint(ctx.buffer);
    };
  },
};
