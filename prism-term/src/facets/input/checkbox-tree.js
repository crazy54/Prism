// A tri-state checkbox tree: checking a folder checks its children, and a mixed folder shows [-].
import { ATTR, uni, glyphs, phase, stepAt, panel, fit, stringWidth } from './_input.js';

// [label, size in MB, checked (leaves), parent index or -1]
const NODES = [
  ['/etc', 0, null, -1], ['nginx/', 12, true, 0], ['ssl/ (private keys)', 0.004, false, 0], ['systemd/', 3, true, 0],
  ['/home', 1840, true, -1],
  ['/var/lib', 0, null, -1], ['postgres/', 1120, true, 5], ['docker/', 210, true, 5], ['grafana/', 90, true, 5],
  ['/opt', 640, false, -1],
];
const KIDS = NODES.map((_, i) => NODES.map((n, j) => (n[3] === i ? j : -1)).filter((j) => j >= 0));
// The script: [time, action]. It walks down, opens /var/lib, unchecks its children one by one, checks the
// folder again (restoring them), folds it, and jumps home, so the loop ends where it starts.
const SCRIPT = [[1.0, 'down'], [1.5, 'down'], [2.0, 'down'], [2.5, 'down'], [3.0, 'down'], [3.6, 'open'], [4.2, 'down'], [4.8, 'toggle'],
  [5.4, 'down'], [6.0, 'toggle'], [6.6, 'down'], [7.2, 'toggle'], [7.9, 'up'], [8.3, 'up'], [8.7, 'up'], [9.3, 'toggle'], [10.0, 'close'], [10.8, 'home']];
const LOOP = 12;

function stateAt(p) {
  const checked = NODES.map((n) => n[2]), open = NODES.map((n, i) => i === 0);
  let cur = 0;
  const visible = () => NODES.map((_, i) => i).filter((i) => NODES[i][3] < 0 || open[NODES[i][3]]);
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const act = SCRIPT[k][1], vis = visible(), at = vis.indexOf(cur);
    if (act === 'down') cur = vis[Math.min(vis.length - 1, at + 1)];
    else if (act === 'up') cur = vis[Math.max(0, at - 1)];
    else if (act === 'home') cur = vis[0];
    else if (act === 'open') open[cur] = true;
    else if (act === 'close') open[cur] = false;
    else if (act === 'toggle') {
      if (KIDS[cur].length) { const all = KIDS[cur].every((j) => checked[j]); for (const j of KIDS[cur]) checked[j] = !all; } else checked[cur] = !checked[cur];
    }
  }
  return { checked, open, cur, visible: visible() };
}

const mark = (st, i) => (KIDS[i].length ? (KIDS[i].every((j) => st.checked[j]) ? 'x' : KIDS[i].some((j) => st.checked[j]) ? '-' : ' ') : st.checked[i] ? 'x' : ' ');
const size = (st, i) => (KIDS[i].length ? KIDS[i].reduce((s, j) => s + (st.checked[j] ? NODES[j][1] : 0), 0) : st.checked[i] ? NODES[i][1] : 0);
const fmt = (mb) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : mb >= 1 ? `${Math.round(mb)} MB` : mb > 0 ? `${Math.max(1, Math.round(mb * 1000))} KB` : '');

export default {
  id: 'input-checkbox-tree',
  since: '0.3.0',
  title: 'Checkbox Tree',
  category: 'Toggles & Checkboxes',
  description: 'A tri-state backup selection tree: checking a folder checks its children, unchecking one child turns the parent [-], and the selected total updates as the cursor walks.',
  tags: ['checkbox', 'tree', 'tri-state', 'indeterminate', 'backup', 'selection'],
  kind: 'tui',
  size: { w: 56, h: 13 },
  minSize: { w: 36, h: 8 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), leaves = NODES.map((_, i) => i).filter((i) => !KIDS[i].length && st.checked[i]);
      const total = leaves.reduce((s, i) => s + NODES[i][1], 0);
      const border = W >= 40 && H >= 9, sizes = W >= 46, hints = W >= 52;
      const MID = u ? '·' : '-';
      const foot = hints ? `${fmt(total)} in ${leaves.length} folders ${MID} Space toggle ${MID} ${u ? '←/→' : '</>'} fold` : `${fmt(total)} ${MID} ${leaves.length} folders`;
      const inner = border ? panel(ctx, b, 0, 0, W, H, { title: 'Back up', footer: foot, color: th.line, footerColor: sub }) : b;
      const rows = border ? inner.height : H - 1, iw = border ? inner.width : W;
      const first = Math.max(0, Math.min(st.visible.length - rows, st.visible.indexOf(st.cur) - rows + 2));
      st.visible.slice(first, first + rows).forEach((i, r) => {
        const on = i === st.cur, depth = NODES[i][3] < 0 ? 0 : 1, kids = KIDS[i].length > 0;
        const exp = kids ? (st.open[i] ? g.triDown : g.tri) : ' ';
        const box = `[${mark(st, i)}]`, label = NODES[i][0], sz = kids || st.checked[i] ? fmt(size(st, i)) : '';
        const x0 = 2 + depth * 2, nameW = Math.max(4, iw - x0 - 6 - (sizes ? 9 : 0));
        const line = fit(`${exp} ${box} ${fit(label, nameW, undefined, ctx).trimEnd()}`, iw - 2 - depth * 2, undefined, ctx);
        if (on) {
          inner.text(0, r, `${g.caret} `, th.accent, undefined, ATTR.BOLD);
          inner.text(x0, r, line, th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
        } else {
          let x = inner.text(x0, r, exp, kids ? th.accent : sub);
          x = inner.text(x + 1, r, box, th.ink, undefined, ATTR.BOLD);
          inner.text(x + 1, r, fit(label, nameW, undefined, ctx).trimEnd(), th.ink);
        }
        if (sizes && sz) inner.text(iw - stringWidth(sz) - 1, r, sz, on ? th.ink : sub, undefined, on ? ATTR.INVERSE : 0);
      });
      if (!border) b.text(0, H - 1, fit(foot, W, undefined, ctx), sub);
    };
  },
};
