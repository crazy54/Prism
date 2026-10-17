// A sortable table: the sort column changes and rows glide to their new places.
import { ATTR, glyphs, fit, phase, ease, mix } from './_kit.js';

const DATA = [
  { name: 'pg-orders-primary-01', cpu: 18, mem: 61, conns: 136, up: 41 },
  { name: 'checkout-01', cpu: 64, mem: 48, conns: 20, up: 6 },
  { name: 'checkout-02', cpu: 58, mem: 47, conns: 20, up: 6 },
  { name: 'payments-01', cpu: 33, mem: 52, conns: 12, up: 19 },
  { name: 'catalog-01', cpu: 41, mem: 77, conns: 30, up: 12 },
  { name: 'search-01', cpu: 27, mem: 69, conns: 8, up: 33 },
  { name: 'redis-sessions-01', cpu: 9, mem: 38, conns: 412, up: 88 },
];
const SORTS = [['name', 1], ['cpu', -1], ['mem', -1], ['conns', -1]];
const COLS = [['name', 'HOST', 21, 'l'], ['cpu', 'CPU%', 6, 'r'], ['mem', 'MEM%', 6, 'r'], ['conns', 'CONNS', 7, 'r'], ['up', 'UP(d)', 6, 'r']];

const order = (key, dir) => DATA.map((d, i) => i).sort((a, b) => {
  const x = DATA[a][key], y = DATA[b][key];
  return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
});

export default {
  id: 'callouts-table-sorted',
  title: 'Sortable Table',
  category: 'Tables',
  description: 'A table whose sort column changes with ▲/▼ markers in the header while the rows glide to their new positions.',
  tags: ['table', 'sort', 'columns', 'reorder', 'hosts'],
  kind: 'tui',
  size: { w: 56, h: 10 },
  minSize: { w: 44, h: 6 },
  loop: 12,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    const orders = SORTS.map(([k, d]) => order(k, d));
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 12);
      const si = Math.floor(p / 3) % SORTS.length, local = p - si * 3;
      const prev = orders[(si + SORTS.length - 1) % SORTS.length], cur = orders[si];
      const k = ease(local, 0, 0.6);
      const cols = W >= 52 ? COLS : COLS.slice(0, 4);
      const total = cols.reduce((n, c) => n + c[2], 0) + cols.length - 1;
      const x0 = Math.max(0, Math.floor((W - total) / 2));
      let x = x0;
      b.fill(x0, 0, total, 1, ' ', undefined, th.panel2);
      cols.forEach(([key, title, w, a]) => {
        const sorted = key === SORTS[si][0];
        const label = sorted ? `${title}${SORTS[si][1] > 0 ? g.sortUp : g.sortDown}` : title;
        b.text(x, 0, fit(label, w, a === 'r' ? 'right' : 'left', ctx), sorted ? th.accent : th.muted, th.panel2, ATTR.BOLD);
        x += w + 1;
      });
      const rows = Math.min(DATA.length, H - 1);
      DATA.forEach((d, i) => {
        const from = prev.indexOf(i), to = cur.indexOf(i);
        const yf = from + (to - from) * k;
        const y = 1 + Math.round(yf);
        if (y > rows) return;
        const moving = Math.abs(to - from) > 0 && k < 1;
        let cx = x0;
        cols.forEach(([key, , w, a]) => {
          const v = key === 'name' ? d.name : String(d[key]);
          const hot = (key === 'cpu' && d.cpu > 60) || (key === 'mem' && d.mem > 75);
          b.text(cx, y, fit(v, w, a === 'r' ? 'right' : 'left', ctx), hot ? th.warn : key === SORTS[si][0] ? th.ink : moving ? mix(th.bg, th.ink, 0.6) : th.muted, to === 0 && !moving ? mix(th.bg, th.accent, 0.12) : undefined, key === SORTS[si][0] ? ATTR.BOLD : 0);
          cx += w + 1;
        });
      });
    };
  },
};
