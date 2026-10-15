// dial-color-wheel — a hue wheel for one encoder segment (200 × 100), seen as the top
// of a large ring that turns under a fixed pointer, the way the physical knob turns.
// One detent is one 5° sector by default, so the wheel clicks color by color. Inside
// the ring: the chosen color (with the saturation and brightness params) and its hex.
// Push (or tap the strip) switches the lamp off: the wheel drains to gray and the
// swatch goes hollow. The ring hues are true OKLCH colors, the same in every theme.

import { surface, path, rect, sectorPath, oklch, n, P } from '../../scene/index.js';
import { clamp, lerp, arrive } from '../../scene/easing.js';
import { finish, arrival, pointer } from './_d4-dial.js';

const SECTOR = 5;

export default {
  id: 'dial-color-wheel',
  title: 'Color Wheel',
  category: 'Dial Segments',
  description: 'A hue wheel that turns under a fixed pointer, one 5° sector per detent, with the chosen color and its hex inside. Push or tap to switch the lamp off.',
  tags: ['color', 'hue', 'wheel', 'lights', 'lamp', 'rgb', 'picker', 'dial', 'smart home'],
  surface: 'strip',
  segments: 1,
  fps: 10,
  loop: 4,
  states: ['on', 'off'],
  tones: { on: 'active', off: 'idle' },
  press: 'toggle',
  params: {
    label: { type: 'text', default: 'Lamp', label: 'Label', maxLength: 12 },
    value: { type: 'number', default: 0.58, min: 0, max: 1, step: 0.001, label: 'Hue (0–1)' },
    step: { type: 'number', default: 0.013889, min: 0.002, max: 0.1, step: 0.001, label: 'Step per detent' },
    saturation: { type: 'number', default: 0.85, min: 0, max: 1, step: 0.01, label: 'Saturation' },
    brightness: { type: 'number', default: 0.72, min: 0, max: 1, step: 0.01, label: 'Brightness' },
  },
  order: 60,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors, s = k.m.safe;
    const off = ctx.stateName === 'off';
    const e = arrival(ctx, 0.55);
    const drain = off ? arrive(ctx.since, 0.4) : 0;
    k.background({ tone: off ? 'idle' : 'active' });
    const hue = (ctx.value * 360) % 360;
    const spin = (1 - e) * (off ? 0 : 50);                       // the wheel turns into place as it arrives
    const cx = w / 2, cy = 134, r0 = 87, r1 = 101;
    const L = k.dark ? 0.74 : 0.67, Cc = lerp(0.15, 0.012, drain);
    // visible sectors only (±78° around the pointer)
    for (let i = 0; i < 360 / SECTOR; i++) {
      const hi = i * SECTOR;
      let a = hi - hue + spin;
      a = ((a + 540) % 360) - 180;
      if (Math.abs(a) > 78) continue;
      k.add(path(sectorPath(cx, cy, r0, r1, a - SECTOR / 2, a + SECTOR / 2 + 0.35), { fill: oklch(L, Cc, hi) }));
    }
    // the selected sector, outlined
    const sel = Math.round(hue / SECTOR) * SECTOR, sa = ((sel - hue + spin + 540) % 360) - 180;
    const ink = k.dark ? '#ffffff' : C.ink;
    k.add(path(sectorPath(cx, cy, r0 - 1.5, r1 + 1.5, sa - SECTOR / 2 - 0.4, sa + SECTOR / 2 + 0.4), { fill: 'none', stroke: ink, strokeWidth: 1.6, strokeLinejoin: 'round' }));
    // inner / outer rims
    const rim = (r) => path(P().M(cx - r * Math.sin(80 * Math.PI / 180), cy - r * Math.cos(80 * Math.PI / 180)).A(r, r, 0, 0, 1, cx + r * Math.sin(80 * Math.PI / 180), cy - r * Math.cos(80 * Math.PI / 180)).d, { fill: 'none', stroke: C.line, strokeWidth: 1, strokeOpacity: 0.9 });
    k.add(rim(r0 - 0.5) + rim(r1 + 0.5));
    // fixed pointer at 12 o'clock
    k.add(path(pointer(cx, cy - r1 - 8.5, 4.4), { fill: ink }));
    // the chosen color
    const color = oklch(lerp(0.36, 0.86, ctx.params.brightness), 0.2 * ctx.params.saturation, hue);
    const sw = 50, sh = 17, sx = cx - sw / 2, sy = 55;
    if (off) k.add(rect({ x: sx, y: sy, width: sw, height: sh, rx: sh / 2, fill: 'none', stroke: C.dim, strokeWidth: 1.4 }));
    else {
      k.add(rect({ x: sx, y: sy, width: sw, height: sh, rx: sh / 2, fill: color, fillOpacity: e < 1 ? n(e, 3) : null }));
      k.add(rect({ x: sx + 0.5, y: sy + 0.5, width: sw - 1, height: sh - 1, rx: sh / 2 - 0.5, fill: 'none', stroke: k.dark ? '#ffffff' : '#000000', strokeWidth: 1, strokeOpacity: 0.22 }));
    }
    k.label(off ? 'Off' : color.toUpperCase(), { x: cx, y: 89, align: 'center', color: off ? 'dim' : 'ink', maxWidth: 110 });
    k.eyebrow(ctx.params.label, { color: off ? 'dim' : 'muted', maxWidth: w * 0.36 });
    k.eyebrow(`H ${Math.round(hue)}°`, { align: 'right', x: w - s, color: off ? 'dim' : 'ink', maxWidth: w * 0.36 });
    return finish(k);
  },
};
