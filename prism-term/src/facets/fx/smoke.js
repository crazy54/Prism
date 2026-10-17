// Incense smoke: a thin laminar ribbon leaves the glowing tip, wavers, then
// breaks into curling turbulence as it climbs — the column is advected through
// a noise flow that strengthens with height, widening and thinning to nothing.
import { lerpc, clamp01 } from '../retro/_kit.js';

export default {
  title: 'Incense Smoke',
  gallery: 'fx',
  category: 'Fire & Water',
  kind: 'scene',
  tags: ['smoke', 'incense', 'turbulence', 'wisps', 'calm', 'ambient'],
  order: 90,
  description: 'Incense smoke: a laminar ribbon leaves the glowing tip, wavers and breaks into curling turbulence as it rises.',
  size: { w: 48, h: 24 },
  minSize: { w: 12, h: 8 },
  loop: 24,
  canvas: 'field',
  palette: 'ice',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const { noise3 } = ctx.noise;
    const { theme } = ctx;
    const { width: W, height: H, px, aspect } = cv;
    const baseY = H * 0.86, tipX = W / 2;
    const smokeC = lerpc(pal(0.75), theme.ink, 0.3);
    const S = Math.min(W, H * aspect);
    const strands = [{ a: 1, b: 0, k: 1, ph: 0 }, { a: -0.8, b: 0.15, k: 0.7, ph: 1.4 }, { a: 0.6, b: -0.22, k: 0.5, ph: 2.9 }];
    const T = 8, D = 1.6;                                           // flow cycle (s) and rise per cycle (noise units)
    const flow = (x, yy, off) => noise3(x * 0.05, yy + off, 0.5) + noise3(x * 0.11, yy * 2.1 + off * 2.1 + 3.3, 2.5) * 0.5;
    return (t) => {
      const u = (t / 24) * Math.PI * 2;
      const f = (t % T) / T;
      for (let y = 0, i = 0; y < H; y++) {
        const hgt = clamp01((baseY - y) / baseY);                  // 0 at the tip, 1 at the top
        const turb = Math.pow(hgt, 1.6) * 2.6;
        const width = (0.45 + hgt * 3.4) * (S / 48);
        const reach = hgt * S * 0.12 + turb * S * 0.26 + width * 3;
        const x0 = Math.max(0, Math.floor(tipX - reach)), x1 = Math.min(W, Math.ceil(tipX + reach));
        px.fill(theme.bg, y * W, (y + 1) * W);
        if (y > baseY) continue;
        const yy = y * aspect * 0.06;
        for (let x = x0; x < x1; x++) {
          i = y * W + x;
          let d = 0;
          // Two copies of the flow, scrolled upward and cross-faded, so the smoke climbs and still loops.
          const n0 = flow(x, yy, f * D) * (1 - f) + flow(x, yy, (f - 1) * D) * f;
          for (const s of strands) {
            const n = n0 * s.a + s.b * hgt;
            const centre = tipX + Math.sin(hgt * 6 - u * 3 + s.ph) * hgt * S * 0.1 + n * turb * S * 0.16;
            const q = (x + 0.5 - centre) / width;
            d += Math.exp(-q * q) * s.k * (1 - hgt * 0.8) * (s.a === 1 ? 1 : clamp01(hgt * 4));
          }
          if (d > 0.02) px[i] = lerpc(theme.bg, smokeC, Math.min(0.92, d * 1.1));
        }
      }
      // The stick, its holder, and the glowing tip.
      for (let y = Math.floor(baseY); y < H; y++) cv.set(tipX, y, 0x6a4a30);
      for (let x = Math.floor(tipX - S * 0.18); x <= tipX + S * 0.18; x++) cv.set(x, H - 1, lerpc(theme.panel, 0x8a6a40, 0.5));
      const glow = 0.7 + 0.3 * Math.sin(t * 5) * Math.sin(t * 3.1);
      cv.set(tipX, baseY, lerpc(0xff5a1a, 0xffd080, glow));
      cv.paint(ctx.buffer);
    };
  },
};
