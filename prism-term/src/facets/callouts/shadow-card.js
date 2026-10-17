// A raised card with a drop shadow that lifts and settles, and a glint across its title.
import { panel, glyphs, ATTR, uni, mix, ease, phase, button } from './_kit.js';

export default {
  id: 'callouts-shadow-card',
  title: 'Shadow Card',
  category: 'Panels & Borders',
  description: 'A card with a shaded drop shadow that lifts on hover and settles, with a glint sweeping its title — depth with nothing but shade blocks.',
  tags: ['card', 'shadow', 'elevation', 'depth', 'hover'],
  kind: 'widget',
  size: { w: 52, h: 14 },
  minSize: { w: 34, h: 9 },
  loop: 6,
  color: '256',
  order: 40,
  setup(ctx) {
    const th = ctx.theme;
    const title = 'Deploy complete';
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 6);
      const lift = ease(p, 0.6, 1.4) * (1 - ease(p, 3.8, 4.8));
      const cw = Math.min(W - 4, 44), chh = Math.min(H - 3, 9);
      const x = Math.floor((W - cw) / 2) - Math.round(lift), y = Math.floor((H - chh) / 2) - Math.round(lift);
      const off = 1 + Math.round(lift);
      // Turbo Vision-style shadow: a darkened band offset down-right, textured with shade blocks.
      // Refraction: depth from light, not heavy drop shadows — a soft band, lighter by Day.
      const shadowBg = mix(th.bg, 0x000000, th.mode === 'light' ? 0.07 : 0.4);
      const shadowFg = mix(shadowBg, th.line, 0.45);
      const shade = uni(ctx) ? (lift > 0.5 ? '▒' : '░') : ':';
      for (let yy = y + off; yy < y + off + chh; yy++) for (let xx = x + off * 2; xx < x + off * 2 + cw; xx++) b.set(xx, yy, shade, shadowFg, shadowBg);
      const inner = panel(ctx, b, x, y, cw, chh, { title: '', color: lift > 0.5 ? th.accent : th.line, bg: th.panel });
      // Title with a moving glint.
      const tx = 2, gl = (p * 9) % (title.length + 14) - 7;
      [...title].forEach((ch, i) => {
        const k = Math.max(0, 1 - Math.abs(i - gl) / 3);
        inner.text(tx + i, 1, ch, mix(th.ink, th.mode === 'light' ? th.accent : 0xffffff, k), th.panel, ATTR.BOLD);
      });
      inner.text(tx + title.length + 1, 1, g.check, th.pos, th.panel);
      if (inner.height > 4) {
        inner.text(tx, 3, 'checkout v2.14.1 is live on 12/12 hosts', th.muted, th.panel);
        inner.text(tx, 4, `MTTR 0s ${g.mid} 0 errors during rollout`, th.dim, th.panel);
      }
      if (inner.height > 6) {
        const bx = inner.width - 22;
        const w1 = button(ctx, inner, Math.max(tx, bx), inner.height - 1, 'View logs', { focused: false });
        button(ctx, inner, Math.max(tx, bx) + w1 + 1, inner.height - 1, 'Done', { focused: true, pressed: p > 4.8 && p < 5.2 });
      }
    };
  },
};
