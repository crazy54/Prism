// An error dialog: a one-line summary, an expandable Details response, and Retry / Copy / Close; Retry works after a reload.
import { ATTR, uni, glyphs, phase, panel, spin, stringWidth } from './_input.js';
import { sub, fitText, inv, silhouette } from './_kit6.js';

const LOOP = 14;
const DETAILS = ['{', '  "error": "version_conflict",', '  "current": 41,', '  "yours": 40,', '  "hint": "reload and reapply"', '}'];
const BTN = [['Retry', 'Retry'], ['Copy details', 'Copy'], ['Close', 'Close']];
// [time, key]: open Details, copy, Retry fails, reload, Retry succeeds and the dialog closes; the error is back at 13.
const KEYS = [[1.0, 'FOCUS_DETAILS'], [1.6, 'TOGGLE'], [3.0, 'FOCUS_1'], [3.6, 'PRESS'], [5.2, 'FOCUS_0'], [5.8, 'PRESS'], [8.4, 'RELOAD'], [9.2, 'PRESS'], [11.0, 'CLOSE'], [13.0, 'REOPEN']];

function stateAt(p) {
  let focus = 0, open = false, onDetails = false, copied = -Infinity, retry = -Infinity, tries = 0, reloaded = false, closed = false;
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'FOCUS_DETAILS') onDetails = true; else if (k === 'TOGGLE') open = !open;
    else if (k.startsWith('FOCUS_')) { onDetails = false; focus = +k.slice(6); }
    else if (k === 'PRESS') { if (focus === 1) copied = t; else if (focus === 0) { retry = t; tries++; } }
    else if (k === 'RELOAD') reloaded = true; else if (k === 'CLOSE') closed = true;
    else if (k === 'REOPEN') { focus = 0; open = false; onDetails = false; copied = retry = -Infinity; tries = 0; reloaded = false; closed = false; }
  }
  const sinceRetry = p - retry, retrying = sinceRetry >= 0 && sinceRetry < 1.0;
  return { focus, open, onDetails, copied: p - copied, retrying, failed: tries === 1 && sinceRetry >= 1.0, ok: tries === 2 && sinceRetry >= 1.0, reloaded, closed, p };
}

export default {
  id: 'input-error-details',
  since: '0.3.0',
  title: 'Error Dialog',
  category: 'Dialogs & Prompts',
  description: 'An error dialog with a one-line summary, a Details expander that reveals the response, and Retry, Copy and Close: Retry fails once, then succeeds after a reload.',
  tags: ['error', 'dialog', 'details', 'retry', 'conflict', 'expander'],
  kind: 'tui',
  size: { w: 64, h: 13 },
  minSize: { w: 44, h: 9 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx);
      const st = stateAt(phase(t, LOOP));
      if (st.closed) {
        silhouette(ctx, b, W, H);
        const c = b.text(2, H - 1, ` ${g.check}`, th.pos, undefined, ATTR.BOLD); b.text(c, H - 1, ' config applied ', th.ink, undefined, ATTR.BOLD);
        return;
      }
      const inner = panel(ctx, b, 0, 0, W, H, { color: th.neg, titleColor: th.ink });
      const iw = inner.width;
      let x = inner.text(0, 0, g.cross, th.neg, undefined, ATTR.BOLD);
      inner.text(x + 1, 0, "Couldn't apply config", th.ink, undefined, ATTR.BOLD);
      // the summary wraps to 2 lines when narrow
      const summary = st.reloaded ? 'reloaded: version 41, you now have 41' : `PUT /v1/flags ${u ? '→' : '->'} 409 Conflict (version 41, you have 40)`;
      let y = 1;
      if (stringWidth(summary) <= iw) inner.text(0, y++, summary, th.ink);
      else { const cut = summary.lastIndexOf(' ', iw); inner.text(0, y++, summary.slice(0, cut), th.ink); inner.text(0, y++, summary.slice(cut + 1), th.ink); }
      // the expander: ▸/▾ Details, then numbered JSON lines (keys muted by Night allowed; values ink)
      y++;
      const exp = st.open ? g.triDown : g.tri;
      if (st.onDetails) { inner.text(0, y, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, inner, 2, y, ` ${exp} Details `); }
      else { inner.text(2, y, exp, th.accent, undefined, ATTR.BOLD); inner.text(4, y, 'Details', th.ink, undefined, ATTR.BOLD); }
      y++;
      const room = inner.height - y - 2;
      if (st.open) {
        DETAILS.slice(0, Math.max(0, room)).forEach((line, i) => {
          inner.text(0, y + i, String(i + 1).padStart(2), sub(th));
          inner.text(3, y + i, line.slice(0, iw - 3), th.ink);
        });
      }
      // status, then the buttons; "Copy details" shortens to "Copy" when narrow
      const sy = inner.height - 2, by = inner.height - 1;
      if (st.retrying) { const c = inner.text(0, sy, spin(ctx, st.p), th.accent, undefined, ATTR.BOLD); inner.text(c + 1, sy, `retrying${u ? '…' : '...'}`, th.ink); }
      else if (st.failed) { const c = inner.text(0, sy, g.cross, th.neg, undefined, ATTR.BOLD); inner.text(c + 1, sy, 'still conflicts', th.ink); }
      else if (st.ok) { const c = inner.text(0, sy, g.check, th.pos, undefined, ATTR.BOLD); inner.text(c + 1, sy, 'applied', th.ink); }
      else if (st.copied >= 0 && st.copied < 1.4) { const c = inner.text(0, sy, g.check, th.pos, undefined, ATTR.BOLD); inner.text(c + 1, sy, 'copied', th.ink); }
      const long = BTN.reduce((n, [l]) => n + stringWidth(l) + 5, 0) <= iw;
      x = 0;
      BTN.forEach(([l, s], i) => {
        const label = `[ ${long ? l : s} ]`, on = !st.onDetails && i === st.focus;
        if (on) { inner.text(x, by, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, inner, x + 1, by, label); } else inner.text(x + 1, by, label, th.ink);
        x += stringWidth(label) + 2;
      });
    };
  },
};
