// Metaballs: an inverse-square field from orbiting blobs. Color is the
// field-weighted blend of each ball's palette hue, so merging blobs mix
// smoothly; the iso-surface gets a hot rim and the outside a soft halo.
export default {
  title: 'Metaballs',
  gallery: 'fx',
  category: 'Fields',
  kind: 'scene',
  tags: ['metaballs', 'blobs', 'isosurface', 'glow'],
  order: 50,
  description: 'Orbiting metaballs that merge with blended hues, a glowing iso-contour rim and soft halo.',
  canvas: 'field',
  palette: 'candy',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const rand = ctx.rng;
    const count = Math.max(2, Math.min(12, ctx.param('count', 6)));
    const { width: W, height: H, px, aspect } = cv;
    const S = Math.min(W, H * aspect);
    const balls = Array.from({ length: count }, (_, i) => {
      const c = pal(i / count);
      return {
        r: S * (0.1 + rand() * 0.06),
        ax: 0.25 + rand() * 0.2, ay: 0.22 + rand() * 0.18,
        fx: 0.3 + rand() * 0.5, fy: 0.25 + rand() * 0.5, p: rand() * 6.28,
        cr: (c >> 16) & 255, cg: (c >> 8) & 255, cb: c & 255,
        x: 0, y: 0, r2: 0,
      };
    });
    const bg = ctx.theme.bg;
    const bR = (bg >> 16) & 255, bG = (bg >> 8) & 255, bB = bg & 255;

    return (t) => {
      for (const b of balls) {
        b.x = W / 2 + Math.sin(t * b.fx + b.p) * W * b.ax * 0.95;
        b.y = (H * aspect) / 2 + Math.cos(t * b.fy + b.p * 1.3) * H * aspect * b.ay * 0.95;
        const pulse = 1 + 0.12 * Math.sin(t * 1.7 + b.p);
        b.r2 = b.r * b.r * pulse * pulse;
      }
      for (let y = 0, i = 0; y < H; y++) {
        const vy = (y + 0.5) * aspect;
        for (let x = 0; x < W; x++, i++) {
          let f = 0, r = 0, g = 0, bl = 0;
          for (let k = 0; k < count; k++) {
            const b = balls[k];
            const dx = x + 0.5 - b.x, dy = vy - b.y;
            const w = b.r2 / (dx * dx + dy * dy + 1);
            f += w; r += b.cr * w; g += b.cg * w; bl += b.cb * w;
          }
          r /= f; g /= f; bl /= f;
          let k, wh;
          if (f >= 1) {
            const e = Math.min(1, (f - 1) * 3);       // 0 at the rim → 1 deep inside
            const rim = Math.exp(-(f - 1) * (f - 1) * 90);
            k = 0.55 + 0.45 * e;
            wh = rim * 0.7;
          } else {
            const halo = f * f * f;
            k = halo * 0.55;
            wh = Math.exp(-(f - 1) * (f - 1) * 260) * 0.35;
          }
          const rr = bR * (1 - Math.min(1, k)) + r * k + (255 - r) * wh;
          const gg = bG * (1 - Math.min(1, k)) + g * k + (255 - g) * wh;
          const bb = bB * (1 - Math.min(1, k)) + bl * k + (255 - bl) * wh;
          px[i] = ((rr > 255 ? 255 : rr) << 16) | ((gg > 255 ? 255 : gg) << 8) | (bb > 255 ? 255 : bb | 0);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
