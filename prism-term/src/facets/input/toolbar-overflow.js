// A responsive toolbar: buttons fold into "More" by priority as width runs out; More opens a menu of the folded ones.
import { ATTR, uni, glyphs, phase, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 12;
// [label, unicode icon, 7-bit twin, priority (1 = last to fold)]
const BTNS = [['Run', '▶', '>', 1], ['Stop', '■', '#', 2], ['Restart', '↻', '@', 3], ['Duplicate', '⎘', '=', 5], ['Rename', '✎', '~', 4], ['Export', '↓', 'v', 6], ['Delete', '×', '-', 7]];
// [time, key]: focus walks the shown buttons to More, Enter opens it, ↓ to Export, Enter runs it, Esc leaves.
const KEYS = [[0.8, 'TAB'], [1.5, 'TAB'], [2.2, 'TAB'], [2.9, 'TAB'], [3.6, 'TAB'], [4.3, 'TAB'], [5.0, 'OPEN'], [5.8, 'DOWN'], [6.6, 'RUN'], [9.6, 'ESC']];

export default {
  id: 'input-toolbar-overflow',
  since: '0.3.0',
  title: 'Responsive Toolbar',
  category: 'Tabs & Bars',
  description: 'An action toolbar whose buttons fold into a More menu by priority as the width runs out: focus walks the buttons, More opens, and a folded action runs from it.',
  tags: ['toolbar', 'overflow menu', 'responsive', 'actions', 'buttons', 'priority'],
  kind: 'tui',
  size: { w: 72, h: 8 },
  minSize: { w: 40, h: 6 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx), MORE = u ? '⋯' : '+';
      const p = phase(t, LOOP);
      // fold by priority; icons drop (labels stay) only once a button would fold anyway
      const btnW = (bt, icons) => stringWidth(bt[0]) + 4 + (icons ? stringWidth(u ? bt[1] : bt[2]) + 1 : 0);
      const fold = (icons) => {
        const order = [...BTNS].sort((a, z) => a[3] - z[3]), shown = new Set();
        let used = btnW(['More', MORE, '+'], icons) + 1;
        for (const bt of order) { const w = btnW(bt, icons) + 1; if (used + w > W) break; shown.add(bt[0]); used += w; }
        return shown;
      };
      // icons drop only once even the top two buttons and More no longer fit with them
      let icons = true, shown = fold(true);
      if (!(shown.has('Run') && shown.has('Stop'))) { icons = false; shown = fold(false); }
      const bar = BTNS.filter((bt) => shown.has(bt[0])), folded = BTNS.filter((bt) => !shown.has(bt[0]));
      const items = [...bar, ...(folded.length ? [['More', MORE, '+', 0]] : [])];
      let focus = -1, open = false, sel = 0, ran = -Infinity;
      for (const [tt, k] of KEYS) {
        if (tt > p) break;
        if (k === 'TAB') focus = Math.min(items.length - 1, focus + 1); else if (k === 'OPEN') { open = items[focus]?.[0] === 'More'; sel = 0; }
        // ↓ goes to Export, wherever it folded
        else if (k === 'DOWN') sel = Math.max(0, folded.findIndex((bt) => bt[0] === 'Export'));
        else if (k === 'RUN') { if (open) ran = tt; open = false; }
        else if (k === 'ESC') { focus = -1; open = false; }
      }
      let x = 0;
      items.forEach((bt, i) => {
        const [label, ic, tw] = bt, on = i === focus, icon = u ? ic : tw, iconColor = bt[0] === 'Delete' ? th.neg : tw.match(/[a-z]/) ? th.ink : sub(th);
        let cx = b.text(x, 0, '[', th.accent, undefined, ATTR.BOLD) + 1;
        if (icons || bt[0] === 'More') cx = b.text(cx, 0, icon, iconColor, undefined, ATTR.BOLD) + 1;
        cx = on ? inv(ctx, b, cx - 1, 0, ` ${label} `) : b.text(cx, 0, label, th.ink) + 1;
        x = b.text(cx, 0, ']', th.accent, undefined, ATTR.BOLD) + 1;
      });
      if (focus >= 0 && focus < items.length) b.text(0, 1, '', th.ink);
      b.text(0, 1, (u ? '─' : '-').repeat(W), th.line);
      // the More menu of the folded actions
      if (open) {
        // one column if it fits; two columns when one would run past the bottom (every action in view);
        // only past that, a scrolling window with a cue row
        const room = Math.max(1, H - 2), two = folded.length > room && 2 * room >= folded.length, cw = two ? 14 : 18, mw = two ? 2 * cw + 1 : 18;
        const mx = Math.max(0, Math.min(W - mw, x - mw)), fits = folded.length <= (two ? 2 * room : room);
        const n = fits ? folded.length : room - 1, first = fits ? 0 : Math.max(0, Math.min(folded.length - n, sel - n + 1));
        const rows = two ? Math.ceil(folded.length / 2) : Math.min(n, room);
        for (let r = 0; r < (fits ? rows : n + 1); r++) { const y = 2 + r; b.fill(mx, y, mw, 1, ' '); b.text(mx, y, u ? '│' : '|', th.accent); b.text(mx + mw - 1, y, u ? '│' : '|', th.accent); }
        folded.slice(first, first + n).forEach((bt, k) => {
          const i = first + k, col = two ? Math.floor(k / rows) : 0, y = 2 + (two ? k % rows : k), cx = mx + 1 + col * cw;
          if (i === sel) { b.text(cx, y, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, b, cx + 1, y, ` ${bt[0]} `); } else b.text(cx + 2, y, bt[0], th.ink);
        });
        if (!fits) {
          const above = first, below = folded.length - first - n, y = 2 + n;
          const c = b.text(mx + 2, y, below ? (u ? '▾' : 'v') : (u ? '▴' : '^'), th.accent, undefined, ATTR.BOLD); b.text(c + 1, y, `${below || above} more`, th.ink);
        }
      }
      // the content area (drops last) and the run status
      if (!open && H >= 7) { fitText(b, 0, 3, W, ['job nightly-report · last run 02:00 · 1,204 rows'.replace(/·/g, u ? '·' : '-')], th.ink); fitText(b, 0, 4, W, ['next run 02:00 tomorrow'], sub(th)); }
      const since = p - ran;
      if (since >= 0 && since < 2.6) { const c = b.text(0, H - 1, g.check, th.pos, undefined, ATTR.BOLD); b.text(c + 1, H - 1, 'exported report.csv', th.ink); }
      else if (!open) fitText(b, 0, H - 1, W, [`Tab move ${u ? '·' : '-'} Enter press ${u ? '·' : '-'} More for the rest`, 'Tab move'], sub(th));
    };
  },
};
