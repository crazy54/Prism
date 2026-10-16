// dial-selector — a detented rotary selector for one encoder segment (200 × 100).
// Every detent clicks to the next option (ctx.ticks, wrapping round like an endless
// encoder): the switch's pointer jumps a position and the drum of names rolls by one.
// Push (or tap the strip) recalls the selected option: a beam sweeps the selection
// window and the segment confirms it. Static between clicks.

import { surface, path, rect, linearGradient, url, polar, n, P } from '../../scene/index.js';
import { clamp, lerp, outCubic } from '../../scene/easing.js';
import { finish, arrival } from './_d4-dial.js';

export default {
  id: 'dial-selector',
  title: 'Rotary Selector',
  category: 'Dial Segments',
  description: 'A detented rotary switch: each detent clicks to the next option and the drum of names rolls by one. Push or tap to recall the selection. Wraps round endlessly.',
  tags: ['selector', 'switch', 'preset', 'scene', 'rotary', 'detent', 'menu', 'dial', 'encoder'],
  surface: 'strip',
  segments: 1,
  fps: 10,
  loop: 4,
  press: 'momentary',
  params: {
    label: { type: 'text', default: 'Scene', label: 'Label', maxLength: 12 },
    options: { type: 'text', default: 'Studio,Stream,Meeting,Music,Game,Night', label: 'Options (comma separated)', maxLength: 72 },
    hue: { type: 'hue', default: 296, min: 0, max: 360, label: 'Hue' },
  },
  order: 70,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, s = k.m.safe;
    const opts = String(ctx.params.options).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12);
    const N = Math.max(1, opts.length || 1);
    const idx = (((Math.round(ctx.ticks) % N) + N) % N);
    const name = (i) => opts[((i % N) + N) % N] || '—';
    const e = arrival(ctx, 0.5);
    const recall = ctx.pressed ? 0 : ctx.pressAge;               // seconds since the recall
    const confirming = recall < 1.4;
    k.background({ tone: confirming ? 'active' : 'idle' });
    const ink = k.dark ? '#ffffff' : C.ink;
    // the switch: N detent positions over 300°, the selected one lit, a pointer on the knob
    const kx = 39, ky = 58, kr = 17, dr = 25.5;
    const angOf = (i) => (N === 1 ? 0 : lerp(-150, 150, i / (N - 1)));
    for (let i = 0; i < N; i++) {
      const [x, y] = polar(kx, ky, dr, angOf(i));
      k.add(`<circle cx="${n(x)}" cy="${n(y)}" r="${i === idx ? 3.1 : 1.7}" fill="${i === idx ? ctx.tint : C.dim}"${i === idx ? '' : ' fill-opacity="0.8"'}/>`);
    }
    k.add(`<circle cx="${kx}" cy="${ky}" r="${kr}" fill="${C.surface2}" stroke="${C.line}" stroke-width="1.4"/>`);
    k.add(`<circle cx="${kx}" cy="${ky}" r="${n(kr - 3.5)}" fill="none" stroke="${C.line}" stroke-width="1" stroke-opacity="0.8"/>`);
    const a = angOf(idx) * e + (1 - e) * -150;
    const [px, py] = polar(kx, ky, kr - 2.5, a), [qx, qy] = polar(kx, ky, 4, a);
    k.add(path(P().M(qx, qy).L(px, py).d, { stroke: ink, strokeWidth: 2.6, strokeLinecap: 'round' }));
    // the drum: previous / selected / next, the selection window between hairlines
    const x0 = 78, wy0 = 41, wy1 = 71, slide = (1 - e) * 14;
    const hid = k.id('win');
    k.def(linearGradient(hid, [[0, C.line, 0], [0.15, C.line, 1], [1, C.line, 0.2]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    k.add(rect({ x: x0 - 6, y: wy0, width: w - s - x0 + 6, height: 1.2, fill: url(hid) }));
    k.add(rect({ x: x0 - 6, y: wy1, width: w - s - x0 + 6, height: 1.2, fill: url(hid) }));
    if (N > 1) k.caption(name(idx - 1), { x: x0, y: 33 + slide, align: 'left', color: 'dim', opacity: e * 0.9, maxWidth: w - s - x0 });
    k.label(name(idx), { x: x0, y: 63 + slide, align: 'left', size: 19, weight: 700, color: 'ink', opacity: e < 1 ? e : undefined, maxWidth: w - s - x0 });
    if (N > 2) k.caption(name(idx + 1), { x: x0, y: 88 + slide, align: 'left', color: 'dim', opacity: e * 0.9, maxWidth: w - s - x0 });
    // recall: a beam sweeps the selection window, then the segment confirms
    if (!ctx.pressed && recall < 0.55 && !ctx.reduced) {
      const p = outCubic(clamp(recall / 0.55)), bx = lerp(x0 - 40, w + 10, p);
      const bid = k.id('sweep');
      k.def(linearGradient(bid, [[0, ctx.tint, 0], [0.7, ctx.tint, 0.35 * (1 - p * 0.5)], [1, ink, 0.6 * (1 - p * 0.5)]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
      k.add(rect({ x: Math.max(x0 - 6, bx - 46), y: wy0 + 1.2, width: Math.max(0.5, Math.min(w - s, bx) - Math.max(x0 - 6, bx - 46)), height: wy1 - wy0 - 1.2, fill: url(bid) }));
    }
    k.eyebrow(confirming ? `${ctx.params.label} ✓` : ctx.params.label, { color: confirming ? 'pos' : 'muted', maxWidth: w * 0.5 });
    k.eyebrow(`${idx + 1}/${N}`, { align: 'right', x: w - s, color: 'muted' });
    return finish(k);
  },
};
