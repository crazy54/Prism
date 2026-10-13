// Panels with titles and footers in every alignment — the footers carry live state.
import { panel, glyphs, ATTR, fit, spin } from './_kit.js';

const pad2 = (n) => String(n).padStart(2, '0');

export default {
  id: 'callouts-titled-panels',
  title: 'Titled Panels',
  category: 'Panels & Borders',
  description: 'Panels with left, centered and right titles and live footers — a clock, a pager and a status — the bread and butter of TUI layout.',
  tags: ['panel', 'title', 'footer', 'layout', 'box'],
  kind: 'widget',
  size: { w: 72, h: 14 },
  minSize: { w: 36, h: 8 },
  loop: 10,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const three = W >= 60;
      const n = three ? 3 : 2;
      const pw = Math.floor((W - (n - 1)) / n);
      const sec = Math.floor(t) + 14 * 3600 + 3 * 60;
      const clock = `${pad2(Math.floor(sec / 3600) % 24)}:${pad2(Math.floor(sec / 60) % 60)}:${pad2(sec % 60)}`;
      const page = 1 + (Math.floor(t / 2) % 5);
      const panes = [
        { title: 'Overview', align: 'left', footer: clock, lines: [['requests', `${(1840 + Math.round(Math.sin(t) * 60)).toLocaleString('en-US')}/s`], ['p95', `${Math.round(212 + Math.sin(t * 0.7) * 18)} ms`], ['errors', `${(0.21 + Math.max(0, Math.sin(t * 0.4)) * 0.08).toFixed(2)} %`]] },
        { title: 'Deployments', align: 'center', footer: `${page}/5`, lines: [['checkout', 'v2.14.0'], ['payments', 'v4.2.7'], ['search', page >= 3 ? 'v2.3.1' : 'v2.3.0']] },
        { title: 'Health', align: 'right', footer: `${spin(ctx, t)} syncing`, lines: [['edge', 'ok'], ['app', 'ok'], ['data', t % 10 > 6 ? 'degraded' : 'ok']] },
      ].slice(0, n);
      panes.forEach((p, i) => {
        const inner = panel(ctx, b, i * (pw + 1), 0, pw, H, { title: p.title, titleAlign: p.align, footer: p.footer, footerAlign: p.align === 'right' ? 'left' : 'right', color: th.line });
        p.lines.forEach(([k, v], j) => {
          if (j * 2 + 1 >= inner.height) return;
          const y = 1 + j * 2;
          const status = v === 'ok' ? th.pos : v === 'degraded' ? th.warn : th.ink;
          inner.text(1, y, fit(k, Math.max(0, inner.width - 2 - Math.min(12, v.length + 2)), undefined, ctx), th.muted);
          const vx = inner.width - 1 - v.length - (v === 'ok' || v === 'degraded' ? 2 : 0);
          if (v === 'ok' || v === 'degraded') inner.text(vx, y, `${g.dot} `, status);
          inner.text(inner.width - 1 - v.length, y, v, status, undefined, ATTR.BOLD);
        });
      });
    };
  },
};
