// A psql-style result grid: full box-drawing junctions, double rule under the
// header, and a spreadsheet cursor moving cell to cell.
import { ATTR, uni, fit, phase, mix } from './_kit.js';

const HEAD = ['id', 'order', 'status', 'total', 'placed_at'];
const ROWS = [
  ['1041', 'ord-80211', 'shipped', '84.20', '14:02:11'],
  ['1042', 'ord-80212', 'paid', '12.99', '14:02:13'],
  ['1043', 'ord-80213', 'pending', '231.00', '14:02:19'],
  ['1044', 'ord-80214', 'refunded', '9.49', '14:02:24'],
  ['1045', 'ord-80215', 'paid', '61.75', '14:02:31'],
];
const ALIGN = ['r', 'l', 'l', 'r', 'l'];

export default {
  id: 'callouts-table-grid',
  title: 'Result Grid',
  category: 'Tables',
  description: 'A psql-style result grid with box-drawing junctions, a double rule under the header, a "(5 rows)" footer and a moving cell cursor.',
  tags: ['table', 'grid', 'sql', 'psql', 'spreadsheet'],
  kind: 'widget',
  size: { w: 60, h: 13 },
  minSize: { w: 52, h: 8 },
  loop: 10,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    const widths = HEAD.map((h, i) => Math.max(h.length, ...ROWS.map((r) => r[i].length)) + 2);
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const J = u ? { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│', t: '┬', bt: '┴', l: '├', r: '┤', x: '┼', dl: '╞', dr: '╡', dx: '╪', dh: '═' }
        : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', t: '+', bt: '+', l: '+', r: '+', x: '+', dl: '+', dr: '+', dx: '+', dh: '=' };
      const total = widths.reduce((n, w) => n + w, 0) + widths.length + 1;
      const x0 = Math.max(0, Math.floor((W - total) / 2));
      const maxRows = Math.max(0, Math.min(ROWS.length, H - 5));
      const p = phase(t, 10);
      const cell = Math.floor(p / 0.4) % (maxRows * HEAD.length || 1);
      const cr = Math.floor(cell / HEAD.length), cc = cell % HEAD.length;
      const rule = (y, l, m, r, h) => {
        if (y >= H) return;
        let x = x0;
        b.set(x++, y, l, th.line);
        widths.forEach((w, i) => { for (let k = 0; k < w; k++) b.set(x++, y, h, th.line); b.set(x++, y, i === widths.length - 1 ? r : m, th.line); });
      };
      const line = (y, cells, fg, attr, hiCol = -1) => {
        if (y >= H) return;
        let x = x0;
        b.set(x++, y, J.v, th.line);
        cells.forEach((c, i) => {
          const hi = i === hiCol;
          b.text(x, y, fit(` ${c} `, widths[i], ALIGN[i] === 'r' ? 'right' : 'left', ctx), hi ? th.bg : typeof fg === 'function' ? fg(i, c) : fg, hi ? th.accent : undefined, hi ? ATTR.BOLD : attr);
          x += widths[i];
          b.set(x++, y, J.v, th.line);
        });
      };
      rule(0, J.tl, J.t, J.tr, J.h);
      line(1, HEAD, th.muted, ATTR.BOLD);
      rule(2, J.dl, J.dx, J.dr, J.dh);
      for (let r = 0; r < maxRows; r++) line(3 + r, ROWS[r], (i, c) => (i === 2 ? ({ shipped: th.pos, paid: th.info, pending: th.warn, refunded: th.dim }[c]) : th.ink), 0, r === cr ? cc : -1);
      rule(3 + maxRows, J.bl, J.bt, J.br, J.h);
      if (4 + maxRows < H) b.text(x0, 4 + maxRows, `(${maxRows} rows)`, th.dim);
      if (4 + maxRows < H) {
        const ref = `${String.fromCharCode(65 + cc)}${cr + 1} = ${ROWS[cr]?.[cc] ?? ''}`;
        b.text(Math.max(x0, x0 + total - ref.length), 4 + maxRows, ref, mix(th.bg, th.accent, 0.85));
      }
    };
  },
};
