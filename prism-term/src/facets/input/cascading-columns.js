// Cascading columns: region → zone → instance type, where moving in one column repopulates the next.
import { ATTR, uni, glyphs, phase, stepAt, panel, clip, stringWidth } from './_input.js';

const REGIONS = [['us-east-1', 4], ['us-west-2', 3], ['eu-west-1', 3], ['ap-southeast-2', 2]];
const TYPES = [['m.large', 2, 8, 0.096], ['m.xlarge', 4, 16, 0.192], ['c.large', 2, 4, 0.085], ['r.large', 2, 16, 0.126], ['g.xlarge', 4, 16, 0.526]];
const zonesOf = (r) => Array.from({ length: REGIONS[r][1] }, (_, i) => `${REGIONS[r][0]}${'abcd'[i]}`);
// [time, key]. Walk the regions (zones repopulate), go right into zones, right into types, commit, back out.
const SCRIPT = [[1.0, 'down'], [1.6, 'down'], [2.2, 'up'], [2.8, 'up'], [3.4, 'right'], [4.0, 'down'], [4.6, 'right'], [5.2, 'down'], [5.8, 'up'],
  [6.4, 'enter'], [8.4, 'left'], [9.0, 'left']];
const LOOP = 12;

function stateAt(p) {
  const cur = [0, 0, 0];
  let col = 0, chosen = null, at = -Infinity;
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const key = SCRIPT[k][1], len = [REGIONS.length, REGIONS[cur[0]][1], TYPES.length][col];
    if (key === 'down') cur[col] = Math.min(len - 1, cur[col] + 1);
    else if (key === 'up') cur[col] = Math.max(0, cur[col] - 1);
    else if (key === 'right' && col < 2) { col++; cur[col] = 0; }
    else if (key === 'left' && col > 0) { cur[col] = 0; col--; chosen = null; }
    else if (key === 'enter' && col === 2) { chosen = [...cur]; at = SCRIPT[k][0]; }
  }
  return { cur, col, chosen, since: p - at };
}

export default {
  id: 'input-cascading-columns',
  since: '0.3.0',
  title: 'Cascading Columns',
  category: 'Selects & Lists',
  description: 'Three linked columns, region to zone to instance type: moving in one repopulates the next until the whole path is chosen, with a breadcrumb and the pick in detail.',
  tags: ['cascading', 'column browser', 'miller columns', 'hierarchy', 'picker', 'breadcrumb'],
  kind: 'tui',
  size: { w: 72, h: 12 },
  minSize: { w: 44, h: 8 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), MID = u ? '·' : '-', SEP = u ? ' › ' : ' > ';
      const three = W >= 60, detail = H >= 11, footH = detail ? 2 : 1, colH = H - footH;
      const shown = three ? [0, 1, 2] : st.col >= 2 ? [1, 2] : [0, 1];   // the leftmost column scrolls off when narrow
      const cw = Math.floor(W / shown.length);
      const lists = [REGIONS.map((r) => r[0]), zonesOf(st.cur[0]), TYPES.map((x) => x[0])];
      const titles = ['Region', 'Zone', 'Instance type'];
      shown.forEach((c, j) => {
        const x = j * cw, w = j === shown.length - 1 ? W - x : cw - 1, active = st.col === c;
        const inner = panel(ctx, b, x, 0, w, colH, { title: `${active ? `${g.caret} ` : ''}${titles[c]}`, color: active ? th.accent : th.line, titleColor: th.ink });
        const items = c <= st.col + 1 ? lists[c] : [];
        items.slice(0, inner.height).forEach((name, i) => {
          const on = active && i === st.cur[c], onPath = c < st.col && i === st.cur[c], kids = c < 2;
          const label = clip(ctx, name, Math.max(1, inner.width - 4));
          if (on) {
            inner.text(0, i, `${g.caret} ${label}`.padEnd(inner.width), th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
            if (kids) inner.text(inner.width - 1, i, g.tri, th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
          } else {
            inner.text(2, i, label, th.ink, undefined, onPath ? ATTR.BOLD : 0);
            if (kids) inner.text(inner.width - 1, i, g.tri, onPath ? th.ink : sub, undefined, onPath ? ATTR.BOLD : 0);
          }
        });
        if (c > st.col + 1 && inner.height > 0) inner.text(2, 0, `pick a ${titles[c - 1].toLowerCase()}`, sub);
      });
      // the path so far, then what it is
      const path = [REGIONS[st.cur[0]][0]];
      if (st.col >= 1) path.push(zonesOf(st.cur[0])[st.cur[1]]);
      if (st.col >= 2) path.push(TYPES[st.cur[2]][0]);
      const by = colH;
      let x = 0;
      if (st.chosen) x = b.text(0, by, g.check, th.pos, undefined, ATTR.BOLD) + 1;
      const crumb = path.join(SEP);
      b.text(x, by, stringWidth(crumb) + x <= W ? crumb : clip(ctx, crumb, W - x), th.ink, undefined, st.chosen ? ATTR.BOLD : 0);
      if (detail) {
        const [name, cpu, mem, price] = TYPES[st.cur[2]];
        const txt = st.col >= 2 ? `${name} ${MID} ${cpu} vCPU ${MID} ${mem} GiB ${MID} $${price.toFixed(3)}/h` : `${u ? '←/→' : '</>'} column ${MID} ${u ? '↑/↓' : '^/v'} move ${MID} enter pick`;
        if (stringWidth(txt) <= W) b.text(0, by + 1, txt, st.col >= 2 ? th.ink : sub);
      }
    };
  },
};
