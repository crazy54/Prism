// The infinite checkerboard floor: a perspective-mapped checker plane racing
// toward the horizon and slowly banking, under a raster-gradient sunset sky.
// Distance fog keeps the far squares from shimmering.
import { lerpc } from './_kit.js';

export default {
  title: 'Checker Floor',
  gallery: 'retro',
  category: 'Raster & Copper',
  kind: 'scene',
  tags: ['checkerboard', 'floor', 'perspective', 'amiga', 'mode 7'],
  order: 40,
  description: 'A perspective checkerboard plane racing to the horizon and banking, under a raster-gradient sky.',
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 12,
  canvas: 'field',
  palette: 'sunset',
  params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, px, aspect } = cv;
    const hz = Math.floor(H * 0.45);
    const a = ctx.theme.accent, b = lerpc(ctx.theme.bg, ctx.theme.ink, 0.9);
    return (t) => {
      const tt = t * speed;
      const bank = Math.sin(tt * 0.35) * 0.18;
      const cs = Math.cos(bank), sn = Math.sin(bank);
      const mid = lerpc(a, b, 0.5), haze = pal(0.66);
      for (let y = 0; y < H; y++) {
        if (y < hz) {
          px.fill(pal(0.08 + (y / hz) * 0.62), y * W, (y + 1) * W);
          continue;
        }
        const dy = (y - hz + 0.5) * aspect;
        const z = (H * aspect * 0.55) / dy;      // depth of this row
        // Far squares shrink below a pixel: fade their contrast first, then haze to the horizon.
        const contrast = 1 - Math.min(1, Math.pow(z / 7, 1.3));
        const hazeK = Math.min(1, Math.pow(z / 14, 1.2));
        for (let x = 0; x < W; x++) {
          const sx = (x - W / 2) / (W / 2);
          let wx = sx * z * 1.8, wz = z * 1.2 + tt * 4;
          [wx, wz] = [wx * cs - wz * sn, wx * sn + wz * cs];
          const check = ((Math.floor(wx) + Math.floor(wz)) & 1) === 0;
          px[y * W + x] = lerpc(lerpc(mid, check ? a : b, contrast), haze, hazeK);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
