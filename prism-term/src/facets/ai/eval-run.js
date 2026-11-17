// An evaluation run streaming test cases with pass or fail and a score against the baseline: the pass rate
// converges, regressions are flagged, and the run ends with a summary.
import { ATTR, uni, phase, span } from './_ai.js';
import { sub, mark, runs, putR, comma, hash01 as hash, fitRows, beat, BEATS } from './_kit7.js';

const LOOP = 14, T0 = 0.5, T1 = 10.5, N = 254, BASE = 85.1, R0 = 12.8, R1 = 13.5;
const CATS = ['refunds', 'billing', 'dates', 'search', 'auth', 'orders', 'shipping', 'tax'];
const ITEMS = ['partial_shipment', 'dst_boundary', 'unicode_query', 'expired_token', 'split_tender', 'late_fee', 'leap_year', 'typo_tolerance', 'vat_reverse', 'gift_card'];
const REGRESS = new Map([[97, 0.12], [188, 0.09]]);
// exactly 32 failures (222 of 254 pass, 87.4%), the two regressions among them
const FAIL = new Set([...REGRESS.keys(), ...Array.from({ length: N }, (_, i) => i).filter((i) => !REGRESS.has(i)).sort((a, b) => hash(a, 1) - hash(b, 1)).slice(0, 30)]);
const CASES = Array.from({ length: N }, (_, i) => {
  const pass = !FAIL.has(i), score = pass ? 0.8 + 0.18 * hash(i, 2) : 0.2 + 0.4 * hash(i, 3);
  const delta = REGRESS.has(i) ? -REGRESS.get(i) : hash(i, 4) > 0.93 ? 0.05 + 0.03 * hash(i, 5) : 0;
  return { name: `${CATS[i % CATS.length]}/${ITEMS[(i * 7 + (i >> 3)) % ITEMS.length]}_${String(i + 1).padStart(3, '0')}`, pass, score, delta };
});

export default {
  id: 'ai-eval-run',
  since: '0.3.0',
  title: 'Eval Run',
  category: 'Agents & Pipelines',
  description: 'An evaluation streams test cases with pass or fail and scores against a baseline; the pass rate converges, regressions are flagged, and a summary closes it.',
  tags: ['evaluation', 'eval', 'regression', 'benchmark', 'test cases', 'model'],
  kind: 'tui',
  size: { w: 72, h: 11 },
  minSize: { w: 48, h: 7 },
  loop: LOOP,
  color: '16',
  order: 230,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      const n = Math.floor(span(p, T0, T1) * N), done = n >= N, seen = CASES.slice(0, n);
      const passed = seen.filter((c) => c.pass).length, rate = n ? (passed / n) * 100 : 0, regs = seen.filter((c) => c.delta < 0).length;
      const rows = fitRows([{ k: 'head', drop: 3 }, { k: 'rate' }, { k: 'gap', drop: 4 }, ...Array.from({ length: 6 }, (_, i) => ({ k: 'case', i, drop: i < 3 ? 1 : 0 })),
        { k: 'gap', drop: 5 }, { k: 'foot' }], H);
      const caseRows = rows.filter((r) => r.k === 'case').length, recent = seen.slice(Math.max(0, n - caseRows)), showDelta = W >= 60;
      let ci = 0;
      rows.forEach((r, y) => {
        if (r.k === 'head') runs(ctx, b, 0, y, W, [['eval', th.ink, ATTR.BOLD], ['  support-answers v14 vs v13', th.ink], [` ${MID} ${N} cases`, sub(th), 0, true]]);
        else if (r.k === 'rate') {
          let x = runs(ctx, b, 0, y, W, [[`pass ${rate.toFixed(1)}%`, th.ink, ATTR.BOLD]]) + 2;
          const bw = Math.max(6, Math.min(20, W - x - 30)), fill = Math.round((rate / 100) * bw), bx = Math.round((BASE / 100) * bw);
          for (let i = 0; i < bw; i++) b.set(x + i, y, i === bx ? (u ? '┃' : '|') : i < fill ? (u ? '█' : '#') : (u ? '░' : '.'), i === bx ? th.ink : i < fill ? th.accent : th.mode === 'light' ? th.ink : th.muted);
          x += bw + 2;
          runs(ctx, b, x, y, W - x, [[`baseline ${BASE}%`, th.ink], [` ${MID} ${comma(n)} / ${N}`, sub(th), 0, true]]);
        } else if (r.k === 'case') {
          const c = recent[ci++];
          if (!c) return;
          const x = c.pass ? mark(ctx, b, 0, y, '✓', '+', th.pos) : mark(ctx, b, 0, y, '✗', 'x', th.neg);
          const sx = showDelta ? W - 10 : W;
          runs(ctx, b, x + 1, y, sx - 7 - x, [[c.name, th.ink]]);
          putR(b, sx, y, c.score.toFixed(2), th.ink, c.delta < 0 ? ATTR.BOLD : 0);
          if (showDelta && c.delta) {
            if (c.delta < 0) mark(ctx, b, W - 7, y, '▼', 'v', th.neg); else mark(ctx, b, W - 7, y, '▲', '^', th.pos);
            putR(b, W, y, `${c.delta < 0 ? (u ? '−' : '-') : '+'}${Math.abs(c.delta).toFixed(2)}`, th.ink, c.delta < 0 ? ATTR.BOLD : 0);
          }
        } else if (r.k === 'foot') {
          if (done) { const x = mark(ctx, b, 0, y, '✔', '*', th.pos); runs(ctx, b, x + 1, y, W - x - 1, [[`done ${MID} ${N} cases`, th.ink, ATTR.BOLD], [` ${MID} pass ${rate.toFixed(1)}%`, th.ink], [` ${MID} ${regs} regressions`, th.ink, 0, true]]); }
          else { const x = regs ? mark(ctx, b, 0, y, '▼', 'v', th.neg) : mark(ctx, b, 0, y, '·', '.', th.muted); runs(ctx, b, x + 1, y, W - x - 1, [[`${regs} ${regs === 1 ? 'regression' : 'regressions'}`, th.ink, ATTR.BOLD], [` ${MID} ${n - passed} failing ${MID} ${passed} passing`, th.ink, 0, true]]); }
        }
      });
    };
    const plan = BEATS.divider(ctx, 'run 2');
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
