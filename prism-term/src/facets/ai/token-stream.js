// A response streaming token by token: each new token flashes, the rate
// wobbles like a real stream, then a tokenizer view tints token boundaries.
import { ATTR, glyphs, uni, phase, mix, fit, tint, tokenize } from './_ai.js';

const TEXT = 'Checkout latency is up because the DB pool is exhausted. Since v2.14.1 the service runs 32 workers but still opens only 20 connections, so about a third of requests wait in the pool queue. Raising the pool to 40 should bring p99 back under 300ms.';
const TOKS = tokenize(TEXT);
const START = 0.4, TOKVIEW = 6.2, RATE = 14;

export default {
  id: 'ai-token-stream',
  title: 'Token Stream',
  category: 'Token Streams',
  description: 'A response streaming token by token with each new token flashing, a live tok/s sparkline and TTFT, then a tokenizer view that tints every token boundary.',
  tags: ['tokens', 'streaming', 'llm', 'tokenizer', 'tok/s'],
  kind: 'text',
  size: { w: 64, h: 9 },
  minSize: { w: 36, h: 6 },
  loop: 9,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    const PAL = ['accent', 'pos', 'warn', 'info', 'crit'];
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      // Warped clock so the rate wobbles: bursts and short stalls.
      const tp = Math.max(0, p - START);
      const warped = tp + 0.12 * Math.sin(tp * 4.1) + 0.06 * Math.sin(tp * 9.3);
      const n = Math.min(TOKS.length, Math.max(0, Math.floor(warped * RATE)));
      const tokView = p >= TOKVIEW;
      // Lay tokens out with word wrap, keeping each token whole.
      const bodyH = H - 2;
      let x = 0, y = 0;
      const cells = [];
      for (let i = 0; i < n; i++) {
        let tok = TOKS[i];
        // Wrap whole words: a word runs until the next token with a leading space.
        if (/^\s/.test(tok) || i === 0) {
          let wl = tok.length;
          for (let j = i + 1; j < TOKS.length && !/^\s/.test(TOKS[j]); j++) wl += TOKS[j].length;
          if (x + wl > W && x > 0) { y++; x = 0; tok = tok.replace(/^\s+/, ''); }
        }
        cells.push([x, y, tok, i]);
        x += tok.length;
      }
      const first = Math.max(0, y - bodyH + 1);
      for (const [cx, cy, tok, i] of cells) {
        if (cy < first) continue;
        const age = n - 1 - i;
        let fg = th.ink, bg;
        if (tokView) { bg = tint(ctx, th[PAL[i % PAL.length]], 0.3); }
        else if (age < 3) { bg = tint(ctx, th.accent, 0.35 - age * 0.1); fg = mix(th.ink, th.accent, 0.3); }
        b.text(cx, cy - first, tok, fg, bg, tokView ? 0 : age === 0 ? ATTR.BOLD : 0);
        // Mono-safe boundary marks in tokenizer view.
        if (tokView && !u) b.set(cx, cy - first, tok[0] === ' ' ? '|' : tok[0], fg, bg);
      }
      if (n < TOKS.length && n > 0) {
        const [lx, ly, lt] = cells[cells.length - 1];
        if (ly - first < bodyH) b.set(Math.min(W - 1, lx + lt.length), ly - first, u ? '▍' : '_', th.accent);
      }
      // Stats.
      const sy = H - 1;
      b.fill(0, sy - 1, W, 1, u ? '─' : '-', th.line);
      const rate = n >= TOKS.length ? 0 : Math.round(RATE * (1 + 0.48 * Math.cos(tp * 4.1) + 0.56 * Math.cos(tp * 9.3)));
      const stats = tokView
        ? `view: tokens ${g.mid} ${TOKS.length} tokens ${g.mid} ${TEXT.length} chars ${g.mid} ${(TEXT.length / TOKS.length).toFixed(1)} chars/token`
        : `TTFT 380ms ${g.mid} ${String(Math.max(0, rate)).padStart(2)} tok/s ${g.mid} ${n}/${TOKS.length} tokens`;
      let sx = b.text(0, sy, fit(stats, W, undefined, ctx).trimEnd(), tokView ? th.info : th.muted);
      // Rate sparkline on the right while streaming.
      if (!tokView && sx + 14 <= W) {
        const LV = u ? '▁▂▃▄▅▆▇█' : '.:-=+*#%';
        for (let i = 0; i < 12; i++) {
          const tt = tp - (11 - i) * 0.25;
          const r = tt < 0 || n >= TOKS.length && tt > TOKS.length / RATE ? 0 : 1 + 0.48 * Math.cos(tt * 4.1) + 0.56 * Math.cos(tt * 9.3);
          b.set(W - 12 + i, sy, LV[Math.max(0, Math.min(7, Math.round(r * 3)))], r ? th.accent : th.dim);
        }
      }
    };
  },
};
