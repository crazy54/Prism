// dial-value-bars — a stepped wedge of 20 bars for one encoder segment (200 × 100).
// One detent is one bar by default (step 0.05), so every click of the knob lights or
// darkens exactly one bar; finer steps fill the lead bar partially. Push (or tap the
// strip) switches the thing off: the bars drain right-to-left and stand hollow; push
// again and they light back up left-to-right. Static at rest.

import { surface, rect, path, n } from '../../scene/index.js';
import { clamp, lerp } from '../../scene/easing.js';
import { finish, arrival, ramp } from './_d4-dial.js';

const BARS = 20;

export default {
  id: 'dial-value-bars',
  title: 'Value Bars',
  category: 'Dial Segments',
  description: 'A stepped wedge of 20 bars: one detent lights one bar, the lead bar fills for finer steps. Push or tap to switch off; the bars drain and stand hollow.',
  tags: ['bars', 'level', 'brightness', 'fader', 'dial', 'encoder', 'meter', 'wedge'],
  surface: 'strip',
  segments: 1,
  fps: 10,
  loop: 4,
  states: ['on', 'off'],
  tones: { on: 'active', off: 'idle' },
  press: 'toggle',
  params: {
    label: { type: 'text', default: 'Brightness', label: 'Label', maxLength: 14 },
    value: { type: 'number', default: 0.65, min: 0, max: 1, step: 0.01, label: 'Level' },
    step: { type: 'number', default: 0.05, min: 0.01, max: 0.1, step: 0.01, label: 'Step per detent' },
    hue: { type: 'hue', default: 60.4, min: 0, max: 360, label: 'Hue' },
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, s = k.m.safe;
    const off = ctx.stateName === 'off';
    const e = arrival(ctx, off ? 0.36 : 0.5);
    k.background({ tone: off ? 'idle' : 'active' });
    const v = ctx.value, lit = v * BARS;
    // on: bars light left → right as the segment arrives; off: they drain right → left
    const reach = off ? lit * (1 - e) : lit * e;
    const x0 = s, x1 = w - s, top = 47, bottom = 88, pitch = (x1 - x0) / BARS, bw = pitch * 0.66;
    let track = '';
    for (let i = 0; i < BARS; i++) {
      const bh = (bottom - top) * lerp(0.2, 1, i / (BARS - 1));
      const x = x0 + i * pitch + (pitch - bw) / 2, y = bottom - bh;
      const f = clamp(reach - i);                      // 0 unlit · 0–1 partial · 1 lit
      if (f < 1) track += `M${n(x)} ${n(y)}h${n(bw)}v${n(bh)}h${n(-bw)}Z`;
      if (f > 0) {
        const lead = reach - i < 1.0001 && reach - i > 0;
        const fh = bh * f;
        k.add(rect({ x, y: bottom - fh, width: bw, height: fh, rx: Math.min(1.2, bw / 4), fill: ramp(ctx, i / (BARS - 1), 120) }));
        if (lead && !off) k.add(rect({ x: x - 0.6, y: bottom - fh - 1.6, width: bw + 1.2, height: 2, rx: 1, fill: k.dark ? '#ffffff' : C.ink }));
      }
    }
    if (track) k.add(path(track, off ? { fill: 'none', stroke: C.dim, strokeWidth: n(Math.max(1, k.m.hair)), strokeOpacity: 0.8 } : { fill: C.line, fillOpacity: 0.85 }));
    k.eyebrow(off ? `${ctx.params.label} · Off` : ctx.params.label, { color: off ? 'dim' : 'muted', maxWidth: w * 0.62 });
    k.value(off ? 'Off' : String(Math.round(v * 100 * (off ? 1 : e))), { align: 'right', x: w - s, cy: 25, color: off ? 'dim' : 'ink', maxWidth: w * 0.36 });
    return finish(k);
  },
};
