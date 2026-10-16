// htop — per-core CPU meters, Mem/Swp, tasks/load/uptime, a live process table and the F-key bar.
import { G, C, ATTR, writer, walk, meter, clock, lpad, pad, fixed, human } from './_kit.js';

const PROCS = [
  { pid: 1, user: 'root', cmd: '/sbin/init', base: 0.0, mem: 0.1, virt: 166e6, res: 12.1e6 },
  { pid: 612, user: 'root', cmd: '/lib/systemd/systemd-journald', base: 0.3, mem: 0.6, virt: 88e6, res: 61e6 },
  { pid: 941, user: 'root', cmd: '/usr/sbin/sshd -D', base: 0.0, mem: 0.1, virt: 15e6, res: 9.2e6 },
  { pid: 1288, user: 'www-data', cmd: 'nginx: worker process', base: 3.1, mem: 0.4, virt: 61e6, res: 33e6 },
  { pid: 1289, user: 'www-data', cmd: 'nginx: worker process', base: 2.4, mem: 0.4, virt: 61e6, res: 32e6 },
  { pid: 2044, user: 'postgres', cmd: 'postgres: 16/main: checkpointer', base: 0.6, mem: 2.1, virt: 4.3e9, res: 330e6 },
  { pid: 2051, user: 'postgres', cmd: 'postgres: app orders 10.20.3.40(51544) SELECT', base: 18, mem: 3.4, virt: 4.4e9, res: 540e6 },
  { pid: 3110, user: 'app', cmd: 'node /srv/api/server.js --port 8080', base: 24, mem: 6.2, virt: 11.4e9, res: 980e6 },
  { pid: 3172, user: 'app', cmd: 'java -Xmx2g -jar /srv/ledger/ledger.jar', base: 11, mem: 13.8, virt: 6.1e9, res: 2.1e9 },
  { pid: 3390, user: 'redis', cmd: '/usr/bin/redis-server 127.0.0.1:6379', base: 1.8, mem: 1.2, virt: 120e6, res: 190e6 },
  { pid: 4107, user: 'root', cmd: '/usr/bin/dockerd -H fd://', base: 0.9, mem: 0.7, virt: 2.1e9, res: 110e6 },
  { pid: 4120, user: 'root', cmd: '/usr/bin/containerd', base: 0.4, mem: 0.3, virt: 1.9e9, res: 52e6 },
  { pid: 5562, user: 'nobody', cmd: '/usr/bin/node_exporter --collector.systemd', base: 0.7, mem: 0.1, virt: 726e6, res: 21e6 },
  { pid: 7781, user: 'ops', cmd: 'htop', base: 1.2, mem: 0.0, virt: 9.1e6, res: 5.2e6 },
  { pid: 8803, user: 'app', cmd: 'python3 /srv/jobs/reindex.py --batch 500', base: 9, mem: 1.9, virt: 410e6, res: 300e6 },
];

export default {
  id: 'ops-htop',
  title: 'htop',
  category: 'System Monitors',
  description: 'htop as you know it: per-core CPU meters, Mem/Swp bars, tasks, load average and uptime over a live, CPU-sorted process list.',
  tags: ['htop', 'top', 'cpu', 'memory', 'processes', 'monitor'],
  kind: 'tui',
  size: { w: 80, h: 24 },
  minSize: { w: 40, h: 10 },
  loop: 20,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx);
    const c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    const cores = W >= 60 && H >= 16 ? 8 : 4;
    const twoCol = W >= 60;
    return (t) => {
      const load = cores === 8 ? 0.35 + walk(ctx, 99, t, 0.08) * 0.4 : 0.4;
      const colW = twoCol ? Math.floor((W - 1) / 2) : W;
      const perCol = twoCol ? cores / 2 : cores;
      let total = 0;
      for (let i = 0; i < cores; i++) {
        const col = twoCol ? Math.floor(i / perCol) : 0;
        const row = twoCol ? i % perCol : i;
        if (row >= H - 2) continue;
        const u = Math.min(0.92, load * (0.45 + walk(ctx, i, t, 0.6) * 0.9));
        const sys = u * (0.15 + walk(ctx, i + 40, t, 0.4) * 0.2), nice = u * 0.08 * walk(ctx, i + 80, t, 0.3);
        total += u;
        const lab = lpad(String(i + 1), cores >= 10 ? 3 : 2);
        meter(w, ctx, col * (colW + 1), row, colW, lab, [{ v: nice, color: c.blue }, { v: u - sys - nice, color: c.green }, { v: sys, color: c.red }], `${fixed(u * 100)}%`);
      }
      let y = twoCol ? perCol : cores;
      // Memory and swap (left), tasks / load / uptime (right).
      const used = 5.4e9 + walk(ctx, 200, t, 0.05) * 0.9e9, buf = 0.42e9, cache = 6.1e9, totalMem = 15.5e9;
      const memLine = y, info = [];
      if (y < H - 1) meter(w, ctx, 0, y++, colW, 'Mem', [{ v: used / totalMem, color: c.green }, { v: buf / totalMem, color: c.blue }, { v: cache / totalMem, color: c.yellow }], `${human(used)}/${human(totalMem)}`);
      if (y < H - 1) meter(w, ctx, 0, y++, colW, 'Swp', [{ v: 0.055, color: c.red }], `${human(112e6)}/${human(2.0e9)}`);
      const running = 1 + Math.round(walk(ctx, 300, t, 0.9) * 3);
      const la = [total / cores * cores * 0.42 + 0.3, 0.98, 0.87].map((v, i) => (i === 0 ? v : v + walk(ctx, 310 + i, t, 0.02) * 0.2));
      const up = 41 * 86400 + 3 * 3600 + 12 * 60 + 7 + Math.floor(t);
      const upS = `${Math.floor(up / 86400)} days, ${lpad(Math.floor(up % 86400 / 3600), 2).replace(' ', '0')}:${String(Math.floor(up % 3600 / 60)).padStart(2, '0')}:${String(up % 60).padStart(2, '0')}`;
      info.push([['Tasks: ', c.cyan], ['214', c.fg, ATTR.BOLD], [', ', c.cyan], ['1032', c.fg, ATTR.BOLD], [' thr; ', c.cyan], [String(running), c.green, ATTR.BOLD], [' running', c.cyan]]);
      info.push([['Load average: ', c.cyan], [fixed(la[0], 2), c.fg, ATTR.BOLD], [' ', c.fg], [fixed(la[1], 2), c.fg], [' ', c.fg], [fixed(la[2], 2), c.muted]]);
      info.push([['Uptime: ', c.cyan], [upS, c.fg, ATTR.BOLD]]);
      if (twoCol) {
        let iy = perCol;
        for (const parts of info) if (iy < H - 1) w.seg(colW + 2, iy++, parts);
        y = Math.max(y, iy);
      } else for (const parts of info) if (y < H - 1) w.seg(1, y++, parts);
      y = Math.max(y, memLine) + 1;
      if (y >= H - 1) return;

      // Process table: header row on green, CPU-sorted, selection bar on cyan.
      const procs = PROCS.map((p, i) => ({ ...p, cpu: Math.max(0, p.base * (0.55 + walk(ctx, 500 + i, t, 0.7) * 0.9)) }))
        .sort((a, b) => b.cpu - a.cpu);
      // Same field widths for header and rows, so columns line up exactly.
      const F = [7, 10, 4, 4, 6, 6, 2, 6, 5, 9];
      const cols = (v) => [lpad(v[0], F[0]), ' ' + pad(v[1], F[1] - 1), lpad(v[2], F[2]), lpad(v[3], F[3]), lpad(v[4], F[4]), lpad(v[5], F[5]), lpad(v[6], F[6]), lpad(v[7], F[7]), lpad(v[8], F[8]), lpad(v[9], F[9]), '  '];
      const head = cols(['PID', 'USER', 'PRI', 'NI', 'VIRT', 'RES', 'S', `CPU%${twoCol ? g.down : 'v'}`, 'MEM%', 'TIME+']).join('') + 'Command';
      w.rowBg(y, c.green);
      w.put(0, y, head.slice(0, W), c.onFill, c.green, ATTR.BOLD);
      y++;
      const sel = Math.floor(t / 3) % 3;
      procs.forEach((p, i) => {
        if (y >= H - 1) return;
        const secs = p.cpu * 4 + t * p.cpu / 100 + p.pid % 97;
        const time = `${Math.floor(secs / 60)}:${(secs % 60).toFixed(2).padStart(5, '0')}`;
        const f = cols([p.pid, p.user, 20, 0, human(p.virt), human(p.res), p.cpu > 1 ? 'R' : 'S', fixed(p.cpu), fixed(p.mem), time]);
        if (i === sel) { w.rowBg(y, c.cyan); w.put(0, y, (f.join('') + p.cmd).slice(0, W), c.onFill, c.cyan); y++; return; }
        const sp = p.cmd.indexOf(' '), exe = sp < 0 ? p.cmd : p.cmd.slice(0, sp), base = exe.lastIndexOf('/');
        w.seg(0, y, [[f[0], c.fg], [f[1], p.user === 'root' ? c.fg : c.muted], [f.slice(2, 4).join(''), c.fg], [f.slice(4, 6).join(''), c.cyan],
          [f[6], p.cpu > 1 ? c.green : c.fg, p.cpu > 1 ? ATTR.BOLD : 0], [f.slice(7, 10).join(''), c.fg], [f[10], c.fg],
          [exe.slice(0, base + 1), c.muted], [exe.slice(base + 1), c.fg, ATTR.BOLD], [sp < 0 ? '' : p.cmd.slice(sp), c.fg]]);
        y++;
      });
      // F-key bar on the last row.
      const keys = [['F1', 'Help'], ['F2', 'Setup'], ['F3', 'Search'], ['F4', 'Filter'], ['F5', 'Tree'], ['F6', 'SortBy'], ['F7', 'Nice -'], ['F8', 'Nice +'], ['F9', 'Kill'], ['F10', 'Quit']];
      let x = 0;
      for (const [k, l] of keys) {
        if (x >= W) break;
        x = w.put(x, H - 1, k, c.fg, c.bg);
        x = w.put(x, H - 1, pad(l, 6), c.onFill, c.cyan);
      }
      if (x < W) w.fill(x, H - 1, W - x, 1, ' ', c.onFill, c.cyan);
    };
  },
};
