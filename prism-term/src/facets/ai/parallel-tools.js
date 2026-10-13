// Parallel tool calls as a live waterfall: four calls fan out at once, bars
// grow while each runs, finish at different times, then fan back in.
import { ATTR, glyphs, uni, phase, fit, spin, tint } from './_ai.js';

// [tool, args, duration (s), result]
const CALLS = [
  ['logs.search', 'checkout-api level>=warn 30m', 1.1, '214 matches'],
  ['metrics.query', 'pool_wait_ms p99', 2.3, '840ms'],
  ['traces.find', 'p99 > 2s, 15m', 3.1, '31 slow traces'],
  ['deploys.list', 'checkout, last 24h', 0.7, 'v2.14.1 @ 12:02'],
];
const START = 0.5, SCALE = 3.4;

export default {
  id: 'ai-parallel-tools',
  title: 'Parallel Tool Calls',
  category: 'Tool Calls',
  description: 'Four tool calls fanned out in parallel as a live waterfall: bars grow while each runs, finish at different times with their results, then fan back in.',
  tags: ['parallel', 'tool calls', 'waterfall', 'fan out', 'agent'],
  kind: 'tui',
  size: { w: 70, h: 6 },
  minSize: { w: 48, h: 6 },
  loop: 7,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 7);
      const el = Math.max(0, p - START);
      const all = Math.max(...CALLS.map((c) => c[2]));
      const finished = el >= all;
      b.text(0, 0, finished ? g.check : spin(ctx, t), finished ? th.pos : th.warn, undefined, ATTR.BOLD);
      b.text(2, 0, fit(finished ? `4 tools finished in ${all.toFixed(1)}s (longest wins)` : `Running 4 tools in parallel ${g.mid} ${el.toFixed(1)}s`, W - 2, undefined, ctx), th.ink, undefined, ATTR.BOLD);
      const lw = Math.min(16, Math.floor(W * 0.24));
      const x0 = lw + 3, tw = Math.max(10, W - x0 - 18);
      CALLS.forEach(([tool, args, dur, result], i) => {
        const y = 2 + i;
        if (y >= H) return;
        const done = el >= dur;
        b.text(0, y, u ? (i === CALLS.length - 1 ? '└' : '├') : (i === CALLS.length - 1 ? '`' : '|'), th.line);
        b.text(2, y, fit(tool, lw, undefined, ctx), done ? th.ink : th.muted, undefined, done ? 0 : ATTR.BOLD);
        // Waterfall bar on a shared time axis.
        const len = Math.max(1, Math.round((Math.min(el, dur) / SCALE) * tw));
        b.fill(x0, y, tw, 1, u ? '·' : '.', tint(ctx, th.line, 0.8));
        b.fill(x0, y, Math.min(len, tw), 1, u ? '━' : '=', done ? th.pos : th.accent);
        if (!done) b.set(x0 + Math.min(len, tw - 1), y, spin(ctx, t + i * 0.3), th.warn);
        const tail = done ? `${g.check} ${result}` : `${(el).toFixed(1)}s`;
        b.text(x0 + tw + 1, y, fit(tail, Math.max(0, W - x0 - tw - 1), undefined, ctx).trimEnd(), done ? th.pos : th.dim);
      });
    };
  },
};
