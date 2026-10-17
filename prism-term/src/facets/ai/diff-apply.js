// An agent applying an edit: a unified diff streams in hunk by hunk with
// line numbers and +/- gutters, then the edit is applied and summarized.
import { ATTR, glyphs, uni, phase, fit, spin, tint, stringWidth } from './_ai.js';

// [old line no, new line no, kind, text]
const DIFF = [
  [3, 3, ' ', "import { createPool } from './db.js';"],
  [4, 4, ' ', ''],
  [5, null, '-', 'const POOL_SIZE = 20;'],
  [null, 5, '+', 'const POOL_SIZE = Number(process.env.DB_POOL_SIZE ?? 40);'],
  [6, 6, ' ', 'const TIMEOUT_MS = 5000;'],
  [null, 7, '+', "const POOL_WAIT_ALERT_MS = 200; // alert: pool_wait_ms p99"],
  [7, 8, ' ', ''],
  [8, 9, ' ', 'export function pool() {'],
];
const T = { head: 0.3, line: 0.32, applied: 4.2 };

export default {
  id: 'ai-diff-apply',
  title: 'Diff Apply',
  category: 'Tool Calls',
  description: 'An agent applying an edit: the unified diff streams in line by line with old and new line numbers and +/- gutters, then the edit is applied and summarized.',
  tags: ['diff', 'edit', 'patch', 'code change', 'agent'],
  kind: 'tui',
  size: { w: 72, h: 10 },
  minSize: { w: 48, h: 9 },
  loop: 8,
  color: '256',
  order: 40,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 8);
      const applied = p >= T.applied;
      b.text(0, 0, applied ? (u ? '●' : '*') : spin(ctx, t), applied ? th.pos : th.warn, undefined, ATTR.BOLD);
      const x = b.text(2, 0, 'Update', th.ink, undefined, ATTR.BOLD);
      b.text(x, 0, fit('(src/db/pool.js)', W - x, undefined, ctx).trimEnd(), th.muted);
      b.text(2, 1, u ? '⎿' : '\\_', th.dim);
      b.text(5, 1, fit(applied ? `Updated src/db/pool.js with 2 additions and 1 removal` : `Proposing edit${g.ellipsis}`, W - 5, undefined, ctx).trimEnd(), applied ? th.ink : th.warn);
      const shown = Math.min(DIFF.length, Math.max(0, Math.floor((p - T.head) / T.line)));
      const addBg = tint(ctx, th.pos, 0.16), delBg = tint(ctx, th.neg, 0.16);
      DIFF.slice(0, shown).forEach(([o, n, kind, text], i) => {
        const y = 2 + i;
        if (y >= H) return;
        const bg = kind === '+' ? addBg : kind === '-' ? delBg : undefined;
        if (bg !== undefined) b.fill(5, y, W - 5, 1, ' ', undefined, bg);
        b.text(5, y, String(o ?? '').padStart(3), th.dim, bg);
        b.text(9, y, String(n ?? '').padStart(3), th.dim, bg);
        b.text(13, y, kind, kind === '+' ? th.pos : kind === '-' ? th.neg : th.dim, bg, ATTR.BOLD);
        const room = W - 15;
        b.text(15, y, stringWidth(text) <= room ? text : fit(text, room, undefined, ctx), kind === '+' ? th.pos : kind === '-' ? th.neg : th.ink, bg);
      });
    };
  },
};
