// A single-select prompt: the cursor walks the options, Enter confirms.
import { ATTR, glyphs, phase, stepAt, promptLine, tint } from './_input.js';

const OPTIONS = [
  ['us-east-1', 'N. Virginia'],
  ['us-east-2', 'Ohio'],
  ['us-west-2', 'Oregon'],
  ['eu-west-1', 'Ireland'],
  ['ap-southeast-2', 'Sydney'],
];

export default {
  id: 'input-select',
  title: 'Select Prompt',
  category: 'Selects & Lists',
  description: 'An inquirer/gum-style single select: the pointer moves through regions with a hint line, Enter confirms and the answer collapses inline.',
  tags: ['select', 'prompt', 'list', 'choose', 'inquirer'],
  kind: 'tui',
  size: { w: 56, h: 10 },
  minSize: { w: 32, h: 7 },
  loop: 6,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 6);
      const steps = [0.8, 1.4, 2.0, 2.6];
      const k = stepAt(p, steps);
      const cur = [0, 1, 2, 3, 2][k + 1];
      const done = p > 3.4;
      if (done) {
        promptLine(ctx, b, 0, 0, 'Deploy region', { state: 'done', answer: OPTIONS[2][0] });
        b.text(2, 2, `Deploying checkout to ${OPTIONS[2][0]} ${g.ellipsis}`, th.muted);
        return;
      }
      promptLine(ctx, b, 0, 0, 'Deploy region', { answer: '' });
      const rows = Math.min(OPTIONS.length, H - 3);
      for (let i = 0; i < rows; i++) {
        const on = i === cur;
        const y = 1 + i;
        if (on) b.fill(0, y, W, 1, ' ', undefined, tint(ctx, th.accent, 0.12));
        b.text(1, y, on ? g.pointer : ' ', th.accent, undefined, ATTR.BOLD);
        b.text(3, y, OPTIONS[i][0], on ? th.accent : th.ink, undefined, on ? ATTR.BOLD : 0);
        b.text(3 + 16, y, OPTIONS[i][1], on ? th.muted : th.dim);
      }
      b.text(0, 1 + rows + (H > rows + 2 ? 1 : 0), `${g.up}/${g.down} move ${g.mid} enter select ${g.mid} esc cancel`, th.dim);
    };
  },
};
