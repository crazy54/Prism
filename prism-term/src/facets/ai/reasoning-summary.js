// A collapsible reasoning block: "Thinking…" expands with summary lines
// streaming in dim italics, collapses to "Thought for 14s", then the answer streams.
import { ATTR, glyphs, uni, phase, fit, mix, reveal, wrapLines, thinkGlyph, shimmer } from './_ai.js';

const THOUGHTS = [
  'p99 jumped at 12:02, same minute as the v2.14.1 deploy.',
  'The diff raises worker concurrency 8 -> 32 but the pool stays at 20.',
  'Pool wait time tracks p99 almost exactly, so requests queue for connections.',
  'Smallest safe fix: size the pool to the workers, alert on pool wait.',
];
const ANSWER = 'The p99 spike is connection-pool starvation: v2.14.1 raised workers to 32 while the DB pool stayed at 20. Raise DB_POOL_SIZE to 40 (Postgres max_connections is 200, so there is headroom) and add an alert on pool wait > 200ms.';
const T = { think: 0.2, collapse: 4.6, answer: 5.0 };

export default {
  id: 'ai-reasoning-summary',
  title: 'Reasoning Summary',
  category: 'Thinking States',
  description: 'A collapsible reasoning block: thought summaries stream in dim italics while the model works, fold to "Thought for 14s", then the final answer streams below.',
  tags: ['reasoning', 'thinking', 'collapsible', 'summary', 'chain of thought'],
  kind: 'text',
  size: { w: 64, h: 11 },
  minSize: { w: 40, h: 7 },
  loop: 11,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx);
      const p = phase(t, 11);
      const open = p < T.collapse;
      let y = 0;
      if (open) {
        const label = `Thinking${g.ellipsis}`;
        b.text(0, y, g.triDown, th.muted);
        b.text(2, y, thinkGlyph(ctx, t), th.accent, undefined, ATTR.BOLD);
        [...label].forEach((ch, i) => b.set(4 + i, y, ch, shimmer(th.muted, th.ink, i, label.length, t), undefined, ATTR.BOLD));
        y++;
        // Thought lines reveal one after another.
        let at = T.think;
        for (const line of THOUGHTS) {
          const r = reveal(line, p, at, 22);
          if (!r.n) break;
          for (const l of wrapLines(r.text, W - 4)) {
            if (y >= H) break;
            b.text(0, y, g.v, mix(th.bg, th.line, 0.9));
            b.text(2, y++, fit(l, W - 2, undefined, ctx).trimEnd(), th.dim, undefined, ATTR.ITALIC);
          }
          at += r.total / 22 + 0.25;
        }
        return;
      }
      b.text(0, y, g.tri, th.muted);
      b.text(2, y, 'Thought for 14s', th.muted, undefined, ATTR.BOLD);
      b.text(18, y, `${g.mid} 4 steps`, th.dim);
      y += 2;
      const r = reveal(ANSWER, p, T.answer, 26);
      const lines = wrapLines(r.text, W);
      lines.slice(0, H - y).forEach((l, i) => b.text(0, y + i, l, th.ink));
      if (!r.done && lines.length) {
        const last = lines[Math.min(lines.length, H - y) - 1];
        const ly = y + Math.min(lines.length, H - y) - 1;
        if (ly < H) b.set(Math.min(W - 1, last.length), ly, uni(ctx) ? '▍' : '_', th.accent);
      }
    };
  },
};
