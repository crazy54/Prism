// Thinking against a token budget: the bar fills through planning, checking and drafting, stops short
// of the cap with "done thinking", and the answer's first line streams in.
import { ATTR, uni, phase, reveal } from './_ai.js';
import { mark, comma, runs, fitRows, fitText, beat, BEATS } from './_kit7.js';

const LOOP = 12, BUDGET = 8000, USED = 3104, T0 = 0.5, RATE = 500.6, END = T0 + USED / RATE;
const PHASES = [[0, 'planning the fix'], [1000, 'checking edge cases'], [2200, 'drafting the answer']];
const ANSWER = 'Backoff never resets, so retry 3 waits 8s instead of 1s.';
const ANS = END + 0.4, R0 = 10.8, R1 = 11.5;
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

export default {
  id: 'ai-thinking-budget',
  since: '0.3.0',
  title: 'Thinking Budget',
  category: 'Thinking States',
  description: 'Thinking against a token budget: the bar fills through planning, checking and drafting, stops well short of the cap, and the answer starts.',
  tags: ['thinking', 'reasoning', 'token budget', 'thinking budget', 'progress', 'assistant'],
  kind: 'tui',
  size: { w: 64, h: 7 },
  minSize: { w: 40, h: 4 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      const tok = Math.max(0, Math.min(USED, (p - T0) * RATE)), done = p >= END;
      const label = PHASES.filter(([at]) => tok >= at).pop()[1], secs = Math.max(0, Math.min(p, END) - T0).toFixed(1);
      const rows = fitRows([{ k: 'status' }, { k: 'gap', drop: 4 }, { k: 'bar' }, { k: 'ticks', drop: 2 }, { k: 'count' }, { k: 'gap', drop: 3 }, { k: 'answer', drop: 1 }], H);
      rows.forEach((r, y) => {
        if (r.k === 'status') {
          if (done) { const x = mark(ctx, b, 0, y, '✔', '+', th.pos); runs(ctx, b, x, y, W - x, [[' done thinking', th.ink, ATTR.BOLD]]); }
          else {
            const x = mark(ctx, b, 0, y, '◐◓◑◒'[Math.floor(p * 4) % 4], '*', th.warn);
            runs(ctx, b, x, y, W - x, [[' thinking', th.ink, ATTR.BOLD], [` ${MID} ${label}`, th.ink]]);
          }
        } else if (r.k === 'bar') {
          // the whole bar is the budget; the fill is the thinking spent so far
          const f = (tok / BUDGET) * W, full = Math.floor(f), rem = f - full;
          for (let i = 0; i < W; i++) {
            if (i < full) b.set(i, y, u ? '█' : '#', th.accent);
            else if (i === full && u && rem >= 1 / 16) b.set(i, y, EIGHTHS[Math.max(1, Math.round(rem * 8))], th.accent);
            else b.set(i, y, u ? '░' : '.', th.mode === 'light' ? th.ink : th.muted);
          }
        } else if (r.k === 'ticks') {
          for (const [at] of PHASES.slice(1)) if (tok >= at) b.set(Math.min(W - 1, Math.round((at / BUDGET) * W)), y, u ? '╵' : '^', th.muted);
        } else if (r.k === 'count') {
          const n = `${comma(tok)} / ${comma(BUDGET)}`;
          fitText(b, 0, y, W, [`${n} thinking tokens ${MID} ${secs}s`, `${n} thinking tokens`, `${n} tokens`], th.ink);
        } else if (r.k === 'answer' && p >= ANS) {
          const a = reveal(ANSWER, p, ANS, 12), x = runs(ctx, b, 0, y, W - 1, [[a.text.trimStart(), th.ink]]);
          if (!a.done && x < W) b.set(x, y, u ? '▌' : '_', th.accent);
        }
      });
    };
    const plan = BEATS.divider(ctx, 'new turn');
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
