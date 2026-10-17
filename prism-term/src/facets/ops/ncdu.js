// ncdu — the reverse-video title, a sorted directory listing with [#####] bars, a moving selection, and totals.
import { C, ATTR, writer, pad, lpad, fixed } from './_kit.js';

const DIRS = [
  ['/lib', 18.4], ['/log', 9.2], ['/cache', 2.31], ['/www', 0.884], ['/backups', 0.512], ['/spool', 0.0412],
  ['/tmp', 0.0188], ['/mail', 0.0012], ['/opt', 0.00041], ['/local', 0.00002],
];
const size = (g) => (g >= 1 ? `${lpad(fixed(g, 1), 6)} GiB` : g >= 0.001 ? `${lpad(fixed(g * 1024, 1), 6)} MiB` : `${lpad(fixed(g * 1048576, 1), 6)} KiB`);

export default {
  id: 'ops-ncdu',
  title: 'ncdu',
  category: 'Disk & Storage',
  description: 'ncdu browsing /var: sizes and [##########] bars sorted largest first, a selection that walks the list, and the total disk usage footer.',
  tags: ['ncdu', 'du', 'disk usage', 'storage', 'cleanup'],
  kind: 'tui',
  size: { w: 72, h: 16 },
  minSize: { w: 44, h: 6 },
  loop: 20,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    return (t) => {
      w.rowBg(0, c.fg);
      w.put(0, 0, 'ncdu 1.19 ~ Use the arrow keys to navigate, press ? for help'.slice(0, W), c.bg, c.fg);
      w.put(0, 1, `--- /var ${'-'.repeat(Math.max(0, W - 9))}`, c.fg, undefined, ATTR.BOLD);
      const rows = Math.max(0, H - 3);
      const sel = Math.floor(t / 1.6) % Math.min(rows || 1, DIRS.length);
      const max = DIRS[0][1];
      DIRS.slice(0, rows).forEach(([name, g], i) => {
        const n = Math.max(0, Math.round(g / max * 10));
        const text = `${size(g)} [${'#'.repeat(n)}${' '.repeat(10 - n)}] ${name}`;
        const y = 2 + i;
        if (i === sel) { w.rowBg(y, c.fg); w.put(0, y, pad(text, W), c.bg, c.fg); }
        else w.seg(0, y, [[size(g), c.fg, ATTR.BOLD], [' [', c.fg], ['#'.repeat(n), c.fg], [' '.repeat(10 - n), c.fg], ['] ', c.fg], [name, c.fg]]);
      });
      if (H >= 4) {
        w.rowBg(H - 1, c.fg);
        w.put(0, H - 1, ' Total disk usage:  31.4 GiB  Apparent size:  30.9 GiB  Items: 214388'.slice(0, W), c.bg, c.fg);
      }
    };
  },
};
