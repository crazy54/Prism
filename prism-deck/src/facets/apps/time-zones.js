// app-time-zones — two time zones on one key, for teams that live across them. Each row: the
// zone's code, its time in big tabular digits, a sun or moon, and the day offset (+1 / −1).
// On big keys each row gets a 24-hour band with that zone's working hours lit and a mark at
// "now", so you can see the overlap at a glance. Offsets are params (minutes from UTC; zone A
// can follow the runtime's local time). Changes once a minute.

import { surface, rect, path, circle, n, P } from '../../scene/index.js';
import { clockOf } from '../../scene/context.js';
import { clamp } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { text, isBig } from './_d7-kit.js';

const fmt = (c, h12) => `${h12 ? ((c.h + 11) % 12) + 1 : c.h}:${String(c.m).padStart(2, '0')}`;

export default {
  id: 'app-time-zones',
  title: 'Time Zones',
  category: 'Clocks & Timers',
  description: 'Two time zones on one key: big digits, a sun or a moon, the day offset and, on big keys, working hours so the overlap shows. Real time from your clock.',
  tags: ['time zone', 'world clock', 'remote', 'team', 'clock', 'utc', 'overlap'],
  surface: 'key',
  fps: 1,
  loop: 120,
  params: {
    aName: { type: 'text', default: 'SFO', maxLength: 5, label: 'Zone A name' },
    aOffset: { type: 'number', default: -420, min: -720, max: 840, step: 15, label: 'Zone A offset (min from UTC)' },
    aLocal: { type: 'bool', default: false, label: 'Zone A follows my local time' },
    bName: { type: 'text', default: 'BER', maxLength: 5, label: 'Zone B name' },
    bOffset: { type: 'number', default: 120, min: -720, max: 840, step: 15, label: 'Zone B offset (min from UTC)' },
    workFrom: { type: 'number', default: 9, min: 0, max: 23, step: 1, label: 'Work day starts (h)' },
    workTo: { type: 'number', default: 17, min: 1, max: 24, step: 1, label: 'Work day ends (h)' },
    hour12: { type: 'bool', default: false, label: '12-hour clock' },
  },
  order: 22,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, u = k.m.u;
    const P0 = ctx.params;
    k.background({ tone: 'idle' });
    const big = isBig(k);
    const offA = P0.aLocal ? (ctx.clock?.tzOffset ?? 0) : P0.aOffset;
    const zones = [{ name: P0.aName, off: offA, hue: 243.6 }, { name: P0.bName, off: P0.bOffset, hue: 34.2 }];
    const utcDay = Math.floor(ctx.now / 86400000);
    const x0 = k.m.text, x1 = w - k.m.text;
    const rowH = (h - k.m.safe * 2) / 2;
    zones.forEach((z, i) => {
      const c = clockOf(ctx.now, z.off);
      const day = Math.floor((ctx.now + z.off * 60000) / 86400000) - utcDay - (Math.floor((ctx.now + offA * 60000) / 86400000) - utcDay);
      const hour = c.h + c.m / 60;
      const isDay = hour >= 6.5 && hour < 19;
      const y0 = k.m.safe + i * rowH;
      const tint = ctx.theme.spectral(z.hue);
      // code + day offset
      const eb = (big ? 8.5 : 7.5) * u;
      text(k, z.name, { x: x0, y: y0 + eb * 0.9 + (big ? u * 2 : u), size: eb, weight: 600, caps: true, tracking: 0.12, anchor: 'start', color: 'muted' });
      // sun / moon mark at the end of the code row, the day offset before it
      const mr = (big ? 3.6 : 2.9) * u, mx = x1 - mr * 1.2, my = y0 + eb * 0.55 + (big ? u * 2 : u);
      if (day !== 0) text(k, `${day > 0 ? '+' : '−'}${Math.abs(day)}d`, { x: x1 - mr * 3.2, y: y0 + eb * 0.9 + (big ? u * 2 : u), size: eb, weight: 700, anchor: 'end', color: tint });
      if (isDay) {
        const rays = P();
        for (let a = 0; a < 8; a++) { const t = (a * Math.PI) / 4; rays.M(mx + Math.cos(t) * mr * 1.25, my + Math.sin(t) * mr * 1.25).L(mx + Math.cos(t) * mr * 1.7, my + Math.sin(t) * mr * 1.7); }
        k.add(circle({ cx: n(mx), cy: n(my), r: n(mr * 0.85), fill: ctx.theme.spectral(86.5) }) + path(rays.d, { stroke: ctx.theme.spectral(86.5), strokeWidth: n(Math.max(1, u * 0.9)), strokeLinecap: 'round' }));
      } else {
        const r = mr * 0.95;
        k.add(path(P().M(mx + r * 0.35, my - r).A(r, r, 0, 1, 0, mx + r, my + r * 0.4).A(r * 0.78, r * 0.78, 0, 1, 1, mx + r * 0.35, my - r).Z().d, { fill: ctx.theme.spectral(269.8), fillOpacity: 0.9 }));
      }
      // time
      const ts = big ? 16 * u : 15 * u;
      text(k, fmt(c, P0.hour12), { x: x0 - u * 0.6, y: y0 + (big ? rowH * 0.8 : rowH * 0.92), size: ts, weight: 700, tabular: true, anchor: 'start', color: 'ink', maxWidth: x1 - x0 + u * 0.6 });
      // 24 h band: working hours lit, now marked
      if (big) {
        const by = y0 + rowH * 0.88, bh = Math.max(2, 2.2 * u), bw = x1 - x0;
        k.add(rect({ x: n(x0), y: n(by), width: n(bw), height: n(bh), rx: n(bh / 2), fill: C.line, fillOpacity: k.dark ? 0.9 : 1 }));
        const a = clamp(P0.workFrom / 24), b = clamp(Math.max(P0.workFrom + 1, P0.workTo) / 24);
        k.add(rect({ x: n(x0 + bw * a), y: n(by), width: n(bw * (b - a)), height: n(bh), rx: n(bh / 2), fill: tint, fillOpacity: 0.75 }));
        const nx = x0 + bw * (hour / 24);
        k.add(rect({ x: n(nx - Math.max(1, u * 0.7)), y: n(by - bh * 0.9), width: n(Math.max(2, u * 1.4)), height: n(bh * 2.8), rx: n(u * 0.6), fill: k.dark ? '#ffffff' : C.ink }));
      }
    });
    // the divider: a hairline beam between the zones
    const id = k.id('div');
    k.def(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.line}" stop-opacity="0"/><stop offset="0.5" stop-color="${mix(C.line, C.muted, 0.3)}"/><stop offset="1" stop-color="${C.line}" stop-opacity="0"/></linearGradient>`);
    k.add(rect({ x: n(x0), y: n(k.m.safe + rowH - 0.5), width: n(x1 - x0), height: n(Math.max(1, u * 0.6)), fill: `url(#${id})` }));
    return k.svg();
  },
};
