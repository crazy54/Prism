// Labeled rules in every weight, with a light sweeping along them.
import { ATTR, uni, phase, mix } from './_kit.js';

const RULES = [
  { ch: ['─', '-'], label: 'Section', align: 'left' },
  { ch: ['━', '='], label: 'Heavy', align: 'center' },
  { ch: ['═', '='], label: 'Double', align: 'right' },
  { ch: ['┄', '.'], label: 'Dotted', align: 'left' },
  { ch: ['╌', '-'], label: 'Dashed', align: 'center' },
  { ch: ['·', '.'], label: 'Middle dots', align: 'center' },
  { ch: ['•', '*'], spaced: true, label: '', align: 'center' },
  { ch: ['▔', '-'], label: 'Overline', align: 'left' },
];

export default {
  id: 'callouts-dividers',
  title: 'Dividers & Rules',
  category: 'Dividers & Headers',
  description: 'Horizontal rules in light, heavy, double, dotted, dashed and dotted-bullet weights with left, centered and right labels and a sweep of light.',
  tags: ['divider', 'rule', 'separator', 'hr', 'section'],
  kind: 'widget',
  size: { w: 64, h: 15 },
  minSize: { w: 24, h: 6 },
  loop: 4,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const step = H >= RULES.length * 2 - 1 ? 2 : 1;
      const sweep = (phase(t, 4) / 4) * (W + 20) - 10;
      RULES.forEach((r, i) => {
        const y = i * step;
        if (y >= H) return;
        const ch = r.ch[u ? 0 : 1];
        for (let x = 0; x < W; x++) {
          if (r.spaced && x % 2) continue;
          const k = Math.max(0, 1 - Math.abs(x - sweep - i * 2) / 6);
          b.set(x, y, ch, mix(th.line, th.accent, k));
        }
        if (r.label) {
          const text = ` ${r.label} `;
          const lx = r.align === 'left' ? 3 : r.align === 'right' ? W - text.length - 3 : Math.floor((W - text.length) / 2);
          b.text(Math.max(0, lx), y, text, i === 0 ? th.ink : th.muted, undefined, ATTR.BOLD);
        }
      });
    };
  },
};
