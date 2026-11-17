// An edit conflict: yours and theirs side by side with differing lines marked; the result preview follows the focus.
import { ATTR, uni, glyphs, phase, panel, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 14;
const MINE = ['replicas: 4', 'image: api:1.9.2', 'cpu: 500m', 'memory: 1Gi', 'env: staging'];
const THEIRS = ['replicas: 6', 'image: api:1.9.2', 'cpu: 750m', 'memory: 1Gi', 'env: staging'];
const CHOICES = ['Keep mine', 'Keep theirs', 'Keep both'];
// [time, focus|enter]: focus walks the choices (the preview follows), Keep theirs is picked, then the dialog resets.
const KEYS = [[2.5, 1], [4.0, 2], [5.5, 1], [6.5, 'ENTER'], [10.5, 'RESET']];

function stateAt(p) {
  let focus = 0, done = -Infinity;
  for (const [t, k] of KEYS) { if (t > p) break; if (k === 'ENTER') done = t; else if (k === 'RESET') { focus = 0; done = -Infinity; } else focus = k; }
  return { focus, done: done > -Infinity ? p - done : -1 };
}
const result = (c) => (c === 0 ? MINE : c === 1 ? THEIRS : MINE.flatMap((l, i) => (l === THEIRS[i] ? [l] : [`${l}  # yours`, `${THEIRS[i]}  # theirs`])));

export default {
  id: 'input-conflict-dialog',
  since: '0.3.0',
  title: 'Edit Conflict',
  category: 'Dialogs & Prompts',
  description: 'A config edit conflict: your version and theirs side by side with the differing lines marked, Keep mine, theirs or both, and a result preview that follows the focus.',
  tags: ['conflict', 'merge', 'diff', 'dialog', 'resolve', 'config'],
  kind: 'tui',
  size: { w: 72, h: 14 },
  minSize: { w: 52, h: 10 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx), GUT = u ? '▌' : '|';
      const st = stateAt(phase(t, LOOP)), inner = panel(ctx, b, 0, 0, W, H, { title: 'Edit conflict: deploy/api.yaml', color: th.accent, titleColor: th.ink });
      const iw = inner.width, ih = inner.height, side = iw >= 64, nums = iw >= 56;
      // the panes: side by side, or yours over theirs when narrow; differing lines get a warn gutter and bold text
      const pane = (x, y, w, title, lines, n) => {
        inner.text(x, y, title, th.ink, undefined, ATTR.BOLD);
        lines.slice(0, n).forEach((l, i) => {
          const diff = l !== (lines === MINE ? THEIRS : MINE)[i], ly = y + 1 + i;
          inner.text(x, ly, diff ? GUT : ' ', th.warn, undefined, ATTR.BOLD);
          let lx = x + 2;
          if (nums) lx = inner.text(lx, ly, String(i + 1).padStart(2), sub(th)) + 1;
          fitText(inner, lx, ly, w - (lx - x), [l], th.ink, undefined, diff ? ATTR.BOLD : 0);
        });
      };
      const n = side ? 5 : Math.max(2, Math.floor((ih - 5) / 2) - 1);
      if (side) { const pw = Math.floor((iw - 2) / 2); pane(0, 0, pw, 'yours', MINE, n); pane(pw + 2, 0, pw, 'theirs', THEIRS, n); }
      else { pane(0, 0, iw, 'yours', MINE, n); pane(0, n + 1, iw, 'theirs', THEIRS, n); }
      // the choices, then the result preview (it drops first)
      const cy = side ? 7 : 2 * (n + 1);
      let x = 0;
      CHOICES.forEach((c, i) => {
        const label = `[ ${c} ]`, on = i === st.focus;
        if (on) { inner.text(x, cy, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, inner, x + 1, cy, label); } else inner.text(x + 1, cy, label, th.ink);
        x += stringWidth(label) + 2;
      });
      if (st.done >= 0) { const c = inner.text(0, ih - 1, g.check, th.pos, undefined, ATTR.BOLD); inner.text(c + 1, ih - 1, `resolved: kept ${CHOICES[st.focus].split(' ')[1]}`, th.ink, undefined, ATTR.BOLD); return; }
      const py = cy + 2, rows = result(st.focus).filter((l, i) => l !== MINE[i] || st.focus === 2 ? true : false);
      if (side && py + 1 < ih) {
        inner.text(0, py, 'result', sub(th), undefined, ATTR.BOLD);
        result(st.focus).filter((l) => /replicas|cpu/.test(l)).slice(0, ih - py - 1).forEach((l, i) => fitText(inner, 2, py + 1 + i, iw - 2, [l], th.ink));
      }
      void rows;
    };
  },
};
