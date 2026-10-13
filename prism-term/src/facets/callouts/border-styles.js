// Every border style prism-term draws, side by side, with a focus ring walking the grid.
import { panel, ATTR, center, phase } from './_kit.js';

const STYLES = [
  ['round', 'the default'],
  ['single', 'classic square'],
  ['double', 'for emphasis'],
  ['heavy', 'for focus'],
  ['dashed', 'secondary panes'],
  ['ascii', '7-bit, anywhere'],
];

export default {
  id: 'callouts-border-styles',
  title: 'Border Styles',
  category: 'Panels & Borders',
  description: 'All six border styles — round, single, double, heavy, dashed and ASCII — with a focus ring stepping through them.',
  tags: ['border', 'box', 'panel', 'box-drawing', 'frame'],
  kind: 'widget',
  size: { w: 72, h: 18 },
  minSize: { w: 34, h: 9 },
  loop: 7.2,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height;
      const cols = W >= 60 ? 3 : 2;
      const rows = Math.ceil(STYLES.length / cols);
      const cw = Math.floor((W - (cols - 1)) / cols), ch = Math.max(3, Math.floor((H - (rows - 1)) / rows));
      const sel = Math.floor(phase(t, 7.2) / 1.2) % STYLES.length;
      STYLES.forEach(([style, note], i) => {
        const x = (i % cols) * (cw + 1), y = Math.floor(i / cols) * (ch + 1);
        if (y + 3 > H) return;
        const on = i === sel;
        const pulse = 0.55 + 0.45 * Math.sin(t * 6);
        const inner = panel(ctx, b, x, y, cw, Math.min(ch, H - y), {
          style,
          title: style, titleAlign: 'center', titleColor: on ? th.accent : th.muted,
          color: on ? (pulse > 0.5 ? th.accent : th.accent2) : th.line,
        });
        if (inner.height >= 1) center(inner, 0, Math.floor((inner.height - 1) / 2), inner.width, note, on ? th.ink : th.dim, undefined, on ? ATTR.BOLD : 0, ctx);
      });
    };
  },
};
