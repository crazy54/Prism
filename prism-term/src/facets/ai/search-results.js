// A code_search call returns ranked results with snippets and scores; the assistant opens the top two and
// writes a one-line takeaway that cites them.
import { ATTR, uni, phase, spin, reveal } from './_ai.js';
import { sub, mark, runs, putR, flow, fitRows, beat, BEATS } from './_kit7.js';

const LOOP = 12, ASKED = 0.3, FOUND = 1.0, OPEN = [[2.8, 3.6], [4.0, 4.8]], SAY = 5.4, R0 = 10.8, R1 = 11.5;
// [path, snippet, score]
const RESULTS = [
  ['internal/retry/backoff.go', 'func Backoff(attempt int) time.Duration', '0.82'],
  ['docs/adr/0012-retry-policy.md', 'Retries use full jitter, capped at 30s', '0.79'],
  ['pkg/httpx/client.go', 'c.retry = retry.New(3, retry.Jitter)', '0.71'],
  ['internal/retry/backoff_test.go', 'func TestBackoffCapsAt30s(t *testing.T)', '0.64'],
  ['scripts/load/retry_storm.js', '// 500 clients retrying at once', '0.41'],
];
const TAKE = 'Backoff uses full jitter capped at 30s (ADR 0012), set in internal/retry/backoff.go.';

export default {
  id: 'ai-search-results',
  since: '0.3.0',
  title: 'Search Call',
  category: 'Tool Calls',
  description: 'A code_search call returns ranked results with snippets and scores; the assistant opens the top two and writes a one-line takeaway citing them.',
  tags: ['search', 'tool calls', 'ranking', 'code search', 'retrieval', 'agent'],
  kind: 'tui',
  size: { w: 64, h: 11 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', found = p >= FOUND + 0.25 * RESULTS.length;
      const AR = u ? '→' : '->', tx = AR.length + 1;
      const take = p >= SAY ? flow((reveal(TAKE, p, SAY, 16).text.trimStart().match(/\s*\S+/g) || []).map((t) => ({ t, fg: th.ink })), W - tx) : [];
      const takeRows = flow((TAKE.match(/\s*\S+/g) || []).map((t) => ({ t })), W - tx).length;
      // the spacers go first, then results 5 and 4; the takeaway stays whole
      const rows = fitRows([{ k: 'call' }, { k: 'gap', drop: 5 }, ...RESULTS.map((r, i) => ({ k: 'res', i, drop: i >= 3 ? i - 1 : 0 })), { k: 'gap', drop: 4 },
        ...Array.from({ length: takeRows }, (_, i) => ({ k: 'take', i }))], H);
      const snip = W >= 56, score = W >= 48;
      rows.forEach((r, y) => {
        if (r.k === 'call') {
          const x = found ? mark(ctx, b, 0, y, '⚙', '*', th.accent) : (b.set(0, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD), 1);
          runs(ctx, b, x + 1, y, W - x - 1, [['code_search', th.ink, ATTR.BOLD], ['  "retry backoff jitter"', th.ink], [found ? `  ${MID} 5 results ${MID} ${p >= OPEN[1][1] ? '2 opened' : '120 ms'}` : '', sub(th), 0, true]]);
        } else if (r.k === 'res' && p >= FOUND + 0.25 * r.i) {
          const [path, snippet, sc] = RESULTS[r.i], o = OPEN[r.i];
          if (o && p >= o[0]) {
            // the pointer sits only on the result being opened; an opened one keeps its check
            if (p < o[1]) { mark(ctx, b, 0, y, '›', '>', th.accent); b.set(1, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD); }
            else mark(ctx, b, 1, y, '✓', '+', th.pos);
          }
          const right = score ? W - 5 : W;
          const end = runs(ctx, b, 3, y, right - 3, [[path, th.ink, ATTR.BOLD]]);
          if (snip && end + 4 < right) runs(ctx, b, end + 2, y, right - end - 3, [[snippet, sub(th)]]);
          if (score) putR(b, W, y, sc, th.ink);
        } else if (r.k === 'take' && take[r.i]) {
          if (r.i === 0) mark(ctx, b, 0, y, '→', '->', th.accent);
          take[r.i].forEach((it) => b.text(tx + it.x, y, it.t, it.fg));
        }
      });
    };
    const plan = BEATS.clear('bottom', 1);
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
