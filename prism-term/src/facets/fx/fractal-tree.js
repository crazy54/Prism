// A recursive blossom tree: ten generations of branches, each a little shorter
// and thinner, swaying more the further they are from the trunk. Blossoms at
// the tips, petals drifting down on the wind.
import { lerpc, hash2 } from '../retro/_kit.js';

const LOOP = 16;

export default {
  title: 'Blossom Tree',
  gallery: 'fx',
  category: 'Fractals',
  kind: 'scene',
  tags: ['tree', 'fractal', 'recursive', 'l-system', 'blossom', 'sakura', 'wind'],
  order: 70,
  description: 'A recursive blossom tree swaying in the wind — ten generations of branches, blooming tips and drifting petals.',
  size: { w: 64, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: LOOP,
  canvas: 'line',
  palette: 'candy',
  params: { depth: { default: 10, min: 5, max: 12, label: 'Generations' } },
  setup(ctx) {
    const cv = ctx.canvas('line');
    const pal = ctx.palette();
    const { theme } = ctx;
    const { width: PW, height: PH, aspect } = cv;
    const depth = Math.max(5, Math.min(12, Math.round(ctx.param('depth', 10))));
    const bark = lerpc(0x6b4a2e, theme.ink, 0.15), twig = lerpc(0x9a7a5a, theme.ink, 0.2);
    const blossom = [pal(0), pal(0.15), lerpc(pal(0), 0xffffff, 0.5)];
    const ground = lerpc(theme.bg, theme.pos, 0.35);
    const len0 = Math.min(PH * 0.3 * aspect, PW * 0.2);
    const petals = Array.from({ length: Math.round(PW * 0.25) }, (_, i) => ({ x: hash2(i, 1), ph: hash2(i, 2), sp: 1 + Math.floor(hash2(i, 3) * 2), c: blossom[i % 3] }));
    return (t) => {
      cv.clear();
      const u = (t / LOOP) * Math.PI * 2;
      const wind = Math.sin(u) * 0.6 + Math.sin(u * 3 + 1) * 0.25;
      // Ground line with a little grass.
      const gy = PH - 1;
      for (let x = 0; x < PW; x++) { cv.set(x, gy, ground); if (hash2(x, 5) < 0.3) cv.set(x, gy - 1, ground); }
      const tips = [];
      const grow = (x, y, ang, len, d, seed) => {
        const sway = wind * 0.035 * (depth - d + 1) * (1 + 0.3 * Math.sin(u * 2 + seed));
        const a = ang + sway;
        const x2 = x + Math.sin(a) * len, y2 = y - (Math.cos(a) * len) / aspect;
        const thick = Math.max(1, Math.round((d / depth) ** 2 * 3.2));
        const c = d > depth * 0.5 ? bark : twig;
        for (let o = 0; o < thick; o++) cv.line(x + o - (thick >> 1), y, x2 + o - (thick >> 1), y2, c);
        if (d <= 1) { tips.push([x2, y2, seed]); return; }
        const spread = 0.42 + 0.08 * Math.sin(seed * 3.1);
        const shrink = 0.72 + 0.06 * hash2(seed, d);
        grow(x2, y2, a - spread, len * shrink, d - 1, seed * 2 + 1);
        grow(x2, y2, a + spread * 0.9, len * (shrink - 0.03), d - 1, seed * 2 + 2);
      };
      grow(PW / 2, gy - 1, 0, len0, depth, 1);
      for (const [x, y, s] of tips) {
        const c = blossom[s % 3];
        cv.set(x, y, c); cv.set(x + 1, y, c); cv.set(x, y - 1, c);
        if (hash2(s, 7) < 0.5) cv.set(x - 1, y + 1, c);
      }
      // Petals: each falls on its own loop, sliding with the wind.
      for (const p of petals) {
        const f = ((t / LOOP) * p.sp + p.ph) % 1;
        const y = PH * 0.15 + f * PH * 0.85;
        const x = (p.x * PW + f * PW * 0.25 + Math.sin(f * 12 + p.ph * 9) * PW * 0.02 + wind * PW * 0.03 * f) % PW;
        cv.set(x, y, p.c);
      }
      cv.paint(ctx.buffer);
    };
  },
};
