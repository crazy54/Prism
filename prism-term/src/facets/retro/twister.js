// The Amiga twister: a square column whose rotation angle varies with height,
// drawn scanline by scanline as the visible faces of a spinning prism. Each
// face keeps its own color; brightness follows its apparent width.
import { lerpc, makeStars } from './_kit.js';

export default {
  title: 'Twister',
  gallery: 'retro',
  category: 'Raster & Copper',
  kind: 'scene',
  tags: ['twister', 'amiga', 'raster', 'demoscene', 'column'],
  order: 30,
  description: 'A square column twisting along its height, drawn per scanline from its visible faces — Amiga classic.',
  size: { w: 60, h: 24 },
  minSize: { w: 16, h: 8 },
  loop: 10,
  canvas: 'field',
  palette: 'prism',
  params: {
    twist: { default: 1, min: 0, max: 3, label: 'Twist' },
    speed: { default: 1, min: 0.25, max: 4, label: 'Speed' },
  },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const twist = ctx.param('twist', 1);
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, px } = cv;
    const R = Math.min(W * 0.22, H * cv.aspect * 0.5);
    const faces = [pal(0.02), pal(0.27), pal(0.52), pal(0.77)];
    const stars = makeStars(ctx.rng, W, H, Math.round(W * H * 0.01));
    const bg = ctx.theme.bg;
    return (t) => {
      const tt = t * speed;
      px.fill(bg);
      for (const s of stars) cv.set(s[0], (s[1] + tt * (2 + 6 * s[2])) % H, lerpc(bg, ctx.theme.muted, 0.3 + s[2] * 0.6));
      for (let y = 0; y < H; y++) {
        const cx = W / 2 + Math.sin(y * 0.03 + tt * 0.9) * W * 0.12;
        const a = tt * 1.6 + Math.sin(y / H * 3.1 + tt * 0.8) * 2.2 * twist;
        for (let f = 0; f < 4; f++) {
          const x1 = cx + Math.sin(a + (f * Math.PI) / 2) * R;
          const x2 = cx + Math.sin(a + ((f + 1) * Math.PI) / 2) * R;
          if (x2 <= x1) continue;
          const light = 0.35 + 0.65 * ((x2 - x1) / (R * Math.SQRT2));
          for (let x = Math.max(0, Math.floor(x1)); x < Math.min(W, Math.ceil(x2)); x++) {
            const u = (x - x1) / (x2 - x1);
            const edge = u < 0.08 || u > 0.92 ? 0.7 : 1;
            px[y * W + x] = lerpc(0x000000, faces[f], Math.min(1, light) * edge);
          }
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
