// Amiga copper bars: glossy horizontal bars swing past each other in depth,
// each a vertical gradient with a white-hot center line — the copper chip's
// party trick, now in a terminal.
import { lerpc, shade, ground } from './_kit.js';

export default {
  title: 'Copper Bars',
  gallery: 'retro',
  category: 'Raster & Copper',
  kind: 'scene',
  tags: ['copper', 'raster bars', 'amiga', 'demoscene', 'gradient'],
  order: 10,
  description: 'Glossy raster bars swinging through each other in depth, each a gradient with a white-hot core.',
  size: { w: 80, h: 20 },
  minSize: { w: 20, h: 6 },
  loop: 10,
  canvas: 'field',
  palette: 'prism',
  params: {
    bars: { default: 7, min: 2, max: 14, label: 'Bars' },
    speed: { default: 1, min: 0.25, max: 4, label: 'Speed' },
  },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const n = Math.round(ctx.param('bars', 7));
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, px } = cv;
    const r = Math.max(2, H / 14);
    const bars = Array.from({ length: n }, (_, i) => ({ phase: (i / n) * Math.PI * 2, color: pal(i / n) }));
    const bg = ctx.theme.bg, base = ground(ctx.theme);
    return (t) => {
      const tt = t * speed;
      for (let y = 0; y < H; y++) px.fill(shade(ctx.theme, 0.35 * Math.abs(y / H - 0.5) * 2), y * W, (y + 1) * W);
      const live = bars.map((b) => {
        const a = tt * 1.4 + b.phase;
        return { y: H / 2 + Math.sin(a) * (H / 2 - r - 1) * 0.92, z: Math.cos(a), color: b.color };
      }).sort((a, b) => a.z - b.z);
      for (const b of live) {
        const rr = r * (0.75 + 0.35 * (b.z + 1) / 2);
        const depth = 0.55 + 0.45 * (b.z + 1) / 2;
        for (let y = Math.max(0, Math.floor(b.y - rr)); y <= Math.min(H - 1, Math.ceil(b.y + rr)); y++) {
          const d = Math.abs(y + 0.5 - b.y) / rr;
          if (d > 1) continue;
          const k = 1 - d;
          let c = lerpc(base, b.color, Math.min(1, k * 1.6) * depth);
          if (k > 0.72) c = lerpc(c, 0xffffff, (k - 0.72) / 0.28 * 0.85 * depth);
          px.fill(c, y * W, (y + 1) * W);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
