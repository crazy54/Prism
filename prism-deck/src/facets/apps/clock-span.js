// app-clock-span — a clock across a block of keys. Gap-aware the way text must be: one character
// per key, so no digit is ever split by a bezel; the seconds are a Beam whose bright point crosses
// the whole time row once a minute (one continuous line behind the bezels). Rows around the time
// carry the date. Layout by width: ≥ 8 keys HH:MM:SS · 5–7 HH:MM · 4 HHMM (colon on the hour's
// edge) · ≤ 3 two lines (HH: / MM + seconds). Tall blocks (the Galleon's 3 × 4) stack time and date.

import { surface, rect, circle, n, linearGradient, url } from '../../scene/index.js';
import { pad2 } from '../../scene/text.js';
import { keyGlass, whiteOf, colorAt } from './_kit.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Lines of key slots: { ch } digit / ':' colon / { small } secondary text, per block width. */
export function clockLines(cols, c, hour12) {
  const hh = pad2(hour12 ? ((c.h + 11) % 12) + 1 : c.h), mm = pad2(c.m), ss = pad2(c.s);
  const D = (s) => [...s].map((ch) => ({ ch }));
  if (cols >= 8) return [[...D(hh), { colon: true }, ...D(mm), { colon: true }, ...D(ss)]];
  if (cols >= 5) return [[...D(hh), { colon: true }, ...D(mm)]];
  if (cols === 4) return [[...D(hh).map((x, i) => (i === 1 ? { ...x, edgeColon: true } : x)), ...D(mm)]];
  if (cols === 3) return [[...D(hh), { colon: true }], [...D(mm), { small: `:${ss}` }]];
  if (cols === 2) return [D(hh), D(mm)];
  return [[{ ch: `${hh}` }], [{ ch: mm }]];
}

export default {
  id: 'app-clock-span',
  title: 'Clock Across Keys',
  category: 'Clocks & Timers',
  description: 'A clock across a block of keys, one digit per key so no bezel splits a number, with a seconds Beam and the date. Real time from your computer’s clock.',
  tags: ['clock', 'time', 'span', 'digits', 'date', 'wall clock', 'gap-aware'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  data: ['clock'],
  fps: 2,
  loop: 60,
  params: {
    hour12: { type: 'bool', default: false, label: '12-hour clock' },
    date: { type: 'bool', default: true, label: 'Show the date' },
  },
  order: 25,
  render(ctx) {
    const d = surface(ctx);
    const { grid, clock: c, params: p } = ctx;
    keyGlass(d, grid, { index: false });
    const cols = [...new Set(grid.cells.map((x) => x.col))].sort((a, b) => a - b);
    const rows = [...new Set(grid.cells.map((x) => x.row))].sort((a, b) => a - b);
    const at = (ci, ri) => grid.cells.find((x) => x.col === cols[ci] && x.row === rows[ri]);
    const KW = grid.key.w, KH = grid.key.h, K = Math.min(KW, KH);
    const lines = clockLines(cols.length, c, p.hour12);
    const dateRow = p.date && rows.length > lines.length;
    const used = lines.length + (dateRow ? 1 : 0);
    // centered; tall blocks (the Galleon's keys under its screen) hang from the top
    const spare = rows.length - used, r0 = Math.max(0, rows.length > cols.length ? Math.floor(spare / 2) : Math.ceil(spare / 2));
    const ink = 'ink';
    const tick = c.s % 2 === 0;
    lines.forEach((line, li) => {
      const ri = r0 + li;
      if (ri >= rows.length) return;
      const c0 = Math.floor((cols.length - line.length) / 2);
      line.forEach((slot, si) => {
        const cell = at(c0 + si, ri);
        if (!cell) return;
        const cx = cell.x + KW / 2, cy = cell.y + KH * 0.5;
        if (slot.colon) {
          const rr = K * 0.055, op = tick || ctx.reduced ? 1 : 0.35;
          for (const dy of [-0.16, 0.16]) d.add(circle({ cx, cy: cy + KH * dy, r: rr, fill: whiteOf(d), fillOpacity: n(op, 2) }));
        } else if (slot.small) {
          d.value(slot.small, { x: cx, cy, size: K * 0.3, maxWidth: KW * 0.8, color: 'muted' });
        } else {
          d.hero(slot.ch, { x: cx, cy, size: K * (slot.ch.length > 1 ? 0.44 : 0.66), maxWidth: KW - d.m.text * 2, color: ink });
          if (slot.edgeColon) { const rr = K * 0.045, op = tick || ctx.reduced ? 1 : 0.35; for (const dy of [-0.15, 0.15]) d.add(circle({ cx: cell.x + KW - d.m.safe, cy: cy + KH * dy, r: rr, fill: whiteOf(d), fillOpacity: n(op, 2) })); }
        }
      });
      // the seconds Beam under the last time line: a hairline across its keys, bright where the seconds are
      if (li === lines.length - 1) {
        const first = at(c0, ri), last = at(c0 + line.length - 1, ri);
        if (first && last) {
          const x0 = first.x + d.m.safe, x1 = last.x + KW - d.m.safe, y = first.y + KH - d.m.u * 7;
          const f = c.s / 60, id = d.id('beam');
          const o1 = Math.max(0, f - 0.12), o3 = Math.min(1, f + 0.04);
          d.def(linearGradient(id, [[0, colorAt(ctx, 'auto', 0), 0.15], [o1, colorAt(ctx, 'auto', f), 0.45], [f, d.dark ? '#ffffff' : d.colors.ink, 1], [Math.max(f, o3), colorAt(ctx, 'auto', f), 0.3], [1, colorAt(ctx, 'auto', 1), 0.12]], { x1: x0, y1: 0, x2: x1, y2: 0, gradientUnits: 'userSpaceOnUse' }));
          // per key, so culling keeps each slice to its own piece of the Beam
          for (let si = 0; si < line.length; si++) {
            const cell = at(c0 + si, ri);
            if (!cell) continue;
            const a = Math.max(x0, cell.x), b = Math.min(x1, cell.x + KW);
            if (b > a) d.add(rect({ x: a, y, width: b - a, height: Math.max(1.25, d.m.line), fill: url(id) }));
          }
        }
      }
    });
    if (dateRow) {
      const ri = r0 + lines.length;
      const items = cols.length >= 5 ? [DAYS[c.dow], String(c.day), MONTHS[c.month - 1], String(c.year)] : cols.length >= 3 ? [DAYS[c.dow], String(c.day), MONTHS[c.month - 1]] : [`${DAYS[c.dow]} ${c.day}`];
      const c0 = Math.floor((cols.length - items.length) / 2);
      items.forEach((txt, i) => {
        const cell = at(c0 + i, ri);
        if (!cell) return;
        const num = /^\d+$/.test(txt);
        if (num) d.value(txt, { x: cell.x + KW / 2, cy: cell.y + KH / 2, size: K * (txt.length > 2 ? 0.26 : 0.34), maxWidth: KW - d.m.text * 2, color: 'muted' });
        else d.eyebrow(txt, { align: 'center', x: cell.x + KW / 2, y: cell.y + KH / 2 + K * 0.06, size: K * 0.17, maxWidth: KW - d.m.text * 2, color: 'muted' });
      });
    }
    return d.svg();
  },
};
