// A running ledger of tool calls: duration, tokens in and out and cost per call, with session totals that tick
// as each call lands; the expensive one is flagged.
import { ATTR, uni, phase, spin } from './_ai.js';
import { sub, mark, runs, putR, kilo, beat, BEATS } from './_kit7.js';

const LOOP = 14, IN = 2.8e-6, OUT = 10.8e-6, R0 = 12.8, R1 = 13.5, RUN = 0.5;
// [tool, seconds, tokens in, tokens out]; the session starts empty and all 14 calls land during the loop
const CALLS = [
  ['read_file', 0.1, 2140, 96], ['grep', 0.4, 1380, 74], ['read_file', 0.1, 3920, 118], ['list_dir', 0.1, 610, 52],
  ['read_file', 0.2, 2870, 104], ['run_tests', 11.8, 4410, 212], ['read_file', 0.1, 1960, 88], ['apply_patch', 0.3, 1240, 1180],
  ['run_tests', 9.6, 3880, 196], ['web_search', 1.9, 2460, 140], ['web_fetch', 2.7, 10830, 230], ['apply_patch', 0.2, 1520, 1640],
  ['run_tests', 10.1, 2790, 188], ['write_file', 0.1, 1190, 1982],
];
const BEFORE = 0, LAND = CALLS.map((_, i) => 0.5 + i * 0.62), BIG = 10;
const cost = ([, , i, o]) => i * IN + o * OUT;
const usd = (v) => '$' + v.toFixed(3);

export default {
  id: 'ai-tool-ledger',
  since: '0.3.0',
  title: 'Tool Call Ledger',
  category: 'Tool Calls',
  description: 'A running ledger of tool calls with duration, tokens in and out and cost per call; session totals tick as each call lands and the expensive one is flagged.',
  tags: ['tool calls', 'cost', 'tokens', 'ledger', 'usage', 'agent'],
  kind: 'tui',
  size: { w: 72, h: 10 },
  minSize: { w: 48, h: 7 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      const landed = BEFORE + LAND.filter((t) => p >= t + RUN).length, running = LAND.findIndex((t) => p >= t && p < t + RUN);
      const n = running >= 0 ? landed + 1 : landed;
      // columns: tokens merge into one column first, then cost goes
      const split = W >= 64, costCol = W >= 56;
      const C = { n: 3, tool: 5, dur: split ? 26 : 23, in: 34, out: 42, tok: 31, cost: split ? 51 : 40 };
      const head = [['#', C.n], ['tool', C.tool, true], ['time', C.dur], ...(split ? [['in', C.in], ['out', C.out]] : [['tokens', C.tok]]), ...(costCol ? [['cost', C.cost]] : [])];
      head.forEach(([s, x, left]) => (left ? b.text(x, 0, s, sub(th), undefined, ATTR.BOLD) : putR(b, x, 0, s, sub(th), ATTR.BOLD)));
      const body = H - 3, first = Math.max(0, n - body);
      for (let i = first; i < n; i++) {
        const c = CALLS[i], y = 1 + i - first, live = i === landed && running >= 0;
        putR(b, C.n, y, String(i + 1), th.ink);
        runs(ctx, b, C.tool, y, C.dur - 7 - C.tool, [[c[0], th.ink, live ? ATTR.BOLD : 0]]);
        const secs = live ? c[1] * Math.min(1, (p - LAND[running]) / RUN) : c[1];
        putR(b, C.dur, y, `${secs.toFixed(1)}s`, th.ink);
        if (live) { b.set(C.dur + 2, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD); runs(ctx, b, C.dur + 4, y, W - C.dur - 4, [['running', sub(th)]]); continue; }
        if (split) { putR(b, C.in, y, kilo(c[2]), th.ink); putR(b, C.out, y, kilo(c[3]), th.ink); }
        else putR(b, C.tok, y, kilo(c[2] + c[3]), th.ink);
        if (costCol) putR(b, C.cost, y, usd(cost(c)), th.ink);
        if (i === BIG) { const nx = (costCol ? C.cost : split ? C.out : C.tok) + 2, x2 = mark(ctx, b, nx, y, '▲', '!', th.warn); runs(ctx, b, x2 + 1, y, W - x2 - 1, [['large page', th.ink, 0, true]]); }
      }
      // totals: a rule, then the sums over the calls that have landed
      const done = CALLS.slice(0, landed), sum = (k) => done.reduce((s, c) => s + c[k], 0), total = done.reduce((s, c) => s + cost(c), 0);
      b.text(0, H - 2, (u ? '─' : '-').repeat(W), th.line);
      const x = b.text(0, H - 1, u ? 'Σ' : 'total', th.ink, undefined, ATTR.BOLD);
      const toks = split ? ` ${MID} ${kilo(sum(2))} in ${MID} ${kilo(sum(3))} out` : ` ${MID} ${kilo(sum(2) + sum(3))} tokens`;
      runs(ctx, b, x + 1, H - 1, W - x - 1, [[`${landed} calls`, th.ink, ATTR.BOLD], [toks, th.ink], [` ${MID} ${usd(total)}`, th.ink, ATTR.BOLD, true]]);
    };
    const plan = BEATS.divider(ctx, 'session closed');
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
