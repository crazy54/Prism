// Login & MOTD: an ssh login with a landscape-style MOTD, a fastfetch-style card, a getty console login and fail2ban.
import { C, G, ATTR, writer, walk, typed, blink, clock, bashPrompt, session, drawSession, pad, fixed, uni } from './_kit.js';

/** Draw the last `H` of a list of rows ({ parts } or { prompt, cmd, cursor }) — a scrolling tty. */
function screen(w, ctx, rows, promptFn = bashPrompt) {
  const c = C(ctx);
  rows.slice(-ctx.height).forEach((r, y) => {
    if (r.parts) { w.seg(0, y, r.parts); return; }
    let x = promptFn(w, ctx, 0, y, r.prompt);
    x = w.put(x, y, r.cmd, c.fg);
    if (r.cursor) w.put(x, y, ' ', c.bg, c.fg);
  });
}

const motd = {
  id: 'ops-motd',
  title: 'SSH Login MOTD',
  category: 'Login & MOTD',
  description: 'ssh into a server and get the landscape-style MOTD: system load, disk, memory, processes, the IPv4 address, pending updates and a restart notice.',
  tags: ['motd', 'ssh', 'login', 'sysinfo', 'banner', 'updates'],
  kind: 'tui',
  size: { w: 80, h: 24 },
  minSize: { w: 60, h: 8 },
  loop: 18,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const local = { user: 'ops', host: 'ws-07' };
    return (t) => {
      const T = t % 18;
      const rows = [];
      const ssh = typed('ssh ops@node03.prod.example', T, 0.3, 22);
      rows.push({ prompt: local, cmd: ssh.text, cursor: !ssh.done || blink(T, 0.8) });
      if (!ssh.done || T < ssh.at + 1) { screen(w, ctx, rows); return; }
      const now = clock(Math.floor(ssh.at + 1));
      const load = fixed(0.38 + walk(ctx, 1, t, 0.2) * 0.1, 2);
      const banner = [
        [['Welcome to Sable Linux 26.04 LTS (GNU/Linux 6.8.0-45-generic x86_64)', c.fg, ATTR.BOLD]],
        [],
        [[' * Documentation:  https://docs.sable.example', c.fg]],
        [[' * Management:     https://manage.sable.example', c.fg]],
        [[' * Support:        https://help.sable.example', c.fg]],
        [],
        [[` System information as of ${now.day} ${now.mon} ${now.dd} ${now.hms} UTC 2026`, c.fg]],
        [],
        [[`  System load:  ${pad(load, 17)}  Processes:             213`, c.fg]],
        [['  Usage of /:   61.3% of 96.73GB   Users logged in:       1', c.fg]],
        [['  Memory usage: 38%                IPv4 address for eth0: 10.20.2.31', c.fg]],
        [['  Swap usage:   0%', c.fg]],
        [],
        [['12 updates can be applied immediately.', c.fg]],
        [['4 of these updates are standard security updates.', c.fg]],
        [['To see these additional updates run: apt list --upgradable', c.fg]],
        [],
        [['*** System restart required ***', c.yellow, ATTR.BOLD]],
        [['Last login: Tue Oct 13 09:41:57 2026 from 10.20.2.15', c.fg]],
      ];
      const shown = Math.min(banner.length, Math.floor((T - ssh.at - 1) * 70) + 1); // arrives in one quick burst
      rows[0].cursor = false;
      banner.slice(0, shown).forEach((parts) => rows.push({ parts }));
      if (shown === banner.length) {
        const after = session(ctx, T - (ssh.at + 1.6), [{ cmd: 'uptime', out: () => [[[` ${clock(Math.floor(T)).hms} up  4:48,  1 user,  load average: ${load}, 0.37, 0.31`, c.fg]]], dur: 30 }]);
        after.forEach((l) => rows.push(l.parts ? { parts: l.parts } : { prompt: {}, cmd: l.cmd, cursor: l.cursor }));
      }
      screen(w, ctx, rows);
    };
  },
};

const card = {
  id: 'ops-sysinfo-card',
  title: 'System Info Card',
  category: 'Login & MOTD',
  description: 'A fastfetch-style system card: an original ASCII prism splitting a beam into a spectrum, beside OS, kernel, uptime, CPU, memory, disk and IP.',
  tags: ['fastfetch', 'neofetch', 'sysinfo', 'ascii-art', 'logo', 'login'],
  kind: 'tui',
  size: { w: 80, h: 18 },
  minSize: { w: 44, h: 10 },
  loop: 12,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    const band = uni(ctx) ? '━' : '=';
    const SPECTRUM = [c.red, c.orange, c.yellow, c.green, c.blue, c.magenta];
    // Original art: a beam enters the left face, and a spectrum fans out of the right one.
    const drawLogo = (y0) => {
      const apex = 14;
      for (let r = 0; r < 12; r++) {
        const y = y0 + r;
        if (r === 0) { w.put(apex, y, '.', c.fg, undefined, ATTR.BOLD); continue; }
        if (r === 11) { w.put(apex - r, y, `/${'_'.repeat(2 * r - 1)}\\`, c.fg, undefined, ATTR.BOLD); }
        else { w.put(apex - r, y, '/', c.fg, undefined, ATTR.BOLD); w.put(apex + r, y, '\\', c.fg, undefined, ATTR.BOLD); }
        if (r === 5) { w.put(0, y, '_'.repeat(apex - r), c.fg, undefined, ATTR.BOLD); w.put(apex - r + 1, y, '-'.repeat(6), c.muted); }
        if (r === 6) w.put(apex - r + 8, y, '-'.repeat(4), c.muted); // the ray crosses the glass to the far face
        if (r >= 6) w.put(apex + r + 1, y, band.repeat(Math.max(0, 30 - (apex + r + 1))), SPECTRUM[r - 6], undefined, ATTR.BOLD);
      }
    };
    return (t) => {
      const T = t % 12;
      const ty = typed('fastfetch', T, 0.3, 14);
      let x = bashPrompt(w, ctx, 0, 0);
      x = w.put(x, 0, ty.text, c.fg);
      if (!ty.done || T < ty.at + 0.35) { w.put(x, 0, ' ', c.bg, c.fg); return; }
      const up = 4 * 60 + 48 + Math.floor(t / 60);
      const mem = 6.01 + walk(ctx, 3, t, 0.2) * 0.12;
      const info = [
        ['OS', 'Sable Linux 26.04 LTS x86_64'], ['Host', 'KVM/QEMU Standard PC (Q35 + ICH9, 2009)'], ['Kernel', 'Linux 6.8.0-45-generic'],
        ['Uptime', `${Math.floor(up / 60)} hours, ${up % 60} mins`], ['Packages', '1287 (dpkg)'], ['Shell', 'bash 5.2.21'], ['Terminal', '/dev/pts/0'],
        ['CPU', '8 x Virtual CPU @ 2.60 GHz'], ['Memory', `${fixed(mem, 2)} GiB / 15.61 GiB (${Math.round(mem / 15.61 * 100)}%)`],
        ['Swap', '0 B / 4.00 GiB (0%)'], ['Disk (/)', '59.31 GiB / 96.73 GiB (61%) - ext4'], ['Local IP (eth0)', '10.20.2.31/24'], ['Locale', 'C.UTF-8'],
      ];
      const logo = W >= 77 && H >= 13;
      const ix = logo ? 32 : 0;
      if (logo) drawLogo(1);
      const room = H - 1;
      const palette = room >= info.length + 4;
      const lines = Math.max(0, Math.min(info.length, room - 2 - (palette ? 2 : 0)));
      w.seg(ix, 1, [['ops', c.blue, ATTR.BOLD], ['@', c.fg], ['node03', c.blue, ATTR.BOLD]]);
      w.put(ix, 2, '-'.repeat(10), c.fg);
      info.slice(0, lines).forEach(([k, v], i) => w.seg(ix, 3 + i, [[k, c.blue, ATTR.BOLD], [': ', c.fg], [v, c.fg]]));
      if (palette) {
        let px = ix;
        for (const col of [c.dim, c.red, c.green, c.yellow, c.blue, c.magenta, c.cyan, c.fg]) px = w.put(px, 4 + lines, g.full.repeat(3), col);
      }
    };
  },
};

const getty = {
  id: 'ops-getty-login',
  title: 'Console Login',
  category: 'Login & MOTD',
  description: 'A tty1 console: the /etc/issue banner with hostname and addresses, a mistyped password and "Login incorrect", then a successful login.',
  tags: ['getty', 'console', 'login', 'issue', 'tty', 'banner'],
  kind: 'tui',
  size: { w: 80, h: 18 },
  minSize: { w: 64, h: 8 },
  loop: 22,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const issue = [
      [],
      [['Sable Linux 26.04 LTS node03 tty1', c.fg, ATTR.BOLD]],
      [],
      [['  +--------------------------------------------------------+', c.fg]],
      [['  |  node03.prod.example                                   |', c.fg]],
      [['  |  Authorized use only. All activity may be monitored.   |', c.fg]],
      [['  +--------------------------------------------------------+', c.fg]],
      [['  eth0: 10.20.2.31  fe80::5054:ff:fe3a:21c4', c.fg]],
      [],
    ];
    return (t) => {
      const T = t % 22;
      const rows = issue.map((parts) => ({ parts }));
      const cur = (on) => (on ? [[' ', c.bg, 0, c.fg]] : []);
      // [login typed at, password entered at, verdict at, ok]
      const tries = [[1.4, 4.2, 6.6, false], [8.6, 11.0, 12.4, true]];
      for (const [at, pw, verdict, ok] of tries) {
        const user = typed('ops', T, at, 7);
        const typing = T < at + 0.6;
        rows.push({ parts: [['node03 login: ', c.fg], [user.text, c.fg], ...cur(typing && blink(T, 0.8))] });
        if (typing) break;
        rows.push({ parts: [['Password: ', c.fg], ...cur(T < pw && blink(T, 0.8))] });
        if (T < verdict) break;
        if (!ok) { rows.push({ parts: [['Login incorrect', c.fg]] }, { parts: [] }); continue; }
        rows.push({ parts: [['Last login: Tue Oct 13 09:41:57 on tty1', c.fg]] });
        const sh = session(ctx, T - verdict - 0.4, [{ cmd: 'systemctl is-system-running', out: () => [[['degraded', c.yellow, ATTR.BOLD]]], dur: 30 }]);
        sh.forEach((l) => rows.push(l.parts ? { parts: l.parts } : { prompt: {}, cmd: l.cmd, cursor: l.cursor }));
      }
      screen(w, ctx, rows);
    };
  },
};

const f2b = {
  id: 'ops-fail2ban',
  title: 'fail2ban Jail',
  category: 'Login & MOTD',
  description: 'fail2ban-client status for the sshd jail (failed and banned counts, the banned IP list), an unban, and the status again as attempts keep coming.',
  tags: ['fail2ban', 'ssh', 'brute-force', 'ban', 'security', 'jail'],
  kind: 'tui',
  size: { w: 80, h: 18 },
  minSize: { w: 64, h: 8 },
  loop: 24,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const status = (failed, total, banned, list) => () => [
      [['Status for the jail: sshd', c.fg]],
      [['|- Filter', c.fg]],
      [['|  |- Currently failed: ', c.fg], [String(failed), c.fg, ATTR.BOLD]],
      [['|  |- Total failed:     ', c.fg], [String(total), c.fg, ATTR.BOLD]],
      [['|  `- Journal matches:  _SYSTEMD_UNIT=sshd.service + _COMM=sshd', c.fg]],
      [['`- Actions', c.fg]],
      [['   |- Currently banned: ', c.fg], [String(banned), c.fg, ATTR.BOLD]],
      [['   |- Total banned:     ', c.fg], ['212', c.fg, ATTR.BOLD]],
      [['   `- Banned IP list:   ', c.fg], [list.join(' '), c.fg]],
    ];
    const ips = ['203.0.113.77', '198.51.100.23', '192.0.2.140', '203.0.113.9'];
    return (t) => {
      const lines = session(ctx, t % 24, [
        { cmd: 'sudo fail2ban-client status sshd', out: status(3, 1287, 4, ips), dur: 4 },
        { cmd: 'sudo fail2ban-client set sshd unbanip 198.51.100.23', out: () => [[['1', c.fg]]], dur: 1.5 },
        { cmd: 'sudo fail2ban-client status sshd', out: status(4, 1292, 3, ips.filter((ip) => ip !== '198.51.100.23')), dur: 8 },
      ]);
      drawSession(w, ctx, lines, 0, 0, ctx.height);
    };
  },
};

export default [motd, card, getty, f2b];
