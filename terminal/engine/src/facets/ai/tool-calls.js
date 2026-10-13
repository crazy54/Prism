// An agent's tool calls stacking up, coding-agent style: each call shows a
// spinner while it runs, then collapses to a one-line result under a ⎿ elbow.
import { ATTR, glyphs, uni, phase, fit, spin, stringWidth } from './_ai.js';

// [start, duration, tool, args, result, extra lines]
const CALLS = [
  [0, 0.9, 'Read', 'src/db/pool.js', 'Read 24 lines', 0],
  [1.5, 1.2, 'Bash', 'kubectl top pods -n checkout', '3 pods, cpu 41-58%', 12],
  [3.0, 0.8, 'Grep', 'pattern: "POOL_SIZE"', 'Found 3 files', 0],
  [4.1, 1.4, 'Query', 'pool_wait_ms p99 [30m]', '840ms (was 12ms before 12:02)', 0],
];

export default {
  id: 'ai-tool-call-card',
  title: 'Tool Calls',
  category: 'Tool Calls',
  description: 'An agent\'s tool calls stacking up: each shows a spinner and its arguments while running, then collapses to a one-line result, with long output folded away.',
  tags: ['tool calls', 'agent', 'function calling', 'coding agent', 'spinner'],
  kind: 'tui',
  size: { w: 64, h: 12 },
  minSize: { w: 40, h: 8 },
  loop: 8,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 8);
      const rows = [];
      for (const [at, dur, tool, args, result, extra] of CALLS) {
        if (p < at) break;
        const running = p < at + dur;
        rows.push({ kind: 'call', tool, args, running });
        if (running) rows.push({ kind: 'wait', text: tool === 'Bash' ? 'Running' : tool === 'Query' ? 'Querying metrics' : 'Working' });
        else {
          rows.push({ kind: 'result', text: result });
          if (extra) rows.push({ kind: 'more', text: `${g.ellipsis} +${extra} lines (ctrl+o to expand)` });
        }
        rows.push({ kind: 'gap' });
      }
      const first = Math.max(0, rows.length - H);
      rows.slice(first).forEach((row, y) => {
        if (row.kind === 'call') {
          b.text(0, y, row.running ? spin(ctx, t) : (u ? '●' : '*'), row.running ? th.warn : th.pos, undefined, ATTR.BOLD);
          const x = b.text(2, y, row.tool, th.ink, undefined, ATTR.BOLD);
          const a = `(${row.args})`;
          b.text(x, y, stringWidth(a) <= W - x ? a : fit(a, W - x, undefined, ctx), th.muted);
        } else if (row.kind === 'result' || row.kind === 'wait' || row.kind === 'more') {
          b.text(2, y, u ? '⎿' : '\\_', th.dim);
          const c = row.kind === 'wait' ? th.warn : row.kind === 'more' ? th.dim : th.ink;
          b.text(5, y, fit(row.kind === 'wait' ? `${row.text}${g.ellipsis}` : row.text, W - 5, undefined, ctx).trimEnd(), c, undefined, row.kind === 'more' ? ATTR.ITALIC : 0);
        }
      });
    };
  },
};
