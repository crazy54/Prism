// Zebra-striped service table: right-aligned numbers, rows arriving, a totals row.
import { ATTR, glyphs, uni, fit, phase, mix } from './_kit.js';

const ROWS = [
  ['edge-lb', 'us-east-1', 4210, 3.1, 0.0003],
  ['api-gateway', 'us-east-1', 4198, 8.4, 0.0004],
  ['checkout', 'us-east-1', 612, 212.0, 0.0015],
  ['payments', 'us-east-1', 598, 131.5, 0.0011],
  ['catalog', 'us-west-2', 2214, 41.2, 0.0009],
  ['search', 'us-west-2', 1630, 22.7, 0.0008],
  ['rx-orders', 'us-east-1', 188, 309.4, 0.0021],
  ['loyalty', 'eu-west-1', 402, 37.9, 0.0007],
];

export default {
  id: 'callouts-table-zebra',
  title: 'Zebra Table with Totals',
  category: 'Tables',
  description: 'A zebra-striped table with right-aligned numeric columns, rows arriving one by one and a bold totals row under a rule.',
  tags: ['table', 'zebra', 'totals', 'columns', 'aligned'],
  kind: 'widget',
  size: { w: 64, h: 13 },
  minSize: { w: 36, h: 6 },
  loop: 8,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 8);
      const shown = Math.min(ROWS.length, 1 + Math.floor(p / 0.45));
      const wide = W >= 56;
      const cols = wide ? [['SERVICE', 14, 'l'], ['REGION', 11, 'l'], ['RPS', 7, 'r'], ['P95 MS', 8, 'r'], ['ERRORS', 8, 'r']] : [['SERVICE', 12, 'l'], ['RPS', 6, 'r'], ['P95', 7, 'r']];
      const total = cols.reduce((n, c) => n + c[1], 0) + cols.length - 1;
      const x0 = Math.max(0, Math.floor((W - total) / 2));
      const row = (y, cells, fg, bg, attr) => {
        if (y >= H) return;
        if (bg !== undefined) b.fill(x0, y, total, 1, ' ', undefined, bg);
        let x = x0;
        cols.forEach(([, w, a], i) => { b.text(x, y, fit(cells[i], w, a === 'r' ? 'right' : 'left', ctx), typeof fg === 'function' ? fg(i) : fg, bg, attr); x += w + 1; });
      };
      row(0, cols.map((c) => c[0]), th.muted, th.panel2, ATTR.BOLD);
      const vis = ROWS.slice(0, Math.min(shown, Math.max(0, H - 3)));
      vis.forEach((r, i) => {
        const cells = wide ? [r[0], r[1], r[2].toLocaleString('en-US'), r[3].toFixed(1), `${(r[4] * 100).toFixed(2)}%`] : [r[0], r[2].toLocaleString('en-US'), r[3].toFixed(1)];
        const hot = r[3] > 200;
        const fresh = i === shown - 1 && p < ROWS.length * 0.45 + 0.4;
        row(1 + i, cells, (c) => (c === 0 ? th.ink : (wide ? c === 3 : c === 2) && hot ? th.warn : th.ink), i % 2 ? th.panel : fresh ? mix(th.bg, th.accent, 0.18) : undefined, 0);
      });
      const ty = 1 + vis.length;
      if (shown === ROWS.length && ty + 1 < H) {
        b.fill(x0, ty, total, 1, u ? '─' : '-', th.line);
        const rps = ROWS.reduce((n, r) => n + r[2], 0);
        const p95 = Math.max(...ROWS.map((r) => r[3]));
        const err = ROWS.reduce((n, r) => n + r[4] * r[2], 0) / rps;
        row(ty + 1, wide ? ['total', `${ROWS.length} services`, rps.toLocaleString('en-US'), `${p95.toFixed(1)}`, `${(err * 100).toFixed(2)}%`] : ['total', rps.toLocaleString('en-US'), p95.toFixed(1)], th.ink, undefined, ATTR.BOLD);
      } else if (ty < H) b.text(x0, ty, `${g.ellipsis} loading`, th.dim);
    };
  },
};
