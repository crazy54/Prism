// A calendar date-range picker: arrow keys walk the grid, Enter sets the start,
// the range previews as the cursor moves, Enter again sets the end.
import { ATTR, glyphs, uni, phase, tint, fit, panel } from './_input.js';

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TODAY = 13;
// Script: [time, action]. Days are in October 2026.
const SCRIPT = [[0.6, 7], [0.9, -1], [1.3, 'start'], [1.7, 1], [2.0, 1], [2.3, 1], [2.6, 1], [3.0, 'end'], [4.6, 'next'], [5.5, 'prev']];

function month(y, m) {
  const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { first, days };
}
const DAY3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayName = (d) => DAY3[(month(2026, 9).first + d - 1) % 7];

export default {
  id: 'input-date-picker',
  title: 'Date Range Picker',
  category: 'Dialogs & Prompts',
  description: 'A calendar range picker for a change freeze: arrows walk the month grid, Enter sets the start, the range previews as the cursor moves, Enter sets the end.',
  tags: ['date picker', 'calendar', 'range', 'schedule', 'form'],
  kind: 'tui',
  size: { w: 52, h: 11 },
  minSize: { w: 27, h: 11 },
  loop: 7,
  color: '256',
  order: 40,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 7);
      let cur = TODAY, start = 0, end = 0, mon = 9;
      for (const [at, a] of SCRIPT) {
        if (p < at) break;
        if (typeof a === 'number') cur += a;
        else if (a === 'start') start = cur;
        else if (a === 'end') end = cur;
        else if (a === 'next') mon = 10;
        else if (a === 'prev') mon = 9;
      }
      const wide = W >= 46;
      const cw = wide ? 25 : W;
      const inner = panel(ctx, b, 0, 0, cw, Math.min(H, 11), { title: 'Change freeze', color: th.accent });
      // Month header with prev/next arrows.
      const head = `${MONTHS[mon]} 2026`;
      const hx = Math.floor((inner.width - head.length) / 2);
      inner.text(0, 0, u ? '‹' : '<', th.muted);
      inner.text(inner.width - 1, 0, u ? '›' : '>', th.muted);
      inner.text(hx, 0, head, th.ink, undefined, ATTR.BOLD);
      const gx = Math.max(0, Math.floor((inner.width - 20) / 2));
      DOW.forEach((d, i) => inner.text(gx + i * 3, 1, d, i >= 5 ? th.dim : th.muted));
      const { first, days } = month(2026, mon);
      const lo = start && (end || (mon === 9 ? cur : start)), a = Math.min(start, lo), z = Math.max(start, lo);
      for (let d = 1; d <= days; d++) {
        const k = first + d - 1;
        const x = gx + (k % 7) * 3 - 1, y = 2 + Math.floor(k / 7);
        if (y >= inner.height - 1) continue;
        const inOct = mon === 9;
        const inRange = inOct && start && d >= a && d <= z;
        const isEnd = inOct && (d === start || d === end);
        const isCur = inOct && d === cur && !end;
        let fg = k % 7 >= 5 ? th.dim : th.ink, bg, attr = 0;
        if (inRange) { bg = tint(ctx, th.accent, end ? 0.3 : 0.18); fg = th.ink; }
        if (isEnd) { bg = th.accent; fg = th.bg; attr = ATTR.BOLD; }
        if (isCur) attr |= ATTR.INVERSE | ATTR.BOLD;
        const cell = String(d).padStart(2);
        // Range cells are joined by tinting the gap column too.
        if (inRange && d < z) inner.set(x + 3, y, ' ', undefined, bg);
        inner.text(x + 1, y, cell, fg, bg, attr);
        if (inOct && d === TODAY && !isEnd && !isCur) inner.text(x + 1, y, cell, th.warn, bg, ATTR.UNDERLINE | ATTR.BOLD);
      }
      // Summary: to the right when wide, else on the last interior row.
      const fmt = (d) => (d ? `${dayName(d)} ${d} Oct` : `${g.ellipsis}`);
      const sum = start && end ? `${g.check} ${start}${u ? '–' : '-'}${end} Oct ${g.mid} ${end - start + 1} days` : start ? `From ${fmt(start)} ${g.right} ${g.ellipsis}` : 'Pick the first day';
      if (wide) {
        const sx = cw + 2, sw = W - sx;
        let y = 1;
        b.text(sx, y++, 'From', th.muted);
        b.text(sx, y++, fit(start ? `${fmt(start)} 2026` : `${g.mid}`, sw, undefined, ctx), start ? th.ink : th.dim, undefined, ATTR.BOLD);
        y++;
        b.text(sx, y++, 'To', th.muted);
        const toD = end || (start && mon === 9 && cur > start ? cur : 0);
        b.text(sx, y++, fit(toD ? `${fmt(toD)} 2026` : `${g.mid}`, sw, undefined, ctx), end ? th.ink : th.dim, undefined, end ? ATTR.BOLD : ATTR.ITALIC);
        y++;
        if (start && toD) b.text(sx, y++, fit(`${z - a + 1} days ${g.mid} no deploys`, sw, undefined, ctx), end ? th.pos : th.dim);
        b.text(sx, Math.min(H, 11) - 1, fit(`${g.left}${g.up}${g.down}${g.right} move ${g.mid} enter pick`, sw, undefined, ctx), th.dim);
        if (mon !== 9) b.text(sx, Math.min(H, 11) - 2, fit('pgup back to October', sw, undefined, ctx), th.dim, undefined, ATTR.ITALIC);
      } else {
        inner.text(0, inner.height - 1, fit(sum, inner.width, undefined, ctx), start && end ? th.pos : th.muted);
      }
    };
  },
};
