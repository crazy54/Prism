// Number steppers: − value + with arrow presses, clamping at the limits.
import { ATTR, glyphs, uni, phase, tint } from './_input.js';

const FIELDS = [
  { label: 'Workers', min: 1, max: 32, start: 8, presses: [[0.5, 1], [0.8, 1], [1.1, 1], [3.6, -1], [3.9, -1], [4.2, -1]] },
  { label: 'Pool size', min: 10, max: 40, start: 36, step: 2, presses: [[1.6, 1], [1.9, 1], [2.2, 1], [2.5, 1], [4.6, -1], [4.9, -1]] },
  { label: 'Retries', min: 0, max: 5, start: 3, presses: [[2.8, -1], [3.1, -1], [3.4, -1], [3.7, -1], [5.2, 1], [5.4, 1]] },
];

export default {
  id: 'input-number-stepper',
  title: 'Number Steppers',
  category: 'Text Fields',
  description: 'Numeric steppers with − and + controls: presses flash, values step, and the field refuses to go past its min/max with a clamped hint.',
  tags: ['number', 'stepper', 'spinner', 'increment', 'form'],
  kind: 'tui',
  size: { w: 48, h: 9 },
  minSize: { w: 32, h: 5 },
  loop: 6,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 6);
      const step = H >= 8 ? 3 : 2;
      FIELDS.forEach((f, i) => {
        const y = i * step;
        if (y >= H) return;
        let v = f.start, last = null, clamped = false;
        f.presses.forEach(([at, d], k) => {
          if (p < at) return;
          const n = v + d * (f.step || 1);
          clamped = n < f.min || n > f.max;
          v = Math.max(f.min, Math.min(f.max, n));
          if (p - at < 0.18) last = { d, k };
        });
        const active = last !== null;
        b.text(0, y, f.label, active ? th.accent : th.muted, undefined, ATTR.BOLD);
        const x0 = Math.max(14, W - 18);
        const minus = u ? ' − ' : ' - ', plus = ' + ';
        b.text(x0, y, minus, last?.d < 0 ? th.bg : th.ink, last?.d < 0 ? th.accent : th.panel2, ATTR.BOLD);
        const val = String(v).padStart(4);
        b.text(x0 + 3, y, ` ${val} `, th.ink, tint(ctx, th.accent, 0.1), ATTR.BOLD);
        b.text(x0 + 9, y, plus, last?.d > 0 ? th.bg : th.ink, last?.d > 0 ? th.accent : th.panel2, ATTR.BOLD);
        if (step === 3 && y + 1 < H) {
          const atLimit = v === f.max ? `max ${f.max}` : v === f.min ? `min ${f.min}` : `${f.min}${u ? '–' : '-'}${f.max}`;
          b.text(x0, y + 1, (clamped && v === f.max) || (clamped && v === f.min) ? `${g.bang} ${atLimit}` : atLimit, clamped ? th.warn : th.dim);
        }
      });
    };
  },
};
