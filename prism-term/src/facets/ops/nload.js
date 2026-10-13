// nload — Incoming and Outgoing traffic graphs drawn with # and |, and Curr/Avg/Min/Max/Ttl on the right.
import { C, ATTR, writer, walk, hash, fixed } from './_kit.js';

const rate = (v) => (v >= 1000 ? `${fixed(v / 1000, 2)} GBit/s` : v >= 1 ? `${fixed(v, 2)} MBit/s` : `${fixed(v * 1000, 2)} kBit/s`);

export default {
  id: 'ops-nload',
  title: 'nload',
  category: 'Network',
  description: 'nload watching eth0: scrolling Incoming and Outgoing bar graphs in # and |, with Curr, Avg, Min, Max and Ttl figures for each direction.',
  tags: ['nload', 'bandwidth', 'traffic', 'throughput', 'network', 'graph'],
  kind: 'chart',
  size: { w: 80, h: 22 },
  minSize: { w: 50, h: 10 },
  loop: 30,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const series = (dir, k) => {
      const base = dir ? 18 : 140;
      const burst = hash(Math.floor(k / 6), dir + 3) > 0.8 ? 2.6 : 1;
      return base * (0.35 + walk(ctx, dir * 50 + 1, k, 0.15) * 0.9) * burst * (0.85 + hash(k, dir) * 0.3);
    };
    const panel = (y0, h, dir, label, k, ttl) => {
      const statW = 22, gw = Math.max(4, W - statW - 1);
      w.put(0, y0, `${label} (100% = ${dir ? '50.00 MBit/s' : '400.00 MBit/s'})`, c.fg, undefined, ATTR.BOLD);
      const max = dir ? 50 : 400;
      const gh = Math.max(1, h - 1);
      const vals = [];
      for (let x = 0; x < gw; x++) vals.push(series(dir, k - (gw - 1 - x)));
      vals.forEach((v, x) => {
        const n = Math.min(gh, v / max * gh);
        const full = Math.floor(n);
        for (let r = 0; r < full; r++) w.put(x, y0 + h - 1 - r, '#', dir ? c.green : c.cyan);
        if (n - full > 0.35 && full < gh) w.put(x, y0 + h - 1 - full, n - full > 0.7 ? '|' : '.', dir ? c.green : c.cyan);
      });
      const cur = vals.at(-1), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const stats = [['Curr', rate(cur)], ['Avg', rate(avg)], ['Min', rate(Math.min(...vals))], ['Max', rate(Math.max(...vals))], ['Ttl', ttl]];
      stats.forEach(([k2, v], i) => {
        const y = y0 + h - stats.length + i;
        if (y > y0) w.seg(gw + 1, y, [[`${k2}: `.padStart(6), c.fg], [v.padStart(15), c.fg, k2 === 'Curr' ? ATTR.BOLD : 0]]);
      });
    };
    return (t) => {
      const k = Math.floor(t * 2);
      w.put(0, 0, 'Device eth0 [10.20.2.31] (1/3):', c.fg, undefined, ATTR.BOLD);
      w.hline(0, 1, W, '=', c.muted);
      const ph = Math.floor((H - 2) / 2);
      panel(2, ph, 0, 'Incoming', k, `${fixed(1843.2 + t * 17.5 / 8, 2)} GByte`);
      panel(2 + ph, H - 2 - ph, 1, 'Outgoing', k, `${fixed(211.7 + t * 2.3 / 8, 2)} GByte`);
    };
  },
};
