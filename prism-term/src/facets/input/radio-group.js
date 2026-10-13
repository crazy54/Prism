// Radio groups: one choice per group, selection hopping between options.
import { ATTR, glyphs, phase, stepAt, tint } from './_input.js';

const GROUPS = [
  ['Environment', ['dev', 'staging', 'production']],
  ['Strategy', ['rolling', 'blue/green', 'canary']],
  ['Notify', ['nobody', 'team', 'on-call']],
];
const SCRIPT = [[0.4, 0, 1], [1.0, 0, 2], [1.7, 1, 2], [2.5, 2, 1], [3.3, 1, 1]];

export default {
  id: 'input-radio-group',
  title: 'Radio Groups',
  category: 'Toggles & Checkboxes',
  description: 'Three labeled radio groups — environment, rollout strategy and notification — with the selected dot hopping as choices change.',
  tags: ['radio', 'options', 'choice', 'form', 'select'],
  kind: 'tui',
  size: { w: 60, h: 9 },
  minSize: { w: 40, h: 6 },
  loop: 5,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 5);
      const sel = [0, 0, 1];
      const k = stepAt(p, SCRIPT.map((s) => s[0]));
      let focusG = 0;
      for (let i = 0; i <= k; i++) { sel[SCRIPT[i][1]] = SCRIPT[i][2]; focusG = SCRIPT[i][1]; }
      const step = H >= GROUPS.length * 3 ? 3 : 2;
      GROUPS.forEach(([name, opts], gi) => {
        const y = gi * step;
        if (y + 1 >= H) return;
        const focused = gi === focusG;
        b.text(0, y, name, focused ? th.accent : th.muted, undefined, ATTR.BOLD);
        let x = 2;
        opts.forEach((o, oi) => {
          const on = sel[gi] === oi;
          if (focused && on) b.fill(x - 1, y + 1, o.length + g.radioOn.length + 3, 1, ' ', undefined, tint(ctx, th.accent, 0.14));
          x = b.text(x, y + 1, on ? g.radioOn : g.radioOff, on ? th.accent : th.dim, undefined, ATTR.BOLD);
          x = b.text(x + 1, y + 1, o, on ? th.ink : th.muted, undefined, on ? ATTR.BOLD : 0) + 3;
        });
      });
    };
  },
};
