// Kefrens bars (a.k.a. Alcatraz bars): one short shaded bar is redrawn on every
// scanline at a wandering x, and each line keeps what the line above drew —
// so the bars stack into a twisting staircase of cylinders. Pure 1990 magic.
import { lerpc } from './_kit.js';

export default {
  title: 'Kefrens Bars',
  gallery: 'retro',
  category: 'Raster & Copper',
  kind: 'scene',
  tags: ['kefrens', 'alcatraz', 'raster', 'amiga', 'demoscene'],
  order: 20,
  description: 'One shaded bar per scanline that never gets erased, stacking into a twisting staircase of cylinders.',
  size: { w: 80, h: 22 },
  minSize: { w: 24, h: 8 },
  loop: 12,
  canvas: 'field',
  palette: 'prism',
  params: { speed: { default: 1, min: 0.25, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, px } = cv;
    const bw = Math.max(3, Math.round(W / 14));
    const row = new Int32Array(W);
    const bg = ctx.theme.bg;
    return (t) => {
      const tt = t * speed;
      row.fill(bg);
      for (let y = 0; y < H; y++) {
        const x0 = Math.round(W / 2 - bw / 2
          + Math.sin(y * 0.11 + tt * 1.9) * W * 0.22
          + Math.sin(y * 0.047 - tt * 1.3) * W * 0.16);
        const c = pal((y / H) * 0.85 + tt * 0.07);
        for (let k = 0; k < bw; k++) {
          const x = x0 + k;
          if (x < 0 || x >= W) continue;
          const u = (k + 0.5) / bw * 2 - 1;          // -1..1 across the bar
          const shade = Math.sqrt(1 - u * u);       // cylinder
          let col = lerpc(0x000000, c, 0.25 + 0.75 * shade);
          if (shade > 0.9) col = lerpc(col, 0xffffff, (shade - 0.9) * 6);
          row[x] = col;
        }
        px.set(row, y * W);
      }
      cv.paint(ctx.buffer);
    };
  },
};
