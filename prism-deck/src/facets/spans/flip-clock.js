// span-flip-clock — a split-flap clock across a row of keys, one flap unit per key. When a digit
// changes, its top flap falls with gravity (it accelerates), shows its shaded back as it passes
// the hinge, lands on the stop and bounces; the new digit is underneath. Each card has two halves,
// a dark hinge gap and pins, in the theme's own card colors.
// Layout by row width: ≥ 8 keys HH : MM : SS · 5–7 HH : MM (+ SS pair on 7) · 4 HHMM · ≤ 3 one pair
// per key. Only the key whose digit changes updates — a flip is ~5 frames at 10 fps.

import { surface } from '../../scene/index.js';
import { clamp } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { materials, inCell, middleRow, rowCells } from './_d3-span.js';
import { flap, flapColors, text } from '../apps/_d7-kit.js';
import { capHeight } from '../../scene/text.js';

const FLIP = 0.55;     // seconds a flip takes (fall + bounce)

function plan(nKeys, seconds) {
  const D = (field, place) => ({ kind: 'd', field, place });
  let slots;
  if (nKeys >= 8) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1), { kind: 'colon' }, D('s', 0), D('s', 1)];
  else if (nKeys >= 7 && seconds) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1), { kind: 'pair', field: 's' }];
  else if (nKeys >= 5) slots = [D('h', 0), D('h', 1), { kind: 'colon' }, D('m', 0), D('m', 1)];
  else if (nKeys === 4) slots = [D('h', 0), D('h', 1), D('m', 0), D('m', 1)];
  else slots = [{ kind: 'pair', field: 'h' }, { kind: 'pair', field: 'm' }, { kind: 'pair', field: 's' }].slice(0, Math.max(1, nKeys));
  if (!seconds) slots = slots.filter((s, i, a) => !(s.field === 's' || (s.kind === 'colon' && a[i + 1]?.field === 's')));
  const lead = Math.floor((nKeys - slots.length) / 2);
  return Array.from({ length: nKeys }, (_, i) => slots[i - lead] || null);
}

/** Two-digit text of a clock field at a wall time. */
function fieldText(c, field, h12) {
  const v = field === 'h' ? (h12 ? ((c.h + 11) % 12) + 1 : c.h) : field === 'm' ? c.m : c.s;
  return String(v).padStart(2, '0');
}

export default {
  id: 'span-flip-clock',
  title: 'Split-Flap Clock',
  category: 'Text & Marquee',
  description: 'A split-flap clock across a row of keys: each digit is a flap unit whose top card falls with gravity, passes the hinge and bounces when the time changes.',
  tags: ['clock', 'time', 'split flap', 'flip clock', 'digits', 'retro', 'span'],
  surface: 'span',
  span: { cols: 'all', rows: 1 },
  fps: 10,
  loop: 60,
  params: {
    seconds: { type: 'bool', default: true, label: 'Seconds (when the row has room)' },
    hour12: { type: 'bool', default: false, label: '12-hour clock' },
  },
  order: 24,
  render(ctx) {
    const k = surface(ctx);
    const { grid } = ctx;
    const row = middleRow(grid);
    const cells = rowCells(grid, row);
    const slots = plan(cells.length, ctx.params.seconds);
    materials(k);
    const now = ctx.clock;
    const into = (ctx.clock.ms + 0) / 1000;                       // seconds into the current second
    const prevClock = { ...now, ...(() => { const t = now.h * 3600 + now.m * 60 + now.s - 1; const d = ((t % 86400) + 86400) % 86400; return { h: Math.floor(d / 3600), m: Math.floor((d % 3600) / 60), s: d % 60 }; })() };
    const age = ctx.reduced ? 9 : into;                            // every digit that changed changed at the last second boundary
    const F = flapColors(k);
    cells.forEach((cell, i) => {
      const slot = slots[i];
      inCell(k, cell, (kk) => {
        const u = kk.m.u;
        const pad = kk.m.safe * 0.8;
        const x = pad, y = pad, cw = kk.w - pad * 2, ch = kk.h - pad * 2;
        if (!slot) return;
        if (slot.kind === 'colon') {
          // a blank card with two rivets
          const r = Math.max(2, 3.6 * u);
          flap(kk, { x: x + cw * 0.25, y, w: cw * 0.5, h: ch, r: kk.m.radius * 0.5, cur: '', size: 1, tag: `c${cell.i}`, colors: F });
          kk.add(`<circle cx="${kk.w / 2}" cy="${y + ch * 0.32}" r="${r}" fill="${F.ink}"/><circle cx="${kk.w / 2}" cy="${y + ch * 0.68}" r="${r}" fill="${F.ink}"/>`);
          return;
        }
        const cur = slot.kind === 'pair' ? fieldText(now, slot.field, ctx.params.hour12) : fieldText(now, slot.field, ctx.params.hour12)[slot.place];
        const prv = slot.kind === 'pair' ? fieldText(prevClock, slot.field, ctx.params.hour12) : fieldText(prevClock, slot.field, ctx.params.hour12)[slot.place];
        const p = prv !== cur ? clamp(age / FLIP) * 1.25 : 9;
        const size = slot.kind === 'pair' ? ch * 0.62 : ch * 0.8;
        const fits = Math.min(size, (cw * (slot.kind === 'pair' ? 0.92 : 0.95)) / (slot.kind === 'pair' ? 1.25 : 0.68));
        flap(kk, { x, y, w: cw, h: ch, r: kk.m.radius * 0.6, prev: prv, cur, p, size: fits, weight: 700, tag: `f${cell.i}`, colors: F, dy: 0 });
        // the field's eyebrow on pair cards (HH / MM / SS)
        if (slot.kind === 'pair' && kk.w >= 110) text(kk, slot.field === 'h' ? (ctx.params.hour12 ? (now.h < 12 ? 'AM' : 'PM') : 'HRS') : slot.field === 'm' ? 'MIN' : 'SEC', { x: x + cw - 4 * u, y: y + 4 * u + capHeight(6.5 * u, 600), size: 6.5 * u, anchor: 'end', weight: 600, caps: true, tracking: 0.12, color: mix(F.ink, F.top, 0.55) });
      }, `fc${cell.i}`);
    });
    return k.svg();
  },
};
