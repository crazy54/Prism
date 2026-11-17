// A pagination bar: ‹ 1 … 7 8 [9] 10 11 … 42 › — step, jump with "g", first and last pages disable their ends.
import { ATTR, uni, phase, stringWidth } from './_input.js';
import { sub, fitText, inv } from './_kit6.js';

const LOOP = 12, TOTAL = 418, PER = 10, PAGES = Math.ceil(TOTAL / PER);
const ACT = ['deploy', 'rollback', 'scale', 'restart'], SVC = ['api', 'web', 'worker', 'search'];
// [time, page]: step, jump to 30, last page, first page, then back to 9 (the start).
const KEYS = [[1.0, 10], [2.0, 11], [4.0, 30], [5.4, PAGES], [7.4, 1], [9.6, 9]];
const TYPING = [[3.0, 'g'], [3.3, 'g 3'], [3.6, 'g 30'], [9.0, 'g'], [9.3, 'g 9']];

export default {
  id: 'input-pagination',
  since: '0.3.0',
  title: 'Pagination Bar',
  category: 'Tabs & Bars',
  description: 'A paged event list with a pager like ‹ 1 … 7 8 [9] 10 11 … 42 ›: the arrows step, "g" jumps to a page, the window recenters, and the shown range updates.',
  tags: ['pagination', 'pager', 'pages', 'list', 'navigation', 'jump'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 40, h: 6 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx), ELL = u ? '…' : '...', L = u ? '‹' : '<', R = u ? '›' : '>';
      const p = phase(t, LOOP);
      let page = 9, typing = '';
      for (const [tt, pg] of KEYS) if (tt <= p) page = pg;
      for (const [tt, s] of TYPING) if (tt <= p && p - tt < 0.7) typing = s;
      // the list rows for this page (they drop first)
      const rows = Math.max(1, H - 3), first = (page - 1) * PER + 1;
      for (let i = 0; i < Math.min(rows, PER); i++) {
        const n = first + i; if (n > TOTAL) break;
        const line = `#${n}`.padEnd(6) + `${ACT[n % 4]} ${SVC[(n * 7) % 4]}@${((n * 2654435761) >>> 0).toString(16).slice(0, 6)}`;
        fitText(b, 0, i, W, [`${line}  ${(n % 23) + 1}h ago`, line], th.ink);
      }
      // the pager: a window of numbers around the current page; neighbours drop before the compact form
      const py = H - 2;
      const pager = (span) => {
        const set = new Set([1, PAGES]); for (let k = page - span; k <= page + span; k++) if (k >= 1 && k <= PAGES) set.add(k);
        const nums = [...set].sort((a, z) => a - z), out = [];
        nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push(-1); out.push(n); });
        return out;
      };
      const draw = (items) => {
        let x = 0;
        const end = (s, off) => { if (off) { x = b.text(x, py, '(', sub(th)); x = b.text(x, py, s, sub(th)); x = b.text(x, py, ')', sub(th)); } else x = b.text(x, py, ` ${s} `, th.ink, undefined, ATTR.BOLD); };
        end(L, page === 1); x++;
        for (const n of items) {
          if (n < 0) { x = b.text(x, py, ELL, th.ink) + 1; continue; }
          if (n === page) { x = b.text(x, py, '[', th.accent, undefined, ATTR.BOLD); x = inv(ctx, b, x, py, String(n)); x = b.text(x, py, ']', th.accent, undefined, ATTR.BOLD) + 1; }
          else x = b.text(x, py, String(n), th.ink) + 1;
        }
        end(R, page === PAGES);
      };
      const len = (items) => items.reduce((n, k) => n + (k < 0 ? stringWidth(ELL) + 1 : String(k).length + (k === page ? 3 : 1)), 0) + 7;
      const opts = [pager(2), pager(1), pager(0)].find((it) => len(it) <= W);
      if (opts) draw(opts);
      else { let x = b.text(0, py, page === 1 ? `(${L})` : ` ${L} `, page === 1 ? sub(th) : th.ink); x = b.text(x + 1, py, `${page} / ${PAGES}`, th.ink, undefined, ATTR.BOLD); b.text(x + 1, py, page === PAGES ? `(${R})` : ` ${R} `, page === PAGES ? sub(th) : th.ink); }
      // the range, and the jump being typed
      const last = Math.min(TOTAL, page * PER);
      const ry = H - 1;
      let x = fitText(b, 0, ry, W, [`Showing ${first}${u ? '–' : '-'}${last} of ${TOTAL}`, `${first}${u ? '–' : '-'}${last} / ${TOTAL}`], sub(th));
      if (typing) b.text(Math.max(x + 2, W - 8), ry, `${typing}${u ? '▏' : '_'}`, th.ink, undefined, ATTR.BOLD);
    };
  },
};
