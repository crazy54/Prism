// Living Voronoi: drifting seeds carve the plane into cells. Each cell is shaded
// like a bevelled tile (bright at its seed, darker toward its edge) and the
// borders — where the nearest and second-nearest seeds tie — glow.
import { lerpc } from '../retro/_kit.js';

export default {
  title: 'Voronoi Cells',
  gallery: 'fx',
  category: 'Fields',
  kind: 'scene',
  tags: ['voronoi', 'worley', 'cells', 'tiles', 'stained glass', 'procedural'],
  order: 70,
  description: 'Drifting seeds carve living Voronoi cells — bevelled stained-glass tiles with glowing borders where neighbors meet.',
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 6 },
  loop: 24,
  canvas: 'field',
  palette: 'prism',
  params: { cells: { default: 1, min: 0.3, max: 3, label: 'Cell density' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette(undefined, { size: 512 });
    const rand = ctx.rng;
    const { width: W, height: H, px, aspect } = cv;
    const VH = H * aspect;
    const n = Math.max(6, Math.min(48, Math.round(((W * VH) / 260) * ctx.param('cells', 1) * (80 / Math.max(80, W)) ** 0.5)));
    const seeds = Array.from({ length: n }, () => ({ x: rand(), y: rand(), ax: 0.05 + rand() * 0.07, ay: 0.05 + rand() * 0.07, fa: 1 + Math.floor(rand() * 2), fb: 1 + Math.floor(rand() * 2), ph: rand() * 6.28, hue: rand() }));
    const sx = new Float32Array(n), sy = new Float32Array(n);
    const S = Math.sqrt((W * VH) / n);               // typical cell size
    // The lead between the panes is dark in daylight too: stained glass, not frosted.
    const edge = lerpc(0xffffff, ctx.theme.ink, 0.3);
    const lead = ctx.theme.mode === 'light' ? lerpc(ctx.theme.ink, ctx.theme.bg, 0.2) : lerpc(ctx.theme.bg, 0x000000, 0.4);
    return (t) => {
      const u = (t / 24) * Math.PI * 2;
      for (let j = 0; j < n; j++) {
        const s = seeds[j];
        sx[j] = (s.x + Math.sin(u * s.fa + s.ph) * s.ax) * W;
        sy[j] = (s.y + Math.cos(u * s.fb + s.ph * 1.3) * s.ay) * VH;
      }
      for (let y = 0, i = 0; y < H; y++) {
        const vy = (y + 0.5) * aspect;
        for (let x = 0; x < W; x++, i++) {
          let d1 = 1e9, d2 = 1e9, best = 0;
          for (let j = 0; j < n; j++) {
            const dx = x + 0.5 - sx[j], dy = vy - sy[j], d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; best = j; } else if (d < d2) d2 = d;
          }
          const f1 = Math.sqrt(d1), f2 = Math.sqrt(d2), gap = (f2 - f1) / S;
          const base = pal((seeds[best].hue + t / 48) % 1);
          let c = lerpc(base, lead, Math.min(0.75, (f1 / S) * 0.9));       // bevel: darker away from the seed
          if (gap < 0.08) c = lead;                                               // the leading between panes
          else if (gap < 0.2) c = lerpc(c, edge, (1 - (gap - 0.08) / 0.12) * 0.35); // light catching the pane's edge
          px[i] = c;
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
