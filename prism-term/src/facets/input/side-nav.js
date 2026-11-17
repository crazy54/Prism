// A sidebar navigation rail: sections with badges, a section folds, and "[" collapses the rail to glyphs.
import { ATTR, uni, glyphs, phase, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 12;
const SECTIONS = [['Services', ['api', 'web', 'worker']], ['Alerts', ['paging', 'warnings']], ['Settings', []]];
// [time, key]: walk the rail to Alerts and open it (its badge clears), fold it, collapse the rail, expand, unfold,
// then three new alerts arrive and the selection goes home.
const KEYS = [[1.0, 'DOWN'], [1.6, 'DOWN'], [2.2, 'DOWN'], [2.8, 'OPEN'], [4.2, 'FOLD'], [5.2, 'COLLAPSE'], [7.6, 'EXPAND'], [8.6, 'UNFOLD'], [10.4, 'ALERTS'], [10.8, 'HOME']];

function stateAt(p) {
  let sel = 1, folded = new Set(), collapsed = false, badge = 3, opened = '';
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'DOWN') sel++; else if (k === 'OPEN') { opened = 'Alerts'; badge = 0; } else if (k === 'FOLD') folded.add('Alerts'); else if (k === 'UNFOLD') folded.delete('Alerts');
    else if (k === 'COLLAPSE') collapsed = true; else if (k === 'EXPAND') collapsed = false; else if (k === 'ALERTS') badge = 3; else if (k === 'HOME') { sel = 1; opened = ''; }
  }
  return { sel, folded, collapsed, badge, opened };
}

export default {
  id: 'input-side-nav',
  since: '0.3.0',
  title: 'Sidebar Navigation',
  category: 'Tabs & Bars',
  description: 'A vertical navigation rail with sections and badges beside a content pane: the arrows move, Enter opens, a section folds, and the rail collapses to glyphs that keep their badges.',
  tags: ['sidebar', 'navigation rail', 'nav', 'badges', 'collapse', 'sections'],
  kind: 'tui',
  size: { w: 64, h: 12 },
  minSize: { w: 44, h: 8 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), DOT = u ? '●' : '*', GL = { Services: u ? '≡' : '=', Alerts: u ? '◆' : '!', Settings: u ? '◎' : '%' };
      // the flat row list: section headers and their items
      const rows = [];
      for (const [name, items] of SECTIONS) { rows.push(['h', name]); if (items.length && !st.folded.has(name)) for (const it of items) rows.push(['i', it, name]); }
      const collapsed = st.collapsed || W < 52, railW = collapsed ? 6 : 20;
      const selRow = rows[Math.min(rows.length - 1, st.sel)];
      rows.slice(0, H - 1).forEach(([kind, name, parent], y) => {
        const on = rows[st.sel] === rows[y] && st.sel === y;
        if (collapsed) {
          if (kind !== 'h') return;
          const cy = SECTIONS.findIndex(([n]) => n === name) * 2;
          if (cy >= H) return;
          b.text(1, cy, GL[name], sub(th), undefined, ATTR.BOLD);
          if (name === 'Alerts' && st.badge) { b.text(2, cy, DOT, th.warn, undefined, ATTR.BOLD); b.text(3, cy, String(st.badge), th.ink, undefined, ATTR.BOLD); }
          if (selRow && (selRow[1] === name || selRow[2] === name)) b.text(0, cy, '›', th.accent, undefined, ATTR.BOLD);
          return;
        }
        const exp = SECTIONS.find(([n]) => n === name)?.[1].length ? (st.folded.has(name) ? g.tri : g.triDown) : ' ';
        const label = kind === 'h' ? `${exp} ${name}` : `    ${name}`;
        if (on) { b.text(0, y, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, b, 1, y, ` ${label.trimEnd()} `); }
        else b.text(1, y, label, th.ink, undefined, kind === 'h' ? ATTR.BOLD : 0);
        if (kind === 'h' && name === 'Alerts' && st.badge) {
          const bx = railW - 6;
          b.text(bx, y, DOT, th.warn, undefined, ATTR.BOLD);
          b.text(bx + 2, y, railW >= 20 ? `[${st.badge}]` : String(st.badge), th.ink, undefined, ATTR.BOLD);
        }
      });
      for (let y = 0; y < H - 1; y++) b.text(railW, y, u ? '│' : '|', th.line);
      // the content pane shows the selection
      const cx = railW + 2, cw = W - cx, cur = st.opened || (selRow ? selRow[1] : '');
      if (cw > 6) {
        b.text(cx, 0, cur, th.ink, undefined, ATTR.BOLD);
        const detail = cur === 'Alerts' ? ['3 alerts read', 'paging: 1 active', 'warnings: 2'] : cur === 'api' ? ['3/3 replicas ready', 'p95 212 ms'] : cur === 'web' ? ['4/4 replicas ready'] : cur === 'worker' ? ['1/3 replicas ready'] : ['section'];
        detail.slice(0, H - 3).forEach((d, i) => fitText(b, cx, 2 + i, cw, [d], th.ink));
      }
      fitText(b, 0, H - 1, W, [`${u ? '↑/↓' : '^/v'} move ${u ? '·' : '-'} Enter open ${u ? '·' : '-'} [ ] collapse rail`, 'Enter open'], sub(th));
    };
  },
};
