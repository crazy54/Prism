// A vim-style statusline that changes color with the mode: NORMAL motions,
// an INSERT edit, a VISUAL LINE indent and a :w COMMAND, with showcmd echo.
import { ATTR, uni, phase, mix, fit } from './_input.js';

const SRC = [
  "import { createPool } from './db.js';",
  '',
  'const POOL_SIZE = 20;',
  'const TIMEOUT_MS = 5000;',
  '',
  'export function pool() {',
  'return createPool({',
  '  max: POOL_SIZE,',
  '  acquireTimeoutMillis: TIMEOUT_MS,',
  '});',
  '}',
];
// [time, mode, row, col, keys-echo, event]
const SCRIPT = [
  [0.0, 'NORMAL', 0, 0, '', ''],
  [0.4, 'NORMAL', 1, 0, 'j', ''],
  [0.7, 'NORMAL', 2, 0, 'j', ''],
  [0.9, 'NORMAL', 2, 6, 'w', ''],
  [1.05, 'NORMAL', 2, 16, 'w', ''],
  [1.2, 'NORMAL', 2, 18, 'w', ''],
  [1.5, 'INSERT', 2, 18, 'ciw', 'cut'],
  [1.75, 'INSERT', 2, 19, '', 'type4'],
  [1.95, 'INSERT', 2, 20, '', 'type0'],
  [2.4, 'NORMAL', 2, 19, '', ''],
  [2.8, 'NORMAL', 6, 0, '4j', ''],
  [3.1, 'V-LINE', 6, 0, 'V', ''],
  [3.4, 'V-LINE', 7, 0, 'j', ''],
  [3.7, 'V-LINE', 8, 0, 'j', ''],
  [4.0, 'V-LINE', 9, 0, 'j', ''],
  [4.4, 'NORMAL', 6, 2, '>', 'indent'],
  [5.0, 'COMMAND', 6, 2, '', ':'],
  [5.25, 'COMMAND', 6, 2, '', ':w'],
  [5.6, 'NORMAL', 6, 2, '', 'written'],
];

export default {
  id: 'input-modeline',
  title: 'Modal Statusline',
  category: 'Tabs & Bars',
  description: 'A vim-style editor whose statusline recolors per mode: NORMAL motions, an INSERT edit, a VISUAL LINE indent and :w, with showcmd key echo and relative numbers.',
  tags: ['statusline', 'vim', 'modal', 'editor', 'modeline'],
  kind: 'tui',
  size: { w: 66, h: 13 },
  minSize: { w: 40, h: 8 },
  loop: 9,
  color: '256',
  order: 40,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 9);
      // Replay the script up to now.
      let mode = 'NORMAL', row = 0, col = 0, echo = '', echoAt = -9, cmd = '', written = false, modified = false;
      let lines = SRC.slice(), vStart = -1;
      for (const [at, m, r, c, keys, ev] of SCRIPT) {
        if (p < at) break;
        if (m === 'V-LINE' && mode !== 'V-LINE') vStart = r;
        else if (m !== 'V-LINE') vStart = -1;
        mode = m; row = r; col = c;
        if (keys) { echo = keys; echoAt = at; }
        if (ev === 'cut') { lines[2] = 'const POOL_SIZE = ;'; modified = true; }
        if (ev === 'type4') lines[2] = 'const POOL_SIZE = 4;';
        if (ev === 'type0') lines[2] = 'const POOL_SIZE = 40;';
        if (ev === 'indent') for (let i = 6; i <= 9; i++) lines[i] = '  ' + lines[i];
        if (ev === ':' || ev === ':w') cmd = ev;
        if (ev === 'written') { cmd = ''; written = true; modified = false; }
      }
      const MODE_C = { NORMAL: th.accent, INSERT: th.pos, 'V-LINE': th.warn, COMMAND: th.crit };
      const mc = MODE_C[mode];

      // Buffer with relative line numbers.
      const bodyH = H - 2;
      const top = Math.max(0, Math.min(lines.length - bodyH, row - Math.floor(bodyH / 2)));
      for (let r = 0; r < bodyH; r++) {
        const i = top + r;
        if (i >= lines.length) { b.text(0, r, '~', mix(th.bg, th.accent, 0.5)); continue; }
        const cur = i === row;
        const num = cur ? String(i + 1).padEnd(3) : String(Math.abs(i - row)).padStart(3);
        b.text(0, r, num, cur ? th.warn : th.dim, undefined, cur ? ATTR.BOLD : 0);
        const sel = vStart >= 0 && i >= Math.min(vStart, row) && i <= Math.max(vStart, row);
        const bg = sel ? mix(th.bg, th.warn, 0.28) : cur ? mix(th.bg, th.panel2, 0.7) : undefined;
        if (bg !== undefined) b.fill(4, r, W - 4, 1, ' ', undefined, bg);
        const line = lines[i];
        const m = /^(\s*)(import|export|function|const|return|from)?(.*)$/.exec(line);
        let x = b.text(4, r, m[1], th.ink, bg);
        if (m[2]) x = b.text(x, r, m[2], th.crit, bg, ATTR.BOLD);
        const rest = m[3];
        [...fit(rest, Math.max(0, W - x), undefined, ctx).trimEnd()].forEach((ch, k) => {
          const isNum = /\d/.test(ch);
          const inStr = (rest.slice(0, k).match(/'/g) || []).length % 2 === 1 || ch === "'";
          b.set(x + k, r, ch, inStr ? th.pos : isNum ? th.warn : th.ink, bg);
        });
        if (cur) {
          const cx = 4 + col;
          if (mode === 'INSERT') b.set(cx, r, undefined, undefined, undefined, ATTR.UNDERLINE | ATTR.BOLD);
          else if (mode !== 'COMMAND') b.set(cx, r, undefined, undefined, undefined, ATTR.INVERSE);
          if (mode === 'INSERT' && u) b.set(cx, r, b.get(cx, r)?.ch === ' ' ? '▏' : undefined, th.pos);
        }
      }

      // Statusline.
      const sy = H - 2;
      const sbg = mix(th.bg, th.panel2, 0.9);
      b.fill(0, sy, W, 1, ' ', undefined, sbg);
      let x = b.text(0, sy, ` ${mode} `, th.bg, mc, ATTR.BOLD);
      x = b.text(x, sy, ' main ', th.ink, mix(th.bg, mc, 0.3));
      const pct = top === 0 ? 'Top' : top + bodyH >= lines.length ? 'Bot' : `${Math.round((top / (lines.length - bodyH)) * 100)}%`;
      const pos = ` ${row + 1}:${col + 1} `;
      const right = [[W >= 56 ? 'utf-8  javascript ' : '', th.muted, sbg, 0], [` ${pct} `, th.ink, mix(th.bg, mc, 0.3), 0], [pos, th.bg, mc, ATTR.BOLD]];
      const rightW = right.reduce((n, [s]) => n + s.length, 0);
      const room = Math.max(0, W - x - 1 - rightW - 1 - (modified ? 4 : 0));
      x = b.text(x + 1, sy, fit(room >= 14 ? 'src/db/pool.js' : 'pool.js', room, undefined, ctx).trimEnd(), th.ink, sbg);
      if (modified) x = b.text(x, sy, ' [+]', th.warn, sbg, ATTR.BOLD);
      let rx = W;
      for (let i = right.length - 1; i >= 0; i--) {
        const [s, fg, bg, at] = right[i];
        rx -= s.length;
        if (rx > x + 1) b.text(rx, sy, s, fg, bg, at);
      }

      // Command line: :w prompt, write message, or -- MODE --; showcmd echo on the right.
      const cy = H - 1;
      if (mode === 'COMMAND') {
        const e = b.text(0, cy, cmd, th.ink);
        b.set(e, cy, ' ', undefined, undefined, ATTR.INVERSE);
      } else if (written && p < 8.4) b.text(0, cy, fit(`"src/db/pool.js" ${lines.length}L, 236B written`, W - 8, undefined, ctx), th.ink);
      else if (mode === 'INSERT') b.text(0, cy, '-- INSERT --', th.pos, undefined, ATTR.BOLD);
      else if (mode === 'V-LINE') b.text(0, cy, '-- VISUAL LINE --', th.warn, undefined, ATTR.BOLD);
      if (echo && p - echoAt < 0.5) b.text(W - 8, cy, echo.padStart(6), th.muted);
    };
  },
};
