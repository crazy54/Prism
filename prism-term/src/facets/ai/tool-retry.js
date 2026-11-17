// A tool call fails validation, the assistant notes why, lists the directory to find the right path, and the
// corrected call succeeds.
import { ATTR, uni, phase, spin } from './_ai.js';
import { sub, mark, runs, fitRows, beat, BEATS } from './_kit7.js';

const LOOP = 12, REASON = 2.0, R0 = 10.8, R1 = 11.5;
// [starts, ends, ok, tool, arg key, path, result]
const CALLS = [
  [0.4, 1.4, false, 'read_file', 'path', 'src/handler.go', 'path not found: src/handler.go'],
  [2.6, 3.4, true, 'list_dir', 'path', 'src/', '6 entries: api/ db/ http/ jobs/ retry/ main.go'],
  [4.0, 5.0, true, 'read_file', 'path', 'src/api/handlers.go', '142 lines; CreateOrder at L37'],
];

export default {
  id: 'ai-tool-retry',
  since: '0.3.0',
  title: 'Tool Error & Fix',
  category: 'Tool Calls',
  description: 'A tool call fails validation on a wrong path; the assistant notes the error, lists the directory, and the corrected call succeeds.',
  tags: ['tool calls', 'error', 'retry', 'self-correction', 'agent', 'function calling'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), ELBOW = u ? '⎿' : '\\_';
      // rows keep the places the finished trace gives them, so nothing reflows as calls land
      const list = [{ k: 'ask', at: 0, drop: 2 }];
      CALLS.forEach((c, i) => {
        if (i) list.push({ k: 'gap', drop: 4 });
        list.push({ k: 'call', c, at: c[0] }, { k: 'result', c, at: c[1] });
        if (i === 0) list.push({ k: 'gap', drop: 4 }, { k: 'reason', at: REASON, drop: 3 });
      });
      fitRows(list, H).forEach((r, y) => {
        if (r.at === undefined || p < r.at) return;
        if (r.k === 'ask') { const x = mark(ctx, b, 0, y, '›', '>', th.accent); runs(ctx, b, x + 1, y, W - x - 1, [['where is CreateOrder handled?', th.ink, ATTR.BOLD]]); }
        else if (r.k === 'call') {
          const [a, e, ok, tool, key, path] = r.c;
          const x = p < e ? (b.set(0, y, spin(ctx, p + a), th.accent, undefined, ATTR.BOLD), 1) : ok ? mark(ctx, b, 0, y, '✔', '+', th.pos) : mark(ctx, b, 0, y, '✖', 'x', th.neg);
          runs(ctx, b, x + 1, y, W - x - 1, [[tool, th.ink, ATTR.BOLD], [`  ${key}=`, th.ink], [path, th.ink, ATTR.BOLD]]);
        } else if (r.k === 'result') {
          b.text(2, y, ELBOW, th.muted);
          runs(ctx, b, 2 + ELBOW.length + 1, y, W - ELBOW.length - 3, [[r.c[6], th.ink]]);
        } else if (r.k === 'reason') {
          const x = mark(ctx, b, 0, y, '↳', '=>', th.muted);
          runs(ctx, b, x + 1, y, W - x - 1, [['wrong path; listing src/ to find the handler', sub(th), ATTR.ITALIC]]);
        }
      });
    };
    // the cards fold up under the question into a one-line summary, which holds, then everything clears
    const plan = (k, info) => {
      if (k >= 0.9) return BEATS.clear()(1, info);
      const fold = BEATS.collapse(0)(Math.min(1, k / 0.4) * 0.65, info), u = uni(ctx);
      if (k >= 0.4) fold.over = [{ x: 0, y: 1, text: u ? '✔' : '+', fg: th.pos, attr: ATTR.BOLD }, { x: 2, y: 1, text: `3 tool calls ${u ? '·' : '-'} 1 retried`, fg: th.ink, attr: ATTR.BOLD }];
      if (k >= 0.8) fold.rows[0] = null;
      return fold;
    };
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
