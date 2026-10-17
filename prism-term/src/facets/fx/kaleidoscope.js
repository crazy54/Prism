// A kaleidoscope: a slowly flowing field of interleaved waves and noise, folded
// through mirrored wedges around the center and turning — the classic tube,
// with a soft vignette like the eyepiece.
import { lerpc } from '../retro/_kit.js';

export default {
  title: 'Kaleidoscope',
  gallery: 'fx',
  category: 'Fields',
  kind: 'scene',
  tags: ['kaleidoscope', 'mirror', 'symmetry', 'mandala', 'psychedelic', 'polar'],
  order: 90,
  description: 'A turning kaleidoscope: a flowing field folded through mirrored wedges into a mandala, with an eyepiece vignette.',
  size: { w: 72, h: 24 },
  minSize: { w: 16, h: 6 },
  loop: 24,
  canvas: 'field',
  palette: 'prism',
  params: { segments: { default: 6, min: 3, max: 12, label: 'Mirrors' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette(undefined, { size: 512 });
    const { noise3 } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    const seg = Math.max(3, Math.min(12, Math.round(ctx.param('segments', 6))));
    const wedge = Math.PI / seg;
    const R = Math.min(W, H * aspect) / 2;
    const bg = ctx.theme.bg;
    return (t) => {
      const u = (t / 24) * Math.PI * 2;
      const rot = u, flow = Math.sin(u) * 0.8;
      for (let y = 0, i = 0; y < H; y++) {
        const dy = ((y + 0.5) * aspect - (H * aspect) / 2) / R;
        for (let x = 0; x < W; x++, i++) {
          const dx = (x + 0.5 - W / 2) / R;
          const r = Math.sqrt(dx * dx + dy * dy);
          if (r > 1.11) { px[i] = bg; continue; }
          // Fold the angle into one mirrored wedge.
          let a = Math.atan2(dy, dx) + rot;
          a = ((a % (2 * wedge)) + 2 * wedge) % (2 * wedge);
          if (a > wedge) a = 2 * wedge - a;
          const fx = Math.cos(a) * r * 2.2, fy = Math.sin(a) * r * 2.2;
          const n = noise3(fx * 1.3 + flow, fy * 1.3, Math.cos(u) * 0.6 + 2) * 1.4;
          const v = Math.sin(fx * 3.1 + Math.sin(fy * 4.2 + u) + n * 2) + Math.sin(fy * 5.3 - u * 2 + n);
          const band = (v * 0.25 + r * 0.4 - t / 24 + 10) % 1;
          const light = 0.55 + 0.45 * Math.cos(v * 2.4);
          let c = lerpc(bg, pal(band), light);
          if (r > 0.86) c = lerpc(c, bg, Math.min(1, (r - 0.86) * 4));
          px[i] = c;
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
