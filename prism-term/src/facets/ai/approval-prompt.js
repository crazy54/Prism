// A human-in-the-loop approval prompt: the agent proposes a command, the
// user reads it, moves to an option and approves; then it runs.
import { ATTR, glyphs, uni, phase, fit, spin, tint, panel, stepAt } from './_ai.js';

const CMD = 'kubectl -n checkout set env deploy/checkout-api DB_POOL_SIZE=40';
const OPTIONS = ['Yes', 'Yes, and don\'t ask again for kubectl set env in checkout', 'No, and tell the agent what to do differently'];
const T = { show: 0.2, moves: [1.8, 2.3, 2.9], enter: 3.5, done: 5.0 };

export default {
  id: 'ai-approval-prompt',
  title: 'Approval Prompt',
  category: 'Tool Calls',
  description: 'A human-in-the-loop approval prompt: the agent proposes a production command with its reason, the user weighs the options and approves, then it runs.',
  tags: ['approval', 'human in the loop', 'permission', 'confirm', 'agent'],
  kind: 'tui',
  size: { w: 70, h: 10 },
  minSize: { w: 50, h: 10 },
  loop: 7,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 7);
      if (p < T.enter) {
        const inner = panel(ctx, b, 0, 0, W, H, { title: 'Bash command', color: th.warn, titleColor: th.warn });
        const iw = inner.width;
        let y = 0;
        inner.text(1, y++, fit(CMD, iw - 2, undefined, ctx), th.ink, undefined, ATTR.BOLD);
        inner.text(1, y++, fit('Raise the checkout DB pool to match 32 workers (fix #142).', iw - 2, undefined, ctx), th.muted);
        y++;
        inner.text(1, y++, fit('Do you want to proceed?', iw - 2, undefined, ctx), th.ink);
        // Cursor: down, down, back up to Yes.
        const k = stepAt(p, T.moves);
        const cur = [0, 1, 2, 0][k + 1];
        OPTIONS.forEach((o, i) => {
          if (y >= inner.height - 1) return;
          const on = i === cur;
          if (on) inner.fill(0, y, iw, 1, ' ', undefined, tint(ctx, th.accent, 0.14));
          inner.text(1, y, on ? g.pointer : ' ', th.accent, undefined, ATTR.BOLD);
          inner.text(3, y++, fit(`${i + 1}. ${o}`, iw - 4, undefined, ctx).trimEnd(), on ? th.ink : th.muted, undefined, on ? ATTR.BOLD : 0);
        });
        inner.text(1, inner.height - 1, fit(`${g.up}${g.down} choose ${g.mid} enter confirm ${g.mid} esc deny`, iw - 2, undefined, ctx), th.dim);
        return;
      }
      // Approved: the call runs and reports.
      const running = p < T.done;
      b.text(0, 0, running ? spin(ctx, t) : (u ? '●' : '*'), running ? th.warn : th.pos, undefined, ATTR.BOLD);
      const x = b.text(2, 0, 'Bash', th.ink, undefined, ATTR.BOLD);
      b.text(x, 0, fit(`(${CMD})`, W - x, undefined, ctx), th.muted);
      b.text(2, 1, u ? '⎿' : '\\_', th.dim);
      b.text(5, 1, fit(running ? `Running${g.ellipsis}` : 'deployment.apps/checkout-api env updated', W - 5, undefined, ctx).trimEnd(), running ? th.warn : th.ink);
      b.text(0, 3, fit(`${g.check} approved by you ${g.mid} 12:05:41 ${g.mid} logged to the audit trail`, W, undefined, ctx), th.pos);
      if (!running && H > 5) b.text(0, 5, fit(`${g.ellipsis} rolling restart 3/3 pods ${g.mid} watching p99`, W, undefined, ctx), th.dim);
    };
  },
};
