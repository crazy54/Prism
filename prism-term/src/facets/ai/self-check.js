// A drafted answer checked claim by claim against the source: two hold, one is wrong, and the draft is revised
// in place with the old value struck and the new one underlined.
import { ATTR, uni, phase, spin } from './_ai.js';
import { sub, inv, mark, runs, fitRows, beat, BEATS } from './_kit7.js';

const LOOP = 14, FIXED = 5.4, DONE = 8.4, R0 = 12.8, R1 = 13.5;
// [check starts, verdict at, holds, claim as checked, evidence]
const CHECKS = [
  [1.0, 2.6, true, 'returns 409 on conflict', 'openapi.yaml L212'],
  [3.0, 4.8, false, 'default timeout is 30s', 'config.go L18'],
  [6.2, 7.8, true, 'retries stop after 5', 'retry.go L44'],
];

export default {
  id: 'ai-self-check',
  since: '0.3.0',
  title: 'Self-Check Pass',
  category: 'Thinking States',
  description: 'A drafted answer is checked claim by claim against the source: two hold, one is wrong, and the draft is revised in place with the change underlined.',
  tags: ['verification', 'self-check', 'fact check', 'citations', 'revision', 'assistant'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 240,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', ARROW = u ? '→' : '->';
      const active = CHECKS.findIndex(([a, v]) => p >= a && p < v), started = CHECKS.filter(([a]) => p >= a);
      const rows = fitRows([{ k: 'status' }, { k: 'gap', drop: 6 }, { k: 'd', i: 0 }, { k: 'd', i: 1 }, { k: 'd', i: 2 }, { k: 'gap', drop: 5 },
        ...started.map((c, i) => ({ k: 'c', i }))], H);
      rows.forEach((r, y) => {
        if (r.k === 'status') {
          if (p >= DONE) { const x = mark(ctx, b, 0, y, '✔', '*', th.pos); runs(ctx, b, x + 1, y, W - x - 1, [['verified 3 claims', th.ink, ATTR.BOLD], [` ${MID} 1 fixed`, th.ink]]); }
          else {
            b.set(0, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD);
            runs(ctx, b, 2, y, W - 2, [['checking the draft', th.ink, ATTR.BOLD], [` ${MID} ${started.filter(([, v]) => p >= v).length} of 3 claims`, th.ink, 0, true]]);
          }
        } else if (r.k === 'd') {
          if (r.i === active) mark(ctx, b, 0, y, '›', '>', th.accent);
          const n = String(r.i + 1), x = r.i === active ? inv(ctx, b, 2, y, n) : b.text(2, y, n, th.ink, undefined, ATTR.BOLD);
          const parts = r.i === 0 ? [['The API returns 409 on a conflict.', th.ink]]
            : r.i === 2 ? [['Retries stop after 5 attempts.', th.ink]]
              : p < FIXED ? [['The default timeout is 30s.', th.ink]]
                : [['The default timeout is ', th.ink], [u ? '30s' : '~30s~', sub(th), ATTR.STRIKE], [' ', th.ink], ['10s', th.ink, ATTR.UNDERLINE | ATTR.BOLD], ['.', th.ink]];
          runs(ctx, b, x + 1, y, W - x - 1, parts);
        } else if (r.k === 'c') {
          const [, v, holds, claim, evidence] = CHECKS[r.i], x = b.text(0, y, String(r.i + 1), th.ink, undefined, ATTR.BOLD) + 1;
          let cx;
          if (p < v) { b.set(x, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD); cx = x + 1; }
          else cx = holds ? mark(ctx, b, x, y, '✓', '+', th.pos) : mark(ctx, b, x, y, '✗', 'x', th.neg);
          const said = holds || p < v ? claim : `${claim} ${ARROW} 10s`;
          runs(ctx, b, cx + 1, y, W - cx - 1, [[said, th.ink], [p >= v ? ` ${MID} ${evidence}` : '', sub(th), 0, true]]);
        }
      });
    };
    const plan = BEATS.divider(ctx, 'new answer');
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
