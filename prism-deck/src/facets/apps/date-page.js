// app-date — a tear-off calendar page: the month on a band in the key's hue (with binder rings),
// the day as the hero, the weekday under it, and on big keys the week as seven dots with today
// lit. At midnight yesterday's page tears away over the top and today's is underneath; when the
// key appears, the page drops in. Static the rest of the day (one change a day).

import { surface, rect, path, circle, n, P, linearGradient, url } from '../../scene/index.js';
import { clockOf } from '../../scene/context.js';
import { clamp, outExpo, inQuad } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { text, isBig, DOW, DOW_LONG, MONTH, MONTH_LONG } from './_d7-kit.js';

const TEAR = 1.2;

/** ISO week number. */
function isoWeek(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const day = (new Date(t).getUTCDay() + 6) % 7;
  const th = t - day * 86400000 + 3 * 86400000;
  const y0 = Date.UTC(new Date(th).getUTCFullYear(), 0, 4);
  return 1 + Math.round(((th - y0) / 86400000 - 3 + ((new Date(y0).getUTCDay() + 6) % 7)) / 7);
}

function page(k, c, { x, y, w, h, big, weekStart }) {
  const C = k.colors, u = k.m.u;
  const r = k.m.radius * 0.6;
  const paper = k.dark ? mix(C.surface, '#ffffff', 0.07) : mix(C.surface, '#ffffff', 0.7);
  const band = h * (big ? 0.27 : 0.3);
  const tint = k.ctx.tint, deep = k.ctx.theme.spectral(k.ctx.hue, { tier: 'ink' });
  const head = k.dark ? mix(tint, '#000000', 0.25) : deep;
  let out = path(P().M(x, y + r).A(r, r, 0, 0, 1, x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(y + h - r).A(r, r, 0, 0, 1, x + w - r, y + h).H(x + r).A(r, r, 0, 0, 1, x, y + h - r).Z().d, { fill: paper, stroke: C.line, strokeWidth: n(Math.max(1, u * 0.6)) });
  out += path(P().M(x, y + band).V(y + r).A(r, r, 0, 0, 1, x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(y + band).Z().d, { fill: head });
  // binder rings
  const rr = Math.max(1.4, 1.9 * u);
  for (const fx of [0.3, 0.7]) out += circle({ cx: n(x + w * fx), cy: n(y + rr * 1.6), r: n(rr), fill: k.dark ? '#000000' : C.surface2, stroke: mix(head, '#000000', 0.3), strokeWidth: n(Math.max(0.8, u * 0.5)) });
  const month = big ? MONTH_LONG[c.month - 1] : MONTH[c.month - 1];
  out += text(k, month, { x: x + w / 2, cy: y + band * 0.6, size: band * 0.42, weight: 700, caps: true, tracking: 0.12, color: '#ffffff', maxWidth: w * 0.84, add: false });
  const numY = y + band + (h - band) * (big ? 0.4 : 0.44);
  out += text(k, String(c.day), { x: x + w / 2, cy: numY, size: (h - band) * (big ? 0.5 : 0.56), weight: 700, tabular: true, color: 'ink', add: false });
  const wd = big ? DOW_LONG[c.dow] : DOW[c.dow];
  out += text(k, wd, { x: x + w / 2, cy: y + band + (h - band) * (big ? 0.74 : 0.84), size: (big ? 8.5 : 7.5) * u, weight: 600, caps: true, tracking: 0.1, color: c.dow === 0 || c.dow === 6 ? deep : 'muted', maxWidth: w * 0.9, add: false });
  if (big) {
    // the week as seven dots, today lit
    const dy = y + h - (h - band) * 0.09, gap = w * 0.105, dr = Math.max(1.3, 1.5 * u);
    let dots = '';
    for (let i = 0; i < 7; i++) {
      const dow = (weekStart + i) % 7, dx = x + w / 2 + (i - 3) * gap;
      if (dow === c.dow) out += circle({ cx: n(dx), cy: n(dy), r: n(dr * 1.45), fill: tint });
      else dots += `M${n(dx + dr)} ${n(dy)}A${n(dr)} ${n(dr)} 0 1 1 ${n(dx - dr)} ${n(dy)}A${n(dr)} ${n(dr)} 0 1 1 ${n(dx + dr)} ${n(dy)}Z`;
    }
    out += path(dots, { fill: C.dim, fillOpacity: 0.7 });
  }
  return out;
}

export default {
  id: 'app-date',
  title: 'Date Page',
  category: 'Clocks & Timers',
  description: 'A tear-off calendar page: the month on a band, the day as the hero, the weekday under it. The real date from your computer’s clock; at midnight the page tears away.',
  tags: ['date', 'calendar', 'day', 'today', 'week', 'clock'],
  surface: 'key',
  fps: 8,
  loop: 4,
  params: {
    weekStart: { type: 'select', default: 'mon', options: ['mon', 'sun'], label: 'Week starts on' },
    showWeek: { type: 'bool', default: true, label: 'Week number (big keys)' },
    hue: { type: 'hue', default: 8, min: 0, max: 360, label: 'Band hue' },
  },
  order: 23,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const u = k.m.u;
    k.background({ tone: 'idle' });
    const big = isBig(k);
    const c = ctx.clock;
    const tz = c.tzOffset ?? 0;
    const sod = c.h * 3600 + c.m * 60 + c.s + c.ms / 1000;     // seconds into the day
    const inset = k.m.safe * 0.75;
    const box = { x: inset, y: inset + u, w: w - inset * 2, h: h - inset * 2 - u, big, weekStart: ctx.params.weekStart === 'sun' ? 0 : 1 };
    // arrival: the page drops in
    const drop = ctx.reduced ? 1 : outExpo(clamp(ctx.since / 0.5));
    const today = page(k, c, box);
    if (drop < 0.999) k.add(`<g transform="translate(0 ${n(-(1 - drop) * h * 0.18)})" opacity="${n(0.3 + 0.7 * drop, 3)}">${today}</g>`);
    else k.add(today);
    if (big && ctx.params.showWeek) text(k, `W${isoWeek(c.year, c.month, c.day)}`, { x: box.x + box.w - 3 * u, y: box.y + box.h * 0.27 + 8.5 * u, size: 7.5 * u, weight: 600, anchor: 'end', color: 'dim' });
    // midnight: yesterday's page flips up over the binding and away (front face, then its blank back)
    if (!ctx.reduced && sod < TEAR && ctx.since > 0.5) {
      const y = clockOf(ctx.now - 86400000, tz);
      const p = clamp(sod / TEAR), th = Math.PI * inQuad(p);
      const sy = Math.cos(th);
      const top = box.y;
      const about = (s) => `translate(0 ${n(top)}) scale(1 ${n(Math.abs(s) < 0.02 ? (s < 0 ? -0.02 : 0.02) : s, 4)}) translate(0 ${n(-top)})`;
      if (sy > 0) {
        const shade = k.id('tear');
        k.def(linearGradient(shade, [[0, '#000000', 0.05], [1, '#000000', 0.45]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
        k.add(`<g transform="${about(sy)}">${page(k, y, box)}${rect({ x: n(box.x), y: n(box.y), width: n(box.w), height: n(box.h), rx: n(k.m.radius * 0.6), fill: url(shade), fillOpacity: n(1 - sy, 3) })}</g>`);
      } else {
        const C = k.colors, back = k.dark ? mix(C.surface, '#ffffff', 0.12) : mix(C.surface2, C.line, 0.2);
        k.add(`<g transform="${about(sy)}" opacity="${n(clamp(1.6 - p * 1.6 + 0.4), 3)}">${rect({ x: n(box.x), y: n(box.y), width: n(box.w), height: n(box.h), rx: n(k.m.radius * 0.6), fill: back, stroke: C.line, strokeWidth: n(Math.max(1, u * 0.6)) })}</g>`);
      }
    }
    return k.svg();
  },
};
