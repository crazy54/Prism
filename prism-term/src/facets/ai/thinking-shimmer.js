// A working indicator: a breathing glyph, a status verb with a shimmer band
// sweeping across it, elapsed time and token count, finished steps above.
import { ATTR, glyphs, phase, fit, mix, thinkGlyph, shimmer, stringWidth } from './_ai.js';

// [start, verb, finished-step summary shown once the next verb starts]
const STEPS = [
  [0, 'Reading the trace', 'Read trace 4bf92f35 (31 spans)'],
  [2.2, 'Correlating spans with pool metrics', 'Correlated p99 with pool wait (r=0.94)'],
  [4.6, 'Checking the deploy diff', 'v2.14.1 raised workers to 32, pool left at 20'],
  [7.0, 'Drafting a fix', ''],
];

export default {
  id: 'ai-thinking-shimmer',
  title: 'Thinking Shimmer',
  category: 'Thinking States',
  description: 'An agent working indicator: a breathing glyph and a status verb with a shimmer sweeping across it, elapsed time and tokens, finished steps ticking off above.',
  tags: ['thinking', 'shimmer', 'working', 'spinner', 'agent'],
  kind: 'spinner',
  size: { w: 64, h: 6 },
  minSize: { w: 36, h: 3 },
  loop: 9.5,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 9.5);
      let k = 0;
      STEPS.forEach(([at], i) => { if (p >= at) k = i; });
      // Finished steps above the live line (as many as fit).
      const done = STEPS.slice(0, k).map((s) => s[2]);
      const rows = done.slice(-(H - 1));
      rows.forEach((text, r) => {
        b.text(0, r, g.check, th.pos, undefined, ATTR.BOLD);
        b.text(2, r, fit(text, W - 2, undefined, ctx), th.muted);
      });
      const y = rows.length;
      const verb = `${STEPS[k][1]}${g.ellipsis}`;
      b.text(0, y, thinkGlyph(ctx, t), th.accent, undefined, ATTR.BOLD);
      const vw = Math.min(stringWidth(verb), W - 2);
      [...verb].slice(0, vw).forEach((ch, i) => b.set(2 + i, y, ch, shimmer(mix(th.bg, th.accent, 0.75), th.ink, i, vw, t), undefined, ATTR.BOLD));
      const secs = Math.floor(p * 1.6) + 3;
      const toks = (0.4 + p * 0.31).toFixed(1);
      const meta = `(${secs}s ${g.mid} ${g.down} ${toks}k tokens ${g.mid} esc to interrupt)`;
      if (2 + vw + 1 + stringWidth(meta) <= W) b.text(3 + vw, y, meta, th.dim);
      else if (y + 1 < H) b.text(2, y + 1, fit(meta, W - 2, undefined, ctx), th.dim);
    };
  },
};
