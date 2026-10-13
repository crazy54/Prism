// A context window filling up: a stacked bar of system, tools, files,
// history and output grows turn by turn until auto-compact squeezes the
// history into a summary and frees room.
import { ATTR, glyphs, uni, phase, ease, fit, mix } from './_ai.js';

const MAX = 200; // k tokens
const SEGS = [['system', 'muted'], ['tools', 'info'], ['files', 'warn'], ['history', 'accent'], ['output', 'pos']];
const COMPACT = [5.8, 6.6];

export default {
  id: 'ai-context-window',
  title: 'Context Window',
  category: 'Model Internals',
  description: 'A 200k context window filling turn by turn as a stacked bar of system, tools, files, history and output, until auto-compact squeezes history into a summary.',
  tags: ['context window', 'tokens', 'compaction', 'memory', 'budget'],
  kind: 'chart',
  size: { w: 64, h: 9 },
  minSize: { w: 40, h: 7 },
  loop: 9,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      // Usage in k tokens: history and files grow with each turn, then compaction.
      const grow = Math.min(1, p / COMPACT[0]);
      const squeeze = ease(p, COMPACT[0], COMPACT[1]);
      const history = (6 + grow * 118) * (1 - squeeze) + 9 * squeeze;
      const files = 4 + grow * 38 - squeeze * 14;
      const output = 1 + grow * 9 + Math.max(0, p - COMPACT[1]) * 2.5;
      const used = { system: 3.2, tools: 11.8, files, history, output };
      const total = Object.values(used).reduce((a, c) => a + c, 0);
      const pct = total / MAX;
      b.text(0, 0, 'context', th.ink, undefined, ATTR.BOLD);
      const head = `${total.toFixed(1)}k / ${MAX}k  ${Math.round(pct * 100)}%`;
      b.text(W - head.length, 0, head, pct > 0.8 ? th.warn : th.muted, undefined, pct > 0.8 ? ATTR.BOLD : 0);
      // Stacked bar, two rows tall.
      const bw = W;
      let x = 0;
      SEGS.forEach(([key, tone], i) => {
        const w = Math.round((used[key] / MAX) * bw);
        const glyph = u ? '█▓▒░█'[i] : '#=+:%'[i];
        for (let k = 0; k < w && x < bw; k++, x++) { b.set(x, 1, glyph, th[tone]); b.set(x, 2, glyph, mix(th[tone], th.bg, 0.25)); }
      });
      for (; x < bw; x++) { b.set(x, 1, u ? '·' : '.', th.line); b.set(x, 2, u ? '·' : '.', th.line); }
      // Auto-compact threshold marker at 80%.
      const tx = Math.round(0.8 * bw);
      b.set(Math.min(W - 1, tx), 3, u ? '▲' : '^', th.warn);
      if (tx + 14 <= W) b.text(tx + 2, 3, 'auto-compact', th.dim);
      // Legend.
      let lx = 0, ly = 4;
      SEGS.forEach(([key, tone], i) => {
        const item = `${key} ${used[key].toFixed(1)}k`;
        if (lx + item.length + 2 > W) { lx = 0; ly++; }
        if (ly >= H - 1) return;
        b.set(lx, ly, u ? '█▓▒░█'[i] : '#=+:%'[i], th[tone]);
        lx = b.text(lx + 2, ly, item, th.muted) + 3;
      });
      const msg = squeeze > 0 && squeeze < 1 ? `${g.spark} compacting history: ${Math.round(6 + 118)}k ${g.right} 9k summary`
        : squeeze >= 1 ? `${g.check} compacted ${g.mid} freed 129k ${g.mid} summary keeps the incident timeline`
          : `turn ${1 + Math.floor(grow * 23)} ${g.mid} history grows with every tool result`;
      b.text(0, H - 1, fit(msg, W, undefined, ctx), squeeze > 0 ? th.pos : th.dim);
    };
  },
};
