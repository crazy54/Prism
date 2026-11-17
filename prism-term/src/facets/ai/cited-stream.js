// An answer streams with inline markers [1] [2]; each new marker adds its source below, and a marker used again
// lights up the source it points to.
import { ATTR, uni, phase, tokenize } from './_ai.js';
import { sub, inv, runs, flow, fitRows, beat, BEATS } from './_kit7.js';

const LOOP = 12, START = 0.8, TPS = 10, R0 = 10.8, R1 = 11.5;
const TEXT = 'Requests over the limit get a 429 with a Retry-After header [1]. The client retries up to 3 times with jittered backoff [2], and the limit window resets every 60 seconds [1].';
const SOURCES = { 1: ['rate limits', 'docs/rate-limits.md', 'L40-58'], 2: ['retry policy', 'PR #412', 'merged 3 Oct'] };
const TOKENS = tokenize(TEXT);
// when each marker finishes streaming: [time, n, first use?]
const MARKS = (() => {
  const out = [], seen = new Set();
  for (const m of TEXT.matchAll(/\[(\d)\]/g)) {
    let n = 0, len = 0;
    while (len < m.index + 3) len += TOKENS[n++].length;
    out.push([START + n / TPS, Number(m[1]), !seen.has(m[1])]); seen.add(m[1]);
  }
  return out;
})();

export default {
  id: 'ai-cited-stream',
  since: '0.3.0',
  title: 'Cited Answer',
  category: 'Token Streams',
  description: 'An answer streams with inline markers that resolve into a sources list as they appear; a marker used again lights up the source it points to.',
  tags: ['citations', 'sources', 'streaming', 'grounding', 'references', 'assistant'],
  kind: 'tui',
  size: { w: 64, h: 11 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      const n = Math.max(0, Math.min(TOKENS.length, Math.floor((p - START) * TPS))), text = TOKENS.slice(0, n).join('');
      const marks = MARKS.filter(([t]) => p >= t), shown = [...new Set(marks.map(([, k]) => k))];
      const lastUse = (k) => Math.max(...marks.filter(([, m]) => m === k).map(([t]) => t)), firstUse = (k) => marks.find(([, m]) => m === k)[0];
      // the answer with its markers in bold (a lone space joins the marker after it); older lines give way first
      const pieces = (text.match(/\s*\S+/g) || []).flatMap((w) => w.split(/(\[\d\])/).filter(Boolean)
        .map((t) => ({ t, fg: th.ink, attr: /^\[\d\]$/.test(t) ? ATTR.BOLD : 0 })))
        .reduce((out, it) => { const prev = out[out.length - 1]; if (prev && /^\s+$/.test(prev.t)) { prev.t += it.t; prev.attr = it.attr; } else out.push(it); return out; }, []);
      const lines = flow(pieces, W - 1);   // the last column stays free for the streaming cursor
      const stack = fitRows([{ k: 'ask', drop: 3 }, { k: 'gap', drop: 4 }, ...lines.map((l) => ({ k: 'line', l, drop: 1 })), { k: 'gap', drop: 5 },
        ...(shown.length ? [{ k: 'head', drop: 2 }] : []), ...shown.map((k) => ({ k: 'src', n: k }))], H);
      stack.forEach((r, y) => {
        if (r.k === 'ask') { const x = b.text(0, y, u ? '›' : '>', th.accent, undefined, ATTR.BOLD); runs(ctx, b, x + 1, y, W - x - 1, [['how does rate limiting work for the API?', th.ink, ATTR.BOLD]]); }
        else if (r.k === 'line') r.l.forEach((it) => b.text(it.x, y, it.t, it.fg, undefined, it.attr));
        else if (r.k === 'head') b.text(0, y, 'Sources', th.ink, undefined, ATTR.BOLD);
        else if (r.k === 'src') {
          const [title, where, detail] = SOURCES[r.n], k = String(r.n);
          const fresh = p - firstUse(r.n) < 1, reused = lastUse(r.n) > firstUse(r.n) && p - lastUse(r.n) < 1;
          const x = reused ? inv(ctx, b, 0, y, `[${k}]`) : b.text(0, y, `[${k}]`, th.ink, undefined, ATTR.BOLD);
          runs(ctx, b, x + 1, y, W - x - 1, [[title, th.ink, fresh ? ATTR.BOLD : 0], [` ${MID} ${where}`, sub(th)], [` ${detail}`, sub(th), 0, true]]);
        }
      });
      if (n > 0 && n < TOKENS.length && lines.length) {
        const y = stack.findLastIndex((r) => r.k === 'line'), l = lines[lines.length - 1], end = l.length ? l[l.length - 1].x + l[l.length - 1].t.length : 0;
        if (y >= 0 && end < W) b.set(end, y, u ? '▌' : '_', th.accent);
      }
    };
    const plan = BEATS.divider(ctx, 'new question');
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
