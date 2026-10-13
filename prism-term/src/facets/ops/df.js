// df -h — the familiar table plus usage bars (dfc-style), red at ≥ 90 %, with /var/log filling up.
import { G, C, ATTR, writer, walk, pad, lpad } from './_kit.js';

const FS = [
  ['/dev/mapper/vg0-root', 98, 61.0, '/', 0],
  ['/dev/nvme0n1p1', 1.0, 0.21, '/boot/efi', 0],
  ['/dev/mapper/vg0-var', 40, 22.3, '/var', 0.4],
  ['/dev/mapper/vg0-varlog', 20, 15.9, '/var/log', 1.6],
  ['/dev/mapper/vg0-home', 200, 41.7, '/home', 0],
  ['/dev/sdb1', 7300, 6820, '/srv/backup', 0.2],
  ['tmpfs', 7.8, 0.003, '/dev/shm', -1],
  ['tmpfs', 1.6, 0.0026, '/run', -1],
  ['nfs01.example:/export/share', 2000, 905, '/mnt/share', 0.1],
];
const unit = (g) => (g >= 1000 ? `${(g / 1024).toFixed(1)}T` : g >= 10 ? `${Math.round(g)}G` : g >= 1 ? `${g.toFixed(1)}G` : `${Math.round(g * 1024)}M`);

export default {
  id: 'ops-df',
  title: 'df -h',
  category: 'Disk & Storage',
  description: 'df -h with Size/Used/Avail/Use% columns and a usage bar per mount; /var/log creeps toward full and turns red past 90%.',
  tags: ['df', 'disk', 'filesystem', 'storage', 'usage'],
  kind: 'tui',
  size: { w: 80, h: 12 },
  minSize: { w: 48, h: 5 },
  loop: 30,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    return (t) => {
      const nameW = Math.min(28, Math.max(10, W - 50));
      const barW = Math.max(0, W - nameW - 40);
      w.put(0, 0, `${pad('Filesystem', nameW)}  Size  Used Avail Use% ${pad('Mounted on', 12)}${barW > 4 ? ' Usage' : ''}`.slice(0, W), c.fg, undefined, ATTR.BOLD);
      FS.slice(0, H - 1).forEach(([dev, size, used, mnt, growth], i) => {
        const u = growth < 0 ? used * (0.5 + walk(ctx, i, t, 0.4)) : Math.min(size * 0.985, used + growth * t / 30 * size * 0.06 * (1 + walk(ctx, i, t, 0.2)));
        const pct = Math.round(u / size * 100);
        const col = pct >= 90 ? c.red : pct >= 75 ? c.yellow : c.green;
        const y = i + 1;
        const x = w.seg(0, y, [[pad(dev, nameW), dev.startsWith('tmpfs') ? c.muted : c.fg], [`  ${lpad(unit(size), 4)}  ${lpad(unit(u), 4)}  ${lpad(unit(size - u), 4)} `, c.fg], [lpad(`${pct}%`, 4), col, pct >= 90 ? ATTR.BOLD : 0], [` ${pad(mnt, 12)}`, c.blue]]);
        if (barW > 4) {
          const n = Math.round(pct / 100 * barW);
          w.seg(x + 1, y, [['[', c.muted], [g.full.repeat(n), col], [g.light.repeat(barW - n), c.dim], [']', c.muted]]);
        }
      });
    };
  },
};
