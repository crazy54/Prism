// Token confidence over a whole answer: low-probability tokens are underlined, and a cursor walks them while a
// popup shows the top alternatives the model weighed at each one.
import { ATTR, uni, phase } from './_ai.js';
import { sub, inv, runs, flow, fitRows } from './_kit7.js';

const LOOP = 12, T0 = 1.0, STEP = 2.2, R0 = 10.8, R1 = 11.5, LOW = 0.5;
// [token, p, alternatives]
const TOKENS = [
  ['Set', 0.97], [' the', 0.99], [' client', 0.88], [' timeout', 0.95], [' to', 0.98], [' 30s', 0.41, [['30s', 0.41], ['10s', 0.38], ['60s', 0.12]]],
  [' and', 0.93], [' retry', 0.81], [' twice', 0.47, [['twice', 0.47], ['3 times', 0.36], ['once', 0.11]]], [' with', 0.96], [' backoff;', 0.9],
  [' the', 0.9], [' gateway', 0.44, [['gateway', 0.44], ['proxy', 0.31], ['load balancer', 0.17]]], [' already', 0.86], [' caps', 0.62],
  [' requests', 0.91], [' at', 0.97], [' 60s', 0.33, [['60s', 0.33], ['30s', 0.29], ['120s', 0.21]]], ['.', 0.99],
];
const LOWS = TOKENS.map((t, i) => [t, i]).filter(([[, pr]]) => pr < LOW).map(([, i]) => i);

export default {
  id: 'ai-logprob-heat',
  since: '0.3.0',
  title: 'Token Confidence',
  category: 'Model Internals',
  description: 'Token confidence over a whole answer: low-probability tokens are underlined, and a cursor walks them while a popup shows the alternatives the model weighed.',
  tags: ['logprobs', 'confidence', 'probability', 'tokens', 'uncertainty', 'model'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    const lines = (w) => flow(TOKENS.map(([t, pr], i) => ({ t, i, fg: th.ink, attr: pr < LOW ? ATTR.UNDERLINE : 0 })), w);
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      // the beat: the cursor goes back to the first low token with the popup closed, then the start frame
      const k = Math.floor((p - T0) / STEP), cur = kb >= 0 ? (kb < 0.6 ? LOWS[0] : -1) : p >= T0 && k < LOWS.length ? LOWS[k] : -1, text = lines(W), closed = kb >= 0;
      // the third alternative goes before the legend, so the underline always has its key
      const rows = fitRows([{ k: 'head', drop: 4 }, { k: 'gap', drop: 7 }, ...text.map((l) => ({ k: 'text', l })), { k: 'gap', drop: 6 }, { k: 'pop' },
        ...[0, 1, 2].map((i) => ({ k: 'alt', i, drop: i === 2 ? 5 : 0 })), { k: 'legend', drop: 3 }], H);
      rows.forEach((r, y) => {
        if (r.k === 'head') runs(ctx, b, 0, y, W, [['token confidence', th.ink, ATTR.BOLD], [` ${MID} ${LOWS.length} of ${TOKENS.length} tokens below p ${LOW}`, th.ink, 0, true]]);
        else if (r.k === 'text') r.l.forEach((it) => (it.i === cur ? inv(ctx, b, it.x, y, it.t, ATTR.UNDERLINE) : b.text(it.x, y, it.t, it.fg, undefined, it.attr)));
        else if (r.k === 'pop') {
          if (cur < 0 || closed) { runs(ctx, b, 0, y, W, [['walking the low-confidence tokens', sub(th)]]); return; }
          const [t, pr] = TOKENS[cur];
          runs(ctx, b, 0, y, W, [[`'${t.trim()}'`, th.ink, ATTR.BOLD], [` p ${pr.toFixed(2)}`, th.ink], [` ${MID} alternatives`, sub(th), 0, true]]);
        } else if (r.k === 'alt' && cur >= 0 && !closed) {
          const [word, pr] = TOKENS[cur][2][r.i], bw = Math.max(6, Math.min(16, W - 24)), n = Math.round(pr * bw), chosen = r.i === 0;
          runs(ctx, b, 2, y, 14, [[word, th.ink, chosen ? ATTR.BOLD : 0]]);
          for (let i = 0; i < bw; i++) b.set(16 + i, y, i < n ? (u ? '█' : '#') : (u ? '░' : '.'), i < n ? th.accent : th.mode === 'light' ? th.ink : th.muted);
          b.text(17 + bw, y, pr.toFixed(2), th.ink, undefined, chosen ? ATTR.BOLD : 0);
        } else if (r.k === 'legend') runs(ctx, b, 0, y, W, [['underline', th.ink, ATTR.UNDERLINE], [` = p < ${LOW}`, th.ink], [` ${MID} the bold row is the token chosen`, sub(th), 0, true]]);
      });
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
