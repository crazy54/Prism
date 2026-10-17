// vmstat 1 — the two-line header pinned on top, a new sample every second scrolling beneath it.
import { C, ATTR, writer, walk, lpad } from './_kit.js';

const H1 = 'procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----';
const H2 = ' r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st';

export default {
  id: 'ops-vmstat',
  title: 'vmstat 1',
  category: 'System Monitors',
  description: 'vmstat 1 streaming one line a second under its two-line header: run queue, memory, swap, block I/O, interrupts, context switches, CPU split.',
  tags: ['vmstat', 'memory', 'io', 'cpu', 'procps'],
  kind: 'tui',
  size: { w: 80, h: 14 },
  minSize: { w: 50, h: 5 },
  loop: 20,
  glyphs: 'ascii',
  color: 'mono',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const H = ctx.height;
    const sample = (k) => {
      const v = (key, s = 1) => walk(ctx, key, k, s);
      const busy = v(1, 0.3);
      const us = Math.round(6 + busy * 30), sy = Math.round(2 + busy * 7), wa = Math.round(v(2, 0.6) * 4);
      const id = Math.max(0, 100 - us - sy - wa);
      const free = Math.round(2155212 - busy * 380000 + v(3, 0.2) * 60000);
      const r = Math.round(busy * 6), b = v(4) > 0.85 ? 1 : 0;
      const bi = Math.round(v(5) ** 3 * 2400), bo = Math.round(40 + v(6) ** 2 * 900);
      const inn = Math.round(1700 + busy * 4200), cs = Math.round(3000 + busy * 8800);
      return `${lpad(r, 2)} ${lpad(b, 2)} ${lpad(114688, 6)} ${lpad(free, 7)} ${lpad(430112, 6)} ${lpad(8352164 - Math.round(busy * 20000), 7)} ${lpad(0, 4)} ${lpad(0, 4)} ${lpad(bi, 5)} ${lpad(bo, 5)} ${lpad(inn, 4)} ${lpad(cs, 4)} ${lpad(us, 2)} ${lpad(sy, 2)} ${lpad(id, 2)} ${lpad(wa, 2)} ${lpad(0, 2)}`;
    };
    return (t) => {
      // Header pinned on top; samples arrive once a second and scroll beneath it.
      w.put(0, 0, H1, c.muted);
      if (H > 1) w.put(0, 1, H2, c.fg, undefined, ATTR.BOLD);
      const rows = Math.max(0, H - 2);
      const n = rows + Math.floor(t);
      for (let i = 0; i < rows; i++) w.put(0, 2 + i, sample(n - rows + i), i === rows - 1 ? c.fg : c.muted, undefined, i === rows - 1 ? ATTR.BOLD : 0);
    };
  },
};
