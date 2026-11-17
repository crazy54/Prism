// Segmented controls: compact value pickers in a dashboard form, the selection easing between segments.
import { ATTR, uni, glyphs, phase, stepAt, stringWidth } from './_input.js';

const GROUPS = [
  { label: 'Time range', segs: ['1h', '6h', '24h', '7d', '30d'], off: [4] },
  { label: 'View', segs: ['Chart', 'Table'], off: [] },
];
const POINTS = { '1h': 60, '6h': 360, '24h': 288, '7d': 2016 }, SPAN = { '1h': '1 h', '6h': '6 h', '24h': '24 h', '7d': '7 d' };
// [time, key]: right/left move focus inside a group (skipping disabled), tab / backtab switch groups, enter selects.
const SCRIPT = [[1.0, 'right'], [1.7, 'enter'], [2.4, 'right'], [3.0, 'right'], [3.7, 'enter'], [4.5, 'tab'], [5.1, 'right'], [5.8, 'enter'],
  [6.7, 'backtab'], [7.2, 'left'], [7.6, 'left'], [8.0, 'left'], [8.5, 'enter'], [9.0, 'tab'], [9.3, 'left'], [9.6, 'enter'], [9.8, 'backtab']];
const LOOP = 10;

function stateAt(p) {
  const sel = [0, 0], foc = [0, 0], prev = [0, 0];
  let g = 0, at = -Infinity;
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const key = SCRIPT[k][1], G = GROUPS[g];
    if (key === 'right' || key === 'left') {
      let i = foc[g];
      do i += key === 'right' ? 1 : -1; while (G.off.includes(i));
      if (i >= 0 && i < G.segs.length) foc[g] = i;
    } else if (key === 'enter') { prev[g] = sel[g]; sel[g] = foc[g]; at = SCRIPT[k][0]; } else if (key === 'tab') { g = 1; foc[1] = sel[1]; } else if (key === 'backtab') { g = 0; foc[0] = sel[0]; }
  }
  return { sel, foc, prev, g, since: p - at };
}

export default {
  id: 'input-segmented',
  since: '0.3.0',
  title: 'Segmented Controls',
  category: 'Toggles & Checkboxes',
  description: 'Compact segmented pickers in a dashboard form, time range and view: focus moves with the arrows, Enter selects, a disabled segment is skipped and the preview updates.',
  tags: ['segmented control', 'button group', 'picker', 'time range', 'form', 'toggle group'],
  kind: 'tui',
  size: { w: 60, h: 9 },
  minSize: { w: 36, h: 6 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), boxed = H >= 9;
      const MID = u ? '·' : '-', V = u ? '│' : '|';
      // labels move above the strips before the segments lose their padding
      const stripW = (p) => Math.max(...GROUPS.map((G) => 1 + G.segs.reduce((n, s) => n + stringWidth(s) + 2 + 2 * p + 1, 0)));
      const above = 14 + stripW(1) > W, pad = (above ? 2 : 14) + stripW(1) <= W ? 1 : 0;
      const groupH = (boxed ? 3 : 1) + (above ? 1 : 0);
      GROUPS.forEach((G, gi) => {
        const y0 = gi * (groupH + (boxed ? 0 : 1)), labelW = above ? 0 : 12;
        const focused = st.g === gi;
        // the group label, with a pointer on the focused group
        const ly = above ? y0 : y0 + (boxed ? 1 : 0);
        b.text(0, ly, focused ? g.caret : ' ', th.accent, undefined, ATTR.BOLD);
        b.text(2, ly, G.label, th.ink, undefined, focused ? ATTR.BOLD : 0);
        const top = above ? y0 + 1 : y0, sy = top + (boxed ? 1 : 0), sx = above ? 2 : labelW + 2;
        // segments: [label] when selected (inverse), (label) when disabled, a caret on the focused one
        const cells = G.segs.map((s, i) => (G.off.includes(i) ? `(${s})` : i === st.sel[gi] ? `[${s}]` : ` ${s} `));
        const ws = cells.map((c) => stringWidth(c) + 2 * pad);
        let x = sx;
        if (boxed) b.text(sx, top, (u ? '╭' : '+') + ws.map((w) => (u ? '─' : '-').repeat(w)).join(u ? '┬' : '+') + (u ? '╮' : '+'), th.line);
        b.text(x, sy, V, th.line);
        cells.forEach((c, i) => {
          x += 1;
          const on = i === st.sel[gi], off = G.off.includes(i), foc = focused && i === st.foc[gi] && !on;
          const body = ' '.repeat(pad) + c + ' '.repeat(pad);
          const leaving = i === st.prev[gi] && st.since < 0.15 && !on;   // the highlight eases across for a frame or two
          if (on) {   // ink-inverse label inside accent brackets
            let cx = b.text(x + pad, sy, '[', th.accent, undefined, ATTR.BOLD);
            cx = b.text(cx, sy, G.segs[i], th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
            b.text(cx, sy, ']', th.accent, undefined, ATTR.BOLD);
          } else if (leaving) b.text(x, sy, body, th.ink, undefined, ATTR.BOLD);
          else if (off) b.text(x, sy, body, sub);
          else b.text(x, sy, body, th.ink, undefined, foc ? ATTR.UNDERLINE | ATTR.BOLD : 0);
          if (foc) b.text(x, sy, g.caret, th.accent, undefined, ATTR.BOLD);
          x += ws[i];
          b.text(x, sy, V, th.line);
        });
        if (boxed) b.text(sx, top + 2, (u ? '╰' : '+') + ws.map((w) => (u ? '─' : '-').repeat(w)).join(u ? '┴' : '+') + (u ? '╯' : '+'), th.line);
      });
      // the preview the picks drive; it drops first
      const range = GROUPS[0].segs[st.sel[0]], view = GROUPS[1].segs[st.sel[1]];
      const preview = view === 'Chart' ? `showing last ${SPAN[range]} ${MID} ${POINTS[range].toLocaleString('en-US')} points` : `table ${MID} last ${SPAN[range]} ${MID} ${POINTS[range].toLocaleString('en-US')} rows`;
      const py = GROUPS.length * (groupH + (boxed ? 0 : 1)) + (boxed ? 0 : -1);
      if (py < H && stringWidth(preview) <= W) b.text(0, py, preview, th.ink);
      const hint = `${u ? '←/→' : '</>'} move ${MID} enter select ${MID} tab next group`;
      if (H >= 9 && py < H - 1 && stringWidth(hint) <= W) b.text(0, H - 1, hint, sub);
    };
  },
};
