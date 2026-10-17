// The Burning Ship fractal (z → (|Re z| + i|Im z|)² + c), flipped upright and
// colored like its name. The camera breathes from the whole hull down into
// the little ship riding the antenna off its bow and back, on a log-scale zoom.
export default {
  title: 'Burning Ship',
  gallery: 'fx',
  category: 'Fractals',
  kind: 'scene',
  tags: ['burning ship', 'fractal', 'escape time', 'zoom', 'fire'],
  order: 50,
  description: 'The Burning Ship fractal in flame colors, breathing from the whole hull down to the little ship on its antenna.',
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 6 },
  loop: 30,
  canvas: 'field',
  palette: 'fire',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette(undefined, { size: 1024 });
    const { width: W, height: H, px, aspect } = cv;
    const C0 = [-0.5, -0.5], W0 = 3.4;                // the whole hull
    const C1 = [-1.755, -0.03], W1 = 0.12;            // the little ship on the bow's antenna
    const inside = ctx.theme.bg;
    return (t) => {
      const s = 0.5 - 0.5 * Math.cos(((t % 30) / 30) * Math.PI * 2);
      const w = W0 * Math.pow(W1 / W0, s);
      const k = (w - W1) / (W0 - W1);                  // zooms toward the target point
      const cx = C1[0] + (C0[0] - C1[0]) * k, cy = C1[1] + (C0[1] - C1[1]) * k;
      const unit = w / Math.min(W, (H * aspect) * 1.6);
      const maxIt = Math.round(70 + 110 * s);
      for (let y = 0, i = 0; y < H; y++) {
        const ci = cy + (y - H / 2 + 0.5) * aspect * unit;
        for (let x = 0; x < W; x++, i++) {
          const cr = cx + (x - W / 2 + 0.5) * unit;
          let zr = 0, zi = 0, n = 0, r2 = 0, i2 = 0;
          while (n < maxIt) {
            r2 = zr * zr; i2 = zi * zi;
            if (r2 + i2 > 64) break;
            zi = Math.abs(2 * zr * zi) + ci;
            zr = r2 - i2 + cr;
            n++;
          }
          if (n >= maxIt) { px[i] = inside; continue; }
          const mu = n + 1 - Math.log(Math.log(r2 + i2) * 0.5) / Math.LN2;
          const v = Math.min(1, Math.pow(mu / maxIt, 0.42) * 1.15);
          px[i] = pal(v);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
