// Big gradient text over a soft spotlight, with twinkling sparkles. Cycles
// through fonts and resolution modes, revealing each with a glowing wipe.
import { mix, mixOklab, NONE } from '../../color.js';
import { drawBanner, measureBanner } from '../../text/banner.js';
import { shimmer } from '../../text/effects.js';

const PERIOD = 6;

function fitScale(text, cfg, maxW, maxH) {
  let best = 1;
  for (let s = 1; s <= 8; s++) {
    const m = measureBanner(text, { ...cfg, scale: s });
    if (m.width <= maxW && m.height <= maxH) best = s;
    else break;
  }
  return best;
}

export default {
  title: 'Big Text',
  gallery: 'text',
  category: 'Banners & Fonts',
  kind: 'scene',
  tags: ['banner', 'big text', 'fonts', 'figlet'],
  order: 10,
  description: 'Gradient banner text with drop shadow and sparkles, cycling fonts and resolutions (--set text=… to change it).',
  canvas: 'hires',
  palette: 'prism',
  setup(ctx) {
    const { width: W, height: H, theme: th, caps } = ctx;
    const text = String(ctx.param('text', 'PRISM'));
    const subtitle = String(ctx.param('subtitle', 'prism-term · terminal facets'));
    const pal = ctx.palette();
    const unicode = caps.unicode !== false;

    let configs = unicode
      ? [
          { font: 'bold', mode: 'half', shadow: true, label: 'bold · half-block' },
          { font: 'standard', mode: caps.sextant ? 'sextant' : 'quad', shadow: true, label: `standard · ${caps.sextant ? 'sextant' : 'quadrant'}` },
          { font: 'bold', mode: 'braille', label: 'bold · braille' },
          { font: 'bold', mode: 'block', wide: true, shadow: true, label: 'bold · block' },
        ]
      : [{ font: 'bold', mode: 'ascii', label: 'bold · ascii' }];
    if (ctx.mode) configs = [{ font: 'bold', mode: ctx.mode, shadow: ctx.mode !== 'braille', label: `bold · ${ctx.mode}` }];
    const maxW = Math.max(4, W - 4), maxH = Math.max(3, H - 6);
    for (const c of configs) {
      c.fill = pal;
      c.theme = th;
      c.scale = fitScale(text, c, maxW, maxH);
      c.size = measureBanner(text, c);
    }

    // Spotlight behind the text (half-block field, transparent outside the glow).
    const glow = ctx.canvas('field', { mode: unicode ? 'half' : 'ascii' });
    const gcx = glow.width / 2, gcy = glow.height / 2, gr = Math.max(glow.width, glow.height * glow.aspect) * 0.55;
    const accent = th.accent;
    for (let y = 0; y < glow.height; y++)
      for (let x = 0; x < glow.width; x++) {
        const d = Math.hypot(x - gcx, (y - gcy) * glow.aspect) / gr;
        const k = Math.max(0, 1 - d);
        glow.px[y * glow.width + x] = k > 0.02 ? mixOklab(ctx.bg === NONE ? th.bg : ctx.bg, accent, 0.16 * k * k) : NONE;
      }
    const showGlow = unicode && ctx.bg !== NONE;

    const rnd = ctx.rng;
    const stars = Array.from({ length: Math.max(6, Math.round((W * H) / 45)) }, () => ({
      x: Math.floor(rnd() * W), y: Math.floor(rnd() * H), ph: rnd() * Math.PI * 2, sp: 0.8 + rnd() * 2.2, hue: rnd(),
    }));
    const starChars = unicode ? ['·', '+', '✦'] : ['.', '+', '*'];

    return (t) => {
      const buf = ctx.buffer;
      if (showGlow) glow.paint(buf);
      for (const s of stars) {
        const b = Math.pow(Math.max(0, Math.sin(t * s.sp + s.ph)), 3);
        if (b < 0.08) continue;
        const ch = starChars[b > 0.7 ? 2 : b > 0.35 ? 1 : 0];
        buf.set(s.x, s.y, ch, mix(th.dim, pal(s.hue), b));
      }

      const idx = Math.floor(t / PERIOD) % configs.length;
      const lt = t - Math.floor(t / PERIOD) * PERIOD;
      const cfg = configs[idx];
      const { width: bw, height: bh } = cfg.size;
      const x0 = Math.floor((W - bw) / 2), y0 = Math.max(0, Math.floor((H - bh) / 2) - 1);
      const p = Math.min(1.2, lt / 0.7);
      drawBanner(buf, x0, y0, text, {
        ...cfg,
        t,
        speed: 0.18,
        direction: 'diagonal',
        shader: p >= 1.2 ? undefined : (c, u) => (u > p ? NONE : p - u < 0.1 ? mixOklab(c, 0xffffff, 1 - (p - u) / 0.1) : c),
      });

      const sy = y0 + bh + 1;
      if (sy < H) shimmer(buf, 'center', sy, subtitle, t, { theme: th, color: th.muted, period: 3 });
      if (sy + 1 < H) {
        const label = cfg.label;
        buf.text(Math.floor((W - label.length) / 2), sy + 1, label, th.dim);
      }
    };
  },
};
