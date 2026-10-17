// Shell prompts: plain bash PS1, __git_ps1, powerline, exit-code prompts, a tmux status line and a two-line starship-style prompt.
import { C, G, ATTR, writer, walk, hash, typed, blink, clock, bashPrompt, session, drawSession, wrapParts, pad, lpad, fixed, uni } from './_kit.js';

const LS = [
  ['total 64'],
  ['drwxr-xr-x  7 ops ops 4096 Oct 13 13:58 ', '.', 'd'], ['drwxr-xr-x  5 ops ops 4096 Oct  9 11:20 ', '..', 'd'], ['drwxr-xr-x  8 ops ops 4096 Oct 13 13:58 ', '.git', 'd'],
  ['-rw-r--r--  1 ops ops  412 Oct  2 16:44 ', '.gitignore'], ['-rw-r--r--  1 ops ops 1931 Oct 13 13:41 ', 'Makefile'], ['-rw-r--r--  1 ops ops    7 Oct 13 13:41 ', 'VERSION'],
  ['drwxr-xr-x  4 ops ops 4096 Oct 12 18:03 ', 'cmd', 'd'], ['-rwxr-xr-x  1 ops ops 1288 Oct  6 09:12 ', 'deploy.sh', 'x'], ['drwxr-xr-x  2 ops ops 4096 Oct 13 13:41 ', 'internal', 'd'],
  ['lrwxrwxrwx  1 ops ops   17 Oct  6 09:12 ', 'logs', 'l', ' -> /var/log/shop'],
];

const bash = {
  id: 'ops-prompt-bash',
  title: 'bash Prompt',
  category: 'Shell Prompts',
  description: 'The classic user@host:dir$ bash prompt in green and blue: cd into a repo, a colored ls -la, cat a file, then a deploy script dry run.',
  tags: ['bash', 'ps1', 'prompt', 'shell', 'ls', 'session'],
  kind: 'tui',
  size: { w: 80, h: 16 },
  minSize: { w: 50, h: 5 },
  loop: 20,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const home = { dir: '~' }, repo = { dir: '~/src/shop-api' };
    const ls = () => LS.map(([meta, name, kind, rest]) => (name === undefined ? [[meta, c.fg]] : [[meta, c.fg], [name, kind === 'd' ? c.blue : kind === 'x' ? c.green : kind === 'l' ? c.cyan : c.fg, kind ? ATTR.BOLD : 0], [rest ?? '', c.fg]]));
    return (t) => {
      const lines = session(ctx, t % 20, [
        { cmd: 'cd ~/src/shop-api', out: () => [], dur: 0.3, prompt: home, after: repo },
        { cmd: 'ls -la', out: ls, dur: 2, prompt: repo },
        { cmd: 'cat VERSION', out: () => [[['2.14.1', c.fg]]], dur: 1, prompt: repo },
        { cmd: './deploy.sh --dry-run', prompt: repo, dur: 8,
          out: (s) => [['==> building shop-api 2.14.1', 0], ['==> would push registry.example/shop/api:2.14.1', 0.8], ['==> dry run: nothing changed', 1.4]].filter(([, at]) => s >= at).map(([m]) => [['==>', c.blue, ATTR.BOLD], [m.slice(3), c.fg, ATTR.BOLD]]) },
      ]);
      drawSession(w, ctx, lines, 0, 0, ctx.height);
    };
  },
};

/** bash with __git_ps1: `ops@node03:~/src/shop-api (main *+% u+1-2)$` with color hints. */
function gitPrompt(w, ctx, x, y, p = {}) {
  const c = C(ctx);
  x = w.seg(x, y, [['ops@node03', c.green, ATTR.BOLD], [':', c.fg], ['~/src/shop-api', c.blue, ATTR.BOLD], [' (', c.fg], [p.branch ?? 'main', c.green]]);
  const flags = [['*', c.red, p.dirty], ['+', c.green, p.staged], ['%', c.red, p.untracked]].filter((f) => f[2]);
  if (flags.length) x = w.seg(x, y, [[' ', c.fg], ...flags.map(([s, col]) => [s, col])]);
  if (p.up) x = w.put(x, y, ` ${p.up}`, c.fg);
  return w.put(x, y, ')$ ', c.fg);
}

const git = {
  id: 'ops-prompt-git',
  title: 'git Prompt',
  category: 'Shell Prompts',
  description: 'A __git_ps1 prompt tracking the repo: dirty *, staged +, untracked %, and upstream u+1 / u+2-1 / u= as files are staged, committed, rebased and pushed.',
  tags: ['git', 'prompt', 'ps1', 'branch', 'ahead-behind', 'bash'],
  kind: 'tui',
  size: { w: 80, h: 16 },
  minSize: { w: 60, h: 5 },
  loop: 26,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const P = {
      s0: { dirty: 1, untracked: 1, up: 'u+1' }, s1: { staged: 1, untracked: 1, up: 'u+1' }, s2: { untracked: 1, up: 'u+2' },
      s3: { untracked: 1, up: 'u+2-1' }, s4: { untracked: 1, up: 'u+2' }, s5: { untracked: 1, up: 'u=' },
    };
    const status = () => [
      [['## ', c.fg], ['main', c.green], ['...', c.fg], ['origin/main', c.red], [' [ahead 1]', c.fg]],
      [[' M', c.red], [' internal/cart/retry.go', c.fg]],
      [[' M', c.red], [' internal/cart/retry_test.go', c.fg]],
      [['??', c.red], [' notes.txt', c.fg]],
    ];
    return (t) => {
      const lines = session(ctx, t % 26, [
        { cmd: 'git status -sb', out: status, dur: 2, prompt: P.s0 },
        { cmd: 'git add internal/', out: () => [], dur: 0.4, prompt: P.s0, after: P.s1 },
        { cmd: 'git commit -qm "cart: cap retry backoff at 30s"', out: () => [], dur: 0.6, prompt: P.s1, after: P.s2 },
        { cmd: 'git fetch -q', out: () => [], dur: 1.2, wait: 0.8, prompt: P.s2, after: P.s3 },
        { cmd: 'git pull --rebase -q', out: () => [], dur: 0.8, wait: 0.6, prompt: P.s3, after: P.s4 },
        { cmd: 'git push -q', out: () => [], dur: 8, wait: 1.1, prompt: P.s4, after: P.s5 },
      ]);
      drawSession(w, ctx, lines, 0, 0, ctx.height, gitPrompt);
    };
  },
};

/**
 * Powerline: colored segments joined by arrow separators. The real U+E0B0 arrow and
 * U+E0A0 branch glyph live in Powerline/Nerd fonts only, so they're opt-in (--set nerd=1);
 * the default uses ▶, which every monospace font has, and ASCII mode uses ">".
 */
function powerline(w, ctx, x, y, p = {}) {
  const c = C(ctx), g = G(ctx);
  const nerd = uni(ctx) && ctx.param('nerd', 0) > 0;
  const sep = nerd ? g.pl : uni(ctx) ? '▶' : '>';
  const segs = [];
  if (p.err) segs.push([` ${uni(ctx) ? '✘' : 'x'} ${p.err} `, c.bg, c.red]);
  segs.push([' ops@node03 ', c.bg, c.blue], [' ~/src/shop-api ', c.fg, c.panel2]);
  segs.push([` ${nerd ? `${g.branchIcon} ` : ''}main${p.dirty ? ' ±' : ''} `, c.bg, p.dirty ? c.yellow : c.green]);
  segs.forEach(([text, fg, bg], i) => {
    x = w.put(x, y, text, fg, bg, ATTR.BOLD);
    const next = segs[i + 1]?.[2];
    x = w.put(x, y, sep, bg, next);
  });
  return w.put(x, y, ' ', c.fg);
}

const pl = {
  id: 'ops-prompt-powerline',
  title: 'Powerline Prompt',
  category: 'Shell Prompts',
  description: 'A powerline prompt of colored segments (user@host, path, git branch going dirty and clean) plus a red exit-code segment after a failing make lint.',
  tags: ['powerline', 'prompt', 'segments', 'git', 'exit-code', 'nerd-font'],
  kind: 'tui',
  size: { w: 80, h: 14 },
  minSize: { w: 60, h: 5 },
  loop: 22,
  glyphs: 'ascii',
  color: '256',
  params: { nerd: { default: 0, min: 0, max: 1, label: 'Powerline font glyphs' } },
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const clean = {}, dirty = { dirty: 1 }, failed = { dirty: 1, err: 2 };
    return (t) => {
      const lines = session(ctx, t % 22, [
        { cmd: 'make test', prompt: dirty, dur: 2.2, wait: 0.3,
          out: (s) => [['ok  \tshop/api/internal/cart     \t0.412s', 0.3], ['ok  \tshop/api/internal/checkout \t1.208s', 1.1]].filter(([, at]) => s >= at).map(([m]) => [['ok', c.green, ATTR.BOLD], [m.slice(2).replace(/\t/g, '  '), c.fg]]) },
        { cmd: 'make lint', prompt: dirty, after: failed, dur: 2.4, wait: 0.6,
          out: () => [[['internal/cart/retry.go:42:2: ', c.fg, ATTR.BOLD], ['ineffectual assignment to err (ineffassign)', c.fg]], [['make: *** [Makefile:18: lint] Error 1', c.red]]] },
        { cmd: 'git stash -q', prompt: failed, after: clean, dur: 8, out: () => [] },
      ]);
      drawSession(w, ctx, lines, 0, 0, ctx.height, powerline);
    };
  },
};

/** `✓ [ops@node03 ~]$` or `✗ 127 [ops@node03 ~]$` — PS1 showing the last exit status. */
function exitPrompt(w, ctx, x, y, p = {}) {
  const c = C(ctx), g = G(ctx);
  if (!uni(ctx)) x = w.put(x, y, `[${p.code ?? 0}] `, p.code ? c.red : c.green, undefined, ATTR.BOLD); // the 7-bit spelling: [0] / [127]
  else x = p.code ? w.put(x, y, `${g.bad} ${p.code} `, c.red, undefined, ATTR.BOLD) : w.put(x, y, `${g.ok} `, c.green, undefined, ATTR.BOLD);
  return w.seg(x, y, [['[', c.fg], ['ops@node03', c.fg, ATTR.BOLD], [' ~]$ ', c.fg]]);
}

const exit = {
  id: 'ops-prompt-exitcode',
  title: 'Exit-Code Prompt',
  category: 'Shell Prompts',
  description: 'A prompt that shows the last exit status: a typo gives ✗ 127, Ctrl-C gives ✗ 130, curl -f gives ✗ 22, and a clean run gives a green ✓.',
  tags: ['prompt', 'exit-code', 'ps1', 'bash', 'troubleshooting', 'curl'],
  kind: 'tui',
  size: { w: 80, h: 14 },
  minSize: { w: 60, h: 5 },
  loop: 24,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const ok = {}, e = (code) => ({ code });
    return (t) => {
      const lines = session(ctx, t % 24, [
        { cmd: 'kubeclt get pods -n shop', prompt: ok, after: e(127), dur: 1, out: () => [[['bash: kubeclt: command not found', c.fg]]] },
        { cmd: 'kubectl get pods -n shop | grep -c Running', prompt: e(127), after: ok, dur: 1, wait: 0.5, out: () => [[['5', c.fg]]] },
        { cmd: 'sleep 30', prompt: ok, after: e(130), dur: 0.8, wait: 1.6, out: () => [[['^C', c.fg]]] },
        { cmd: 'curl -sf https://api.example/healthz', prompt: e(130), after: e(22), dur: 1, wait: 0.7, out: () => [] },
        { cmd: "curl -s -o /dev/null -w '%{http_code}\\n' https://api.example/healthz", prompt: e(22), after: ok, dur: 8, wait: 0.6, out: () => [[['503', c.fg, ATTR.BOLD]]] },
      ], { cps: 26 });
      drawSession(w, ctx, lines, 0, 0, ctx.height, exitPrompt);
    };
  },
};

const tmux = {
  id: 'ops-tmux-status',
  title: 'tmux Session',
  category: 'Shell Prompts',
  description: 'A tmux window split in two: a log tail above, a shell below, a green active-pane border, and the status line with windows, flags and a clock.',
  tags: ['tmux', 'status-line', 'panes', 'multiplexer', 'session', 'windows'],
  kind: 'tui',
  size: { w: 80, h: 20 },
  minSize: { w: 50, h: 8 },
  loop: 30,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx), g = G(ctx);
    const W = ctx.width, H = ctx.height;
    const LOG = [['INFO ', 'GET /api/v1/cart 200 18ms'], ['INFO ', 'POST /api/v1/checkout 201 142ms'], ['INFO ', 'GET /api/v1/products?page=2 200 31ms'],
      ['WARN ', 'pool: waited 412ms for a connection'], ['INFO ', 'GET /healthz 200 1ms'], ['ERROR', 'payments.internal.example: context deadline exceeded']];
    return (t) => {
      const T = t % 30;
      const topH = Math.max(2, Math.floor((H - 2) / 2)), sepY = topH, botY = sepY + 1, botH = H - 1 - botY;
      // top pane: tail -f, one line every ~0.6 s
      const n = Math.floor(t / 0.6) + 40;
      for (let k = 0; k < topH; k++) {
        const i = n - topH + 1 + k;
        const pick = hash(i, 4) > 0.97 ? 5 : hash(i, 5) > 0.9 ? 3 : [0, 1, 2, 4][Math.floor(hash(i, 6) * 4)];
        const [lvl, msg] = LOG[pick];
        w.seg(0, k, [[clock(i * 0.6 - 24).hms + ' ', c.muted], [lvl, lvl === 'ERROR' ? c.red : lvl === 'WARN ' ? c.yellow : c.green, ATTR.BOLD], [` ${msg}`, c.fg]]);
      }
      w.hline(0, sepY, W, g.h, c.green); // active pane (below) gets the green border
      const lines = session(ctx, T, [
        { cmd: 'kubectl -n shop get deploy api', dur: 3, out: () => [[['NAME   READY   UP-TO-DATE   AVAILABLE   AGE', c.fg]], [['api    5/5     5            5           41d', c.fg]]] },
        { cmd: 'kubectl -n shop rollout restart deploy/api', dur: 20, out: () => [[['deployment.apps/api restarted', c.fg]]] },
      ]);
      drawSession(w, ctx, lines, 0, botY, botH);
      // status line, tmux defaults: green bar, [session] windows on the left, "title" time date on the right
      const y = H - 1;
      w.rowBg(y, c.green, 0, W);
      const act = T > 9; // window 2 had output: tmux flags it # and shows it reversed
      const x = w.seg(0, y, [['[prod] ', c.bg, 0, c.green], ['0:logs-', c.bg, 0, c.green], [' ', c.bg, 0, c.green], ['1:shell*', c.bg, ATTR.BOLD, c.green], [' ', c.bg, 0, c.green], [`2:deploy${act ? '#' : ''}`, act ? c.green : c.bg, 0, act ? c.bg : c.green]]);
      const now = clock(Math.floor(t));
      const right = `"node03" ${now.hm} ${now.dd}-${now.mon}-26`;
      if (W - right.length > x + 1) w.right(W, y, right, c.bg, c.green);
    };
  },
};

/** Starship-style two-line prompt: modules on the first line, ❯ on the second. */
function starRows(ctx, p, cmd, cursor) {
  const c = C(ctx);
  const u = uni(ctx);
  const info = [];
  if (p.kube) info.push([`kube ${p.kube}`, p.kube.startsWith('prod') ? c.red : c.blue, ATTR.BOLD], [' (shop)', c.blue, ATTR.BOLD], [' in ', c.fg]);
  info.push([p.dir ?? 'shop-api', c.cyan, ATTR.BOLD]);
  info.push([' on ', c.fg], [`git:${p.branch ?? 'main'}`, c.magenta, ATTR.BOLD]);
  if (p.git) info.push([` [${p.git}]`, c.red, ATTR.BOLD]);
  if (p.go) info.push([' via ', c.fg], ['go v1.23.2', c.cyan, ATTR.BOLD]);
  if (p.py) info.push([' via ', c.fg], ['py v3.12.4 (.venv)', c.yellow, ATTR.BOLD]);
  if (p.took) info.push([' took ', c.fg], [p.took, c.yellow, ATTR.BOLD]);
  const chr = [[u ? '❯' : '>', p.err ? c.red : c.green, ATTR.BOLD], [' ', c.fg], [cmd, c.fg]];
  if (cursor) chr.push([' ', c.bg, 0, c.fg]);
  return [[], info, chr];
}

const star = {
  id: 'ops-prompt-starship',
  title: 'Starship-Style Prompt',
  category: 'Shell Prompts',
  description: 'A two-line starship-style prompt: kube context (red for prod), repo, git branch and status, toolchain versions, command duration, then ❯.',
  tags: ['starship', 'prompt', 'kubernetes', 'git', 'two-line', 'zsh'],
  kind: 'tui',
  size: { w: 80, h: 16 },
  minSize: { w: 60, h: 6 },
  loop: 26,
  glyphs: 'ascii',
  color: '256',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const ahead = uni(ctx) ? '⇡1' : '^1';
    const s0 = { kube: 'prod-east', git: `!?${ahead}`, go: 1 };
    const s1 = { ...s0, took: '4s' };
    const s2 = { ...s0, kube: 'staging-west' };
    const s3 = { kube: 'staging-west', dir: 'infra', branch: 'feat/vpc', git: '?', py: 1 };
    return (t) => {
      const lines = session(ctx, t % 26, [
        { cmd: 'go test ./...', prompt: s0, after: s1, dur: 3.8, wait: 0.2,
          out: (s) => [['ok  \tshop/api/internal/cart     \t0.412s', 1.2], ['ok  \tshop/api/internal/checkout \t1.208s', 3.6]].filter(([, at]) => s >= at).map(([m]) => [['ok', c.green, ATTR.BOLD], [m.slice(2).replace(/\t/g, '  '), c.fg]]) },
        { cmd: 'kubectl config use-context staging-west', prompt: s1, after: s2, dur: 1.4, out: () => [[['Switched to context "staging-west".', c.fg]]] },
        { cmd: 'cd ../infra && source .venv/bin/activate', prompt: s2, after: s3, dur: 8, out: () => [] },
      ], { cps: 24 });
      const rows = [];
      for (const l of lines) {
        if (l.parts) rows.push(l.parts);
        else rows.push(...starRows(ctx, l.prompt ?? {}, l.cmd, l.cursor));
      }
      const vis = rows.slice(-ctx.height);
      if (vis.length && !vis[0].length) vis.shift();
      vis.forEach((parts, y) => w.seg(0, y, parts));
    };
  },
};

export default [bash, git, pl, exit, tmux, star];
