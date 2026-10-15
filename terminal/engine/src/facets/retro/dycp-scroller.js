// DYCP — "Different Y Character Position", the C64 scroller where every
// letter bobs on its own sine phase. This one bounces off a mirrored water line
// that ripples its reflection.
import { textMask, maskAt, fontPx, lerpc, dim, shade } from './_kit.js';

const MESSAGE = 'DIFFERENT Y CHARACTER POSITION   ';

export default {
  title: 'DYCP Scroller',
  gallery: 'retro',
  category: 'Intros & Scrollers',
  kind: 'scene',
  tags: ['dycp', 'scroller', 'c64', 'reflection', 'demoscene'],
  order: 20,
  description: 'C64-style DYCP scroller: every letter bobs on its own sine, mirrored in a rippling water line.',
  size: { w: 80, h: 20 },
  minSize: { w: 30, h: 8 },
  loop: 10,
  canvas: 'field',
  palette: 'candy',
  params: {
    text: { default: MESSAGE, label: 'Message' },
    speed: { default: 1, min: 0.25, max: 4, label: 'Speed' },
  },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const text = String(ctx.param('text', MESSAGE)).toUpperCase();
    const { width: W, height: H, px } = cv;
    const water = Math.round(H * 0.68);
    const S = fontPx(cv, Math.max(2, ctx.height * 0.22), 7);
    const chars = [...text].map((ch) => textMask(ch === ' ' ? ' ' : ch, { font: 'bold' }));
    const adv = chars.map((m) => (m.w + 1) * S.sx);
    const total = adv.reduce((a, b) => a + b, 0);
    const ch = 7 * S.sy;
    const amp = Math.max(1, (water - ch) * 0.42);
    const bg = ctx.theme.bg;
    const day = ctx.theme.mode === 'light';
    const sky0 = shade(ctx.theme, 0.25), sky1 = lerpc(bg, pal(0.3), 0.18);
    const sea = day ? lerpc(bg, pal(0.55), 0.3) : dim(pal(0.55), 0.22);
    return (t) => {
      const tt = t * speed;
      for (let y = 0; y < H; y++) {
        const c = y < water ? lerpc(sky0, sky1, y / water) : lerpc(sea, bg, (y - water) / (H - water));
        px.fill(c, y * W, (y + 1) * W);
      }
      let x0 = W - ((tt * 24 * S.sx) % (total + W));
      for (let i = 0; i < chars.length * 2; i++) {
        const k = i % chars.length;
        const m = chars[k];
        const gx = Math.round(x0);
        x0 += adv[k];
        if (gx > W || gx + adv[k] < 0 || text[k] === ' ') continue;
        const gy = Math.round(water - ch - 1 - Math.abs(Math.sin(tt * 2.6 + i * 0.55)) * amp);
        const color = pal((k / chars.length + tt * 0.1) % 1);
        for (let y = 0; y < ch; y++) for (let x = 0; x < m.w * S.sx; x++) {
          if (!maskAt(m, x, y, S.sx, S.sy)) continue;
          // The top row catches the light: white at Night; by Day it's the color itself over a deeper body.
          const c = day ? (y < S.sy ? color : lerpc(color, ctx.theme.ink, 0.2)) : y < S.sy ? lerpc(color, 0xffffff, 0.5) : color;
          cv.set(gx + x, gy + y, c);
          // Reflection below the water line, rippled and darker.
          const ry = water + (water - (gy + y)) - 1;
          if (ry < H) cv.set(gx + x + Math.round(Math.sin(ry * 0.9 + tt * 4) * 1.2), ry, lerpc(c, bg, 0.6));
        }
      }
      for (let x = 0; x < W; x++) px[water * W + x] = lerpc(pal(0.6), 0xffffff, 0.3 + 0.2 * Math.sin(x * 0.4 + tt * 3));
      cv.paint(ctx.buffer);
    };
  },
};
