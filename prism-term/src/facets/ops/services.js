// systemd and process views: systemctl status, failed units, pstree -p, and list-timers counting down.
import { G, C, ATTR, writer, session, drawSession, clock, pad, lpad, fixed, uni } from './_kit.js';

const dur = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}min` : s >= 60 ? `${Math.floor(s / 60)}min ${Math.floor(s % 60)}s` : `${Math.floor(s)}s`);

const status = {
  id: 'ops-systemctl-status',
  title: 'systemctl status',
  category: 'Processes & Services',
  description: 'systemctl status nginx.service: the green ● active (running) block, Main PID, tasks, memory, CPU, CGroup tree and a journal tail with a live reload.',
  tags: ['systemd', 'systemctl', 'service', 'status', 'nginx', 'unit'],
  kind: 'tui',
  size: { w: 80, h: 20 },
  minSize: { w: 56, h: 6 },
  loop: 24,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const H = ctx.height;
    return (t) => {
      const T = t % 24;
      const up = 4 * 3600 + 48 * 60 + 7 + t;
      const reloading = T > 10 && T < 11.5;
      const reloaded = T >= 11.5;
      const lines = [
        [[`${g.dot} `, reloading ? c.yellow : c.green, ATTR.BOLD], ['nginx.service - A high performance web server and a reverse proxy server', c.fg, ATTR.BOLD]],
        [['     Loaded: ', c.fg], ['loaded (/usr/lib/systemd/system/nginx.service; ', c.fg], ['enabled', c.green, ATTR.BOLD], ['; preset: ', c.fg], ['enabled', c.green, ATTR.BOLD], [')', c.fg]],
        [['     Active: ', c.fg], [reloading ? 'reloading (reload)' : 'active (running)', reloading ? c.yellow : c.green, ATTR.BOLD], [` since Tue 2026-10-13 09:14:02 UTC; ${dur(up)} ago`, c.fg]],
        [['       Docs: ', c.fg], ['man:nginx(8)', c.fg]],
        [['    Process: ', c.fg], [`${reloaded ? 8612 : 1281} ${reloaded ? 'ExecReload' : 'ExecStartPre'}=/usr/sbin/nginx -t -q -g "daemon on;" (code=exited, status=0/SUCCESS)`, c.fg]],
        [['   Main PID: ', c.fg], ['1287 (nginx)', c.fg]],
        [['      Tasks: ', c.fg], ['5 (limit: 18922)', c.fg]],
        [['     Memory: ', c.fg], [`${fixed(21.4 + (reloaded ? 1.1 : 0) + Math.sin(t / 3) * 0.2)}M (peak: 24.1M)`, c.fg]],
        [['        CPU: ', c.fg], [`2min ${fixed(11.402 + t * 0.031, 3)}s`, c.fg]],
        [['     CGroup: ', c.fg], ['/system.slice/nginx.service', c.fg]],
      ];
      const tree = uni(ctx) ? ['├─', '└─'] : ['|-', '`-'];
      const kids = ['1287 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"', ...[1288, 1289, 1290, 1291].map((p) => `${reloaded ? p + 7320 : p} "nginx: worker process"`)];
      kids.forEach((k, i) => lines.push([[`             ${i === kids.length - 1 ? tree[1] : tree[0]}`, c.muted], [k, c.fg]]));
      lines.push([]);
      const log = [
        [0, 'Starting nginx.service - A high performance web server and a reverse proxy server...'],
        [0, 'Started nginx.service - A high performance web server and a reverse proxy server.'],
      ];
      if (T > 10) log.push([0, 'Reloading nginx.service - A high performance web server and a reverse proxy server...']);
      if (reloaded) log.push([0, 'Reloaded nginx.service - A high performance web server and a reverse proxy server.']);
      for (const [, msg] of log) lines.push([['Oct 13 ', c.fg], [msg.startsWith('Start') ? '09:14:02' : clock(Math.floor(t)).hms, c.fg], [' node03 systemd[1]: ', c.fg], [msg, c.fg]]);
      lines.slice(0, H).forEach((parts, y) => w.seg(0, y, parts));
    };
  },
};

const failed = {
  id: 'ops-systemctl-failed',
  title: 'Failed Units',
  category: 'Processes & Services',
  description: 'systemctl --failed shows two red ● failed units; a restart fixes the backup job and the follow-up listing drops to one.',
  tags: ['systemd', 'failed', 'units', 'troubleshooting', 'restart'],
  kind: 'tui',
  size: { w: 80, h: 16 },
  minSize: { w: 60, h: 6 },
  loop: 22,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const units = [['certbot-renew.service', 'Renew TLS certificates'], ['backup-db.service', 'Nightly database backup']];
    const list = (n) => () => [
      [[`  ${pad('UNIT', 23)}${pad('LOAD', 7)}${pad('ACTIVE', 7)}${pad('SUB', 7)}DESCRIPTION`, c.fg, ATTR.BOLD]],
      ...units.slice(0, n).map(([u, d]) => [[`${g.dot} `, c.red, ATTR.BOLD], [pad(u, 23), c.fg], [pad('loaded', 7), c.fg], [pad('failed', 7), c.red, ATTR.BOLD], [pad('failed', 7), c.red, ATTR.BOLD], [d, c.fg]]),
      [],
      [[`${n} loaded units listed.`, c.fg]],
    ];
    return (t) => {
      const lines = session(ctx, t % 22, [
        { cmd: 'systemctl --failed', out: list(2), dur: 4 },
        { cmd: 'sudo systemctl restart backup-db.service', out: () => [], dur: 1.2 },
        { cmd: 'systemctl --failed', out: list(1), dur: 6 },
      ]);
      drawSession(w, ctx, lines, 0, 0, ctx.height);
    };
  },
};

const pstree = {
  id: 'ops-pstree',
  title: 'pstree -p',
  category: 'Processes & Services',
  description: 'pstree -p under watch: systemd and its children as a tree with PIDs, while a cron job forks a backup script that runs and exits.',
  tags: ['pstree', 'processes', 'tree', 'pids', 'cron'],
  kind: 'diagram',
  size: { w: 80, h: 16 },
  minSize: { w: 50, h: 6 },
  loop: 20,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const u = uni(ctx);
    const S = u ? { h: '─', tee: '┬', mid: '├', end: '└', bar: '│', one: '───' } : { h: '-', tee: '+', mid: '|', end: '`', bar: '|', one: '---' };
    return (t) => {
      const T = Math.floor((t % 20) / 2) * 2; // watch refreshes every 2 s
      const job = T > 6 && T < 15;
      const now = clock(Math.floor(t / 2) * 2);
      const head = 'Every 2.0s: pstree -p';
      w.put(0, 0, head, c.fg);
      if (ctx.width >= 60) w.right(ctx.width, 0, `node03: ${now.day} ${now.mon} ${now.dd} ${now.hms} 2026`, c.fg);
      const kids = [
        ['agetty(902)', []], ['containerd(4120)', ['8*[{containerd}]']],
        ['cron(712)', job ? ['cron(9001)───sh(9002)───backup.sh(9003)───pg_dump(9007)'.replace(/───/g, S.one)] : []],
        ['dockerd(4107)', ['docker-proxy(4301)', '14*[{dockerd}]']], ['nginx(1287)', ['4*[nginx(1288)]']],
        ['node(3110)', ['10*[{node}]']], ['postgres(2040)', ['postgres(2044)', 'postgres(2045)', `postgres(${job ? 9011 : 2051})`]],
        ['redis-server(3390)', ['4*[{redis-server}]']], ['sshd(941)', ['sshd(7702)───sshd(7744)───bash(7745)───watch(7790)'.replace(/───/g, S.one)]],
        ['systemd-journal(612)', []], ['systemd-logind(733)', []],
      ];
      const lines = [];
      const root = 'systemd(1)';
      kids.forEach(([name, sub], i) => {
        const lead = i === 0 ? `${root}${S.h}${S.tee}${S.h}` : `${' '.repeat(root.length)} ${i === kids.length - 1 ? S.end : S.mid}${S.h}`;
        if (!sub.length) { lines.push([[lead, c.muted], [name, name.startsWith('cron') && job ? c.yellow : c.fg]]); return; }
        if (sub.length === 1) { lines.push([[lead, c.muted], [name, c.fg], [S.one, c.muted], [sub[0], job && sub[0].includes('backup') ? c.yellow : c.fg, job && sub[0].includes('backup') ? ATTR.BOLD : 0]]); return; }
        const pre = ' '.repeat(root.length) + ' ' + (i === kids.length - 1 ? ' ' : S.bar) + ' ' + ' '.repeat(name.length);
        sub.forEach((s, j) => {
          const branch = j === 0 ? `${S.h}${S.tee}${S.h}` : ` ${j === sub.length - 1 ? S.end : S.mid}${S.h}`;
          lines.push([[j === 0 ? lead : pre, c.muted], [j === 0 ? name : '', c.fg], [branch, c.muted], [s, s.includes('9011') ? c.yellow : c.fg]]);
        });
      });
      lines.slice(0, ctx.height - 2).forEach((parts, y) => w.seg(0, y + 2, parts));
    };
  },
};

const timers = {
  id: 'ops-list-timers',
  title: 'systemctl list-timers',
  category: 'Processes & Services',
  description: 'systemd timers with NEXT, LEFT counting down live, LAST and PASSED; when a timer fires its LAST/PASSED reset and NEXT rolls forward.',
  tags: ['systemd', 'timers', 'cron', 'schedule', 'countdown'],
  kind: 'tui',
  size: { w: 80, h: 10 },
  minSize: { w: 64, h: 4 },
  loop: 60,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    // [unit, activates, period s, phase s]
    const TIMERS = [['logrotate.timer', 'logrotate.service', 300, 120], ['backup-db.timer', 'backup-db.service', 90, 37], ['certbot-renew.timer', 'certbot-renew.service', 43200, 9000],
      ['fstrim.timer', 'fstrim.service', 604800, 200000], ['apt-daily.timer', 'apt-daily.service', 21600, 4100], ['systemd-tmpfiles-clean.timer', 'systemd-tmpfiles-clean.service', 86400, 31000]];
    const left = (s) => (s >= 86400 ? `${Math.floor(s / 86400)} days` : s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}min` : s >= 60 ? `${Math.floor(s / 60)}min ${Math.floor(s % 60)}s` : `${Math.floor(s)}s`);
    return (t) => {
      const now = clock(0).sec + Math.floor(t);
      const act = ctx.width >= 9 + 12 + 9 + 15 + 30 + 12;
      w.put(0, 0, `${pad('NEXT', 9)}${pad('LEFT', 12)}${pad('LAST', 9)}${pad('PASSED', 15)}${pad('UNIT', 30)}${act ? 'ACTIVATES' : ''}`.slice(0, ctx.width), c.fg, undefined, ATTR.BOLD);
      const rows = TIMERS.map(([u, a, p, ph]) => {
        const next = Math.ceil((now - ph) / p) * p + ph;
        return { u, a, next, last: next - p };
      }).sort((x, y) => x.next - y.next);
      const hms = (s) => new Date(s * 1000).toISOString().slice(11, 19);
      rows.slice(0, ctx.height - 3).forEach(({ u, a, next, last }, i) => {
        const l = next - now, pas = now - last;
        w.seg(0, 1 + i, [[pad(hms(next), 9), c.fg], [pad(left(l), 12), l < 30 ? c.yellow : c.fg, l < 30 ? ATTR.BOLD : 0], [pad(hms(last), 9), c.fg], [pad(`${left(pas)} ago`, 15), pas < 5 ? c.green : c.fg], [pad(u, 30), c.cyan], [act ? a : '', c.fg]]);
      });
      if (ctx.height > TIMERS.length + 2) w.put(0, ctx.height - 1, `${TIMERS.length} timers listed.`, c.fg);
    };
  },
};

export default [status, failed, pstree, timers];
