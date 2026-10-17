// Status Lines: a vim statusline over a live buffer, a tmux session with its
// status bar, and a powerline prompt with git and kube segments.
import { mix } from '../../color.js';
import { glyphs, put, putR, safe, ATTR } from '../charts/_data.js';
import { tail, stamp, levelColor } from './_logs.js';

const KW = new Set(['export', 'async', 'function', 'const', 'let', 'while', 'if', 'throw', 'new', 'await', 'return']);

/** Minimal JS-ish highlighter: keywords, numbers, strings, calls, punctuation. */
function code(b, x, y, src, w, th, bg) {
  const re = /(\s+)|([A-Za-z_$][\w$]*)|(\d+)|('[^']*')|(.)/g;
  let m, cx = x;
  while ((m = re.exec(src)) && cx < x + w) {
    const [tok, ws, id, n, str] = m;
    let c = th.ink;
    if (ws) c = th.ink;
    else if (id) c = KW.has(id) ? th.accent : src[re.lastIndex] === '(' ? th.info : th.ink;
    else if (n) c = th.warn;
    else if (str) c = th.pos;
    else c = th.muted;
    cx = put(b, cx, y, tok, x + w - cx, c, bg, id && KW.has(id) ? ATTR.BOLD : 0);
  }
  return cx;
}

const SRC = [
  'export async function acquire(pool, ms = 2000) {',
  '  const started = performance.now();',
  '  while (pool.inUse >= pool.size) {',
  '    if (performance.now() - started > ms) throw new PoolTimeout(pool.name);',
  '    await sleep(5);',
  '  }',
  '  pool.inUse++;',
  '  return lease(pool);',
  '}',
];
const TYPED = '    metrics.waiting.inc(pool.name);';

// [start, mode, cursor line (0-based into the shown buffer), command line text]
const SCRIPT = [
  [0, 'NORMAL', 1], [0.6, 'NORMAL', 2], [1.2, 'NORMAL', 3], [1.8, 'NORMAL', 4],
  [2.4, 'INSERT', 4], [7.4, 'NORMAL', 4], [8.2, 'COMMAND', 4], [9.4, 'WRITTEN', 4], [11.2, 'VISUAL', 6],
];

const vimLine = {
  id: 'status-vim-line',
  title: 'Vim Statusline',
  category: 'Status Lines',
  description: 'A lightline-style vim statusline over a live buffer: modes change, text is typed in, :w writes and the ruler follows the cursor.',
  tags: ['vim', 'statusline', 'lightline', 'editor', 'modes'],
  kind: 'widget',
  size: { w: 80, h: 9 },
  minSize: { w: 40, h: 3 },
  loop: 13,
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const modeColor = { NORMAL: th.accent, INSERT: th.pos, VISUAL: th.warn, COMMAND: th.info, WRITTEN: th.accent };
    const body = Math.max(0, H - 2), FIRST = 38;
    const sep = g.u ? '│' : '|';
    return (t) => {
      const lt = t % 13;
      let step = SCRIPT[0];
      for (const s of SCRIPT) if (lt >= s[0]) step = s;
      const [, mode, cur0] = step;
      // While inserting, a new line grows below the cursor line.
      const inserted = lt >= 2.4;
      const typedN = inserted ? Math.min(TYPED.length, Math.floor((lt - 2.4) * 9)) : 0;
      const lines = inserted ? [...SRC.slice(0, 4), TYPED.slice(0, Math.max(4, typedN)), ...SRC.slice(4)] : SRC;
      const cur = Math.min(lines.length - 1, cur0);
      const col = mode === 'INSERT' ? Math.max(4, typedN) : mode === 'VISUAL' ? 2 : 4;
      const top = Math.max(0, Math.min(lines.length - body, cur - Math.floor(body / 2)));
      const gutter = 5;
      for (let r = 0; r < body; r++) {
        const li = top + r;
        if (li >= lines.length) { b.text(0, r, '~', th.dim); continue; }
        const n = FIRST + li;
        const rowBg = li === cur ? mix(th.bg, th.line, 0.35) : undefined;
        if (rowBg) for (let x = 0; x < W; x++) b.set(x, r, ' ', undefined, rowBg);
        b.text(0, r, String(n).padStart(gutter - 1), li === cur ? th.warn : th.dim, rowBg, li === cur ? ATTR.BOLD : 0);
        const selected = mode === 'VISUAL' && li >= 6 && li <= cur;
        code(b, gutter, r, lines[li], W - gutter, th, selected ? mix(th.bg, th.warn, 0.3) : rowBg);
        if (n === 41 && W >= 50) b.set(gutter - 1, r, g.u ? '▲' : 'W', th.warn, rowBg);
        if (li === cur) {
          const cx = gutter + col;
          const ch = lines[li][col] ?? ' ';
          if (mode === 'INSERT') b.set(cx, r, g.u ? '▏' : '|', th.ink, rowBg);
          else b.set(cx, r, ch, th.bg, th.ink);
        }
      }
      // Statusline.
      const y = H - (H >= 3 ? 2 : 1), mc = modeColor[mode];
      const barBg = mix(th.bg, th.panel2 ?? th.line, 0.9), midBg = mix(th.bg, th.line, 0.7);
      for (let x = 0; x < W; x++) b.set(x, y, ' ', undefined, barBg);
      const label = mode === 'WRITTEN' ? 'NORMAL' : mode;
      let x = b.text(0, y, ` ${label} `, th.bg, mc, ATTR.BOLD);
      x = b.text(x, y, ` ${g.u ? '⎇' : 'git:'} main `, th.ink, midBg);
      const dirty = inserted && lt < 9.4;
      x = b.text(x, y, ` src/pool.js${dirty ? ' [+]' : ''} `, th.ink, barBg, ATTR.BOLD);
      if (W >= 60) {
        x = b.text(x, y, ` ${g.cross} 0 `, th.dim, barBg);
        x = b.text(x, y, `${g.warn} 1 `, th.warn, barBg);
      }
      const pct = Math.round(((FIRST + cur) / 96) * 100);
      const right = W >= 64 ? ` utf-8 ${sep} unix ${sep} javascript ` : W >= 48 ? ' javascript ' : '';
      const ruler = ` ${String(FIRST + cur).padStart(3)}:${String(col + 1).padEnd(2)} `, pc = ` ${String(pct).padStart(3)}% `;
      let rx = W - ruler.length;
      b.text(rx, y, ruler, th.bg, mc, ATTR.BOLD);
      if (rx - pc.length > x + 1) { rx -= pc.length; b.text(rx, y, pc, th.ink, midBg); }
      if (right && rx - right.length > x + 1) b.text(rx - right.length, y, right, th.muted, barBg);
      // Command line.
      if (H >= 3) {
        const cy = H - 1;
        if (mode === 'INSERT') b.text(0, cy, '-- INSERT --', th.ink, undefined, ATTR.BOLD);
        else if (mode === 'VISUAL') b.text(0, cy, '-- VISUAL LINE --', th.ink, undefined, ATTR.BOLD);
        else if (mode === 'COMMAND') { const cmd = ':w'.slice(0, 1 + Math.floor((lt - 8.2) * 2.5)); const e = b.text(0, cy, cmd, th.ink); b.set(e, cy, ' ', th.bg, th.ink); }
        else if (mode === 'WRITTEN') put(b, 0, cy, `"src/pool.js" 97L, 2874B written`, W, th.muted);
      }
    };
  },
};

const WINDOWS = ['zsh', 'vim', 'logs', 'k9s', 'psql'];

const SHELL = [
  ['p', 'make test'],
  ['o', 'ok   checkout/pool     0.412s', 'pos'],
  ['o', 'ok   checkout/cart     0.208s', 'pos'],
  ['o', '--- FAIL: TestRefund (0.03s)', 'neg'],
  ['o', 'FAIL checkout/refund   0.031s', 'neg'],
  ['p', 'git stash && make test'],
  ['o', 'ok   checkout/refund   0.029s', 'pos'],
  ['p', ''],
];

const tmuxBar = {
  id: 'status-tmux-bar',
  title: 'tmux Session',
  category: 'Status Lines',
  description: 'A tmux session: split panes with a shell and a live log tail, the active-pane border, and the classic green status bar with a ticking clock.',
  tags: ['tmux', 'status bar', 'panes', 'multiplexer', 'session'],
  kind: 'widget',
  size: { w: 80, h: 12 },
  minSize: { w: 40, h: 4 },
  loop: 12,
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const split = Math.floor(W * 0.5), paneH = H - 1;
    const prompt = '~/src/checkout $ ';
    return (t) => {
      const lt = t % 12;
      const active = lt < 6 ? 0 : 1; // the active pane flips half-way
      // Left pane: a shell session that types and prints.
      const shown = [];
      const reveal = lt * 1.3;
      for (let i = 0; i < SHELL.length; i++) {
        const [kind, text, tone] = SHELL[i];
        const at = i * 1.4;
        if (i > 0 && reveal < at) break;
        if (kind === 'p') {
          const typed = text.slice(0, Math.max(0, Math.floor((reveal - at) * 9)));
          shown.push([prompt + typed, th.ink, i === SHELL.length - 1 || typed.length < text.length]);
        } else shown.push([text, th[tone] ?? th.ink, false]);
      }
      const view = shown.slice(-paneH);
      view.forEach(([s, c, cursor], r) => {
        if (s.startsWith(prompt)) { b.text(0, r, '~/src/checkout', th.info); b.text(15, r, '$', th.muted); put(b, 17, r, s.slice(prompt.length), split - 18, th.ink); }
        else put(b, 0, r, s, split - 1, c);
        if (cursor && active === 0 && Math.floor(t * 2) % 2 === 0) b.set(Math.min(split - 2, s.length), r, ' ', th.bg, th.ink);
      });
      // Pane border: tmux paints the half next to the active pane in the active color.
      for (let y = 0; y < paneH; y++) b.set(split, y, g.v, (y < paneH / 2) === (active === 0) ? th.pos : th.line);
      // Right pane: tail -f of the service log.
      const rw = W - split - 1, lines = tail(7, t, 1.6, paneH);
      lines.forEach((l, r) => {
        const ts = stamp(l.i, 1.6).slice(7);
        let x = b.text(split + 1, r, ts, th.dim);
        x = b.text(x + 1, r, l.svc.padEnd(8).slice(0, 8), levelColor(th, l.level));
        put(b, x + 1, r, l.msg, split + 1 + rw - x - 1, l.level === 'error' || l.level === 'crit' ? th.neg : th.muted);
      });
      if (active === 1 && Math.floor(t * 2) % 2 === 0) b.set(W - 1, paneH - 1, ' ', th.bg, th.ink);
      // Status bar.
      const y = H - 1, bar = th.pos, ink = th.bg;
      for (let x = 0; x < W; x++) b.set(x, y, ' ', ink, bar);
      let x = b.text(0, y, '[ops] ', ink, bar);
      const cur = Math.floor(lt / 3) % 3 === 2 ? 2 : 1;
      WINDOWS.forEach((w, i) => {
        if (x + w.length + 4 > W - (W >= 60 ? 30 : 8)) return;
        const flag = i === cur ? '*' : i === (cur === 1 ? 0 : 1) ? '-' : i === 2 && cur !== 2 && Math.floor(t * 1.5) % 2 ? '#' : ' ';
        const s = `${i}:${w}${flag}`;
        x = b.text(x, y, s, ink, i === cur ? mix(bar, 0xffffff, 0.25) : bar, i === cur ? ATTR.BOLD : 0) + 1;
      });
      const secs = 14 * 3600 + 2 * 60 + 31 + Math.floor(t);
      const clock = `${String(Math.floor(secs / 3600)).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}`;
      const right = W >= 60 ? `"web-01" ${clock} 13-Oct-26` : clock;
      putR(b, W, y, right, ink, bar);
      if (W >= 60 && Math.floor(lt / 3) % 3 === 1 && lt % 3 < 0.5) putR(b, W - right.length - 1, y, ' ^B ', bar, ink, ATTR.BOLD);
    };
  },
};

const HIST = [
  { cmd: 'git pull --rebase', out: 'Successfully rebased and updated refs/heads/main.', code: 0, dur: '1.2s', kube: 'staging', git: 'main', dirty: 0, ahead: 0 },
  { cmd: 'kubectx prod-us-east', out: 'Switched to context "prod-us-east".', code: 0, dur: '84ms', kube: 'staging', git: 'main', dirty: 0, ahead: 0 },
  { cmd: 'kubectl rollout status deploy/checkout', out: 'deployment "checkout" successfully rolled out', code: 0, dur: '38s', kube: 'prod-us-east', git: 'main', dirty: 0, ahead: 0 },
  { cmd: 'npm run lint', out: 'src/pool.js:41:7  error  no-floating-promises', code: 1, dur: '3.4s', kube: 'prod-us-east', git: 'main', dirty: 2, ahead: 0 },
  { cmd: 'git commit -am "await sleep in pool"', out: '[main 4c1e9a2] await sleep in pool', code: 0, dur: '210ms', kube: 'prod-us-east', git: 'main', dirty: 2, ahead: 0 },
];

const powerline = {
  id: 'status-powerline',
  title: 'Powerline Prompt',
  category: 'Status Lines',
  description: 'A two-line powerline shell prompt — user, path, git and kube segments, exit code, duration and clock — as commands run.',
  tags: ['powerline', 'prompt', 'shell', 'git', 'kubernetes'],
  kind: 'widget',
  size: { w: 80, h: 12 },
  minSize: { w: 40, h: 3 },
  loop: 15,
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const arrow = g.u ? '▶' : '>', arrowL = g.u ? '◀' : '<';
    const EACH = 3;
    // Segments are [text, fg, bg]; each separator is drawn in the previous segment's color.
    const segs = (row, x, list) => {
      list.forEach(([text, fg, bg], i) => {
        x = b.text(x, row, ` ${text} `, fg, bg, i === 0 ? ATTR.BOLD : 0);
        const next = list[i + 1]?.[2];
        x = b.text(x, row, arrow, bg, next);
      });
      return x;
    };
    const segsR = (row, xEnd, list) => {
      let x = xEnd;
      for (let i = list.length - 1; i >= 0; i--) {
        const [text, fg, bg] = list[i];
        x -= text.length + 2;
        b.text(x, row, ` ${text} `, fg, bg);
        x -= 1;
        b.text(x, row, arrowL, bg, list[i - 1]?.[2]);
      }
    };
    const left = (h, code) => {
      const gitBg = h.dirty ? th.warn : th.pos;
      const gitTxt = `${g.u ? '⎇' : 'git:'} ${h.git}${h.dirty ? ` ${g.u ? '±' : '+-'}${h.dirty}` : ''}${h.ahead ? ` ${g.u ? '⇡' : '^'}${h.ahead}` : ''}`;
      const prod = h.kube.startsWith('prod');
      const list = [
        ['deploy@web-01', th.bg, th.accent],
        ['~/src/checkout', th.ink, mix(th.bg, th.line, 0.9)],
        [gitTxt, th.bg, gitBg],
      ];
      if (W >= 64) list.push([`${g.u ? '⎈' : 'k8s:'} ${h.kube}`, prod ? 0xffffff : th.bg, prod ? th.neg : th.info]);
      if (code) list.push([`${g.cross} ${code}`, 0xffffff, th.crit]);
      return list;
    };
    return (t) => {
      const lt = t % (HIST.length * EACH);
      const cur = Math.floor(lt / EACH), within = lt - cur * EACH;
      const blocks = [];
      for (let i = 0; i <= cur; i++) {
        const h = HIST[i], prev = HIST[i - 1];
        const typing = i === cur;
        const typed = typing ? h.cmd.slice(0, Math.floor(within * 18)) : h.cmd;
        const done = !typing || within > 2.2;
        blocks.push({ h, st: h, typed, done, typing, code: prev && prev.code ? prev.code : 0, prevDur: prev ? prev.dur : '12ms' });
      }
      const rowsPer = (blk) => 2 + (blk.done ? 1 : 0);
      let need = 0, start = blocks.length;
      while (start > 0 && need + rowsPer(blocks[start - 1]) <= H) { need += rowsPer(blocks[start - 1]); start--; }
      let y = 0;
      for (let i = start; i < blocks.length; i++) {
        const blk = blocks[i];
        segs(y, 0, left(blk.st, blk.code));
        if (W >= 70) {
          const secs = 14 * 3600 + 2 * 60 + 31 + Math.floor(t - (blocks.length - 1 - i) * EACH);
          const clk = `${String(Math.floor(secs / 3600) % 24).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
          segsR(y, W, [[blk.prevDur, th.ink, mix(th.bg, th.line, 0.9)], [clk, th.bg, th.muted]]);
        }
        y++;
        let x = b.text(0, y, g.u ? '❯ ' : '> ', blk.code ? th.neg : th.pos, undefined, ATTR.BOLD);
        x = put(b, x, y, blk.typed, W - 3, th.ink);
        if (blk.typing && !blk.done && Math.floor(t * 2.5) % 2 === 0) b.set(x, y, ' ', th.bg, th.ink);
        y++;
        if (blk.done) { put(b, 0, y, blk.h.out, W, blk.h.code ? th.neg : th.muted); y++; }
      }
    };
  },
};

export default [vimLine, tmuxBar, powerline];
