// Shell reverse history search: Ctrl-R plus a query fills the line with the newest match; Ctrl-R again steps older.
import { ATTR, uni, phase, stringWidth } from './_input.js';
import { sub, fitText } from './_kit6.js';

const LOOP = 12;
const HISTORY = ['kubectl rollout restart deploy/api -n staging', 'git pull --rebase', 'kubectl get pods -n staging -l app=api', 'make test',
  'kubectl logs deploy/api -n staging --since=10m', 'kubens staging'];
const TRANSCRIPT = [['$ ', 'git status -sb'], ['', '## main...origin/main'], ['$ ', 'make test'], ['', 'ok   ./internal/api   2.41s'], ['$ ', 'kubectl config current-context'], ['', 'staging-east']];
// [time, key]. Ctrl-R, "kub", Ctrl-R through older matches, a failed "z" and its Backspace, → accepts, Ctrl-C clears.
const KEYS = [[0.8, 'R'], [1.4, 'k'], [1.8, 'u'], [2.2, 'b'], [3.2, 'R'], [4.0, 'R'], [4.8, 'R'], [5.8, 'z'], [6.8, 'BS'], [7.8, 'ACCEPT'], [10.2, 'CANCEL']];

function stateAt(p) {
  let mode = 'prompt', q = '', idx = -1, line = '';
  const find = (from) => { for (let i = Math.max(0, from); i < HISTORY.length; i++) if (HISTORY[i].includes(q)) return i; return -1; };
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'R') { if (mode !== 'search') { mode = 'search'; q = ''; idx = -1; } else { const n = find(idx + 1); if (n >= 0) idx = n; } }
    else if (k === 'BS') { q = q.slice(0, -1); idx = HISTORY[idx]?.includes(q) ? idx : find(0); }
    else if (k === 'ACCEPT') { mode = 'prompt'; line = HISTORY[idx] ?? ''; }
    else if (k === 'CANCEL') { mode = 'prompt'; line = ''; }
    else { q += k; const keep = idx >= 0 && HISTORY[idx].includes(q); if (!keep) { const n = find(idx < 0 ? 0 : idx); idx = n >= 0 ? n : idx; } }
  }
  const failed = mode === 'search' && q && (idx < 0 || !HISTORY[idx].includes(q));
  return { mode, q, idx, line, failed };
}

export default {
  id: 'input-history-search',
  since: '0.3.0',
  title: 'History Search',
  category: 'Command Palettes',
  description: 'Shell reverse history search: Ctrl-R and a query fill the line with the newest match, highlighted, Ctrl-R again steps to older ones, and the arrow key accepts the line to edit.',
  tags: ['history', 'reverse search', 'ctrl-r', 'shell', 'readline', 'command line'],
  kind: 'tui',
  size: { w: 64, h: 8 },
  minSize: { w: 40, h: 5 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), ELL = u ? '…' : '...';
      const st = stateAt(phase(t, LOOP)), y = H - 1;
      // the transcript scrolls above; it drops first
      const lines = TRANSCRIPT.slice(-Math.max(0, H - 2));
      lines.forEach(([pr, txt], i) => { const x = pr ? b.text(0, i, pr, sub(th), undefined, ATTR.BOLD) : 0; fitText(b, x, i, W - x, [txt], pr ? th.ink : sub(th)); });
      if (st.mode === 'prompt') {
        const x = b.text(0, y, '$ ', th.accent, undefined, ATTR.BOLD), room = W - x - 1;
        const shown = stringWidth(st.line) > room ? st.line.slice(0, room - 1) + ELL.slice(0, 1) : st.line;
        const e = b.text(x, y, shown, th.ink);
        b.text(e, y, u ? '▏' : '_', th.ink, undefined, ATTR.BOLD);
        return;
      }
      // the search line: the match underlined and bold, the tail cut after the match, never through it
      const label = st.failed ? '(failed reverse-i-search)' : '(reverse-i-search)';
      let x = b.text(0, y, label, sub(th));
      x = b.text(x, y, '`', sub(th)); x = b.text(x, y, st.q, th.ink, undefined, ATTR.BOLD); x = b.text(x, y, "': ", sub(th));
      const cmd = st.idx >= 0 ? HISTORY[st.idx] : '', at = st.failed ? -1 : cmd.indexOf(st.q), room = W - x;
      let shown = cmd;
      if (stringWidth(cmd) > room) { const keep = Math.max(room - stringWidth(ELL), at >= 0 ? at + st.q.length : 0); shown = cmd.slice(0, keep) + ELL; }
      if (stringWidth(shown) > room) shown = '';
      b.text(x, y, shown, th.ink);
      if (at >= 0 && st.q && at + st.q.length <= stringWidth(shown)) b.text(x + at, y, st.q, th.ink, undefined, ATTR.UNDERLINE | ATTR.BOLD);
    };
  },
};
