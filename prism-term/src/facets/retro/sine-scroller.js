// The classic sine scroller: a big bitmap-font message rides a sine wave from
// right to left, each scanline tinted by a cycling copper gradient, over a
// parallax starfield. Drop shadow included, as the law requires.
import { textMask, maskAt, fontPx, makeStars, dim, lerpc } from './_kit.js';

const MESSAGE = 'PRISM TERMINAL FACETS   *   SINE SCROLLERS NEVER DIE   *   GREETINGS TO EVERY SYSOP STILL RUNNING A NODE   *   ';

export default {
  title: 'Sine Scroller',
  gallery: 'retro',
  category: 'Intros & Scrollers',
  kind: 'scene',
  tags: ['scroller', 'sine', 'cracktro', 'demoscene', 'bitmap font'],
  order: 10,
  description: 'Big bitmap-font message riding a sine wave, copper-tinted per scanline, over a parallax starfield.',
  size: { w: 80, h: 20 },
  minSize: { w: 30, h: 8 },
  loop: 12,
  canvas: 'field',
  palette: 'prism',
  params: {
    speed: { default: 1, min: 0.25, max: 4, label: 'Speed' },
    text: { default: MESSAGE, label: 'Message' },
  },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const m = textMask(String(ctx.param('text', MESSAGE)).toUpperCase(), { font: 'bold' });
    const { width: W, height: H, px } = cv;
    const { sx, sy } = fontPx(cv, Math.max(3, ctx.height * 0.34), 7);
    const tw = m.w * sx, th = m.h * sy;
    const amp = Math.max(0, (H - th) / 2 - 1);
    const stars = makeStars(ctx.rng, W, H, Math.round(W * H * 0.012));
    const bg0 = ctx.theme.bg, bg1 = lerpc(ctx.theme.bg, pal(0.65), 0.12);
    const shadow = dim(ctx.theme.bg, 0.4);
    return (t) => {
      const tt = t * speed;
      for (let y = 0; y < H; y++) px.fill(lerpc(bg0, bg1, y / H), y * W, (y + 1) * W);
      for (const s of stars) {
        const v = 0.25 + s[2] * 0.75;
        const x = ((s[0] - tt * (6 + 40 * s[2] * s[2])) % W + W) % W;
        cv.set(x, s[1], lerpc(bg0, ctx.theme.ink, v));
      }
      const scroll = tt * 26 * sx;
      const period = tw + W;
      for (let x = 0; x < W; x++) {
        const u = ((x - W + scroll) % period + period) % period; // text-space column
        if (u >= tw) continue;
        const yOff = Math.round(H / 2 - th / 2 + Math.sin(u * 0.045 / sx * 2 + tt * 2.1) * amp);
        for (let k = 0; k < th; k++) {
          if (!maskAt(m, u, k, sx, sy)) continue;
          const y = yOff + k;
          const c = pal(((y / H) * 0.9 + tt * 0.12) % 1);
          cv.set(x + 1, y + 1, shadow);
          cv.set(x, y, k < sy ? lerpc(c, 0xffffff, 0.45) : c);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
