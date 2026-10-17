// mtr — "My traceroute": the header, key help line, and per-hop Loss%/Snt/Last/Avg/Best/Wrst/StDev updating.
import { C, ATTR, writer, hash, walk, pad, lpad, fixed, clock } from './_kit.js';

const HOPS = [
  ['_gateway', 0.4, 0], ['10.20.0.1', 0.9, 0], ['100.64.12.1', 3.1, 0], ['198.51.100.17', 6.8, 0],
  ['198.51.100.94', 7.2, 3], ['203.0.113.6', 12.4, 0], ['203.0.113.41', 18.9, 0], ['api.example', 22.6, 0],
];

export default {
  id: 'ops-mtr',
  title: 'mtr',
  category: 'Network',
  description: 'mtr\'s curses view: header and key help, then each hop\'s Loss%, Snt, Last, Avg, Best, Wrst and StDev updating as probes return.',
  tags: ['mtr', 'traceroute', 'latency', 'packet loss', 'network'],
  kind: 'tui',
  size: { w: 80, h: 14 },
  minSize: { w: 64, h: 6 },
  loop: 30,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    return (t) => {
      const snt = 18 + Math.floor(t);
      const ck = clock(t);
      w.put(Math.max(0, Math.floor((W - 28) / 2)), 0, 'My traceroute  [v0.95]', c.fg, undefined, ATTR.BOLD);
      w.put(0, 1, `node03 (10.20.2.31) -> api.example (192.0.2.80)`, c.fg);
      w.right(W, 1, `${ck.date}T${ck.hms}+0000`, c.fg);
      w.seg(0, 2, [['Keys:  ', c.fg], ['H', c.fg, ATTR.BOLD], ['elp   ', c.fg], ['D', c.fg, ATTR.BOLD], ['isplay mode   ', c.fg], ['R', c.fg, ATTR.BOLD], ['estart statistics   ', c.fg], ['O', c.fg, ATTR.BOLD], ['rder of fields   ', c.fg], ['q', c.fg, ATTR.BOLD], ['uit', c.fg]]);
      const hostW = W - 47;
      w.put(hostW + 4, 3, 'Packets               Pings', c.fg, undefined, ATTR.BOLD);
      w.put(0, 4, ` ${pad('Host', hostW - 1)}${lpad('Loss%', 6)}${lpad('Snt', 6)}${lpad('Last', 7)}${lpad('Avg', 6)}${lpad('Best', 6)}${lpad('Wrst', 6)}${lpad('StDev', 6)}`, c.fg, undefined, ATTR.BOLD);
      HOPS.slice(0, H - 5).forEach(([host, base, lossPct], i) => {
        const lost = lossPct ? Math.round(snt * lossPct / 100 + (hash(Math.floor(t / 4), i) > 0.5 ? 1 : 0)) : 0;
        const loss = lost / snt * 100;
        const last = base * (0.9 + hash(Math.floor(t), i) * 0.4);
        const avg = base * (1.02 + walk(ctx, i, t, 0.05) * 0.06), best = base * 0.88, wrst = base * (1.6 + hash(i, 9) * 1.4) + (i > 3 ? 8 : 0);
        const y = 5 + i;
        w.seg(0, y, [[` ${lpad(i + 1, 2)}. `, c.fg], [pad(host, hostW - 5), i === HOPS.length - 1 ? c.fg : c.cyan, i === HOPS.length - 1 ? ATTR.BOLD : 0],
          [lpad(`${fixed(loss, 1)}%`, 6), loss > 0 ? c.red : c.fg, loss > 0 ? ATTR.BOLD : 0],
          [`${lpad(snt, 6)}${lpad(fixed(last), 7)}${lpad(fixed(avg), 6)}${lpad(fixed(best), 6)}${lpad(fixed(wrst), 6)}${lpad(fixed((wrst - best) / 4), 6)}`, c.fg]]);
      });
    };
  },
};
