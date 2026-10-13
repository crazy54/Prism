// The bottom of a swimming pool on a sunny day: tiles and grout bent by the
// moving surface, overlaid with the bright network of caustics — light focused
// where the surface's wave crests act as lenses. Two noise layers drift
// against each other; caustic lines live where their sum crosses zero.
import { lerpc, clamp01 } from '../retro/_kit.js';

export default {
  title: 'Pool Caustics',
  gallery: 'fx',
  category: 'Fire & Water',
  kind: 'scene',
  tags: ['caustics', 'pool', 'water', 'light', 'refraction', 'summer', 'tiles'],
  order: 100,
  description: 'A sunlit pool floor: tiles bent by the moving surface under a dancing network of bright caustic light.',
  size: { w: 72, h: 24 },
  minSize: { w: 16, h: 6 },
  loop: 16,
  canvas: 'field',
  palette: 'ocean',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { noise3 } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    const S = Math.min(W, H * aspect);
    const tile = Math.max(4, S / 5);
    const water = pal(0.42), deep = pal(0.28), light = pal(0.95), grout = lerpc(pal(0.22), 0x000000, 0.2);
    // The three noise fields are smooth, so on big canvases they're evaluated on a
    // coarse lattice and interpolated; tile edges and ridges stay per-pixel.
    const g = W * H > 9000 ? 2 : 1;
    const GW = Math.ceil(W / g) + 2, GH = Math.ceil(H / g) + 2;
    const OX = new Float32Array(GW * GH), OY = new Float32Array(GW * GH), NN = new Float32Array(GW * GH);
    const lerp2 = (A, x, y) => {
      const gx = x / g, gy = y / g, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy, j = iy * GW + ix;
      return (A[j] * (1 - fx) + A[j + 1] * fx) * (1 - fy) + (A[j + GW] * (1 - fx) + A[j + GW + 1] * fx) * fy;
    };
    return (t) => {
      const u = (t / 16) * Math.PI * 2;
      const ca = Math.cos(u), sa = Math.sin(u);
      for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
        const vx = (gx * g + 0.5) / S, vy = ((gy * g + 0.5) * aspect) / S, j = gy * GW + gx;
        OX[j] = noise3(vx * 2.2 + ca * 0.4, vy * 2.2, sa * 0.4 + 1) * 0.06;
        OY[j] = noise3(vx * 2.2, vy * 2.2 + sa * 0.4, ca * 0.4 + 5) * 0.06;
        NN[j] = noise3(vx * 3.1 + ca * 0.7, vy * 3.1 + sa * 0.7, 0.5) + noise3(vx * 3.7 - sa * 0.6, vy * 3.7 + ca * 0.6, 7.5) * 0.8 + noise3(vx * 5.3 + sa, vy * 5.3 - ca, 3.1) * 0.35;
      }
      for (let y = 0, i = 0; y < H; y++) {
        const vy = ((y + 0.5) * aspect) / S;
        for (let x = 0; x < W; x++, i++) {
          const vx = (x + 0.5) / S;
          // Refraction wobble for the tiles.
          const gx = ((vx + lerp2(OX, x, y)) * S) / tile, gy = ((vy + lerp2(OY, x, y)) * S) / tile;
          const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
          const line = Math.min(fx, 1 - fx, fy, 1 - fy) * tile;
          let c = lerpc(deep, water, 0.5 + 0.5 * Math.sin(Math.floor(gx) * 1.7 + Math.floor(gy) * 2.3) * 0.3);
          if (line < Math.max(0.6, tile * 0.07)) c = grout;
          // Caustic network: sharp ridges where drifting noise layers cancel.
          const ridge = Math.pow(clamp01(1 - Math.abs(lerp2(NN, x, y)) * 3.2), 3);
          c = lerpc(c, light, Math.min(0.85, ridge * 0.95));
          px[i] = c;
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
