// A complete cracktro screen: chrome group logo with a shine sweep, raster bars
// pumping in the middle, a greetings sine scroller along the bottom, and a
// parallax starfield behind it all. Everything a 1989 floppy needed.
import { textMask, maskAt, fontPx, makeStars, lerpc, dim } from './_kit.js';

const GREETS = 'CRACKED AND TRAINED BY THE PRISM CREW   *   GREETINGS TO ALL TERMINAL SCENERS   *   CALL OUR BOARD AT 300-2400 BAUD   *   ';

export default {
  title: 'Cracktro',
  gallery: 'retro',
  category: 'Intros & Scrollers',
  kind: 'scene',
  tags: ['cracktro', 'intro', 'logo', 'scroller', 'raster bars', 'demoscene'],
  order: 5,
  description: 'Full cracktro: chrome logo with shine sweep, pumping raster bars, greetings scroller and starfield.',
  size: { w: 80, h: 24 },
  minSize: { w: 36, h: 12 },
  loop: 14,
  canvas: 'field',
  palette: 'prism',
  params: {
    logo: { default: 'PRISM', label: 'Logo' },
    text: { default: GREETS, label: 'Scroller' },
    speed: { default: 1, min: 0.25, max: 4, label: 'Speed' },
  },
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette();
    const speed = ctx.param('speed', 1);
    const { width: W, height: H, px, aspect } = cv;
    const logo = textMask(String(ctx.param('logo', 'PRISM')).toUpperCase(), { font: 'bold' });
    const greets = textMask(String(ctx.param('text', GREETS)).toUpperCase(), { font: 'standard' });
    // Logo: as large as fits in the top ~40%.
    let L = fontPx(cv, Math.max(3, ctx.height * 0.3), 7);
    if (logo.w * L.sx > W * 0.92) {
      const sx = Math.max(1, Math.floor((W * 0.92) / logo.w));
      L = { sx, sy: Math.max(1, Math.round((L.sy * sx) / L.sx)) };
    }
    const lw = logo.w * L.sx, lh = logo.h * L.sy;
    const lx = Math.round((W - lw) / 2), ly = Math.max(1, Math.round(H * 0.06));
    const G = fontPx(cv, Math.max(1.5, ctx.height * 0.1), 7);
    const gh = greets.h * G.sy, gw = greets.w * G.sx;
    const stars = makeStars(ctx.rng, W, H, Math.round(W * H * 0.015));
    const bg = ctx.theme.bg;
    const chrome = [0x2a3446, 0x8fa3c4, 0xf4f7ff, 0x6c7f9f, 0x1b2230, 0x9fb4d6, 0xe8eef9];
    const metal = (v) => {
      const i = Math.min(chrome.length - 2, Math.floor(v * (chrome.length - 1)));
      return lerpc(chrome[i], chrome[i + 1], v * (chrome.length - 1) - i);
    };
    const barsTop = ly + lh + Math.round(H * 0.05), barsBot = H - gh - Math.round(H * 0.12);
    return (t) => {
      const tt = t * speed;
      px.fill(bg);
      for (const s of stars) {
        const x = ((s[0] - tt * (4 + 30 * s[2] * s[2])) % W + W) % W;
        cv.set(x, s[1], lerpc(bg, 0xffffff, 0.2 + 0.7 * s[2]));
      }
      // Raster bars between logo and scroller.
      if (barsBot > barsTop + 2) {
        const mid = (barsTop + barsBot) / 2, span = (barsBot - barsTop) / 2;
        for (let i = 0; i < 4; i++) {
          const y0 = mid + Math.sin(tt * 2.2 + i * 0.9) * span * 0.75;
          const r = Math.max(1.5, span * 0.28);
          const c = pal(i / 4 + tt * 0.05);
          for (let y = Math.floor(y0 - r); y <= Math.ceil(y0 + r); y++) {
            if (y < barsTop || y >= barsBot) continue;
            const k = 1 - Math.abs(y + 0.5 - y0) / r;
            if (k <= 0) continue;
            const col = k > 0.75 ? lerpc(c, 0xffffff, (k - 0.75) * 3) : lerpc(0x000000, c, k * 1.4);
            px.fill(col, y * W, (y + 1) * W);
          }
        }
      }
      // Logo with a diagonal shine sweep.
      const sweep = ((tt * 0.35) % 1.6) - 0.3;
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        if (!maskAt(logo, x, y, L.sx, L.sy)) continue;
        const v = y / lh;
        let c = metal(v);
        const d = Math.abs((x / lw) - v * 0.25 * aspect - sweep);
        if (d < 0.06) c = lerpc(c, 0xffffff, 1 - d / 0.06);
        cv.set(lx + x + 1, ly + y + 1, dim(bg, 0.3));
        cv.set(lx + x, ly + y, c);
      }
      // Greetings sine scroller.
      const period = gw + W;
      const scroll = tt * 30 * G.sx;
      const gy = H - gh - Math.max(1, Math.round(H * 0.06));
      for (let x = 0; x < W; x++) {
        const u = ((x - W + scroll) % period + period) % period;
        if (u >= gw) continue;
        const yOff = Math.round(gy + Math.sin(u * 0.09 / G.sx + tt * 3) * Math.max(1, H * 0.035));
        for (let k = 0; k < gh; k++) {
          if (!maskAt(greets, u, k, G.sx, G.sy)) continue;
          cv.set(x, yOff + k, pal((x / W) * 0.6 + tt * 0.2));
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
