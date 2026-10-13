// Logs & journals: journalctl -f, an lnav-style access log, dmesg -wH, and an lnav-style histogram.
import { G, C, ATTR, writer, walk, hash, typed, clock, bashPrompt, wrapParts, pad, lpad, fixed, blink } from './_kit.js';

/** Weighted, deterministic choice: items are [weight, ...]. */
const choose = (items, n, salt) => {
  const total = items.reduce((a, it) => a + it[0], 0);
  let r = hash(n, salt) * total;
  for (const it of items) { r -= it[0]; if (r < 0) return it; }
  return items.at(-1);
};

/** Entries arrive at i*gap plus jitter (monotonic); how many have arrived by t? */
const arrived = (t, gap, jit, salt) => {
  const at = (i) => i * gap + hash(i, salt) * jit;
  let n = Math.max(-1, Math.floor(t / gap) - 1);
  while (at(n + 1) <= t) n++;
  while (n >= 0 && at(n) > t) n--;
  return { n, at };
};

/** Fill `rows` rows bottom-up from the newest entry, wrapping each like a tty (whole entries only). */
function tail(w, entries, y0, rows, width) {
  const out = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const r = wrapParts(entries[i], width);
    if (out.length + r.length > rows) { if (!out.length) out.push(...r.slice(-rows)); break; }
    out.unshift(...r);
  }
  out.forEach((parts, k) => w.seg(0, y0 + rows - out.length + k, parts));
}

// [weight, identifier, pid, priority, message]
const JOURNAL = [
  [9, 'shop-api', 2210, 6, 'GET /api/v1/cart 200 18ms'],
  [7, 'shop-api', 2210, 6, 'POST /api/v1/checkout 201 142ms'],
  [3, 'shop-api', 2210, 4, 'pool: waited 412ms for a connection (limit 250ms)'],
  [1.4, 'shop-api', 2210, 3, 'upstream payments.internal.example: context deadline exceeded'],
  [1, 'shop-worker', 3118, 3, 'job reindex-28817640 failed: exit status 137'],
  [3, 'shop-worker', 3118, 7, 'heartbeat ok (lag 3ms)'],
  [3, 'sshd', 7702, 6, 'Accepted publickey for ops from 10.20.2.15 port 51022 ssh2: ED25519 SHA256:k3J9xQ2mR7tL0vB4nY8cW1z'],
  [2, 'sshd', 7702, 6, 'pam_unix(sshd:session): session opened for user ops(uid=1000) by ops(uid=0)'],
  [2, 'sshd', 7811, 6, 'Invalid user admin from 203.0.113.77 port 40112'],
  [2, 'systemd', 1, 6, 'Started session-412.scope - Session 412 of User ops.'],
  [2, 'systemd', 1, 6, 'logrotate.service: Deactivated successfully.'],
  [2, 'CRON', 9001, 6, '(root) CMD (/usr/local/bin/backup.sh --quiet)'],
  [2, 'kernel', 0, 4, '[UFW BLOCK] IN=eth0 OUT= SRC=198.51.100.23 DST=10.20.2.31 PROTO=TCP DPT=23'],
  [2, 'postgres', 2044, 6, 'LOG:  checkpoint complete: wrote 1342 buffers (8.2%)'],
  [1.5, 'sudo', 7790, 5, '     ops : TTY=pts/0 ; PWD=/home/ops ; USER=root ; COMMAND=/usr/bin/systemctl reload nginx'],
  [1, 'systemd-resolved', 581, 5, 'Using degraded feature set UDP instead of UDP+EDNS0 for DNS server 10.20.0.2.'],
  [0.6, 'kernel', 0, 4, 'nvme0n1: I/O 412 QID 3 timeout, completion polled'],
  [0.3, 'smartd', 702, 2, 'Device: /dev/sdb [SAT], 8 Currently unreadable (pending) sectors'],
];

const journal = {
  id: 'ops-journalctl-follow',
  title: 'journalctl -f',
  category: 'Logs & Journals',
  description: 'journalctl -f following the system journal with priority colors: crit/err red, warning yellow, notice bold, info plain and debug dim.',
  tags: ['journalctl', 'systemd', 'journal', 'logs', 'follow', 'syslog'],
  kind: 'tui',
  size: { w: 80, h: 16 },
  minSize: { w: 50, h: 5 },
  loop: 40,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const HIST = 10;
    const prio = (p) => (p <= 3 ? [c.red, ATTR.BOLD] : p === 4 ? [c.yellow, ATTR.BOLD] : p === 5 ? [c.fg, ATTR.BOLD] : p === 7 ? [c.dim, 0] : [c.fg, 0]);
    return (t) => {
      const { n, at } = arrived(t, 0.7, 0.6, 13);
      const entries = [];
      for (let i = Math.max(-HIST, n - ctx.height); i <= n; i++) { // older lines have scrolled away
        const [, id, pid, p, msg] = choose(JOURNAL, i + 1000, 5);
        const ts = clock(i < 0 ? i * 0.7 : at(i)).hms;
        const [fg, attr] = prio(p);
        entries.push([[`Oct 13 ${ts} node03 ${id}${pid ? `[${pid}]` : ''}: `, c.fg], [msg, fg, attr]]);
      }
      const H = ctx.height;
      const promptRow = [];
      const total = entries.reduce((a, e) => a + wrapParts(e, ctx.width).length, 0);
      if (total < H) { // the prompt hasn't scrolled away yet
        const x = bashPrompt(w, ctx, 0, 0);
        w.put(x, 0, 'journalctl -f', c.fg);
        promptRow.push(1);
      }
      tail(w, entries, promptRow.length, H - promptRow.length, ctx.width);
    };
  },
};

const PATHS = [[8, 'GET', '/api/v1/cart'], [6, 'GET', '/api/v1/products?page=2'], [4, 'POST', '/api/v1/checkout'], [5, 'GET', '/static/app.4f9c2e.js'],
  [6, 'GET', '/healthz'], [2, 'GET', '/favicon.ico'], [2, 'POST', '/api/v1/login'], [1, 'GET', '/wp-login.php'], [1, 'GET', '/.env']];
const UAS = ['Mozilla/5.0 (X11; Linux x86_64)', 'curl/8.5.0', 'kube-probe/1.31', 'python-requests/2.32.3', 'Go-http-client/2.0'];

const access = {
  id: 'ops-nginx-access',
  title: 'nginx access log',
  category: 'Logs & Journals',
  description: 'An lnav-style view following the nginx access log: lines chopped at the edge, status codes by class, a 5xx burst tinting lines red, and a status bar.',
  tags: ['nginx', 'access-log', 'http', 'status-codes', 'lnav', 'logs'],
  kind: 'tui',
  size: { w: 80, h: 16 },
  minSize: { w: 56, h: 6 },
  loop: 30,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    const line = (i, at) => {
      const T = ((at % 30) + 30) % 30;
      const burst = T > 14 && T < 19; // upstream falls over for ~5 s
      const [, m, path] = choose(PATHS, i, 3);
      let st = path === '/healthz' ? 200 : path.includes('wp-') || path === '/.env' ? 404 : path === '/favicon.ico' ? 304 : hash(i, 8) > 0.96 ? 499 : hash(i, 9) > 0.93 ? 301 : 200;
      if (burst && path.startsWith('/api') && hash(i, 10) > 0.25) st = hash(i, 11) > 0.5 ? 502 : 504;
      if (m === 'POST' && st === 200) st = path.endsWith('checkout') ? 201 : 200;
      const ip = path.includes('wp-') || path === '/.env' ? '203.0.113.77' : path === '/healthz' ? '10.20.4.17' : `198.51.100.${10 + Math.floor(hash(i, 12) * 200)}`;
      const ua = path === '/healthz' ? 'kube-probe/1.31' : UAS[Math.floor(hash(i, 13) * UAS.length)];
      const bytes = st >= 500 ? 157 + (st % 10) * 3 : st === 304 ? 0 : Math.floor(300 + hash(i, 14) * 24000);
      return { ip, ts: clock(at).hms, m, path, st, bytes, ua };
    };
    return (t) => {
      const { n, at } = arrived(t, 0.24, 0.2, 21);
      const rows = H - 2;
      const L = [];
      let n4 = 0, n5 = 0;
      for (let i = Math.max(-40, n - 120); i <= n; i++) { // counts over a recent window, for the status bar
        const e = line(i, i < 0 ? i * 0.24 : at(i));
        if (e.st >= 500) n5++; else if (e.st >= 400) n4++;
        if (i > n - rows) L.push(e);
      }
      const top = L.at(-1);
      w.rowBg(0, c.panel2, 0, W);
      w.seg(0, 0, [[` 2026-10-13 ${top.ts} `, c.fg, ATTR.BOLD, c.panel2], [` LOG ${g.gt} access.log ${g.gt} access_log`, c.muted, 0, c.panel2]]);
      L.forEach((e, k) => {
        const y = 1 + k;
        const sc = e.st >= 500 ? c.red : e.st >= 400 ? c.yellow : e.st >= 300 ? c.cyan : c.green;
        const tint = e.st >= 500 ? c.red : e.st >= 400 ? c.yellow : null;
        w.seg(0, y, [
          [e.ip, tint ?? c.cyan], [' - - [', tint ?? c.fg], [`13/Oct/2026:${e.ts} +0000`, tint ?? c.muted], ['] "', tint ?? c.fg],
          [`${e.m} ${e.path} HTTP/2.0`, tint ?? c.fg, ATTR.BOLD], ['" ', tint ?? c.fg], [String(e.st), sc, ATTR.BOLD],
          [` ${e.bytes} "-" "${e.ua}"`, tint ?? c.fg],
        ]);
      });
      const y = H - 1;
      w.rowBg(y, c.panel2, 0, W);
      const left = ` L${String(48211 + n).replace(/\B(?=(\d{3})+$)/g, ',')}  100% `;
      w.seg(0, y, [[left, c.fg, ATTR.BOLD, c.panel2], [` ${n5} errors `, n5 ? c.red : c.muted, ATTR.BOLD, c.panel2], [` ${n4} warnings `, n4 ? c.yellow : c.muted, 0, c.panel2]]);
      w.right(W, y, '?:View Help ', c.muted, c.panel2);
    };
  },
};

// dmesg -wH: [t_seconds, level, subsystem, message]. Backlog first, then the live sequence.
const KERN = [
  [-3.1, 6, 'EXT4-fs (dm-0)', 'mounted filesystem 3f1c9a2e-77b0-4d1e-9c55-0a8e2f61b7d4 r/w with ordered data mode. Quota mode: none.'],
  [-2.6, 6, 'virtio_net virtio0 eth0', 'link up'],
  [-2.2, 6, 'IPv6', 'ADDRCONF(NETDEV_CHANGE): eth0: link becomes ready'],
  [-1.4, 4, 'perf', 'interrupt took too long (2503 > 2500), lowering kernel.perf_event_max_sample_rate to 79750'],
  [-0.6, 6, 'br-6f1d0c', 'port 2(veth3a91c2e) entered forwarding state'],
  [1.5, 6, 'usb 1-2', 'new high-speed USB device number 7 using xhci_hcd'],
  [1.9, 6, 'usb-storage 1-2:1.0', 'USB Mass Storage device detected'],
  [3.2, 5, 'sd 6:0:0:0', '[sdc] 62914560 512-byte logical blocks: (32.2 GB/30.0 GiB)'],
  [3.3, 6, 'sd 6:0:0:0', '[sdc] Attached SCSI removable disk'],
  [6.0, 4, 'TCP', 'request_sock_TCP: Possible SYN flooding on port 443. Sending cookies.'],
  [9.4, 3, 'shop-worker[3118]', 'segfault at 0 ip 000055d0c4a1b2e3 sp 00007ffd2b9c41a8 error 4 in shop-worker[55d0c4a00000+1f000]'],
  [13.0, 4, 'shop-api', 'invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0'],
  [13.1, 6, 'CPU', '3 PID: 2210 Comm: shop-api Not tainted 6.8.0-45-generic #45-Sable'],
  [13.2, 3, 'Memory cgroup out of memory', 'Killed process 2210 (shop-api) total-vm:2183404kB, anon-rss:1021788kB, file-rss:2304kB, UID:1001'],
  [13.5, 6, 'oom_reaper', 'reaped process 2210 (shop-api), now anon-rss:0kB, file-rss:0kB, shmem-rss:0kB'],
  [17.8, 4, 'nvme nvme0', 'I/O 412 QID 3 timeout, completion polled'],
  [21.0, 6, 'virtio_net virtio1 eth1', 'link down'],
];

const dmesg = {
  id: 'ops-dmesg',
  title: 'dmesg -wH',
  category: 'Logs & Journals',
  description: 'dmesg -wH following the kernel ring buffer with relative timestamps: a USB disk attaches, a segfault, then an oom-kill sequence in red.',
  tags: ['dmesg', 'kernel', 'oom-killer', 'segfault', 'ring-buffer', 'logs'],
  kind: 'tui',
  size: { w: 80, h: 18 },
  minSize: { w: 56, h: 6 },
  loop: 26,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    return (t) => {
      const T = t % 26;
      const ty = typed('sudo dmesg -wH', T, 0.2, 18);
      const entries = [];
      const head = [[['ops@node03', c.green, ATTR.BOLD], [':', c.fg], ['~', c.blue, ATTR.BOLD], ['$ ', c.fg], [ty.text, c.fg], ...(ty.done ? [] : [[' ', c.bg, 0, c.fg]])]];
      if (ty.done) {
        const t0 = ty.at + 0.3;
        let prev = null;
        for (const [s, lvl, sub, msg] of KERN) {
          if (s >= 0 && T < t0 + s) break;
          const abs = s < 0 ? s - 40 : s; // backlog came earlier
          const minute = clock(abs).hm;
          const stamp = prev === null || minute !== prev.minute ? `[Oct13 ${minute}]` : `[${lpad(`+${fixed(Math.max(0.000001, abs - prev.abs), 6)}`, 11)}]`;
          prev = { minute, abs };
          const mc = lvl <= 3 ? c.red : lvl === 4 ? c.yellow : c.fg;
          entries.push([[stamp, c.green], [' '], [`${sub}: `, c.orange], [msg, mc, lvl <= 4 ? ATTR.BOLD : 0]]);
        }
      }
      const H = ctx.height;
      const rows = [...head, ...entries].flatMap((e) => wrapParts(e.map(([s, fg = c.fg, a = 0, bg]) => [s, fg, a, bg]), ctx.width));
      rows.slice(-H).forEach((parts, k) => w.seg(0, k, parts));
    };
  },
};

const hist = {
  id: 'ops-log-histogram',
  title: 'Log Histogram',
  category: 'Logs & Journals',
  description: 'An lnav-style histogram of log volume in 10-second buckets: bars split into errors, warnings and normal, with the current bucket filling live.',
  tags: ['lnav', 'histogram', 'logs', 'errors', 'volume', 'timeline'],
  kind: 'chart',
  size: { w: 80, h: 16 },
  minSize: { w: 50, h: 6 },
  loop: 60,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    const bucket = (b) => {
      const incident = Math.max(0, 1 - Math.abs(((b % 18) + 18) % 18 - 9) / 3); // an error storm every 3 min
      const total = Math.round(180 + walk(ctx, 1, b, 0.3) * 160 + incident * 220);
      const err = Math.round(total * (0.004 + incident * 0.22 + hash(b, 2) * 0.006));
      const warn = Math.round(total * (0.03 + incident * 0.08 + hash(b, 3) * 0.03));
      return { total, err, warn };
    };
    return (t) => {
      const now = clock(0).sec + t;
      const cur = Math.floor(now / 10);
      const frac = (now / 10) - cur;
      const rows = H - 2;
      const list = [];
      for (let b = cur - rows + 1; b <= cur; b++) {
        const v = bucket(b);
        if (b === cur) { v.total = Math.round(v.total * frac); v.err = Math.round(v.err * frac); v.warn = Math.round(v.warn * frac); }
        list.push({ b, ...v });
      }
      const max = Math.max(...list.map((v) => v.total), 1);
      w.rowBg(0, c.panel2, 0, W);
      w.seg(0, 0, [[` ${clock(t).date} ${clock(t).hms} `, c.fg, ATTR.BOLD, c.panel2], [` HIST ${g.gt} syslog ${g.gt} 10s buckets`, c.muted, 0, c.panel2]]);
      const labW = 9, numW = W >= 70 ? 22 : 0, barW = Math.max(4, W - labW - numW - 1);
      list.forEach((v, k) => {
        const y = 1 + k;
        const hms = new Date(v.b * 10 * 1000).toISOString().slice(11, 19);
        w.put(0, y, hms, v.b === cur ? c.fg : c.muted, undefined, v.b === cur ? ATTR.BOLD : 0);
        const len = Math.round(v.total / max * barW), le = Math.round(v.err / max * barW), lw = Math.round(v.warn / max * barW);
        const n = Math.max(0, len - le - lw);
        w.seg(labW, y, [[g.full.repeat(le), c.red], [g.full.repeat(lw), c.yellow], [g.full.repeat(n), c.green]]);
        if (numW) w.right(W, y, `${lpad(v.total, 4)} msg ${lpad(v.warn, 3)} w ${lpad(v.err, 3)} e`, v.err > 20 ? c.red : c.muted, undefined, v.err > 20 ? ATTR.BOLD : 0);
      });
      const y = H - 1;
      w.rowBg(y, c.panel2, 0, W);
      const errs = list.reduce((a, v) => a + v.err, 0), warns = list.reduce((a, v) => a + v.warn, 0);
      w.seg(0, y, [[' Errors ', c.red, ATTR.BOLD, c.panel2], [g.full, c.red, 0, c.panel2], [`  Warnings `, c.yellow, ATTR.BOLD, c.panel2], [g.full, c.yellow, 0, c.panel2], ['  Normal ', c.green, ATTR.BOLD, c.panel2], [g.full, c.green, 0, c.panel2]]);
      if (W >= 66) w.right(W, y, `${errs} err  ${warns} warn  q:Back `, c.muted, c.panel2);
    };
  },
};

export default [journal, access, dmesg, hist];
