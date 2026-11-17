// A transfer list: two list boxes and the buttons that move marked items between them.
import { ATTR, uni, glyphs, phase, stepAt, panel, clip, stringWidth } from './_input.js';

const ALL = ['web-01', 'web-02', 'web-03', 'web-04', 'api-01', 'api-02', 'api-03', 'db-01', 'db-02'];
const START_BATCH = ['cache-01', 'cache-02', 'queue-01'];
const BTN = ['›', '»', '‹', '«'], BTN_A = ['>', '>>', '<', '<<'];
// [time, action]. Mark two hosts and move them across, bring one back, then bring the other back (the reset).
const SCRIPT = [[1.0, 'down'], [1.5, 'mark'], [2.0, 'down'], [2.4, 'down'], [2.8, 'down'], [3.2, 'mark'], [3.9, 'tab'], [4.5, 'press'],
  [5.4, 'tab'], [5.9, 'down'], [6.2, 'down'], [6.5, 'down'], [6.8, 'down'], [7.2, 'mark'], [7.8, 'btn2'], [8.4, 'press'],
  [9.2, 'tab'], [9.7, 'mark'], [10.3, 'btn2'], [10.7, 'press'], [11.3, 'home']];
const LOOP = 12;

function stateAt(p) {
  let left = [...ALL], right = [...START_BATCH], marks = new Set(), focus = 0, cur = [0, 0], btn = 0, pressedAt = -Infinity;
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const a = SCRIPT[k][1], list = focus === 0 ? left : right, side = focus === 2 ? 1 : 0;
    if (a === 'down' && focus !== 1) cur[side] = Math.min(list.length - 1, cur[side] + 1);
    else if (a === 'up' && focus !== 1) cur[side] = Math.max(0, cur[side] - 1);
    else if (a === 'mark' && focus !== 1) { const it = list[cur[side]]; if (marks.has(it)) marks.delete(it); else marks.add(it); }
    else if (a === 'tab') { focus = (focus + 1) % 3; if (focus === 1) btn = 0; }
    else if (a === 'home') { focus = 0; cur = [0, 0]; }
    else if (a === 'btn2') { focus = 1; btn = 2; }
    else if (a === 'press') {
      pressedAt = SCRIPT[k][0];
      if (btn === 0) { const mv = left.filter((h) => marks.has(h)); left = left.filter((h) => !marks.has(h)); right = [...right, ...mv]; mv.forEach((h) => marks.delete(h)); }
      if (btn === 2) { const mv = right.filter((h) => marks.has(h)); right = right.filter((h) => !marks.has(h)); left = ALL.filter((h) => left.includes(h) || mv.includes(h)); mv.forEach((h) => marks.delete(h)); }
      cur = [Math.min(cur[0], left.length - 1), Math.min(cur[1], right.length - 1)];
    }
  }
  return { left, right, marks, focus, cur, btn, pressed: p - pressedAt };
}

export default {
  id: 'input-transfer-list',
  since: '0.3.0',
  title: 'Transfer List',
  category: 'Selects & Lists',
  description: 'A dual list, available hosts and a maintenance batch, with move buttons between them: two hosts are marked and moved across, one comes back, and the counts follow.',
  tags: ['transfer list', 'dual list', 'shuttle', 'move items', 'selection', 'batch'],
  kind: 'tui',
  size: { w: 64, h: 12 },
  minSize: { w: 40, h: 8 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), allBtns = W >= 56, counts = W >= 48, hints = H >= 11;
      const midW = allBtns ? 9 : 7, boxW = Math.floor((W - midW) / 2), boxH = H - (hints ? 1 : 0);
      const lists = [[st.left, 'Available'], [st.right, 'Batch']];
      lists.forEach(([items, name], side) => {
        const x = side ? W - boxW : 0, focused = st.focus === (side ? 2 : 0);
        const title = `${focused ? `${g.caret} ` : ''}${counts ? `${name} (${items.length})` : name}`;
        const inner = panel(ctx, b, x, 0, boxW, boxH, { title, color: focused ? th.accent : th.line, titleColor: th.ink });
        const rows = inner.height, first = Math.max(0, Math.min(items.length - rows, st.cur[side] - rows + 1));
        items.slice(first, first + rows).forEach((h, r) => {
          const i = first + r, on = focused && i === st.cur[side], marked = st.marks.has(h);
          const box = marked ? '[x]' : '[ ]', label = clip(ctx, h, Math.max(1, inner.width - 6));
          inner.text(0, r, on ? g.caret : ' ', th.accent, undefined, ATTR.BOLD);
          if (on) inner.text(2, r, `${box} ${label}`.padEnd(inner.width - 2), th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
          else { inner.text(2, r, box, marked ? th.accent : sub, undefined, ATTR.BOLD); if (marked) inner.text(3, r, 'x', th.ink, undefined, ATTR.BOLD); inner.text(6, r, label, th.ink); }
        });
      });
      // the buttons between the boxes; » « drop first, then the title counts
      const order = allBtns ? [0, 1, 2, 3] : [0, 2], bx = boxW + Math.floor((midW - 5) / 2);
      const by0 = Math.max(1, Math.floor((boxH - order.length * 2 + 1) / 2));
      order.forEach((k, j) => {
        const y = by0 + j * 2, on = st.focus === 1 && st.btn === k, pressed = on && st.pressed < 0.35;
        const label = `[${(u ? BTN[k] : BTN_A[k]).padStart(u ? 2 : 2).padEnd(3)}]`;
        if (on) b.text(bx - 1, y, g.caret, th.accent, undefined, ATTR.BOLD);
        b.text(bx, y, label, on ? th.ink : sub, undefined, on ? (pressed ? ATTR.INVERSE | ATTR.BOLD : ATTR.BOLD | ATTR.UNDERLINE) : 0);
      });
      if (hints) {
        const MID = u ? '·' : '-', h = `space mark ${MID} tab move focus ${MID} enter press`;
        if (stringWidth(h) <= W) b.text(0, H - 1, h, sub);
      }
    };
  },
};
