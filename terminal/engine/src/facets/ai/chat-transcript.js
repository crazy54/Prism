// A chat transcript: the user's question sits right-aligned, the assistant
// streams its reply on the left with a tool chip, then a follow-up arrives.
import { ATTR, glyphs, uni, phase, fit, tint, reveal, wrapLines, stringWidth, thinkGlyph } from './_ai.js';

const MSGS = [
  ['user', 0, 'Why is checkout slow since lunch?'],
  ['tool', 1.0, 'searched traces, metrics, deploys'],
  ['bot', 1.8, 'p99 went from 180ms to 2.4s at 12:02, right when v2.14.1 shipped. That release runs 32 workers against a 20-connection pool, so requests queue for a connection.'],
  ['user', 5.4, 'Can you fix it?'],
  ['bot', 6.1, 'Yes: raise DB_POOL_SIZE to 40. I have queued it as fix #142 for your approval.'],
];

export default {
  id: 'ai-chat-transcript',
  title: 'Chat Transcript',
  category: 'Agents & Pipelines',
  description: 'A chat transcript: user questions sit right-aligned in tinted bubbles, the assistant streams replies on the left with a tool-use chip, and the view scrolls.',
  tags: ['chat', 'transcript', 'assistant', 'conversation', 'streaming'],
  kind: 'tui',
  size: { w: 64, h: 16 },
  minSize: { w: 40, h: 10 },
  loop: 9.5,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9.5);
      const rows = [];
      const bw = Math.max(16, Math.floor(W * 0.62));
      for (const [who, at, text] of MSGS) {
        if (p < at) break;
        if (who === 'user') {
          const lines = wrapLines(text, bw - 4);
          const w = Math.max(...lines.map((l) => stringWidth(l))) + 4;
          rows.push({ kind: 'label', who: 'you', x: W - 3 });
          for (const l of lines) rows.push({ kind: 'user', text: l, x: W - w, w });
        } else if (who === 'tool') {
          rows.push({ kind: 'tool', text });
        } else {
          const r = reveal(text, p, at, 24);
          if (!r.n) { rows.push({ kind: 'think' }); continue; }
          rows.push({ kind: 'label', who: 'mainbrain', x: 0 });
          const lines = wrapLines(r.text, bw);
          lines.forEach((l, i) => rows.push({ kind: 'bot', text: l, caret: !r.done && i === lines.length - 1 }));
        }
        rows.push({ kind: 'gap' });
      }
      const first = Math.max(0, rows.length - H);
      rows.slice(first).forEach((row, y) => {
        if (row.kind === 'label') {
          const lab = row.who;
          b.text(row.who === 'you' ? W - stringWidth(lab) : 0, y, lab, row.who === 'you' ? th.muted : th.accent, undefined, ATTR.BOLD);
        } else if (row.kind === 'user') {
          const bg = tint(ctx, th.accent, 0.22);
          b.fill(row.x, y, row.w, 1, ' ', undefined, bg);
          b.text(row.x + 2, y, row.text, th.ink, bg);
        } else if (row.kind === 'bot') {
          const x = b.text(0, y, row.text, th.ink);
          if (row.caret) b.set(Math.min(W - 1, x), y, u ? '▍' : '_', th.accent);
        } else if (row.kind === 'tool') {
          const chip = ` ${g.spark} ${row.text} `;
          b.text(0, y, fit(chip, W, undefined, ctx).trimEnd(), th.muted, tint(ctx, th.panel2, 0.9), ATTR.ITALIC);
        } else if (row.kind === 'think') {
          b.text(0, y, `${thinkGlyph(ctx, t)} thinking${g.ellipsis}`, th.dim, undefined, ATTR.ITALIC);
        }
      });
    };
  },
};
