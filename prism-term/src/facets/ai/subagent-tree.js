// An orchestrator fans work out to subagents shown as a live tree, each with its status, current action and
// token use; as each finishes, its result folds back into the parent.
import { ATTR, uni, phase, spin, span } from './_ai.js';
import { sub, mark, runs, putR, kilo, fitRows, beat, BEATS } from './_kit7.js';

const LOOP = 14, DONE = 9.8, FOLD = 0.8, R0 = 12.8, R1 = 13.5;
// [name, spawned, starts, ends, tokens, actions [[at, text]], result, summary]
const AGENTS = [
  ['researcher', 0.4, 0.4, 3.6, 12400, [[0.4, 'reading 4 files'], [1.8, 'grepping for CreateOrder']], '3 call sites found', '3 call sites in api/ and jobs/'],
  ['implementer', 0.7, 3.8, 7.0, 21700, [[3.8, 'editing handlers.go'], [5.2, 'editing jobs/settle.go']], '3 files changed', 'patched 3 files, +41 -12'],
  ['tester', 1.0, 7.2, 9.2, 6200, [[7.2, 'running go test ./...']], '18 passed', '18 passed, 0 failed'],
];
const TOTAL = AGENTS.reduce((n, a) => n + a[4], 0);

export default {
  id: 'ai-subagent-tree',
  since: '0.3.0',
  title: 'Subagent Tree',
  category: 'Agents & Pipelines',
  description: 'An orchestrator fans work out to subagents in a live tree with status, current action and token use; each result folds back into the parent as it finishes.',
  tags: ['subagents', 'orchestrator', 'multi-agent', 'delegation', 'tree', 'agent'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 200,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-';
      const running = AGENTS.filter(([, sp, a, e]) => p >= sp && p >= a && p < e).length;
      const rows = fitRows([{ k: 'head' }, ...AGENTS.map((a, i) => ({ k: 'agent', i })), { k: 'gap', drop: 2 }, ...AGENTS.map((a, i) => ({ k: 'sum', i, drop: 1 }))], H);
      const showTok = W >= 52, showAct = W >= 50;
      rows.forEach((r, y) => {
        if (r.k === 'head') {
          const done = p >= DONE, x = done ? mark(ctx, b, 0, y, '✔', '+', th.pos) : mark(ctx, b, 0, y, '◆', '*', th.accent);
          runs(ctx, b, x + 1, y, W - x - 1, [['orchestrator', th.ink, ATTR.BOLD], [done ? ` ${MID} done ${MID} ${kilo(TOTAL)} tok` : ` ${MID} 3 subagents ${MID} ${running} running`, th.ink]]);
        } else if (r.k === 'agent') {
          const [name, spawned, a, e, tok, acts, result] = AGENTS[r.i];
          if (p < spawned) return;
          b.text(0, y, r.i < AGENTS.length - 1 ? (u ? '├─' : '|-') : (u ? '└─' : '`-'), th.muted);
          b.text(3, y, name, th.ink, undefined, ATTR.BOLD);
          let x = 16;
          if (p < a) { x = mark(ctx, b, x, y, '◌', '.', th.muted); runs(ctx, b, x + 1, y, W - x - 1, [[`waiting for ${AGENTS[r.i - 1][0]}`, sub(th), 0, true]]); return; }
          const live = p < e;
          x = live ? (b.set(x, y, spin(ctx, p + r.i * 0.3), th.accent, undefined, ATTR.BOLD), x + 1) : mark(ctx, b, x, y, '✔', '+', th.pos);
          const tw = showTok ? 10 : 0, act = !live ? result : showAct ? acts.filter(([t]) => p >= t).pop()[1] : 'working';
          runs(ctx, b, x + 1, y, W - x - 1 - tw, [[act, live && !showAct ? sub(th) : th.ink]]);
          if (showTok) putR(b, W, y, `${kilo(tok * span(p, a, e))} tok`, sub(th));
        } else if (r.k === 'sum' && p >= AGENTS[r.i][3] + FOLD) {
          const x = mark(ctx, b, 0, y, '↳', '>', th.muted);
          runs(ctx, b, x + 1, y, W - x - 1, [[`${AGENTS[r.i][0]}: `, th.ink, ATTR.BOLD], [AGENTS[r.i][7], th.ink]]);
        }
      });
    };
    const plan = BEATS.collapse(0);
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
