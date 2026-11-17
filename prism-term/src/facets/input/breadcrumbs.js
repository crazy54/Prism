// A breadcrumb bar whose middle collapses into … as it grows: ←/→ walk the segments, Enter jumps, ↓ opens siblings.
import { ATTR, uni, glyphs, phase, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 12;
const FULL = ['prod', 'us-east-1', 'payments', 'api', 'deployments', 'api-7f3c', 'pods', 'api-7f3c-x8k2p'];
const CHILDREN = { payments: ['api', 'worker', 'ledger'], api: ['deployments', 'services', 'config'], deployments: ['api-7f3c', 'api-6e1b'], 'api-7f3c': ['pods', 'events'], pods: ['api-7f3c-x8k2p', 'api-7f3c-m4q9z'], 'api-7f3c-x8k2p': ['logs', 'env', 'events'] };
const SIBLINGS = ['billing', 'payments', 'ledger-svc'];
// [time, key]: drill down five levels (the middle collapses), focus the bar, walk ← to payments, open its siblings, close, Enter trims back.
const KEYS = [[1.0, 'IN'], [2.0, 'IN'], [3.0, 'IN'], [4.0, 'IN'], [5.0, 'IN'], [6.0, 'BAR'], [6.4, 'LEFT'], [6.8, 'LEFT'], [7.2, 'LEFT'], [7.6, 'LEFT'], [7.9, 'LEFT'],
  [8.4, 'DOWN'], [9.4, 'ESC'], [10.0, 'ENTER'], [10.6, 'CONTENT']];

function stateAt(p) {
  let depth = 3, bar = false, focus = 0, sib = false;
  for (const [t, k] of KEYS) {
    if (t > p) break;
    if (k === 'IN') depth = Math.min(FULL.length, depth + 1);
    else if (k === 'BAR') { bar = true; focus = depth - 1; } else if (k === 'LEFT') focus = Math.max(0, focus - 1);
    else if (k === 'DOWN') sib = true; else if (k === 'ESC') sib = false;
    else if (k === 'ENTER') depth = focus + 1; else if (k === 'CONTENT') bar = false;
  }
  return { depth, bar, focus, sib };
}

export default {
  id: 'input-breadcrumbs',
  since: '0.3.0',
  title: 'Breadcrumb Bar',
  category: 'Tabs & Bars',
  description: 'A location breadcrumb whose middle collapses into an ellipsis as it grows: the arrows walk the segments, Enter jumps back to one, and the down arrow opens its siblings.',
  tags: ['breadcrumbs', 'location bar', 'navigation', 'path', 'hierarchy', 'collapse'],
  kind: 'tui',
  size: { w: 72, h: 8 },
  minSize: { w: 40, h: 5 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), g = glyphs(ctx), SEP = u ? ' › ' : ' > ', ELL = u ? '…' : '~';   // a 1-col twin: both modes collapse the same segments
      const st = stateAt(phase(t, LOOP)), path = FULL.slice(0, st.depth), last = path.length - 1;
      // which segments show: all if they fit; else the first, …, the last two, and the focused one
      const width = (idx) => idx.reduce((n, i, k) => n + (i < 0 ? stringWidth(ELL) : stringWidth(path[i])) + (k ? stringWidth(SEP) : 0), 0);
      let idx = path.map((_, i) => i);
      if (width(idx) > W) {
        const keep = new Set([0, last - 1, last, st.bar ? st.focus : last]);
        idx = [];
        path.forEach((_, i) => { if (keep.has(i)) idx.push(i); else if (idx[idx.length - 1] !== -1) idx.push(-1); });
        if (width(idx) > W) idx = [0, -1, last];
      }
      let x = 0, fx = 0;
      idx.forEach((i, k) => {
        if (k) x = b.text(x, 0, SEP, sub(th));
        if (i < 0) { x = b.text(x, 0, ELL, th.ink); return; }
        const on = st.bar && i === st.focus, cur = i === last;
        if (on) fx = x;
        if (on) x = inv(ctx, b, x, 0, path[i]); else x = b.text(x, 0, path[i], th.ink, undefined, cur ? ATTR.BOLD : 0);
      });
      b.text(0, 1, (u ? '─' : '-').repeat(W), th.line);
      // the content: this location's items (drops first)
      const kids = CHILDREN[path[last]] ?? [];
      const next = FULL[st.depth];
      if (!(st.bar && st.sib)) kids.slice(0, Math.max(0, H - 3)).forEach((k, i) => {
        const y = 2 + i, on = !st.bar && k === next;
        if (on) { b.text(0, y, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, b, 2, y, ` ${k} `); } else b.text(3, y, k, th.ink);
      });
      // the siblings dropdown under the focused segment
      if (st.bar && st.sib) {
        const sx = Math.max(0, Math.min(W - 16, fx - 1));   // under the focused segment
        SIBLINGS.forEach((s, i) => {
          const y = 2 + i; if (y >= H) return;
          b.fill(sx, y, 16, 1, ' ');
          b.text(sx, y, u ? '│' : '|', th.accent);
          if (s === path[st.focus]) { b.text(sx + 1, y, '›', th.accent, undefined, ATTR.BOLD); inv(ctx, b, sx + 2, y, ` ${s} `); } else b.text(sx + 3, y, s, th.ink);
          b.text(sx + 15, y, u ? '│' : '|', th.accent);
        });
      }
      if (H >= 7) fitText(b, 0, H - 1, W, [`${u ? '←/→' : '</>'} segment ${u ? '·' : '-'} Enter jump ${u ? '·' : '-'} ${u ? '↓' : 'v'} siblings`, 'Enter jump'], sub(th));
    };
  },
};
