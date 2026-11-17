// A "?" keymap cheatsheet: bindings grouped by area in a modal; typing filters rows and hides empty groups.
import { ATTR, uni, phase, panel, stringWidth } from './_input.js';
import { sub, fitText, silhouette } from './_kit6.js';

const LOOP = 12, FILTER = 'pane';
const GROUPS = [
  ['Navigation', [['j k', 'move'], ['gg', 'top'], ['G', 'bottom'], ['^D', 'half page']]],
  ['Editing', [['i', 'insert'], ['dd', 'delete line'], ['u', 'undo'], ['.', 'repeat']]],
  ['Panes', [['^W s', 'split pane'], ['^W w', 'next pane'], ['^W q', 'close pane'], ['^W =', 'equalize']]],
];
// [time, key]: "?" opens it, "pane" filters, Backspace restores the rows, Esc closes.
const KEYS = (() => { const out = [[0.6, 'OPEN']]; let t = 1.8; for (const c of FILTER) { out.push([t, c]); t += 0.2; } for (let i = 0; i < 4; i++) out.push([5.6 + i * 0.25, 'BS']); out.push([8.6, 'CLOSE']); return out; })();

export default {
  id: 'input-keymap-help',
  since: '0.3.0',
  title: 'Keybinding Cheatsheet',
  category: 'Command Palettes',
  description: 'A "?" overlay of key bindings grouped by area over a dimmed app: typing filters it to the matching rows, hides groups left empty, and Backspace brings them back.',
  tags: ['keybindings', 'cheatsheet', 'help', 'shortcuts', 'filter', 'overlay'],
  kind: 'tui',
  size: { w: 72, h: 14 },
  minSize: { w: 44, h: 9 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), MID = u ? '·' : '-';
      const p = phase(t, LOOP);
      let open = false, q = '';
      for (const [tt, k] of KEYS) { if (tt > p) break; if (k === 'OPEN') open = true; else if (k === 'CLOSE') { open = false; q = ''; } else if (k === 'BS') q = q.slice(0, -1); else q += k; }
      silhouette(ctx, b, W, H);
      if (!open) { fitText(b, 2, H - 1, W - 2, [` ? keybindings `], th.ink, undefined, ATTR.BOLD); return; }
      // the modal: a filter field, then the groups as columns (stacked when narrow)
      const mw = Math.min(W - 2, 68), mh = H - 1, mx = Math.floor((W - mw) / 2);
      const inner = panel(ctx, b, mx, 0, mw, mh, { title: 'Keybindings', footer: 'esc close', color: th.accent, bg: th.panel, titleColor: th.ink, footerColor: sub(th) });
      inner.fill(0, 0, inner.width, inner.height, ' ', undefined, th.panel);
      let x = inner.text(0, 0, 'filter: ', sub(th));
      x = inner.text(x, 0, q, th.ink, undefined, ATTR.BOLD); inner.text(x, 0, u ? '▏' : '_', th.ink, undefined, ATTR.BOLD);
      const match = (k, a) => !q || a.includes(q) || k.includes(q);
      const groups = GROUPS.map(([name, rows]) => [name, rows.filter(([k, a]) => match(k, a))]).filter(([, rows]) => rows.length);
      const cols = inner.width >= 60 ? 3 : 1, cw = Math.floor(inner.width / cols);
      if (cols === 3) {
        groups.forEach(([name, rows], gi) => {
          const cx = gi * cw;
          inner.text(cx, 2, name, th.ink, undefined, ATTR.BOLD);
          rows.forEach(([k, a], i) => row(inner, cx, 3 + i, cw - 1, k, a));
        });
      } else {
        let y = 2;
        for (const [name, rows] of groups) {
          if (y >= inner.height) break;
          inner.text(0, y++, name, th.ink, undefined, ATTR.BOLD);
          for (const [k, a] of rows) { if (y >= inner.height) break; row(inner, 0, y++, inner.width, k, a); }
        }
      }
      if (!groups.length) inner.text(0, 2, 'no bindings match', sub(th));
      function row(s, cx, y, w, k, a) {
        if (y >= s.height) return;
        let kx = cx;
        for (const key of k.split(' ')) { kx = s.text(kx, y, '[', th.accent, undefined, ATTR.BOLD); kx = s.text(kx, y, key, th.ink, undefined, ATTR.BOLD); kx = s.text(kx, y, ']', th.accent, undefined, ATTR.BOLD) + 1; }
        const ax = Math.max(kx, cx + 9);
        // an action that doesn't fit shortens to its leading whole words
        const words = a.split(' '), fit = words.map((_, n) => words.slice(0, words.length - n).join(' ')).find((v) => ax + stringWidth(v) <= cx + w);
        if (fit) {
          s.text(ax, y, fit, th.ink);
          const at = q ? fit.indexOf(q) : -1;
          if (at >= 0) s.text(ax + at, y, q, th.ink, undefined, ATTR.UNDERLINE | ATTR.BOLD);
        }
      }
      void MID;
    };
  },
};
