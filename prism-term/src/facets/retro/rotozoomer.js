// Rotozoomer: one small tile — a checker with a prism emblem — rotated and
// zoomed across the whole screen every frame. The texture-mapping trick that
// showed what a 7 MHz CPU could do.
import { lerpc, shade } from './_kit.js';

const T = 32;
function makeTile(pal, theme) {
  const tile = new Int32Array(T * T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const check = ((x >> 3) + (y >> 3)) & 1;
    let c = check ? lerpc(theme.bg, theme.accent, 0.42) : shade(theme, 0.25);
    // Prism emblem: a triangle with a bright edge, centered in the tile.
    const u = (x - T / 2 + 0.5) / (T / 2), v = (y - T / 2 + 0.5) / (T / 2);
    const inTri = v > -0.62 && v < 0.55 && Math.abs(u) < (v + 0.62) * 0.62;
    const edge = inTri && (v > 0.43 || Math.abs(u) > (v + 0.62) * 0.62 - 0.16);
    if (inTri) c = edge ? 0xffffff : pal(((u + 1) * 0.5 + 0.1) % 1);
    tile[y * T + x] = c;
  }
  return tile;
}

export default {
  title: 'Rotozoomer',
  gallery: 'retro',
  category: 'Intros & Scrollers',
  kind: 'scene',
  tags: ['rotozoom', 'texture mapping', 'demoscene', 'rotation', 'zoom'],
  order: 60,
  description: 'One small emblem tile rotated and zoomed across the whole screen every frame — classic texture mapping.',
  size: { w: 70, h: 22 },
  minSize: { w: 16, h: 6 },
  loop: 12,
  canvas: 'field',
  palette: 'prism',
  params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, px, aspect } = cv;
    const tile = makeTile(pal, ctx.theme);
    return (t) => {
      const tt = t * speed;
      const a = tt * 0.6, zoom = 1.1 + Math.sin(tt * 0.45) * 0.75;
      const ca = Math.cos(a) * zoom * (T / Math.min(W, H * aspect)) * 1.6, sa = Math.sin(a) * zoom * (T / Math.min(W, H * aspect)) * 1.6;
      const ox = tt * 9, oy = tt * 5;
      for (let y = 0, i = 0; y < H; y++) {
        const vy = (y - H / 2) * aspect;
        for (let x = 0; x < W; x++, i++) {
          const vx = x - W / 2;
          const u = Math.floor(vx * ca - vy * sa + ox), v = Math.floor(vx * sa + vy * ca + oy);
          px[i] = tile[(v & (T - 1)) * T + (u & (T - 1))];
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
