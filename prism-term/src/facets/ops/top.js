// procps top — the five-line summary and the classic process table with its reverse-video header.
import { C, ATTR, writer, walk, clock, lpad, pad, fixed } from './_kit.js';

const PROCS = [
  ['3110', 'app', 'node', 24, 6.2, '10.6g', '935.2m', '41.2m'], ['2051', 'postgres', 'postgres', 18, 3.4, '4.4g', '540.1m', '512.0m'],
  ['3172', 'app', 'java', 11, 13.8, '6.1g', '2.1g', '28.7m'], ['8803', 'app', 'python3', 9, 1.9, '410.2m', '300.4m', '18.1m'],
  ['1288', 'www-data', 'nginx', 3.1, 0.4, '61.2m', '33.1m', '6.0m'], ['1289', 'www-data', 'nginx', 2.4, 0.4, '61.2m', '32.4m', '6.0m'],
  ['3390', 'redis', 'redis-server', 1.8, 1.2, '120.4m', '190.3m', '4.1m'], ['7781', 'ops', 'top', 1.2, 0.0, '9.1m', '5.2m', '3.4m'],
  ['4107', 'root', 'dockerd', 0.9, 0.7, '2.1g', '110.0m', '48.2m'], ['5562', 'nobody', 'node_exporter', 0.7, 0.1, '726.0m', '21.1m', '10.4m'],
  ['612', 'root', 'systemd-journal', 0.3, 0.6, '88.1m', '61.4m', '60.1m'], ['4120', 'root', 'containerd', 0.4, 0.3, '1.9g', '52.0m', '30.3m'],
  ['1', 'root', 'systemd', 0.0, 0.1, '166.2m', '12.1m', '8.4m'], ['941', 'root', 'sshd', 0.0, 0.1, '15.2m', '9.2m', '7.8m'],
];

export default {
  id: 'ops-top',
  title: 'top',
  category: 'System Monitors',
  description: 'procps top: the uptime/Tasks/%Cpu(s)/MiB Mem/MiB Swap summary and a CPU-sorted process table that refreshes every few seconds.',
  tags: ['top', 'procps', 'cpu', 'processes', 'load'],
  kind: 'tui',
  size: { w: 80, h: 20 },
  minSize: { w: 50, h: 8 },
  loop: 15,
  glyphs: 'ascii',
  color: 'mono',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    return (t) => {
      const tick = Math.floor(t / 3); // top refreshes every 3 s
      const T = tick * 3;
      const ck = clock(T);
      const v = (k, s = 0.5) => walk(ctx, k, T, s);
      const us = 9 + v(1) * 9, sy = 2 + v(2) * 3, wa = v(3) * 1.2, id = 100 - us - sy - wa - 0.2;
      const la = [0.6 + us / 20, 0.71 + v(4, 0.05) * 0.1, 0.66 + v(5, 0.02) * 0.05];
      const free = 2104.7 - v(6, 0.1) * 300, used = 5611.3 + v(6, 0.1) * 300;
      const running = 1 + Math.round(v(7) * 3);
      const lines = [
        [['top - ', c.fg], [ck.hms, c.fg, ATTR.BOLD], [' up 41 days,  3:12,  2 users,  load average: ', c.fg], [la.map((x) => fixed(x, 2)).join(', '), c.fg, ATTR.BOLD]],
        [['Tasks: ', c.fg], ['214', c.fg, ATTR.BOLD], [' total, ', c.fg], [lpad(running, 3), c.fg, ATTR.BOLD], [' running, ', c.fg], [String(214 - running), c.fg, ATTR.BOLD], [' sleeping,   0 stopped,   0 zombie', c.fg]],
        [['%Cpu(s): ', c.fg], [lpad(fixed(us), 4), c.fg, ATTR.BOLD], [' us, ', c.fg], [lpad(fixed(sy), 4), c.fg, ATTR.BOLD], [' sy,  0.0 ni, ', c.fg], [lpad(fixed(id), 4), c.fg, ATTR.BOLD], [' id, ', c.fg], [lpad(fixed(wa), 4), c.fg, ATTR.BOLD], [' wa,  0.0 hi,  0.2 si,  0.0 st', c.fg]],
        [['MiB Mem : ', c.fg], [' 15872.4', c.fg, ATTR.BOLD], [' total, ', c.fg], [lpad(fixed(free), 8), c.fg, ATTR.BOLD], [' free, ', c.fg], [lpad(fixed(used), 8), c.fg, ATTR.BOLD], [' used, ', c.fg], ['  8156.4', c.fg, ATTR.BOLD], [' buff/cache', c.fg]],
        [['MiB Swap: ', c.fg], ['  2048.0', c.fg, ATTR.BOLD], [' total, ', c.fg], ['  1936.0', c.fg, ATTR.BOLD], [' free, ', c.fg], ['   112.0', c.fg, ATTR.BOLD], [' used. ', c.fg], [lpad(fixed(9907.2 + free - 2104.7), 8), c.fg, ATTR.BOLD], [' avail Mem', c.fg]],
      ];
      let y = 0;
      for (const l of lines) if (y < H) w.seg(0, y++, l);
      y++;
      if (y >= H) return;
      const head = `${lpad('PID', 7)} ${pad('USER', 8)} ${lpad('PR', 2)} ${lpad('NI', 3)} ${lpad('VIRT', 7)} ${lpad('RES', 6)} ${lpad('SHR', 6)} S ${lpad('%CPU', 5)} ${lpad('%MEM', 5)} ${lpad('TIME+', 8)} COMMAND`;
      w.rowBg(y, c.fg);
      w.put(0, y++, head.slice(0, W), c.bg, c.fg);
      const rows = PROCS.map((p, i) => ({ p, cpu: p[3] * (0.5 + walk(ctx, 100 + i, T, 0.8)) })).sort((a, b) => b.cpu - a.cpu);
      for (const { p, cpu } of rows) {
        if (y >= H) break;
        const secs = 60 + cpu * 5 + T * cpu / 100 + Number(p[0]) % 89;
        const time = `${Math.floor(secs / 60)}:${(secs % 60).toFixed(2).padStart(5, '0')}`;
        const line = `${lpad(p[0], 7)} ${pad(p[1], 8)} ${lpad(20, 2)} ${lpad(0, 3)} ${lpad(p[5], 7)} ${lpad(p[6], 6)} ${lpad(p[7], 6)} ${cpu > 1 ? 'R' : 'S'} ${lpad(fixed(cpu), 5)} ${lpad(fixed(p[4]), 5)} ${lpad(time, 8)} ${p[2]}`;
        w.put(0, y++, line.slice(0, W), c.fg, undefined, cpu > 1 ? ATTR.BOLD : 0);
      }
    };
  },
};
