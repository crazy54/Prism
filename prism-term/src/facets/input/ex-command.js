// A vi-style command line: Tab shows a wildmenu, and a substitute previews every replacement live before Enter.
import { ATTR, uni, phase, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 14;
const BUFFER = ['upstream api {', '  server http://10.0.1.12:8080;', '}', 'location /docs { proxy_pass http://docs.internal; }', '# mirror: http://mirror.local/status', "log_format main '$remote_addr';"];
const WILD = ['set', 'setlocal', 'setfiletype'], SUB = '%s/http:/https:/g';
// [time, key]: ":se" + Tab Tab Tab, Esc; then ":%s/http:/https:/g" typed with a live preview, Enter, u undoes.
const KEYS = (() => {
  const out = [[0.8, 'COLON'], [1.2, 's'], [1.4, 'e'], [2.0, 'TAB'], [2.6, 'TAB'], [3.2, 'TAB'], [3.9, 'ESC'], [4.6, 'COLON']];
  let t = 4.9;
  for (const c of SUB) { out.push([t, c]); t += 0.16; }
  out.push([8.4, 'ENTER'], [11.0, 'UNDO'], [12.6, 'CLEARMSG']);
  return out;
})();

function stateAt(p) {
  let mode = 'normal', cmd = '', wild = -1, applied = false, msg = '';
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'COLON') { mode = 'cmd'; cmd = ''; wild = -1; msg = ''; }
    else if (k === 'TAB') { wild = (wild + 1) % WILD.length; cmd = WILD[wild]; }
    else if (k === 'ESC') { mode = 'normal'; cmd = ''; wild = -1; }
    else if (k === 'ENTER') { mode = 'normal'; applied = true; msg = '3 substitutions on 3 lines'; cmd = ''; }
    else if (k === 'UNDO') { applied = false; msg = '3 changes undone'; }
    else if (k === 'CLEARMSG') msg = '';
    else cmd += k;
  }
  return { mode, cmd, wild, applied, msg };
}
// the substitute being typed: its pattern, and its replacement once the second / is in
const parseSub = (cmd) => { const m = /^%s\/([^/]*)(?:\/([^/]*))?/.exec(cmd); return m ? { pat: m[1], rep: m[2] } : null; };

export default {
  id: 'input-ex-command',
  since: '0.3.0',
  title: 'Ex Command Line',
  category: 'Command Palettes',
  description: 'A vi-style command line: Tab completes through a wildmenu above it, and a substitute command previews every replacement live in the buffer before Enter applies it.',
  tags: ['vi', 'ex', 'command line', 'wildmenu', 'substitute', 'live preview'],
  kind: 'tui',
  size: { w: 72, h: 12 },
  minSize: { w: 44, h: 8 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const st = stateAt(phase(t, LOOP)), rows = Math.min(BUFFER.length, H - 3), s = st.mode === 'cmd' ? parseSub(st.cmd) : null;
      // the buffer, with the live preview: matches underlined, replacements underlined and bold
      for (let i = 0; i < rows; i++) {
        const y = i, num = `${i + 1}`.padStart(2);
        b.text(0, y, num, sub(th));
        let line = BUFFER[i], marks = [];
        const pat = s && s.pat, rep = s && s.rep !== undefined ? s.rep : null;
        if (st.applied) line = line.split('http:').join('https:');
        else if (pat) {
          let out = '', k = 0;
          while (k < line.length) {
            if (line.startsWith(pat, k)) { const r = rep ?? pat; marks.push([out.length, r.length, rep !== null]); out += r; k += pat.length; }
            else { out += line[k]; k++; }
          }
          line = out;
        }
        // nowrap: a line that runs past the window ends at a word boundary with vi's '>' extends mark
        const room = W - 3, brk = stringWidth(line) > room ? Math.max(line.lastIndexOf(' ', room - 2), 1) : -1, txt = brk > 0 ? line.slice(0, brk) : line;
        if (brk > 0) b.text(W - 1, y, '>', sub(th), undefined, ATTR.BOLD);
        b.text(3, y, txt, th.ink);
        for (const [at, n, bold] of marks) if (at < room) b.text(3 + at, y, txt.slice(at, at + n), th.ink, undefined, ATTR.UNDERLINE | (bold ? ATTR.BOLD : 0));
      }
      for (let y = rows; y < H - 2; y++) b.text(0, y, '~', sub(th));
      // the wildmenu row during completion; items away from the selection drop, with < > marks
      const wy = H - 2, cy = H - 1;
      if (st.mode === 'cmd' && st.wild >= 0) {
        let x = 0;
        const fitsAll = WILD.reduce((n, w) => n + stringWidth(w) + 2, 0) <= W;
        const items = fitsAll ? WILD.map((w, i) => i) : [st.wild];
        if (!fitsAll && st.wild > 0) x = b.text(x, wy, '< ', th.ink, undefined, ATTR.BOLD);
        for (const i of items) { if (i === st.wild) x = inv(ctx, b, x, wy, WILD[i]); else x = b.text(x, wy, WILD[i], th.ink); x += 2; }
        if (!fitsAll && st.wild < WILD.length - 1) b.text(x, wy, '>', th.ink, undefined, ATTR.BOLD);
      } else if (st.mode !== 'cmd' && H >= 10) fitText(b, 0, wy, W, [`: command ${u ? '·' : '-'} Tab complete ${u ? '·' : '-'} u undo`], sub(th));
      // the command line itself, or the last message
      if (st.mode === 'cmd') { let x = b.text(0, cy, ':', th.accent, undefined, ATTR.BOLD); x = b.text(x, cy, st.cmd, th.ink); b.text(x, cy, u ? '▏' : '_', th.ink, undefined, ATTR.BOLD); }
      else if (st.msg) fitText(b, 0, cy, W, [st.msg], th.ink, undefined, ATTR.BOLD);
    };
  },
};
