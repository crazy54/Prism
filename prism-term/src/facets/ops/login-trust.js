// Login & MOTD: ssh's client-side trust check (OpenSSH 9.6 text, Debian's ssh-keygen hint) after a server
// rebuild, and who is on a shared box under `watch -d w` (procps-ng 4.0.4 columns and time formats).
// Every screen is a pure function of t % loop.
import { C, ATTR, writer, clock, blink, wrapParts, hash, pad, lpad } from './_kit.js';
import { phase, watchTitle, drawTranscript } from './_watch.js';
import { shellPrompt, typedLine } from './_shell.js';

const shared = { glyphs: 'ascii', color: '16' };

// ── ssh host key changed: the @@@ wall, ssh-keygen -R, trust the new key, log in and out ──────
const SLOOP = 24;
const LOCAL = { host: 'ws-ops' };
const KH = '/home/ops/.ssh/known_hosts';
const FP = 'SHA256:Xq3b9Ve2tKpN7mLr0Yd5Hc8Wj1Fs6Ga4Ou2Zi9Te3Qs';
const BOX = '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@';
const S1 = 0.3, S1_OUT = 1.4, KG = 7.8, KG_OUT = 9.25, S2 = 10.8, S2_ASK = 11.9, YES = 13.6, ADDED = 14.2, LOGIN = 14.6;
const EXIT = 16.4, CLOSED = 17.0, S_CLEAR = 21.2, S_CLEARED = 21.8;

const sshHostkey = {
  ...shared,
  id: 'ops-ssh-hostkey',
  since: '0.3.0',
  title: 'SSH Host Key Changed',
  category: 'Login & MOTD',
  order: 200,
  description: "ssh into a rebuilt server and hit OpenSSH's REMOTE HOST IDENTIFICATION HAS CHANGED wall, clear the old key with ssh-keygen -R, accept the new fingerprint, log in and log out.",
  tags: ['ssh', 'openssh', 'known_hosts', 'host-key', 'fingerprint', 'ssh-keygen', 'security', 'login'],
  kind: 'tui',
  size: { w: 80, h: 20 },
  minSize: { w: 60, h: 8 },
  loop: SLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const REMOTE = { host: 'db01', hostColor: c.yellow };
    const red = (s) => [[s, c.red, ATTR.BOLD]], ink = (s) => [[s, c.fg]];
    const WARNING = [red(BOX), red('@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @'), red(BOX),
      ink('IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!'),
      ink('Someone could be eavesdropping on you right now (man-in-the-middle attack)!'),
      ink('It is also possible that a host key has just been changed.'),
      ink('The fingerprint for the ED25519 key sent by the remote host is'), [[`${FP}.`, c.muted]],
      ink('Please contact your system administrator.'),
      ink(`Add correct host key in ${KH} to get rid of this message.`),
      ink(`Offending ED25519 key in ${KH}:14`), ink('  remove with:'), ink(`  ssh-keygen -f '${KH}' -R 'db01'`),
      ink('Host key for db01 has changed and you have requested strict checking.'), red('Host key verification failed.')];
    const transcript = (T) => {
      const lines = [typedLine(c, LOCAL, 'ssh db01', T, S1, 12).parts];
      if (T < S1_OUT) return { lines };
      const box = lines.length;
      lines.push(...WARNING, typedLine(c, LOCAL, 'ssh-keygen -R db01', T, KG, 14).parts);
      if (T < KG_OUT) return { lines, box: T < KG ? box : -1 };
      lines.push(ink('# Host db01 found: line 14'), ink(`${KH} updated.`), ink(`Original contents retained as ${KH}.old`),
        typedLine(c, LOCAL, 'ssh db01', T, S2, 12).parts);
      if (T < S2_ASK) return { lines };
      const yes = T < YES ? '' : 'yes'.slice(0, Math.floor((T - YES) * 8));
      lines.push(ink("The authenticity of host 'db01 (10.0.3.21)' can't be established."), [['ED25519 key fingerprint is ', c.fg], [`${FP}.`, c.muted]],
        ink('This key is not known by any other names.'),
        [['Are you sure you want to continue connecting (yes/no/[fingerprint])? ', c.fg], [yes, c.fg], ...(yes.length < 3 && blink(T, 0.8) ? [[' ', c.bg, 0, c.fg]] : [])]);
      if (T < ADDED) return { lines };
      lines.push(ink("Warning: Permanently added 'db01' (ED25519) to the list of known hosts."));
      if (T < LOGIN) return { lines };
      lines.push(ink('Last login: Tue Oct 13 13:58:12 2026 from 10.0.3.5'), typedLine(c, REMOTE, 'exit', T, EXIT, 10).parts);
      if (T < CLOSED) return { lines };
      lines.push(ink('logout'), ink('Connection to db01 closed.'), typedLine(c, LOCAL, 'clear', T, S_CLEAR, 14).parts);
      return { lines };
    };
    return (t) => {
      const T = phase(t, SLOOP);
      if (T >= S_CLEARED) { drawTranscript(w, [shellPrompt(c, LOCAL, '', blink(T, 0.8))]); return; }
      const { lines, box = -1 } = transcript(T);
      // While the warning holds, a short terminal stays scrolled back on the top of the @ box.
      if (box >= 0) {
        const rows = lines.flatMap((l) => wrapParts(l, W)), top = lines.slice(0, box).flatMap((l) => wrapParts(l, W)).length;
        if (rows.length - top > H) { rows.slice(top, top + H).forEach((parts, y) => w.seg(0, y, parts)); return; }
      }
      drawTranscript(w, lines);
    };
  },
};

// ── w under watch -d: who is on, from where, idle how long, running what ─────────────────────
const WLOOP = 30;
const BOX_HOST = 'shell01';
const z2 = (n) => String(n).padStart(2, '0');
/** procps print_time_ival7: 7 columns, days from 48 h, h:mm"m" from 1 h, m:ss past a minute, else s.cs. */
const ival7 = (t, cs = 0) => (t >= 172800 ? ` ${lpad(Math.floor(t / 86400), 2)}days`
  : t >= 3600 ? ` ${lpad(Math.floor(t / 3600), 2)}:${z2(Math.floor(t / 60) % 60)}m`
    : t > 60 ? ` ${lpad(Math.floor(t / 60), 2)}:${z2(Math.floor(t) % 60)} `
      : ` ${lpad(Math.floor(t), 2)}.${z2(cs)}s`);
const cpu = (t) => ival7(t, Math.round((t % 1) * 100) % 100);
// ana's visit: [from s, to s, WHAT, idle at entry, idle grows?]. She cd's to /etc/nginx first, so each command
// fits the 15 columns w leaves WHAT at 80 (the reload cuts to "sudo nginx -s r", as w itself cuts it).
const ANA = [[4, 7, '-bash', 0, false], [7, 13, 'vim nginx.conf', 0, false], [13, 16, 'sudo nginx -t', 0, false], [16, 17, 'sudo nginx -s reload', 0, false], [17, 22, '-bash', 0, true]];
const LOAD = [[0.42, 0.37, 0.31], [0.45, 0.38, 0.31], [0.51, 0.39, 0.32], [0.47, 0.39, 0.32], [0.44, 0.38, 0.32], [0.41, 0.38, 0.31]];

const wFacet = {
  ...shared,
  id: 'ops-w',
  since: '0.3.0',
  title: 'w',
  category: 'Login & MOTD',
  order: 210,
  description: 'watch -d w on a shared box: who is on, from where, idle how long and running what, as a colleague logs in, edits nginx.conf, reloads it and leaves.',
  tags: ['w', 'who', 'sessions', 'tty', 'idle', 'uptime', 'watch', 'users'],
  kind: 'tui',
  size: { w: 80, h: 10 },
  minSize: { w: 56, h: 6 },
  loop: WLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const full = W >= 76; // w cuts WHAT to COLUMNS-65, so narrower panes watch `w -s`
    const head = H >= 8, y0 = head ? 2 : 0;
    const what = full ? W - 65 : W - 45;
    // The screen w prints at refresh s, as plain rows plus the columns that render muted.
    const screen = (s) => {
      const ana = ANA.find(([a, b]) => s >= a && s < b);
      const users = ana ? 4 : 3, [l1, l5, l15] = LOAD[Math.floor(s / 5)];
      const rows = [` ${clock(s).hms} up 41 days,  3:07, ${lpad(users, 2)} users,  load average: ${l1.toFixed(2)}, ${l5.toFixed(2)}, ${l15.toFixed(2)}`,
        `${pad('USER', 8)} TTY      ${pad('FROM', 15)}${full ? '  LOGIN@   IDLE   JCPU   PCPU WHAT' : '   IDLE WHAT'}`];
      const sess = [
        ['root', 'tty1', '-', ' 02Sep26', 41 * 86400 + 11200 + s, 0.04, 0.04, '-bash'],
        ['deploy', 'pts/1', '10.0.3.9', ' 09:12  ', 8045 + s, 1.03, 0.98, 'tail -f api.log'],
        ['ops', 'pts/0', '10.0.3.5', ' 13:47  ', (s + 3) % 8, 0.21 + 0.013 * s, 0.03 + 0.002 * s, `watch -d -n1 w${full ? '' : ' -s'}`], // tty times move in 8 s steps
      ];
      if (ana) {
        const [a, , cmd, idle0, grows] = ana, k = s - 4;
        const idle = grows ? idle0 + (s - a) : Math.round(hash(s, 61) * 1.4);
        sess.push(['ana', 'pts/2', '10.0.3.14', ' 14:02  ', idle, 0.02 + 0.017 * k, cmd === '-bash' ? 0.01 : 0.02 + 0.008 * (s - a), cmd]);
      }
      const muted = [];
      for (const [u, tty, from, login, idle, jc, pc, cmd] of sess) {
        const row = full ? `${pad(u, 9)}${pad(tty, 9)}${pad(from, 16)}${login}${ival7(idle)}${cpu(jc)}${cpu(pc)} ${cmd.slice(0, what)}`
          : `${pad(u, 9)}${pad(tty, 9)}${pad(from, 16)}${ival7(idle)} ${cmd.slice(0, what)}`;
        if (idle >= 86400) muted.push([rows.length, full ? 42 : 34, 7]);
        rows.push(row);
      }
      return { rows, muted };
    };
    return (t) => {
      const s = Math.floor(phase(t, WLOOP));
      const now = screen(s), prev = screen((s + WLOOP - 1) % WLOOP); // watch -d marks what changed since the last refresh
      if (head) watchTitle(w, c, 0, 1, full ? 'w' : 'w -s', BOX_HOST, s);
      // Every cell is compared across the full width, blanks included: a vanished row flashes for one refresh.
      for (let i = 0; i < Math.max(now.rows.length, prev.rows.length) && y0 + i < H; i++) {
        const row = now.rows[i] ?? '', was = prev.rows[i] ?? '', mute = now.muted.find(([r]) => r === i);
        const parts = [];
        for (let x = 0; x < W; x++) {
          const ch = row[x] ?? ' ', changed = ch !== (was[x] ?? ' ');
          const fg = mute && x >= mute[1] && x < mute[1] + mute[2] ? c.muted : c.fg;
          const attr = (i === 1 ? ATTR.BOLD : 0) | (changed ? ATTR.INVERSE : 0);
          const last = parts.at(-1);
          if (last && last[1] === fg && last[2] === attr) last[0] += ch; else parts.push([ch, fg, attr]);
        }
        while (parts.length && !(parts.at(-1)[2] & ATTR.INVERSE) && !parts.at(-1)[0].trim()) parts.pop();
        w.seg(0, y0 + i, parts);
      }
    };
  },
};

export default [sshHostkey, wFacet];
