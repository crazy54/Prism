// Sliders: a handle dragged along a ticked track, value label riding along.
import { ATTR, uni, phase, ease, mix } from './_input.js';

const SLIDERS = [
  ['Replicas', 1, 12, 0, (p) => 2 + ease(p, 0.5, 2.0) * 7 - ease(p, 4.2, 5.0) * 7, (v) => `${Math.round(v)}`],
  ['CPU limit', 0.25, 4, 2, (p) => 1 + ease(p, 1.2, 2.6) * 2.2 - ease(p, 4.4, 5.2) * 2.2, (v) => `${v.toFixed(2)} cores`],
  ['Timeout', 100, 5000, 0, (p) => 3000 - ease(p, 2.2, 3.6) * 2400 + ease(p, 4.6, 5.6) * 2400, (v) => `${Math.round(v / 50) * 50} ms`],
];

export default {
  id: 'input-slider',
  title: 'Sliders',
  category: 'Toggles & Checkboxes',
  description: 'Range sliders for replicas, CPU and timeout: handles glide along ticked tracks, filled to the value, with the reading following the handle.',
  tags: ['slider', 'range', 'control', 'drag', 'form'],
  kind: 'tui',
  size: { w: 60, h: 10 },
  minSize: { w: 34, h: 7 },
  loop: 6,
  color: '256',
  order: 40,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 6);
      const step = H >= 9 ? 3 : 2;
      SLIDERS.forEach(([label, lo, hi, , f, fmt], i) => {
        const y = i * step;
        if (y + 1 >= H) return;
        const v = Math.max(lo, Math.min(hi, f(p)));
        const k = (v - lo) / (hi - lo);
        const tw = Math.max(8, W - 4);
        const hx = 1 + Math.round(k * (tw - 1));
        const active = Math.abs(f(p + 0.05) - f(p)) > 1e-6;
        b.text(0, y, label, active ? th.accent : th.muted, undefined, ATTR.BOLD);
        const val = fmt(v);
        b.text(W - val.length, y, val, active ? th.ink : th.muted, undefined, ATTR.BOLD);
        for (let x = 0; x < tw; x++) {
          const filled = 1 + x <= hx;
          b.set(1 + x, y + 1, u ? (filled ? '━' : '─') : (filled ? '=' : '-'), filled ? mix(th.accent, th.info, x / tw) : th.line);
          if (step === 3 && y + 2 < H && x % Math.max(1, Math.floor(tw / 10)) === 0) b.set(1 + x, y + 2, u ? '╵' : "'", th.dim);
        }
        b.set(hx, y + 1, u ? '●' : 'O', active ? th.ink : th.accent, undefined, ATTR.BOLD);
      });
    };
  },
};
