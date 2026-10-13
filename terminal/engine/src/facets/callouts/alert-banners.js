// Full-width alert banners that slide in, stack, and get dismissed.
import { glyphs, uni, ATTR, fit, tint, ease, phase } from './_kit.js';

const BANNERS = [
  { tone: 'info', icon: ['ℹ', 'i'], title: 'Maintenance', text: 'pg-orders-replica-01 patch window starts at 02:00 UTC' },
  { tone: 'pos', icon: ['✔', '+'], title: 'Resolved', text: 'checkout latency back to baseline (p95 212 ms)' },
  { tone: 'warn', icon: ['▲', '!'], title: 'Degraded', text: 'payments p95 above SLO for 3 minutes' },
  { tone: 'neg', icon: ['✖', 'x'], title: 'Outage', text: 'insurance-claims.example.net timing out; rx refills queued' },
];

export default {
  id: 'callouts-alert-banners',
  title: 'Alert Banners',
  category: 'Admonitions',
  description: 'Full-width info, success, warning and error banners that slide in from the edge, stack, pulse when critical and get dismissed.',
  tags: ['banner', 'alert', 'notification', 'status', 'slide'],
  kind: 'widget',
  size: { w: 76, h: 12 },
  minSize: { w: 36, h: 4 },
  loop: 9,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      const rowH = H >= 10 ? 3 : H >= 6 ? 2 : 1;
      const fitN = Math.max(1, Math.floor(H / rowH));
      BANNERS.slice(0, fitN).forEach((bn, i) => {
        const inAt = i === 0 ? -1 : 0.3 + i * 0.9, outAt = 7.2 + i * 0.25;
        const slide = ease(p, inAt, inAt + 0.45) * (1 - ease(p, outAt, outAt + 0.35));
        if (slide <= 0.001) return;
        const c = th[bn.tone];
        const x = Math.round((1 - slide) * W);
        const y = i * rowH;
        const crit = bn.tone === 'neg' && Math.sin(t * 5) > 0;
        const bg = tint(ctx, c, crit ? 0.32 : 0.2);
        for (let r = 0; r < Math.min(rowH, 2); r++) b.fill(x, y + r, W - x, 1, ' ', undefined, bg);
        b.set(x, y, u ? '▌' : '|', c, bg);
        if (rowH > 1) b.set(x, y + 1, u ? '▌' : '|', c, bg);
        const line = `${bn.icon[u ? 0 : 1]}  ${bn.title}`;
        b.text(x + 2, y, line, c, bg, ATTR.BOLD);
        const tx = rowH > 1 ? x + 5 : x + 4 + line.length;
        const ty = rowH > 1 ? y + 1 : y;
        b.text(tx, ty, fit(bn.text, Math.max(0, W - tx - 4), undefined, ctx), th.ink, bg);
        b.text(W - 3, y, u ? '✕' : 'x', th.muted, bg);
      });
    };
  },
};
