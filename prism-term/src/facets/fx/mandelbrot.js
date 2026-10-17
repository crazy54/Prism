// Endless Mandelbrot dive into Seahorse Valley with smooth (normalized
// iteration count) coloring. The zoom breathes in and out on a log scale, and
// the iteration cap adapts to the work done last frame so cost stays bounded.
// `--set set=julia` swaps in an animated Julia set.
export default {
  title: 'Mandelbrot Dive',
  gallery: 'fx',
  category: 'Fractals',
  kind: 'scene',
  tags: ['mandelbrot', 'julia', 'fractal', 'zoom'],
  order: 40,
  description: 'Continuous zoom into Seahorse Valley with smooth iteration coloring; --set set=julia for a morphing Julia set.',
  canvas: 'field',
  palette: 'magma',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette(undefined, { size: 1024 });
    const julia = ctx.param('set', 'mandelbrot') === 'julia';
    const period = ctx.param('period', 36);
    const { width: W, height: H, px, aspect } = cv;
    const FX = -0.743643887037151, FY = 0.13182590420533;
    const maxLog = Math.log(julia ? 6 : 3e4);
    const budget = 3.6e6; // iterations per frame (~6 ms)
    const inside = ctx.theme.bg;
    let cap = 220;

    return (t) => {
      const phase = (t % period) / period;
      const zoom = Math.exp(maxLog * (1 - Math.cos(phase * Math.PI * 2)) / 2);
      const want = Math.min(900, Math.floor(90 + 110 * Math.log10(zoom)));
      const maxIt = Math.max(24, Math.min(want, cap));
      const unit = (julia ? 3.1 : 3.0) / (Math.min(W, H * aspect) * zoom);
      const rot = julia ? 0 : phase * Math.PI * 2;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      // Julia c walks the main cardioid's boundary (c = e^iθ/2 − e^2iθ/4), where the
      // sets are connected and most intricate.
      const jt = t * 0.12 + 1.2;
      const jr = 0.5 * Math.cos(jt) - 0.25 * Math.cos(2 * jt), ji = 0.5 * Math.sin(jt) - 0.25 * Math.sin(2 * jt);
      const cx0 = julia ? 0 : FX, cy0 = julia ? 0 : FY;
      const shift = t * 0.015;
      let work = 0;

      for (let y = 0, i = 0; y < H; y++) {
        const vy = (y - H / 2 + 0.5) * aspect * unit;
        for (let x = 0; x < W; x++, i++) {
          const vx = (x - W / 2 + 0.5) * unit;
          const ox = cx0 + vx * cr - vy * sr, oy = cy0 + vx * sr + vy * cr;
          let zr, zi, ar, ai;
          if (julia) { zr = ox; zi = oy; ar = jr; ai = ji; }
          else {
            zr = 0; zi = 0; ar = ox; ai = oy;
            // Skip the main cardioid and period-2 bulb outright.
            const q = (ox - 0.25) * (ox - 0.25) + oy * oy;
            if (q * (q + (ox - 0.25)) <= 0.25 * oy * oy || (ox + 1) * (ox + 1) + oy * oy <= 0.0625) { px[i] = inside; continue; }
          }
          let n = 0, r2 = 0, i2 = 0;
          while (n < maxIt) {
            r2 = zr * zr; i2 = zi * zi;
            if (r2 + i2 > 256) break;
            zi = 2 * zr * zi + ai;
            zr = r2 - i2 + ar;
            n++;
          }
          work += n;
          if (n >= maxIt) { px[i] = inside; continue; }
          const mu = n + 1 - Math.log(Math.log(r2 + i2) * 0.5) / Math.LN2;
          const s = Math.log2(Math.max(1, mu) + 1) * 0.3 + shift;
          px[i] = pal(1 - Math.abs(((s % 2) + 2) % 2 - 1));
        }
      }
      // Steer next frame's cap toward the budget (deterministic: depends only on content).
      if (work > budget) cap = Math.max(24, Math.floor(cap * 0.85));
      else if (work < budget * 0.6) cap = Math.min(900, Math.ceil(cap * 1.08) + 1);
      cv.paint(ctx.buffer);
    };
  },
};
