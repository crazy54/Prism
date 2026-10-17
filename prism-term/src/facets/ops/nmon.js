// nmon CPU panel — the bordered nmon frame with per-CPU User/Sys/Wait bars drawn as U s W letters.
import { G, C, ATTR, writer, walk, clock, fixed, lpad } from './_kit.js';

export default {
  id: 'ops-nmon',
  title: 'nmon CPU Utilization',
  category: 'System Monitors',
  description: 'nmon\'s CPU Utilization panel: the boxed nmon frame and per-CPU bars of U (user), s (system) and W (wait) on a 0–100 scale.',
  tags: ['nmon', 'cpu', 'utilization', 'aix', 'monitor'],
  kind: 'tui',
  size: { w: 80, h: 15 },
  minSize: { w: 56, h: 7 },
  loop: 16,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    return (t) => {
      const T = Math.floor(t / 2) * 2;
      const ck = clock(T);
      const hb = (y, text) => { w.put(0, y, g.v, c.fg); w.put(W - 1, y, g.v, c.fg); if (text) w.seg(1, y, text); };
      const title = `${g.tl}nmon-16p${g.h.repeat(6)}[H for help]${g.h.repeat(3)}Hostname=node03${g.h.repeat(5)}Refresh= 2secs ${g.h.repeat(3)}${ck.hm}.${ck.hms.slice(6)}`;
      w.put(0, 0, title.slice(0, W - 1), c.fg);
      w.hline(Math.min(W - 1, [...title].length), 0, W - 1 - [...title].length, g.h, c.fg);
      w.put(W - 1, 0, g.tr, c.fg);
      const barW = W - 30;
      const scale = (s) => {
        let out = '';
        for (const [pct, label] of [[0, '0'], [25, '25'], [50, '50'], [75, '75'], [100, '100']]) {
          const x = Math.round(pct / 100 * (barW - 1));
          while (out.length < x) out += ' ';
          out = pct === 100 ? out.slice(0, barW - label.length) + label : (out + `|${label}`).slice(0, barW);
        }
        return out.padEnd(barW).slice(0, barW);
      };
      hb(1, [[' CPU Utilisation ', c.fg, ATTR.BOLD], [g.h.repeat(Math.max(0, W - 19)), c.fg]]);
      hb(2, [['-'.repeat(26) + '+' + '-'.repeat(barW) + '+', c.muted]]);
      hb(3, [['CPU User%  Sys% Wait%  Idle', c.fg, ATTR.BOLD], ['|' + scale() + '|', c.muted]]);
      const cpus = Math.max(1, Math.min(8, H - 6));
      let tu = 0, ts = 0, tw = 0;
      for (let i = 0; i < cpus; i++) {
        const busy = walk(ctx, i, T, 0.35);
        const u = 6 + busy * 58, s = 2 + walk(ctx, i + 20, T, 0.5) * 10, wa = walk(ctx, i + 40, T, 0.8) ** 3 * 9;
        const idle = Math.max(0, 100 - u - s - wa);
        tu += u; ts += s; tw += wa;
        const nU = Math.round(u / 100 * barW), nS = Math.round(s / 100 * barW), nW = Math.round(wa / 100 * barW);
        hb(4 + i, [[`${lpad(i + 1, 3)} ${lpad(fixed(u), 5)} ${lpad(fixed(s), 5)} ${lpad(fixed(wa), 5)} ${lpad(fixed(idle), 5)}`, c.fg], ['|', c.muted],
          ['U'.repeat(nU), c.green], ['s'.repeat(nS), c.red], ['W'.repeat(nW), c.blue], ['>'.repeat(Math.min(1, barW - nU - nS - nW)), c.fg],
          [' '.repeat(Math.max(0, barW - nU - nS - nW - 1)), c.fg], ['|', c.muted]]);
      }
      let y = 4 + cpus;
      if (y < H - 2) {
        hb(y++, [['-'.repeat(26) + '+' + '-'.repeat(barW) + '+', c.muted]]);
        const n = cpus;
        hb(y++, [[`Avg ${lpad(fixed(tu / n), 5)} ${lpad(fixed(ts / n), 5)} ${lpad(fixed(tw / n), 5)} ${lpad(fixed(100 - (tu + ts + tw) / n), 5)}`, c.fg, ATTR.BOLD], ['|', c.muted],
          ['U'.repeat(Math.round(tu / n / 100 * barW)), c.green], ['s'.repeat(Math.round(ts / n / 100 * barW)), c.red], ['W'.repeat(Math.round(tw / n / 100 * barW)), c.blue]]);
        w.put(W - 1, y - 1, g.v, c.fg);
      }
      while (y < H - 1) hb(y++);
      if (H > 1) { w.put(0, H - 1, g.bl, c.fg); w.hline(1, H - 1, W - 2, g.h, c.fg); w.put(W - 1, H - 1, g.br, c.fg); }
    };
  },
};
