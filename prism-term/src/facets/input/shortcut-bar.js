// A nano-style editor: the two-row shortcut bar flashes as keys are pressed,
// switches to prompt-specific keys during Where Is / Write Out, and the
// status line reports each action.
import { ATTR, glyphs, phase, typed, fit, stringWidth } from './_input.js';

const FILE = [
  'apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: checkout-api', '  namespace: checkout',
  'spec:', '  replicas: 3', '  selector:', '    matchLabels:', '      app: checkout-api', '  template:',
  '    spec:', '      containers:', '        - name: api', '          image: registry.example/checkout-api:2.14.1',
];
const MAIN = [
  [['^G', 'Help'], ['^O', 'Write Out'], ['^W', 'Where Is'], ['^K', 'Cut'], ['^C', 'Location']],
  [['^X', 'Exit'], ['^R', 'Read File'], ['^\\', 'Replace'], ['^U', 'Paste'], ['^_', 'Go To Line']],
];
const SEARCH = [
  [['^G', 'Help'], ['M-C', 'Case Sens'], ['M-B', 'Backwards'], ['^P', 'Older']],
  [['^C', 'Cancel'], ['M-R', 'Reg.exp.'], ['^R', 'Replace'], ['^N', 'Newer']],
];
const WRITE = [
  [['^G', 'Help'], ['M-D', 'DOS Format'], ['M-A', 'Append'], ['M-B', 'Backup File']],
  [['^C', 'Cancel'], ['M-M', 'Mac Format'], ['M-P', 'Prepend'], ['^T', 'Browse']],
];
const T = { find: 1.0, query: 1.3, found: 2.4, end: 2.9, edit: 3.3, write: 4.3, wrote: 5.2 };
const ROW = 6;

export default {
  id: 'input-shortcut-bar',
  title: 'Shortcut Bar',
  category: 'Tabs & Bars',
  description: 'A nano-style editor whose two-row shortcut bar flashes on each keypress and swaps to prompt keys for Where Is and Write Out while a deploy.yaml is edited.',
  tags: ['shortcuts', 'key bar', 'nano', 'editor', 'hotkeys'],
  kind: 'tui',
  size: { w: 72, h: 14 },
  minSize: { w: 40, h: 9 },
  loop: 9,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 9);
      const lines = FILE.slice();
      const edited = p >= T.edit;
      if (edited) lines[ROW] = '  replicas: 4';
      const modified = edited && p < T.wrote;
      // Title bar.
      b.fill(0, 0, W, 1, ' ', th.bg, th.ink);
      b.text(1, 0, 'nano', th.bg, th.ink, ATTR.BOLD);
      const name = 'deploy.yaml';
      b.text(Math.floor((W - name.length) / 2), 0, name, th.bg, th.ink, ATTR.BOLD);
      if (modified) b.text(W - 9, 0, 'Modified', th.bg, th.ink);

      // Cursor position for this moment.
      let cy = 0, cx = 0;
      if (p >= T.found) { cy = ROW; cx = 2; }
      if (p >= T.end) cx = lines[ROW].length;
      // Body, scrolled to keep the cursor in view.
      const bodyH = Math.max(1, H - 4);
      const top = Math.max(0, Math.min(FILE.length - bodyH, cy - Math.floor(bodyH / 2)));
      for (let r = 0; r < bodyH && top + r < lines.length; r++) {
        const i = top + r, line = lines[i];
        const m = /^(\s*-?\s*)([\w.]+)(:)(.*)$/.exec(line);
        if (m) {
          let x = b.text(0, 1 + r, m[1], th.dim);
          x = b.text(x, 1 + r, m[2], th.accent);
          x = b.text(x, 1 + r, m[3], th.dim);
          b.text(x, 1 + r, fit(m[4], Math.max(0, W - x), undefined, ctx).trimEnd(), /\d+$/.test(m[4]) ? th.warn : th.ink);
        } else b.text(0, 1 + r, fit(line, W, undefined, ctx), th.ink);
        // Search match highlight, briefly.
        if (i === ROW && p >= T.found && p < T.end) b.text(2, 1 + r, 'replicas', th.bg, th.warn, ATTR.BOLD);
        if (i === cy && p < T.write) b.set(cx, 1 + r, undefined, undefined, undefined, ATTR.INVERSE);
      }

      // Status / prompt line.
      const sy = H - 3;
      let keys = MAIN, pressed = '';
      if (p >= T.find - 0.15 && p < T.find) pressed = '^W';
      if (p >= T.write - 0.15 && p < T.write) pressed = '^O';
      const msg = (s, c = th.ink) => {
        const w = stringWidth(s);
        b.text(Math.max(0, Math.floor((W - w) / 2)), sy, fit(s, W, undefined, ctx).trimEnd(), c, th.panel2, ATTR.BOLD);
      };
      if (p < T.find) msg(`[ Read ${FILE.length} lines ]`);
      else if (p < T.found) {
        keys = SEARCH;
        b.fill(0, sy, W, 1, ' ', undefined, th.panel2);
        const x = b.text(0, sy, 'Search: ', th.ink, th.panel2, ATTR.BOLD);
        const q = typed('replicas', p, T.query, 9);
        const e = b.text(x, sy, q, th.ink, th.panel2);
        b.set(e, sy, ' ', undefined, undefined, ATTR.INVERSE);
      } else if (p >= T.write && p < T.wrote) {
        keys = WRITE;
        b.fill(0, sy, W, 1, ' ', undefined, th.panel2);
        const x = b.text(0, sy, 'File Name to Write: ', th.ink, th.panel2, ATTR.BOLD);
        const e = b.text(x, sy, name, th.ink, th.panel2);
        b.set(e, sy, ' ', undefined, undefined, ATTR.INVERSE);
      } else if (p >= T.wrote) msg(`[ Wrote ${FILE.length} lines ]`, th.pos);
      else if (p >= T.edit) {
        b.text(0, sy, fit(`  line ${ROW + 1}/${FILE.length} ${g.mid} replicas 3 ${g.right} 4`, W, undefined, ctx), th.dim);
      }

      // Two-row shortcut bar: as many columns as fit, like nano does.
      const need = Math.min(13, Math.max(...keys.flat().map(([k, l]) => k.length + l.length + 2)));
      const cols = Math.max(2, Math.min(keys[0].length, Math.floor(W / need)));
      const cw = Math.floor(W / cols);
      for (let r = 0; r < 2; r++) {
        keys[r].slice(0, cols).forEach(([k, label], i) => {
          const x = i * cw;
          const on = k === pressed;
          const kx = b.text(x, H - 2 + r, k, th.bg, on ? th.accent : th.ink, ATTR.BOLD);
          b.text(kx + 1, H - 2 + r, fit(label, Math.max(0, cw - k.length - 2), undefined, ctx).trimEnd(), on ? th.accent : th.ink, undefined, on ? ATTR.BOLD : 0);
        });
      }
    };
  },
};
