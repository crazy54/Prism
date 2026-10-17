// zpool status — pool tank mid-scrub: scan progress ticking, mirror vdev tree, READ/WRITE/CKSUM columns.
import { C, ATTR, writer, pad, lpad, fixed, clock } from './_kit.js';

const VDEVS = [
  ['tank', 0, 'ONLINE'], ['mirror-0', 1, 'ONLINE'], ['ata-HDD-8TB-ZA1B2C3D', 2, 'ONLINE'], ['ata-HDD-8TB-ZA1B4E5F', 2, 'ONLINE'],
  ['mirror-1', 1, 'ONLINE'], ['ata-HDD-8TB-ZA1C7G8H', 2, 'ONLINE'], ['ata-HDD-8TB-ZA1C9J0K', 2, 'ONLINE'],
  ['logs', 0, ''], ['nvme-SSD-1TB-S5H2NX0R1', 1, 'ONLINE'],
];

export default {
  id: 'ops-zpool-status',
  title: 'zpool status',
  category: 'Disk & Storage',
  description: 'zpool status for a mirrored pool mid-scrub: scanned/issued throughput and % done ticking, the vdev tree, and clean error counters.',
  tags: ['zfs', 'zpool', 'scrub', 'raid', 'mirror', 'storage'],
  kind: 'tui',
  size: { w: 76, h: 20 },
  minSize: { w: 60, h: 8 },
  loop: 30,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const H = ctx.height;
    return (t) => {
      const pct = 27.08 + t * 0.21;
      const total = 3.62, scanned = total * pct / 100 * 1.12, issued = total * pct / 100;
      const left = Math.max(0, (100 - pct) / 0.21 * 0.55 + 3300 - t * 1.6);
      const hh = Math.floor(left / 3600), mm = Math.floor(left % 3600 / 60), ss = Math.floor(left % 60);
      const lines = [
        [['  pool: ', c.fg, ATTR.BOLD], ['tank', c.fg]],
        [[' state: ', c.fg, ATTR.BOLD], ['ONLINE', c.green, ATTR.BOLD]],
        [['  scan: ', c.fg, ATTR.BOLD], ['scrub in progress since Tue Oct 13 13:41:02 2026', c.fg]],
        [[`        ${fixed(scanned, 2)}T / ${total}T scanned at ${fixed(1.02 + Math.sin(t) * 0.03, 2)}G/s, ${fixed(issued, 2)}T / ${total}T issued at 830M/s`, c.fg]],
        [[`        0B repaired, `, c.fg], [`${fixed(pct, 2)}% done`, c.yellow, ATTR.BOLD], [`, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')} to go`, c.fg]],
        [['config:', c.fg, ATTR.BOLD]],
        [],
        [[`        ${pad('NAME', 32)}${pad('STATE', 9)}${lpad('READ', 5)}${lpad('WRITE', 6)}${lpad('CKSUM', 6)}`, c.fg, ATTR.BOLD]],
      ];
      for (const [name, depth, state] of VDEVS) {
        const label = `${'  '.repeat(depth)}${name}`;
        lines.push(state
          ? [[`        ${pad(label, 32)}`, depth === 2 ? c.fg : c.cyan], [pad(state, 9), c.green], [`${lpad(0, 5)}${lpad(0, 6)}${lpad(0, 6)}`, c.fg]]
          : [[`        ${label}`, c.cyan]]);
      }
      lines.push([]);
      lines.push([['errors: ', c.fg, ATTR.BOLD], ['No known data errors', c.fg]]);
      lines.slice(0, H).forEach((parts, y) => w.seg(0, y, parts));
    };
  },
};
