// Next-token sampling: top-k candidates as probability bars that sharpen or
// flatten as the temperature slides, the sampled token flashing and joining
// the text above.
import { ATTR, glyphs, uni, phase, fit, mix, hbar, ease } from './_ai.js';

const PROMPT = 'The p99 spike is caused by DB';
// Steps: [candidates with logits, chosen index]
const STEPS = [
  [[[' pool', 3.1], [' connection', 1.9], [' lock', 0.9], [' query', 0.6], [' index', 0.1], [' CPU', -0.4]], 0],
  [[[' exhaustion', 2.6], [' starvation', 2.2], [' limits', 0.9], [' size', 0.7], [' wait', 0.4], [' churn', -0.6]], 1],
  [[['.', 3.4], [' after', 1.3], [' since', 1.1], [',', 0.8], [' under', 0.2], [' when', -0.2]], 0],
];
const STEP = 2.6;

const softmax = (ls, T) => { const e = ls.map((l) => Math.exp(l / T)); const s = e.reduce((a, c) => a + c, 0); return e.map((v) => v / s); };

export default {
  id: 'ai-sampling-probs',
  title: 'Next-Token Sampling',
  category: 'Model Internals',
  description: 'Next-token sampling: top-k candidates as probability bars that sharpen or flatten as temperature slides, then the sampled token flashes and joins the text.',
  tags: ['sampling', 'temperature', 'probabilities', 'top-k', 'logits'],
  kind: 'chart',
  size: { w: 60, h: 10 },
  minSize: { w: 40, h: 9 },
  loop: STEP * 3,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, STEP * 3);
      const k = Math.floor(p / STEP), local = p - k * STEP;
      const [cands, pick] = STEPS[k];
      // Temperature sweeps 0.4 -> 1.4 -> 0.8 within each step.
      const T = 0.4 + ease(local, 0.1, 1.0) * 1.0 - ease(local, 1.1, 1.6) * 0.6;
      const probs = softmax(cands.map((c) => c[1]), T);
      const sampled = local >= 1.8;
      // Text so far.
      const text = PROMPT + STEPS.slice(0, k).map(([c, i]) => c[i][0]).join('');
      let x = b.text(0, 0, fit(text, W - 12, undefined, ctx).trimEnd(), th.ink);
      if (sampled) x = b.text(x, 0, cands[pick][0], th.bg, th.accent, ATTR.BOLD);
      else b.set(x, 0, u ? '▍' : '_', th.accent);
      // Temperature slider.
      const sw = Math.min(20, W - 20);
      b.text(0, 2, 'temperature', th.muted);
      for (let i = 0; i < sw; i++) b.set(12 + i, 2, u ? '─' : '-', th.line);
      b.set(12 + Math.round(((T - 0.2) / 1.4) * (sw - 1)), 2, u ? '●' : 'O', th.warn, undefined, ATTR.BOLD);
      b.text(13 + sw, 2, T.toFixed(2), th.warn, undefined, ATTR.BOLD);
      // Candidate bars.
      const bw = Math.max(8, W - 26);
      cands.forEach(([tok, ], i) => {
        const y = 4 + i;
        if (y >= H) return;
        const on = sampled && i === pick;
        const label = JSON.stringify(tok).slice(1, -1).replace(/^ /, u ? '·' : '_');
        b.text(0, y, fit(label, 12, undefined, ctx), on ? th.accent : th.ink, undefined, on ? ATTR.BOLD : 0);
        hbar(ctx, b, 13, y, bw, probs[i], on ? th.accent : mix(th.info, th.accent, probs[i]));
        b.text(14 + bw, y, `${(probs[i] * 100).toFixed(1)}%`.padStart(6), on ? th.accent : th.muted, undefined, on ? ATTR.BOLD : 0);
        if (on && 21 + bw < W) b.text(21 + bw, y, g.left, th.accent, undefined, ATTR.BOLD);
      });
    };
  },
};
