// A service list with row actions: the selected row shows Restart / Logs / Delete, and a delete can be undone.
import { ATTR, uni, glyphs, phase, stepAt, stringWidth } from './_input.js';

const SERVICES = [['api', 'running', 3, 3], ['web', 'running', 4, 4], ['worker', 'degraded', 1, 3], ['cron', 'stopped', 0, 1], ['mailer', 'running', 2, 2], ['search', 'running', 2, 2]];
const UNDO_S = 5, LOOP = 12;
// [time, key]. Walk the rows, come back to api, open its actions, delete it, undo 3 s in, close the actions.
const SCRIPT = [[1.0, 'down'], [1.5, 'down'], [2.0, 'up'], [2.5, 'up'], [3.0, 'open'], [3.8, 'delete'], [7.0, 'undo'], [8.6, 'close']];

function stateAt(p) {
  let cur = 0, open = false, deleted = -1, delAt = -Infinity, undoAt = -Infinity;
  const n = stepAt(p, SCRIPT.map((s) => s[0]));
  for (let k = 0; k <= n; k++) {
    const key = SCRIPT[k][1];
    if (key === 'down') cur = Math.min(SERVICES.length - 1, cur + 1);
    else if (key === 'up') cur = Math.max(0, cur - 1);
    else if (key === 'open') open = true;
    else if (key === 'close') open = false;
    else if (key === 'delete') { deleted = cur; delAt = SCRIPT[k][0]; open = false; }
    else if (key === 'undo') { deleted = -1; undoAt = SCRIPT[k][0]; open = true; }
  }
  return { cur, open, deleted, sinceDel: p - delAt, sinceUndo: p - undoAt };
}

export default {
  id: 'input-row-actions',
  since: '0.3.0',
  title: 'List with Row Actions',
  category: 'Selects & Lists',
  description: 'A service list where the selected row shows inline actions, restart, logs and delete: a delete collapses the row behind an undo countdown, and undo brings it back.',
  tags: ['row actions', 'inline actions', 'undo', 'delete', 'list', 'services'],
  kind: 'tui',
  size: { w: 64, h: 12 },
  minSize: { w: 40, h: 8 },
  loop: LOOP,
  color: '16',
  order: 250,
  setup(ctx) {
    const th = ctx.theme;
    const sub = th.mode === 'light' ? th.ink : th.muted;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP)), MID = u ? '·' : '-', labels = W >= 56, statusWords = W >= 48;
      const top = H >= 10 ? 2 : 0;
      if (top) {
        b.text(0, 0, 'Services', th.ink, undefined, ATTR.BOLD);
        b.text(9, 0, `${MID} prod-east ${MID} ${SERVICES.length - (st.deleted >= 0 ? 1 : 0)} services`, sub);
      }
      // the delete collapses the row (it dims, then the rows below close up) behind an undo bar
      const collapsing = st.deleted >= 0 && st.sinceDel < 0.35;
      const rows = SERVICES.map((s, i) => i).filter((i) => i !== st.deleted || collapsing);
      // with the selected row deleted, the cursor rests on the row that took its place
      const cur = st.deleted === st.cur && !collapsing ? SERVICES.findIndex((_, i) => i > st.cur && i !== st.deleted) : st.cur;
      const DEL = u ? '×' : '-';
      rows.forEach((i, r) => {
        const [name, state, up, want] = SERVICES[i], y = top + r, gone = i === st.deleted, on = i === cur && (!gone || collapsing);
        const [dot, dc] = state === 'running' ? [u ? '●' : '*', th.pos] : state === 'degraded' ? [u ? '◐' : '~', th.warn] : [u ? '○' : '-', sub];
        b.text(0, y, on ? g.caret : ' ', th.accent, undefined, ATTR.BOLD);
        const nameW = 10, line = `${name.padEnd(nameW)}`;
        b.text(2, y, line, gone ? sub : th.ink, undefined, on ? ATTR.INVERSE | ATTR.BOLD : gone ? ATTR.STRIKE : 0);
        b.text(2 + nameW + 1, y, dot, gone ? sub : dc, undefined, ATTR.BOLD);
        const sx = 2 + nameW + 3, stTxt = statusWords ? `${state.padEnd(9)}${up}/${want}` : `${up}/${want}`;
        b.text(sx, y, stTxt, gone ? sub : th.ink, undefined, gone ? ATTR.STRIKE : 0);
        if (gone) { const dx = b.text(sx + stringWidth(stTxt) + 2, y, DEL, th.neg, undefined, ATTR.BOLD); b.text(dx + 1, y, 'deleting', th.ink, undefined, ATTR.BOLD); }
        if (on && st.open && !gone) {
          // inline actions on the selected row; labels shrink to their keys when narrow
          let ax = sx + stringWidth(stTxt) + 2;
          const acts = labels ? [['r', 'estart'], ['l', 'ogs'], ['d', 'elete']] : [['r', ''], ['l', ''], ['d', '']];
          acts.forEach(([key, rest], j) => {
            if (j === 2) ax = b.text(ax, y, u ? '×' : '-', th.neg, undefined, ATTR.BOLD) + 1;
            ax = b.text(ax, y, `[${key}]`, th.ink, undefined, ATTR.BOLD);
            ax = b.text(ax, y, rest, th.ink) + (labels ? 1 : 0);
          });
        }
      });
      // the undo bar, counting down; undo restores the row where it was
      const by = H - 1;
      if (st.deleted >= 0) {
        const left = Math.max(0, Math.ceil(UNDO_S - st.sinceDel)), name = SERVICES[st.deleted][0];
        let x = b.text(0, by, g.warn, th.warn, undefined, ATTR.BOLD);
        const msg = [`Deleted ${name} ${MID} u to undo (${left}s)`, `Deleted ${name} ${MID} u undo ${left}s`].find((m) => stringWidth(m) + 2 <= W);
        const end = b.text(x + 1, by, msg ?? `u undo ${left}s`, th.ink, undefined, ATTR.BOLD), bw = Math.min(10, W - end - 2);
        if (bw >= 3) { const f = Math.max(0, 1 - st.sinceDel / UNDO_S) * bw; for (let i = 0; i < bw; i++) b.set(end + 2 + i, by, i < Math.round(f) ? (u ? '█' : '#') : (u ? '░' : '.'), i < Math.round(f) ? th.warn : th.muted); }
      } else if (st.sinceUndo < 1.4) {
        const x = b.text(0, by, g.check, th.pos, undefined, ATTR.BOLD);
        b.text(x + 1, by, `Restored ${SERVICES[st.cur][0]}`, th.ink, undefined, ATTR.BOLD);
      } else if (H >= 10) {
        b.text(0, by, `${u ? '↑/↓' : '^/v'} move ${MID} enter actions ${MID} r l d`, sub);
      }
    };
  },
};
