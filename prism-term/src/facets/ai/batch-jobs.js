// A batch of 1,000 prompts working through a model: a stacked bar of done, running, queued and failed, the rate
// and ETA, and rate-limited jobs retrying until a few fail for good.
import { ATTR, uni, phase, spin, span, ease } from './_ai.js';
import { sub, mark, runs, comma, fitRows } from './_kit7.js';

const LOOP = 16, T0 = 0.5, T1 = 12.5, N = 1000, LANES = 24, RATE = 112, PER = 0.0018, R0 = 14.8, R1 = 15.5;
// [fails at, job, clears at (retried fine) or gives up at, gives up?]
const FAILS = [[2.0, '#0137', 3.2, false], [3.5, '#0298', 4.6, false], [5.0, '#0412', 7.4, true], [6.2, '#0533', 7.0, false],
  [8.0, '#0731', 10.0, true], [9.4, '#0866', 11.6, true], [10.2, '#0905', 11.0, false]];

export default {
  id: 'ai-batch-jobs',
  since: '0.3.0',
  title: 'Batch Jobs',
  category: 'Agents & Pipelines',
  description: 'A batch of 1,000 prompts working through a model: done, running, queued and failed in one bar, the rate and ETA, and rate-limited jobs retrying.',
  tags: ['batch', 'jobs', 'queue', 'retries', 'rate limit', 'progress'],
  kind: 'tui',
  size: { w: 72, h: 9 },
  minSize: { w: 48, h: 6 },
  loop: LOOP,
  color: '16',
  order: 260,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      // the beat runs the bar back to empty, right to left, and the counters back to zero
      const back = kb >= 0 ? 1 - ease(Math.min(1, kb / 0.8), 0, 1) : 1;
      const processed = Math.round(span(p, T0, T1) * N * back), active = kb < 0 && p >= T0 && processed < N, gaveUp = kb >= 0.3 ? 0 : FAILS.filter(([, , t, perm]) => perm && p >= t).length;
      const retrying = kb >= 0 ? 0 : FAILS.filter(([f, , t]) => p >= f && p < t).length, running = active ? Math.min(LANES, N - processed) : 0;
      const failed = gaveUp, done = processed - failed, queued = N - processed - running, finished = processed >= N;
      const G = { done: [u ? '█' : '#', th.pos], run: [u ? '▓' : '=', th.accent], queue: [u ? '░' : '.', th.mode === 'light' ? th.ink : th.muted], fail: [u ? '✖' : '!', th.neg] };
      const rows = fitRows([{ k: 'head' }, { k: 'gap', drop: 5 }, { k: 'bar' }, { k: 'legend' }, { k: 'rate', drop: 1 }, { k: 'gap', drop: 4 },
        ...[0, 1, 2].map((i) => ({ k: 'fail', i, drop: 3 - i / 10 }))], H);
      const slots = rows.filter((r) => r.k === 'fail').length, recent = kb >= 0 ? [] : FAILS.filter(([f]) => p >= f).filter(([, , at, perm]) => perm || p < at).slice(-slots);
      let fi = 0;
      rows.forEach((r, y) => {
        if (r.k === 'head') {
          if (finished) { const x = mark(ctx, b, 0, y, '✔', '*', th.pos); runs(ctx, b, x + 1, y, W - x - 1, [[`${comma(N)} processed`, th.ink, ATTR.BOLD], [` ${MID} ${failed} failed permanently`, th.ink]]); }
          else runs(ctx, b, 0, y, W, [['batch b-2611', th.ink, ATTR.BOLD], [` ${MID} ${comma(N)} prompts ${MID} fast model`, th.ink]]);
        } else if (r.k === 'bar') {
          const cells = (n) => Math.round((n / N) * W), cf = Math.max(failed ? 1 : 0, cells(failed)), cr = Math.max(running ? 1 : 0, cells(running)), cd = Math.min(cells(done), W - cf - cr);
          for (let i = 0; i < W; i++) {
            const [ch, fg] = i < cd ? G.done : i < cd + cr ? G.run : i < W - cf ? G.queue : G.fail;
            b.set(i, y, ch, fg);
          }
        } else if (r.k === 'legend') {
          let x = 0;
          const items = [['done', done, 'done', 'done'], ['run', running, 'running', 'run'], ['queue', queued, 'queued', 'queue'], ['fail', failed, 'failed', 'fail']];
          const long = items.reduce((n, [, v, w]) => n + 5 + w.length + comma(v).length, 0) - 2 <= W;
          for (const [key, n, wide, short] of items) {
            const word = long ? wide : short;
            const part = [[G[key][0], G[key][1], ATTR.BOLD], [` ${word} ${comma(n)}`, th.ink]];
            if (x + 1 + part[1][0].length > W) break;
            x = runs(ctx, b, x, y, W - x, part) + 2;
          }
        } else if (r.k === 'rate') {
          const eta = Math.ceil((N - processed) / RATE);
          runs(ctx, b, 0, y, W, [[finished ? `${RATE} req/min avg` : `${RATE} req/min ${MID} ETA ${eta}m`, th.ink], [` ${MID} $${(processed * PER).toFixed(2)} ${finished ? 'total' : 'so far'}`, th.ink, 0, true],
            [retrying ? ` ${MID} ${retrying} retrying` : '', sub(th), 0, true]]);
        } else if (r.k === 'fail') {
          const f = recent[fi++];
          if (!f) return;
          const [at, job, end, perm] = f, gone = perm && p >= end, tries = gone ? 3 : 1 + Math.min(1, Math.floor(span(p, at, end) * 2));
          let x = gone ? mark(ctx, b, 0, y, '✖', '!', th.neg) : mark(ctx, b, 0, y, '▲', '^', th.warn);
          x = runs(ctx, b, x + 1, y, W - x - 1, [[job, th.ink, ATTR.BOLD], ['  429 rate limited', th.ink], [` ${MID} retry ${tries}/3`, th.ink], [gone ? ` ${MID} gave up` : '', th.ink, ATTR.BOLD]]);
          if (!gone && x + 2 <= W) b.set(x + 1, y, spin(ctx, p + r.i * 0.3), th.accent, undefined, ATTR.BOLD);
        }
      });
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
