// Crepuscular rays through a forest: the low sun behind swaying canopy and
// trunks, its light marched pixel by pixel back toward the sun through the
// gaps, so shafts of light fan out through the haze. Dust motes drift in them.
import { lerpc, clamp01, hash2 } from '../retro/_kit.js';

const LOOP = 20, STEPS = 14;

export default {
  title: 'God Rays',
  gallery: 'fx',
  category: 'Light & Sky',
  kind: 'scene',
  tags: ['god rays', 'crepuscular', 'volumetric', 'light shafts', 'forest', 'sun', 'haze'],
  order: 90,
  description: 'Volumetric light: the low sun behind a swaying forest canopy, shafts fanning through the gaps and dust drifting in them.',
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: LOOP,
  canvas: 'field',
  palette: 'gold',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { fbm } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    const occ = new Float32Array(W * H);                      // 1 = blocked, 0 = open sky
    const trunks = Array.from({ length: Math.max(3, Math.round(W / 9)) }, (_, i) => ({ x: (i + 0.3 + hash2(i, 1) * 0.4) * (W / Math.max(3, Math.round(W / 9))), w: 1 + hash2(i, 2) * Math.max(1, W / 40), lean: (hash2(i, 3) - 0.5) * 0.15 }));
    const motes = Array.from({ length: Math.round(W * H * 0.008) }, (_, i) => [hash2(i, 4), hash2(i, 5), hash2(i, 6)]);
    const haze = pal(0.45), dark = lerpc(pal(0.04), 0x000000, 0.4), sunC = pal(0.98);
    const emit = new Float32Array(W * H);
    // The canopy noise is smooth: on big canvases it's computed every other pixel.
    const g = W * H > 9000 ? 2 : 1, GW = Math.ceil(W / g) + 1, GH = Math.ceil(H / g) + 1;
    const leafG = new Float32Array(GW * GH), lightG = new Float32Array(GW * GH);
    return (t) => {
      const u = (t / LOOP) * Math.PI * 2;
      const sunX = W * (0.5 + 0.08 * Math.sin(u)), sunY = H * 0.2;
      for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
        const x = gx * g, y = gy * g, sway = Math.sin(u + y * 0.1) * 1.5;
        leafG[gy * GW + gx] = fbm((x + sway) * 0.06, y * aspect * 0.06, Math.cos(u) * 0.3 + Math.sin(u) * 0.3, 3);
      }
      // Occluders: a canopy thickest at the top with gaps, trunks, the forest floor.
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = y / H, gx = x / g, gy = y / g, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, j = iy * GW + ix;
        const leaf = (leafG[j] * (1 - fx) + leafG[j + 1] * fx) * (1 - fy) + (leafG[j + GW] * (1 - fx) + leafG[j + GW + 1] * fx) * fy;
        let o = clamp01((leaf + 0.2 - v * 0.6) * 5);
        if (v > 0.86) o = 1;
        occ[y * W + x] = o;
      }
      for (const tr of trunks) for (let y = Math.floor(H * 0.2); y < H; y++) {
        const cx = tr.x + (y - H) * tr.lean;
        for (let dx = 0; dx < tr.w; dx++) { const x = Math.round(cx + dx); if (x >= 0 && x < W) occ[y * W + x] = 1; }
      }
      // Only open sky near the sun emits; marching toward the sun smears it into shafts.
      for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const d = Math.hypot((x - sunX) / W, ((y - sunY) * aspect) / W);
        emit[i] = (1 - occ[i]) * Math.pow(clamp01(1 - d / 0.55), 2.2);
      }
      // The light march runs on the same lattice — shafts are smooth along their length.
      for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
        const x = Math.min(W - 1, gx * g), y = Math.min(H - 1, gy * g);
        const dx = (sunX - x) / STEPS, dy = (sunY - y) / STEPS;
        let light = 0, sx = x, sy = y, w = 1;
        for (let s = 0; s < STEPS; s++) {
          const ix = sx | 0, iy = sy | 0;
          if (ix >= 0 && iy >= 0 && ix < W && iy < H) light += emit[iy * W + ix] * w;
          sx += dx; sy += dy; w *= 0.95;
        }
        lightG[gy * GW + gx] = light / 4.7;
      }
      for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const gx = x / g, gy = y / g, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, j = iy * GW + ix;
        const light = (lightG[j] * (1 - fx) + lightG[j + 1] * fx) * (1 - fy) + (lightG[j + GW] * (1 - fx) + lightG[j + GW + 1] * fx) * fy;
        const d = Math.hypot((x - sunX) / W, ((y - sunY) * aspect) / W);
        const open = 1 - occ[i];
        let c = lerpc(dark, haze, open * 0.4 * (1 - y / H));            // dim far forest air
        c = lerpc(c, haze, clamp01(light * 1.1));                         // the shafts
        c = lerpc(c, sunC, clamp01(light * 1.6 - 0.6));
        c = lerpc(c, sunC, clamp01(1 - d * 11) * open);                   // the sun's disc
        px[i] = c;
      }
      // Dust motes catching the light inside the shafts.
      for (const [mx, my, k] of motes) {
        const x = (mx * W + Math.sin(u + k * 9) * 3 + W) % W, y = ((((my + (t / LOOP) * (k > 0.5 ? 1 : -1)) % 1) + 1) % 1) * H * 0.85;
        const i = Math.floor(y) * W + Math.floor(x);
        cv.blend(x, y, sunC, clamp01((((px[i] >> 8) & 255) - 90) / 120) * 0.7);
      }
      cv.paint(ctx.buffer);
    };
  },
};
