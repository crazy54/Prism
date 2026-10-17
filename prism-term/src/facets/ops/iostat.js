// iostat -dx 2 — avg-cpu plus a device table (r/s, w/s, kB/s, await, aqu-sz, %util) with util bars.
import { G, C, ATTR, writer, walk, pad, lpad, fixed } from './_kit.js';

const DEVS = [['nvme0n1', 1.0, 0.25], ['nvme1n1', 0.7, 0.2], ['sda', 0.3, 2.4], ['sdb', 0.15, 6.8], ['dm-0', 0.9, 0.3], ['dm-1', 0.4, 0.4]];

export default {
  id: 'ops-iostat',
  title: 'iostat -dx',
  category: 'Disk & Storage',
  description: 'iostat -dx 2 refreshing: avg-cpu, then per-device reads/writes, throughput, await, queue size and %util with a utilization bar.',
  tags: ['iostat', 'sysstat', 'disk', 'io', 'latency'],
  kind: 'tui',
  size: { w: 80, h: 13 },
  minSize: { w: 60, h: 6 },
  loop: 20,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    return (t) => {
      const T = Math.floor(t / 2) * 2;
      const v = (k, s = 0.5) => walk(ctx, k, T, s);
      const busy = v(1, 0.15);
      w.put(0, 0, 'avg-cpu:  %user   %nice %system %iowait  %steal   %idle', c.fg, undefined, ATTR.BOLD);
      const us = 8 + busy * 20, sy = 2 + busy * 5, io = 0.2 + busy ** 2 * 6;
      w.put(0, 1, `          ${lpad(fixed(us, 2), 6)}    0.00  ${lpad(fixed(sy, 2), 6)}  ${lpad(fixed(io, 2), 6)}    0.00  ${lpad(fixed(100 - us - sy - io, 2), 6)}`, c.fg);
      if (H < 5) return;
      const head = `${pad('Device', 9)}${lpad('r/s', 8)}${lpad('w/s', 8)}${lpad('rkB/s', 10)}${lpad('wkB/s', 10)}${lpad('r_await', 8)}${lpad('w_await', 8)}${lpad('aqu-sz', 7)}${lpad('%util', 7)}`;
      w.put(0, 3, head.slice(0, W), c.fg, undefined, ATTR.BOLD);
      const barW = Math.max(0, W - head.length - 3);
      DEVS.slice(0, H - 4).forEach(([dev, load, lat], i) => {
        const k = busy * load * (0.6 + v(10 + i, 0.8) * 0.8);
        const rs = k * 820, ws = k * 1460, rkb = rs * 64, wkb = ws * 31, ra = lat * (1 + k), wa = lat * 1.6 * (1 + k * 2);
        const util = Math.min(99.9, k * 100 * (dev.startsWith('sd') ? 1.8 : 0.9));
        const y = 4 + i;
        const x = w.seg(0, y, [[pad(dev, 9), c.cyan], [`${lpad(fixed(rs, 2), 8)}${lpad(fixed(ws, 2), 8)}${lpad(fixed(rkb, 2), 10)}${lpad(fixed(wkb, 2), 10)}${lpad(fixed(ra, 2), 8)}${lpad(fixed(wa, 2), 8)}${lpad(fixed(k * 3, 2), 7)}`, c.fg],
          [lpad(fixed(util, 2), 7), util > 80 ? c.red : util > 50 ? c.yellow : c.fg, util > 80 ? ATTR.BOLD : 0]]);
        if (barW > 3) { const n = Math.round(util / 100 * barW); w.seg(x + 1, y, [[g.full.repeat(n), util > 80 ? c.red : util > 50 ? c.yellow : c.green], [g.light.repeat(barW - n), c.dim]]); }
      });
    };
  },
};
