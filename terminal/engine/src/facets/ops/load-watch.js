// watch -n2 uptime — the watch header, the uptime line, and a braille chart of the 1-minute load.
import { C, ATTR, writer, walk, clock, fixed } from './_kit.js';

export default {
  id: 'ops-load-watch',
  title: 'Load Average Watch',
  category: 'System Monitors',
  description: 'watch -n2 uptime with a braille history of the 1/5/15-minute load against the core count, so a creeping box is obvious.',
  tags: ['uptime', 'load average', 'watch', 'chart', 'cpu'],
  kind: 'chart',
  size: { w: 72, h: 14 },
  minSize: { w: 40, h: 6 },
  loop: 30,
  glyphs: 'ascii',
  color: '16',
  canvas: 'line',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const CORES = 8;
    const chartTop = 3, chartH = Math.max(1, H - chartTop - 1), chartX = 5, chartW = Math.max(4, W - chartX - 1);
    const cv = ctx.canvas('line', { cols: chartW, rows: chartH });
    const load = (s) => 1.4 + walk(ctx, 1, s, 0.03) * 4.8 + (walk(ctx, 2, s, 0.25) - 0.5) * 1.2;
    return (t) => {
      const ck = clock(t);
      const T = Math.floor(t / 2) * 2;
      const l1 = load(T), l5 = 0.8 * load(T - 60) + 0.2 * l1, l15 = 0.9 * load(T - 300) + 0.1 * l5;
      const head = `Every 2.0s: uptime`;
      w.put(0, 0, head, c.fg);
      w.right(W, 0, `node03: ${ck.day} ${ck.mon} ${ck.dd} ${ck.hms} 2026`, c.fg);
      w.seg(0, 1, [[` ${ck.hms} up 41 days,  3:12,  2 users,  load average: `, c.fg], [fixed(l1, 2), l1 > CORES ? c.red : l1 > CORES * 0.7 ? c.yellow : c.green, ATTR.BOLD], [`, ${fixed(l5, 2)}, ${fixed(l15, 2)}`, c.fg]]);
      if (H <= chartTop) return;
      // Chart: the last chartW*2 samples (2 s apart), scaled to 0..CORES.
      cv.clear();
      const cores = cv.height * (1 - CORES / (CORES * 1.25));
      for (let x = 0; x < cv.width; x++) cv.set(x, Math.round(cores), c.line);
      let prev = null;
      for (let x = 0; x < cv.width; x++) {
        const s = T - (cv.width - 1 - x) * 2;
        const v = load(s);
        const y = Math.round((1 - Math.min(1, v / (CORES * 1.25))) * (cv.height - 1));
        const col = v > CORES ? c.red : v > CORES * 0.7 ? c.yellow : c.green;
        if (prev) cv.line(prev[0], prev[1], x, y, col); else cv.set(x, y, col);
        for (let yy = y + 1; yy < cv.height; yy += 3) cv.set(x, yy, c.dim);
        prev = [x, y];
      }
      cv.paint(ctx.buffer, chartX, chartTop);
      w.put(0, chartTop, String(Math.round(CORES * 1.25)).padStart(4), c.muted);
      w.put(0, chartTop + Math.round((1 - 0.8) * (chartH - 1)), `${CORES}c`.padStart(4), c.muted);
      w.put(0, chartTop + chartH - 1, '0'.padStart(4), c.muted);
      w.put(chartX, H - 1, `-${chartW * 4}s`, c.muted);
      w.right(W, H - 1, 'now', c.muted);
    };
  },
};
