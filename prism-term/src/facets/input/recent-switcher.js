// A hold-Ctrl+Tab recent switcher: each Tab while Ctrl is held moves down the most-recent list; release switches.
import { ATTR, uni, phase, panel, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 12;
const ITEMS = [['file', 'deploy.yaml', '2m'], ['logs', 'api logs', '5m'], ['shell', 'prod-east', '12m'], ['board', 'dashboards', '20m'], ['file', 'values.yaml', '1h'], ['logs', 'worker logs', '2h']];
const VERB = { file: 'editing', logs: 'viewing', shell: 'shell', board: 'viewing' };
// [time, key]: Ctrl+Tab opens on the previous item, Tab, Shift-Tab, release switches; then back to the start item.
const KEYS = [[1.0, 'OPEN'], [1.8, 'TAB'], [2.6, 'BACK'], [3.4, 'RELEASE'], [6.4, 'OPEN'], [7.6, 'RELEASE']];

function stateAt(p) {
  let order = ITEMS.map((_, i) => i), open = false, sel = 0;
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'OPEN') { open = true; sel = 1; } else if (k === 'TAB') sel = Math.min(order.length - 1, sel + 1); else if (k === 'BACK') sel = Math.max(0, sel - 1);
    else if (k === 'RELEASE') { open = false; const it = order[sel]; order = [it, ...order.filter((i) => i !== it)]; }
  }
  return { order, open, sel };
}

export default {
  id: 'input-recent-switcher',
  since: '0.3.0',
  title: 'Recent Switcher',
  category: 'Command Palettes',
  description: 'A hold-Ctrl+Tab switcher over recently used items: each Tab while Ctrl is held moves to the next most recent one, Shift-Tab goes back, and releasing Ctrl switches.',
  tags: ['switcher', 'mru', 'recent', 'ctrl tab', 'navigation', 'palette'],
  kind: 'tui',
  size: { w: 60, h: 10 },
  minSize: { w: 40, h: 7 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), MID = u ? '·' : '-';
      const st = stateAt(phase(t, LOOP)), GL = { file: u ? '≡' : '=', logs: u ? '▤' : '#', shell: '$', board: u ? '◆' : '*' };
      // the app header behind: what is current
      const [kind, name] = ITEMS[st.order[0]];
      let x = b.text(0, 0, `${VERB[kind]}:`, sub(th));
      b.text(x + 1, 0, name, th.ink, undefined, ATTR.BOLD);
      b.text(0, 1, (u ? '─' : '-').repeat(W), th.line);
      if (!st.open) { fitText(b, 0, H - 1, W, [`Ctrl+Tab recent ${MID} hold Ctrl, Tab to move`, 'Ctrl+Tab recent'], sub(th)); return; }
      // the popup: ages drop first, then glyphs, then items 6 → 4
      const n = Math.max(1, Math.min(ITEMS.length, H - 3)), pw = Math.min(W - 4, 40), px = Math.floor((W - pw) / 2), py = Math.max(1, Math.min(2, H - n - 2));
      const foot = ['release Ctrl to switch', 'release Ctrl'].find((f) => stringWidth(f) + 4 <= pw);
      const inner = panel(ctx, b, px, py, pw, n + 2, { title: 'Recent', footer: foot, color: th.accent, titleColor: th.ink, footerColor: sub(th), bg: th.panel });
      inner.fill(0, 0, inner.width, inner.height, ' ', undefined, th.panel);
      const ages = inner.width >= 30, glyph = inner.width >= 22;
      st.order.slice(0, n).forEach((i, r) => {
        const [k, nm, age] = ITEMS[i], on = r === st.sel;
        let cx = inner.text(0, r, on ? '›' : ' ', th.accent, undefined, ATTR.BOLD);
        if (glyph) cx = inner.text(cx + 1, r, GL[k], sub(th));
        const label = ` ${nm} `;
        cx = on ? inv(ctx, inner, cx + 1, r, label) : inner.text(cx + 1, r, label, th.ink);
        if (ages) inner.text(inner.width - stringWidth(age) - 1, r, age, sub(th));
      });
    };
  },
};
