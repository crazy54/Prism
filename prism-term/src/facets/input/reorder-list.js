// A keyboard-reorderable list: Space grabs a row, the arrows move it while the others make room, Space drops.
import { ATTR, uni, glyphs, phase, stepAt, stringWidth } from './_input.js';

const ITEMS = [['db-primary', 'writer'], ['db-replica', 'reader'], ['api-01', 'stateless'], ['api-02', 'stateless'], ['web-01', 'edge'], ['web-02', 'edge']];
// [time, key]. db-primary is grabbed and carried to the end (it should restart last), dropped, then carried back.
const SCRIPT = [[1.0, 'grab'], [1.6, 'down'], [2.2, 'down'], [2.8, 'down'], [3.4, 'down'], [4.0, 'down'], [4.7, 'drop'],
  [6.5, 'grab'], [7.1, 'up'], [7.7, 'up'], [8.3, 'up'], [8.9, 'up'], [9.5, 'up'], [10.1, 'drop']];
const LOOP = 12;

function stateAt(p) {
  const order = ITEMS.map((_, i) => i);
  let cur = 0, held = false, moved = -Infinity, dropped = -Infinity;
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const key = SCRIPT[k][1];
    if (key === 'grab') held = true;
    else if (key === 'drop') { held = false; dropped = SCRIPT[k][0]; }
    else {
      const to = key === 'down' ? Math.min(order.length - 1, cur + 1) : Math.max(0, cur - 1);
      if (held && to !== cur) { [order[cur], order[to]] = [order[to], order[cur]]; moved = SCRIPT[k][0]; }
      cur = to;
    }
  }
  return { order, cur, held, moved: p - moved, dropped: p - dropped };
}

export default {
  id: 'input-reorder-list',
  since: '0.3.0',
  title: 'Reorderable List',
  category: 'Selects & Lists',
  description: 'Setting a rolling-restart order by keyboard: Space grabs a row, the arrows carry it while the other rows make room and renumber, and Space drops it in its new place.',
  tags: ['reorder', 'sortable', 'drag', 'keyboard', 'list', 'restart order'],
  kind: 'tui',
  size: { w: 52, h: 11 },
  minSize: { w: 34, h: 7 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), handles = W >= 40, notes = W >= 44, foot = H >= 7, MID = u ? '·' : '-';
      const top = H >= 10 ? 2 : 0;
      if (top) {
        b.text(0, 0, 'Restart order', th.ink, undefined, ATTR.BOLD);
        const nm = ITEMS[st.order[st.cur]][0];
        const say = (st.held ? [`${MID} moving ${nm}`, `${MID} moving`] : st.dropped < 1.8 ? [`${MID} ${nm} is now #${st.cur + 1}`, `${MID} now #${st.cur + 1}`] : [`${MID} top to bottom`, '']).find((m) => 14 + stringWidth(m) <= W);
        if (say) b.text(14, 0, say, sub);
      }
      const rows = Math.min(ITEMS.length, H - top - (foot ? 1 : 0));
      for (let r = 0; r < rows; r++) {
        const [name, note] = ITEMS[st.order[r]], on = r === st.cur, grabbed = on && st.held, y = top + r;
        const num = `${r + 1}`.padStart(2), handle = handles ? (u ? '⋮⋮' : '::') : '';
        const nudge = grabbed ? 1 : 0;
        b.text(0, y, on ? g.caret : ' ', th.accent, undefined, ATTR.BOLD);
        b.text(2, y, num, sub);
        let x = 5 + nudge;
        if (handles) { b.text(x, y, handle, grabbed ? th.accent : sub, undefined, grabbed ? ATTR.BOLD : 0); x += 3; }
        const text = `${name}${notes ? ` ${MID} ${note}` : ''}`;
        if (grabbed) {
          const mark = u ? '≡' : '=';
          b.text(x, y, ` ${text} `.padEnd(Math.min(W - x - 3, 26)), th.ink, undefined, ATTR.INVERSE | ATTR.BOLD);
          b.text(Math.min(W - 2, x + Math.min(W - x - 3, 26) + 1), y, mark, th.accent, undefined, ATTR.BOLD);
        } else {
          b.text(x + 1, y, name, th.ink, undefined, on ? ATTR.BOLD | ATTR.UNDERLINE : 0);
          if (notes) b.text(x + 1 + stringWidth(name), y, ` ${MID} ${note}`, sub);
        }
      }
      if (foot) {
        const keys = [`Space grab ${MID} ${u ? '↑↓' : '^v'} move ${MID} Space drop`, `Space grab/drop ${MID} ${u ? '↑↓' : '^v'}`];
        const k = keys.find((s) => stringWidth(s) <= W);
        if (k) b.text(0, H - 1, k, sub);
      }
    };
  },
};
