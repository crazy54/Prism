// A roles × permissions checkbox matrix: the cursor moves cell to cell, a column header toggles the
// column ([-] when mixed), a policy-locked cell won't change, and unsaved edits are starred.
import { ATTR, uni, glyphs, phase, stepAt, stringWidth } from './_input.js';

const COLS = [['read', 'rd'], ['write', 'wr'], ['deploy', 'dep'], ['admin', 'adm']];
const ROLES = ['viewer', 'developer', 'sre', 'owner'];
const START = [[1, 0, 0, 0], [1, 1, 0, 0], [1, 1, 1, 0], [1, 1, 1, 1]];
const LOCKED = [[0, 3]];   // viewer · admin: policy forbids it
// [time, key]: the cursor walks (row -1 is the header row), toggles a cell and a whole column, tries the
// locked cell, then discards everything.
const SCRIPT = [[1.0, 'right'], [1.5, 'down'], [2.0, 'right'], [2.6, 'space'], [3.3, 'up'], [3.8, 'up'], [4.4, 'space'], [5.4, 'right'],
  [6.0, 'down'], [6.6, 'space'], [7.6, 'esc'], [8.6, 'home']];
const LOOP = 12;
const locked = (r, c) => LOCKED.some(([a, b]) => a === r && b === c);

function stateAt(p) {
  const grid = START.map((r) => [...r]);
  let r = 0, c = 0, note = '', noteAt = -Infinity;
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const key = SCRIPT[k][1];
    if (key === 'right') c = Math.min(COLS.length - 1, c + 1);
    else if (key === 'down') r = Math.min(ROLES.length - 1, r + 1);
    else if (key === 'up') r = Math.max(-1, r - 1);
    else if (key === 'home') { r = 0; c = 0; }
    else if (key === 'esc') { for (let i = 0; i < grid.length; i++) grid[i] = [...START[i]]; note = 'discarded'; noteAt = SCRIPT[k][0]; }
    else if (key === 'space') {
      if (r < 0) { const all = ROLES.every((_, i) => locked(i, c) || grid[i][c]); ROLES.forEach((_, i) => { if (!locked(i, c)) grid[i][c] = all ? 0 : 1; }); }
      else if (locked(r, c)) { note = 'locked'; noteAt = SCRIPT[k][0]; }
      else grid[r][c] = grid[r][c] ? 0 : 1;
    }
  }
  const changes = grid.reduce((s, row, i) => s + row.filter((v, j) => v !== START[i][j]).length, 0);
  return { grid, r, c, changes, note: p - noteAt < 1.4 ? note : '' };
}

export default {
  id: 'input-permission-grid',
  since: '0.3.0',
  title: 'Permission Matrix',
  category: 'Toggles & Checkboxes',
  description: 'Roles by permissions as a checkbox grid: the cursor toggles cells and a whole column from its header, which shows [-] when mixed, a policy lock holds, and edits stay starred.',
  tags: ['permissions', 'roles', 'rbac', 'checkbox grid', 'matrix', 'access control'],
  kind: 'tui',
  size: { w: 64, h: 11 },
  minSize: { w: 44, h: 8 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), MID = u ? '·' : '-';
      const roleW = W >= 56 ? 12 : 10, longCols = W >= 56, colW = longCols ? 9 : 7, spaced = H >= 11;
      const cx = (c) => roleW + c * colW;
      // column labels and the header boxes that toggle a whole column
      COLS.forEach(([long, abbr], c) => b.text(cx(c), 0, longCols ? long : abbr, th.ink, undefined, ATTR.BOLD));
      const hy = 1;
      b.text(0, hy, 'all', sub);
      COLS.forEach((_, c) => {
        const vals = ROLES.map((__, i) => (locked(i, c) ? null : st.grid[i][c])).filter((v) => v !== null);
        const box = vals.every(Boolean) ? '[x]' : vals.some(Boolean) ? '[-]' : '[ ]', on = st.r === -1 && st.c === c;
        if (on) b.text(cx(c), hy, box, th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
        else b.text(cx(c), hy, box, th.ink, undefined, ATTR.BOLD);
        if (on) b.text(cx(c) - 1, hy, g.caret, th.accent, undefined, ATTR.BOLD);
      });
      const rule = u ? '─' : '-';
      if (spaced) b.text(0, 2, rule.repeat(Math.min(W, cx(COLS.length - 1) + 4)), th.line);
      ROLES.forEach((role, i) => {
        const y = (spaced ? 3 : 2) + i;
        b.text(0, y, role.slice(0, roleW - 1), th.ink);
        COLS.forEach((_, c) => {
          const lock = locked(i, c), v = st.grid[i][c], on = st.r === i && st.c === c, changed = !lock && v !== START[i][c];
          const box = lock ? '[#]' : v ? '[x]' : '[ ]';
          b.text(cx(c), y, box, on ? th.ink : lock ? th.muted : th.ink, undefined, on ? ATTR.INVERSE | ATTR.BOLD : v ? ATTR.BOLD : 0);
          if (on) b.text(cx(c) - 1, y, g.caret, th.accent, undefined, ATTR.BOLD);
          if (changed) b.text(cx(c) + 3, y, '*', th.warn, undefined, ATTR.BOLD);
        });
      });
      // footer: unsaved count and keys; the hints drop first
      const fy = Math.min(H - 1, (spaced ? 3 : 2) + ROLES.length + (spaced ? 1 : 0));
      const cnt = st.note === 'discarded' ? 'discarded changes' : st.note === 'locked' ? 'locked by policy' : `${st.changes} change${st.changes === 1 ? '' : 's'}`;
      let x = 0;
      if (st.changes && !st.note) x = b.text(0, fy, '*', th.warn, undefined, ATTR.BOLD) + 1;
      if (st.note === 'locked') x = b.text(0, fy, '#', sub, undefined, ATTR.BOLD) + 1;
      x = b.text(x, fy, cnt, th.ink, undefined, ATTR.BOLD);
      const hint = ` ${MID} s save ${MID} esc discard ${MID} space toggle`;
      if (x + stringWidth(hint) <= W) b.text(x, fy, hint, sub);
      else { const h2 = [` ${MID} s save ${MID} esc discard`, ` ${MID} s save`].find((h) => x + stringWidth(h) <= W); if (h2) b.text(x, fy, h2, sub); }
      if (fy < H - 1) {   // the legend takes the free last row whenever there is one
        let lx = 0;
        for (const [box, color, word] of [['[x]', th.ink, 'granted'], ['[-]', th.ink, 'mixed'], ['[#]', th.muted, 'locked'], ['*', th.warn, 'unsaved']]) {
          if (lx + stringWidth(box) + stringWidth(word) + 1 > W) break;
          const bx0 = lx;
          lx = b.text(lx, H - 1, box, color, undefined, ATTR.BOLD);
          lx = b.text(lx + 1, H - 1, word, sub) + 2;
        }
      }
    };
  },
};
