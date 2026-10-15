// span-clock — the time across a row of keys, one digit per key. A digit that changes
// refracts into place (spectral copies converge, outExpo), the colon key blinks with the
// seconds, and a hairline Beam runs along the bottom of the row once a minute — through
// the bezels, so the seconds read as one continuous sweep. Only the keys that change
// update: a digit once a second at most, the colon twice, the key under the beam head.
//
// Layout by row width: ≥ 8 keys HH:MM:SS · ≥ 5 HH:MM · 4 HHMM (colon dots on the inner
// edges) · ≤ 3 one pair per key (HH MM SS). On taller spans the clock sits on the middle
// row and the date goes below it.

import { surface, rect, circle, linearGradient, url } from '../../scene/index.js';
import { clamp, outExpo, lerp } from '../../scene/easing.js';
import { pad2 } from '../../scene/text.js';
import { BUDGET, frameClock, materials, inCell, middleRow, rowCells, half } from './_d3-span.js';

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Slot plan for n keys: [{ kind: 'd', field, place } | { kind: 'colon' } | { kind: 'pair', field } | null]. */
function plan(nKeys) {
  const D = (field, place) => ({ kind: 'd', field, place });
  let slots;
  if (nKeys >= 8) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1), { kind: 'colon' }, D('s', 0), D('s', 1)];
  else if (nKeys >= 5) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1)];
  else if (nKeys === 4) slots = [D('h', 0), { ...D('h', 1), dotsRight: true }, { ...D('m', 0), dotsLeft: true }, D('m', 1)];
  else slots = [{ kind: 'pair', field: 'h' }, { kind: 'pair', field: 'm' }, { kind: 'pair', field: 's' }].slice(0, Math.max(1, nKeys));
  const lead = Math.floor((nKeys - slots.length) / 2);
  return Array.from({ length: nKeys }, (_, i) => slots[i - lead] || null);
}

export default {
  id: 'span-clock',
  title: 'Clock Across Keys',
  category: 'Text & Marquee',
  description: 'The time across a row of keys, one digit per key: changing digits refract into place, the colon blinks, a Beam sweeps the row once a minute.',
  tags: ['clock', 'time', 'digits', 'seconds', 'span', 'desk'],
  surface: 'span',
  span: { cols: 'all', rows: 1 },
  data: ['clock'],
  fps: 4,
  loop: 60,
  params: {
    hours: { type: 'select', default: '24', options: ['24', '12'], label: 'Hours' },
    hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
    budget: BUDGET,
  },
  order: 21,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    const row = middleRow(grid);
    const cells = rowCells(grid, row);
    const { t } = frameClock(ctx, { fps: 4, changing: 3, still: 0 });
    materials(k);
    // wall time at the quantized instant
    const c0 = ctx.clock;
    const back = (ctx.t - t);                                      // seconds the clock is held back by quantizing
    let sec = c0.h * 3600 + c0.m * 60 + c0.s + c0.ms / 1000 - back;
    sec = ((sec % 86400) + 86400) % 86400;
    const H24 = Math.floor(sec / 3600), M = Math.floor((sec % 3600) / 60), S = Math.floor(sec % 60), frac = sec % 1;
    const H = ctx.params.hours === '12' ? ((H24 + 11) % 12) + 1 : H24;
    const fields = { h: ctx.params.hours === '12' ? String(H).padStart(2, ' ') : pad2(H), m: pad2(M), s: pad2(S) };
    // seconds since each digit last changed (for the refraction)
    const age = {
      s1: frac, s0: (S % 10) + frac, m1: S + frac, m0: (M % 10) * 60 + S + frac,
      h1: M * 60 + S + frac, h0: (H24 % 10) * 3600 + M * 60 + S + frac,
    };
    const ink = T.colors.ink, hue = ctx.hue;
    const slots = plan(cells.length);
    cells.forEach((cell, i) => {
      const slot = slots[i];
      if (!slot) return;
      inCell(k, cell, (kk) => {
        const size = kk.h * (slot.kind === 'pair' ? 0.5 : 0.74);
        const cy = kk.h * 0.48;
        if (slot.kind === 'colon') {
          const on = ctx.reduced || frac < 0.5;
          const r = Math.max(2, kk.h * 0.045);
          for (const dy of [-0.13, 0.13]) kk.add(circle({ cx: kk.w / 2, cy: half(cy + dy * kk.h), r, fill: T.dark ? ink : T.ink(hue), fillOpacity: on ? 1 : 0.28 }));
          return;
        }
        const str = slot.kind === 'pair' ? fields[slot.field] : fields[slot.field][slot.place];
        const a = slot.kind === 'pair' ? age[`${slot.field}1`] : age[`${slot.field}${slot.place}`];
        const e = ctx.reduced ? 1 : outExpo(clamp(a / 0.5));
        if (e < 0.999) {
          // refraction: spectral copies converge on the new digit
          const off = (1 - e) * kk.w * 0.07;
          kk.hero(str, { size, cy, x: kk.w / 2 - off, color: T.spectral(296), opacity: 0.75 * (1 - e) });
          kk.hero(str, { size, cy, x: kk.w / 2 + off, color: T.spectral(30), opacity: 0.75 * (1 - e) });
        }
        kk.hero(str, { size, cy, opacity: lerp(0.35, 1, e) });
        if (slot.dotsRight || slot.dotsLeft) {
          const r = Math.max(2, kk.h * 0.04), x = slot.dotsRight ? kk.w - kk.m.safe * 0.9 : kk.m.safe * 0.9;
          for (const dy of [-0.13, 0.13]) kk.add(circle({ cx: x, cy: half(cy + dy * kk.h), r, fill: ink, fillOpacity: frac < 0.5 || ctx.reduced ? 0.9 : 0.25 }));
        }
        if (slot.kind === 'pair' && slot.field === 'h' && ctx.params.hours === '12') kk.eyebrow(H24 < 12 ? 'AM' : 'PM', { align: 'right', x: kk.w - kk.m.text, color: 'muted' });
      }, `d${cell.i}`);
    });
    // the seconds Beam along the bottom of the row: track (static) + lit run + head (per key)
    const by = cells[0].y + grid.key.h - k.m.safe * 1.15;
    const x0 = cells[0].x + k.m.safe, x1 = cells[cells.length - 1].x + grid.key.w - k.m.safe;
    const head = lerp(x0, x1, (S + frac) / 60);
    const beamC = T.colors.beam || '#ffffff';
    const gid = k.id('run');
    k.def(linearGradient(gid, [[0, T.spectral(hue + 60), 0.2], [0.85, T.spectral(hue), 0.9], [1, beamC, 1]], { x1: x0, y1: 0, x2: x1, y2: 0, gradientUnits: 'userSpaceOnUse' }));
    const lw = Math.max(1, Math.round(k.m.hair * 1.5));
    for (const c of cells) {
      const a = Math.max(c.x + k.m.safe, x0), b = Math.min(c.x + c.w - k.m.safe, x1);
      if (b <= a) continue;
      k.add(rect({ x: a, y: by, width: b - a, height: lw, fill: T.colors.line, fillOpacity: T.dark ? 0.9 : 1 }));
      const lit = Math.min(b, head) - a;
      if (lit > 0.5) k.add(rect({ x: a, y: by, width: half(lit), height: lw, fill: url(gid) }));
      if (head >= a && head <= b) k.add(circle({ cx: half(head), cy: by + lw / 2, r: lw * 1.8, fill: T.dark ? beamC : T.ink(hue) }));
    }
    // the date under the clock on taller spans
    if (grid.rows > 1 && row + 1 < grid.row + grid.rows) {
      const below = rowCells(grid, row + 1);
      const lead = below[Math.floor((below.length - 1) / 2)];
      inCell(k, lead, (kk) => {
        kk.value(String(c0.day), { cy: kk.h * 0.42 });
        kk.label(`${DOW[c0.dow]} ${MON[c0.month - 1]}`, { color: 'muted' });
      }, `date${lead.i}`);
    }
    return k.svg();
  },
};
