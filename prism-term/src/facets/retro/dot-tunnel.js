// Dot tunnel: rings of dots flying at the camera along a snaking path, each
// ring twisted a little further than the last. Near dots are big and bright,
// far ones fade into the dark — braille makes the dots razor sharp.
import { lerpc } from './_kit.js';

export default {
  title: 'Dot Tunnel',
  gallery: 'retro',
  category: 'Intros & Scrollers',
  kind: 'scene',
  tags: ['tunnel', 'dots', 'demoscene', '3d', 'braille'],
  order: 50,
  description: 'Rings of dots racing at the camera along a snaking path, twisting ring by ring, fading with depth.',
  size: { w: 70, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 10,
  canvas: 'line',
  palette: 'prism',
  params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, aspect } = cv;
    const VH = H * aspect;
    const RINGS = 30, DOTS = 28, DEPTH = 18;
    const f = Math.min(W, VH) * 0.62;
    const bg = ctx.theme.bg;
    const path = (z, t) => [Math.sin(z * 0.23 + t * 0.9) * 1.1, Math.cos(z * 0.17 + t * 0.7) * 0.8];
    return (t) => {
      const tt = t * speed;
      cv.clear();
      const travel = tt * 5;
      const [camX, camY] = path(travel, tt);
      for (let r = RINGS - 1; r >= 0; r--) {
        const zWorld = Math.floor(travel) + r + 1;
        const z = zWorld - travel;                 // distance from camera
        if (z <= 0.15) continue;
        const [ox, oy] = path(zWorld, tt);
        const fade = Math.pow(1 - Math.min(1, z / DEPTH), 0.55);
        const c = lerpc(bg, lerpc(pal((zWorld * 0.045) % 1), 0xffffff, 0.15 * fade), 0.2 + 0.8 * fade);
        const twist = zWorld * 0.35 + tt * 0.8;
        for (let d = 0; d < DOTS; d++) {
          const a = (d / DOTS) * Math.PI * 2 + twist;
          const x = W / 2 + ((ox - camX + Math.cos(a) * 1.6) * f) / z;
          const y = (VH / 2 + ((oy - camY + Math.sin(a) * 1.6) * f) / z) / aspect;
          cv.set(x, y, c);
          if (z < 2.2) { cv.set(x + 1, y, c); cv.set(x, y + 1, c); cv.set(x + 1, y + 1, c); }
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
