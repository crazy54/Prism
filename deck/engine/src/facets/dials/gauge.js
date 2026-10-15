// dial-gauge — an analog half-dial for one encoder segment (200 × 100). The needle
// reads a live metric (CPU, GPU or memory — push or tap to cycle; on each change the
// needle sweeps up from zero like an instrument at power-on). Turn to set the red line:
// past it the segment raises the theme's alert (light that breathes, a corner flag —
// never color alone). Live at ≤ 6 fps.

import { surface, path, arcPath, polar, n, P } from '../../scene/index.js';
import { clamp, lerp } from '../../scene/easing.js';
import { finish, arrival, tickPaths, ramp } from './_d4-dial.js';

const METRICS = { cpu: { label: 'CPU', off: 0 }, gpu: { label: 'GPU', off: 41 }, mem: { label: 'Memory', off: 83 } };

export default {
  id: 'dial-gauge',
  title: 'Gauge',
  category: 'Gauges & Scrubbers',
  description: 'An analog half-dial with a sweeping needle on a live metric. Turn to set the red line; past it the segment raises an alert. Push or tap to cycle CPU, GPU, memory.',
  tags: ['gauge', 'needle', 'meter', 'cpu', 'gpu', 'memory', 'threshold', 'alert', 'dial', 'analog'],
  surface: 'strip',
  segments: 1,
  data: ['cpu', 'gpu', 'mem'],
  fps: 6,
  loop: 8,
  states: ['cpu', 'gpu', 'mem'],
  press: 'cycle',
  params: {
    value: { type: 'number', default: 0.8, min: 0.05, max: 1, step: 0.01, label: 'Red line' },
    step: { type: 'number', default: 0.01, min: 0.005, max: 0.1, step: 0.005, label: 'Step per detent' },
    hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
  },
  order: 40,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, s = k.m.safe;
    const key = ctx.stateName || 'cpu', M = METRICS[key];
    const live = typeof ctx.data?.[key] === 'number';
    const raw = live ? clamp(ctx.data[key]) : ctx.noise.metric((ctx.reduced ? 2 : ctx.t) + M.off, { lo: 0.18, hi: 0.94, speed: 0.32, jitter: 0.12 });
    const e = arrival(ctx, 0.7);
    const reading = raw * e;
    const redline = ctx.value;
    const over = e >= 1 && raw >= redline;
    k.background({ tone: over ? 'alert' : 'idle' });
    const cx = 56, cy = 72, r = 41, FROM = -90, TO = 90;
    // scale: 21 ticks (5 %), majors every 25 %
    const tk = tickPaths(cx, cy, r + 8, 2.6, 5.2, FROM, TO, 21, 5);
    k.add(path(tk.minor, { fill: 'none', stroke: C.dim, strokeWidth: n(Math.max(1, k.m.hair)), strokeOpacity: 0.6, strokeLinecap: 'round' }));
    k.add(path(tk.major, { fill: 'none', stroke: C.muted, strokeWidth: n(Math.max(1.3, k.m.hair * 1.4)), strokeLinecap: 'round' }));
    // the arc: track, the filled reading, the red zone outside it
    k.add(path(arcPath(cx, cy, r, FROM, TO), { fill: 'none', stroke: C.line, strokeWidth: 4.5, strokeLinecap: 'butt', strokeOpacity: 0.9 }));
    if (reading > 0.004) k.add(path(arcPath(cx, cy, r, FROM, lerp(FROM, TO, reading)), { fill: 'none', stroke: over ? k.tone('alert') : ramp(ctx, reading, 90), strokeWidth: 4.5, strokeLinecap: 'butt' }));
    const ra = lerp(FROM, TO, redline);
    k.add(path(arcPath(cx, cy, r + 4.6, ra, TO), { fill: 'none', stroke: C.neg, strokeWidth: 2.6, strokeLinecap: 'butt', strokeOpacity: 0.9 }));
    const [tx, ty] = polar(cx, cy, r + 12.5, ra), [lx, ly] = polar(cx, cy, r + 17, ra - 4), [rx, ry] = polar(cx, cy, r + 17, ra + 4);
    k.add(path(P().M(tx, ty).L(lx, ly).L(rx, ry).Z().d, { fill: C.neg }));
    // the needle (a hint of tremble when live), the hub
    const ang = lerp(FROM, TO, clamp(reading + (ctx.reduced ? 0 : 0.006 * Math.sin(ctx.t * 23.7))));
    const [nx, ny] = polar(cx, cy, r - 3, ang), [bx, by] = polar(cx, cy, 7, ang + 180);
    const [ax, ay] = polar(cx, cy, 2.2, ang - 90), [cx2, cy2] = polar(cx, cy, 2.2, ang + 90);
    const ink = k.dark ? '#ffffff' : C.ink;
    k.add(path(P().M(bx, by).L(ax, ay).L(nx, ny).L(cx2, cy2).Z().d, { fill: over ? k.tone('alert') : ink }));
    k.add(`<circle cx="${n(cx)}" cy="${n(cy)}" r="5.2" fill="${C.surface2}" stroke="${ink}" stroke-width="1.6"/>`);
    // end labels under the arc ends
    k.caption('0', { x: cx - r, y: cy + 15, align: 'center', color: 'dim' });
    k.caption('100', { x: cx + r, y: cy + 15, align: 'center', color: 'dim' });
    // readouts
    const x0 = 112;
    k.eyebrow(M.label, { x: x0, align: 'left', color: over ? 'neg' : 'muted', maxWidth: w - x0 - s });
    k.value(String(Math.round(reading * 100)), { align: 'right', x: w - s, cy: 47, color: 'ink', maxWidth: w - x0 - s });
    k.caption(`${over ? 'Over ' : 'Line '}${Math.round(redline * 100)}%`, { align: 'right', x: w - s, y: h - 16, color: over ? 'neg' : 'muted', maxWidth: w - x0 - s + 6 });
    return finish(k);
  },
};
