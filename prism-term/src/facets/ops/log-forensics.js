// Logs & Journals, by hand: grep and a uniq -c histogram chase a timeout spike through app logs, and
// coredumpctl (systemd v255) opens a crash record through its pager (less -FRSXMK: -S chops long lines
// with a standout '>', -M shows "lines a-b/n"). Every screen is a pure function of t % loop.
import { C, ATTR, writer, clock, blink, pad, lpad } from './_kit.js';
import { phase, cut, drawTranscript } from './_watch.js';
import { shellPrompt, typedLine } from './_shell.js';

const shared = { glyphs: 'ascii', color: '16' };

// ── grep: matches in GNU grep's default GREP_COLORS, then counts per minute ───────────────────
const GLOOP = 20;
const WEB = { host: 'web03', dir: '/var/log/app' };
const GREP_CMD = 'grep -rn -m3 --color timeout api.log api.log.1'; // -m3: the first three matches per file
const COUNT_CMD = 'zgrep -h timeout api.log* | cut -c12-16 | sort | uniq -c';
// [file, line, text before the match, text after]; every line fits 60 columns.
const MATCHES = [
  ['api.log', 211, '2026-10-13T13:59:41Z WARN upstream ', ' 30s'],
  ['api.log', 1874, '2026-10-13T14:00:12Z WARN upstream ', ' 30s'],
  ['api.log', 4209, '2026-10-13T14:01:00Z ERROR pool ', ' 5s'],
  ['api.log.1', 51377, '2026-10-13T13:41:02Z WARN read ', ' 10s'],
  ['api.log.1', 57120, '2026-10-13T13:46:55Z WARN read ', ' 10s'],
  ['api.log.1', 58904, '2026-10-13T13:52:18Z WARN upstream ', ''],
];
const COUNTS = [[1, '13:41'], [1, '13:46'], [3, '13:52'], [2, '13:57'], [4, '13:59'], [1, '14:00'], [187, '14:01'], [11, '14:02'], [3, '14:03']];
const G1 = 0.4, G1_OUT = 3.65, G2 = 8.0, G2_OUT = 12.05, G_CLEAR = 17.2, G_CLEARED = 17.8;

const grepFacet = {
  ...shared,
  id: 'ops-grep',
  since: '0.3.0',
  title: 'grep -rn',
  category: 'Logs & Journals',
  order: 200,
  description: 'Chasing a timeout spike through app logs by hand: grep -rn in GNU colors finds the first matches, then zgrep | cut | sort | uniq -c shows 187 of them in one minute.',
  tags: ['grep', 'zgrep', 'uniq', 'logs', 'forensics', 'timeout', 'shell', 'incident'],
  kind: 'tui',
  size: { w: 80, h: 16 },
  minSize: { w: 60, h: 6 },
  loop: GLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const match = ([file, n, pre, post]) => [[file, c.magenta], [':', c.cyan], [String(n), c.green], [':', c.cyan], [pre, c.fg], ['timeout', c.red, ATTR.BOLD], [post, c.fg]];
    return (t) => {
      const T = phase(t, GLOOP);
      if (T >= G_CLEARED) { drawTranscript(w, [shellPrompt(c, WEB, '', blink(T, 0.8))]); return; }
      const lines = [typedLine(c, WEB, GREP_CMD, T, G1, 15).parts];
      if (T >= G1_OUT) {
        lines.push(...MATCHES.map(match), typedLine(c, WEB, COUNT_CMD, T, G2, 16).parts);
        if (T >= G2_OUT) lines.push(...COUNTS.map(([n, hm]) => [[`${lpad(n, 7)} ${hm}`, c.fg]]), typedLine(c, WEB, 'clear', T, G_CLEAR, 14).parts);
      }
      drawTranscript(w, lines);
    };
  },
};

// ── coredumpctl: list the dumps, then info on the newest through the pager ───────────────────
const CLOOP = 22;
const IMG = { host: 'img02' };
const BOOT = '3f1c7a0e2b9d4c6e8a5f1b2d3c4e5f60';
const CRASH_US = `${Date.UTC(2026, 9, 13, 14, 1, 55) / 1000}000000`;
const LIST = [ // systemd's table: widths from content, PID/UID/GID/SIZE right-aligned, header underlined
  ['Tue 2026-10-13 13:52:07 UTC', '4127', '998', '998', 'SIGABRT', 'missing', '/usr/bin/resizer', '-'],
  ['Tue 2026-10-13 13:58:41 UTC', '4380', '998', '998', 'SIGSEGV', 'present', '/usr/bin/resizer', '1.2M'],
  ['Tue 2026-10-13 14:01:55 UTC', '4529', '998', '998', 'SIGSEGV', 'present', '/usr/bin/resizer', '1.3M'],
];
const HEAD = ['TIME', 'PID', 'UID', 'GID', 'SIG', 'COREFILE', 'EXE', 'SIZE'];
const RIGHT = new Set([1, 2, 3, 7]);
const COLW = HEAD.map((h, i) => Math.max(h.length, ...LIST.map((r) => r[i].length)));
const FRAMES = [ // elfutils frames, printed "#%-2u 0x%016x %s (%s + 0x%x)": [pc, symbol, module, offset]
  ['00007f3a2c1e8b4d', 'vips_region_fill', 'libvips.so.42', '1e8b4d'],
  ['00007f3a2c1e9f10', 'vips_region_prepare', 'libvips.so.42', '1e9f10'],
  ['000055d0c2a4b1e3', 'resize_tile', 'resizer', '81e3'],
  ['000055d0c2a4b9f0', 'worker_main', 'resizer', '89f0'],
  ['00007f3a2b894ac3', 'start_thread', 'libc.so.6', '94ac3'],
  ['00007f3a2b926850', '__clone3', 'libc.so.6', '126850'],
];
const L1 = 0.4, L1_OUT = 2.25, I_TYPE = 6.0, I_OPEN = 7.9, PAGE = 10.6, Q = 16.8, C_TYPE = 18.6, C_CLEARED = 19.2;

const coredumpctl = {
  ...shared,
  id: 'ops-coredumpctl',
  since: '0.3.0',
  title: 'coredumpctl info',
  category: 'Logs & Journals',
  order: 210,
  description: 'An image worker keeps crashing: coredumpctl list shows the dumps, then coredumpctl info pages through the newest record, SIGSEGV down to its stack trace.',
  tags: ['coredumpctl', 'systemd', 'coredump', 'segfault', 'stack-trace', 'crash', 'debugging', 'pager'],
  kind: 'tui',
  size: { w: 80, h: 18 },
  minSize: { w: 60, h: 8 },
  loop: CLOOP,
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const lab = (k) => [`${k.padStart(14)}: `, c.fg];
    const ind = ' '.repeat(16);
    const INFO = [
      [lab('PID'), ['4529', c.fg, ATTR.BOLD], [' (resizer)', c.fg]],
      [lab('UID'), ['998 (imgsvc)', c.fg]], [lab('GID'), ['998 (imgsvc)', c.fg]],
      [lab('Signal'), ['11 (SEGV)', c.fg]],
      [lab('Timestamp'), ['Tue 2026-10-13 14:01:55 UTC (23s ago)', c.fg]],
      [lab('Command Line'), ['/usr/bin/resizer --workers 4 --queue imgq', c.fg]],
      [lab('Executable'), ['/usr/bin/resizer', c.fg, ATTR.BOLD]],
      [lab('Control Group'), ['/system.slice/resizer.service', c.fg]], [lab('Unit'), ['resizer.service', c.fg]], [lab('Slice'), ['system.slice', c.fg]],
      [lab('Boot ID'), [BOOT, c.fg]], [lab('Machine ID'), ['9a8b7c6d5e4f30211234567890abcdef', c.fg]], [lab('Hostname'), ['img02', c.fg]],
      [lab('Storage'), [`/var/lib/systemd/coredump/core.resizer.998.${BOOT}.4529.${CRASH_US}.zst (present)`, c.fg]],
      [lab('Size on Disk'), ['1.3M', c.fg]], [lab('Package'), ['img-resizer/2.4.1-1', c.fg]], [lab('build-id'), ['4f0e7c3a9b2d81e6c5a7f3e2d1b0c9a8f7e6d5c4', c.fg]],
      [lab('Message'), ['Process 4529 (resizer) of user 998 dumped core.', c.fg]], [[ind, c.fg]],
      ...['resizer from deb img-resizer-2.4.1-1.amd64', 'libvips.so.42 from deb vips-8.15.1-1.1build4.amd64', 'libglib-2.0.so.0 from deb glib2.0-2.80.0-6ubuntu3.1.amd64',
        'libstdc++.so.6 from deb gcc-14-14-20240412-0ubuntu1.amd64', 'libc.so.6 from deb glibc-2.39-0ubuntu8.3.amd64'].map((m) => [[`${ind}Module ${m}`, c.fg]]),
      [[`${ind}Stack trace of thread 4531:`, c.fg]],
      ...FRAMES.map(([pc, fn, mod, off], i) => [[`${ind}#${String(i).padEnd(2)} 0x${pc} `, c.fg], [fn, c.fg], [` (${mod} + 0x${off})`, c.fg]]),
      [[`${ind}ELF object binary architecture: AMD x86-64`, c.fg]],
    ];
    const N = INFO.length, ROWS = H - 1, STACK = INFO.findIndex((l) => l[0][0].includes('Stack trace')) + 1;
    const maxTop = Math.max(1, N - ROWS + 1);
    const spaceTop = Math.min(1 + ROWS, maxTop);
    // One page forward reaches frames #0-#1 on a tall terminal; a short one searches for them instead.
    const search = spaceTop + ROWS - 1 < STACK + 2;
    const pageTop = search ? Math.min(STACK, maxTop) : spaceTop;
    const chop = (parts) => (parts.reduce((n, p) => n + String(p[0]).length, 0) > W ? [...cut(parts, W - 1), ['>', c.fg, ATTR.INVERSE]] : parts);
    const mark = (parts) => parts.flatMap(([s, ...rest]) => String(s).split(/(Stack)/).filter(Boolean).map((x) => (x === 'Stack' ? [x, c.fg, ATTR.INVERSE] : [x, ...rest])));
    const pageRows = (top, marked) => INFO.slice(top - 1, top - 1 + ROWS).map((l) => chop(marked ? mark(l) : l));
    const lessPrompt = (top) => { const bot = Math.min(N, top + ROWS - 1); return `lines ${top}-${bot}/${N} ${bot >= N ? '(END)' : `${Math.round((100 * bot) / N)}%`}`; };
    const table = [HEAD, ...LIST].map((r, ri) => {
      const cells = r.map((v, i) => (RIGHT.has(i) ? lpad(v, COLW[i]) : pad(v, COLW[i])));
      if (ri === 0) return chop([[cells.join(' '), c.fg, ATTR.UNDERLINE]]);
      return chop(cells.flatMap((v, i) => [[v, (r[5] === 'missing' && i === 5) || r[i] === '-' ? c.muted : c.fg], [i < cells.length - 1 ? ' ' : '', c.fg]]));
    });
    const screen = (rows, bottom) => { // the pager owns the whole terminal: content rows, then its prompt row
      rows.forEach((parts, y) => w.seg(0, y, parts));
      if (bottom) w.seg(0, H - 1, bottom);
    };
    return (t) => {
      const T = phase(t, CLOOP);
      if (T >= C_CLEARED) { drawTranscript(w, [shellPrompt(c, IMG, '', blink(T, 0.8))]); return; }
      if (T < I_OPEN) {
        const lines = [typedLine(c, IMG, 'sudo coredumpctl list', T, L1, 14).parts];
        if (T >= L1_OUT) lines.push(...table, typedLine(c, IMG, 'sudo coredumpctl info', T, I_TYPE, 14).parts);
        drawTranscript(w, lines);
        return;
      }
      const jumped = search ? T >= PAGE + 0.75 : T >= PAGE;
      const top = jumped ? pageTop : 1;
      if (T >= Q) { // q: less -X leaves its last page on screen and the shell prompt takes the bottom row
        screen(pageRows(top, search), typedLine(c, IMG, 'clear', T, C_TYPE, 14).parts);
        return;
      }
      const typing = search && T >= PAGE && !jumped ? `/${'Stack'.slice(0, Math.floor((T - PAGE) * 10))}` : null;
      screen(pageRows(top, search && jumped), typing !== null ? [[typing, c.fg], [' ', c.bg, 0, c.fg]] : [[lessPrompt(top), c.fg, ATTR.INVERSE]]);
    };
  },
};

export default [grepFacet, coredumpctl];
