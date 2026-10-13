// A long list in a short window: the cursor runs down, the view scrolls, the
// scrollbar thumb tracks it.
import { ATTR, glyphs, phase, panel, scrollbar, tint, fit } from './_input.js';

const PODS = Array.from({ length: 26 }, (_, i) => {
  const svc = ['checkout', 'payments', 'catalog', 'search', 'cart', 'auth', 'orders', 'notify'][i % 8];
  return [`${svc}-7d9f${(i * 7919 % 9000 + 1000).toString(36)}`, ['Running', 'Running', 'Running', 'Pending', 'Running'][i % 5], `${(i * 13) % 59 + 1}m`];
});

export default {
  id: 'input-scroll-list',
  title: 'Scrolling List',
  category: 'Selects & Lists',
  description: 'A long pod list in a short framed window: the cursor runs down and back, the view scrolls with it and the scrollbar thumb tracks position.',
  tags: ['list', 'scroll', 'scrollbar', 'pods', 'cursor'],
  kind: 'tui',
  size: { w: 52, h: 12 },
  minSize: { w: 34, h: 6 },
  loop: 10,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 10);
      const pos = p < 5 ? p / 5 : 1 - (p - 5) / 5;
      const cur = Math.round(pos * (PODS.length - 1));
      const inner = panel(ctx, b, 0, 0, W, H, { title: 'pods', footer: `${cur + 1}/${PODS.length}`, color: th.line });
      const vis = inner.height;
      const first = Math.max(0, Math.min(PODS.length - vis, cur - Math.floor(vis / 2)));
      for (let r = 0; r < vis; r++) {
        const i = first + r;
        if (i >= PODS.length) break;
        const [name, status, age] = PODS[i];
        const on = i === cur;
        if (on) inner.fill(0, r, inner.width - 1, 1, ' ', undefined, tint(ctx, th.accent, 0.16));
        inner.text(0, r, on ? g.pointer : ' ', th.accent, undefined, ATTR.BOLD);
        inner.text(2, r, fit(name, Math.max(4, inner.width - 18), undefined, ctx), on ? th.ink : th.muted, undefined, on ? ATTR.BOLD : 0);
        inner.text(inner.width - 15, r, status.padEnd(8), status === 'Running' ? th.pos : th.warn);
        inner.text(inner.width - 5, r, age.padStart(3), th.dim);
      }
      scrollbar(ctx, inner, inner.width - 1, 0, vis, PODS.length, first, vis);
    };
  },
};
