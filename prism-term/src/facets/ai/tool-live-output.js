// A long-running run_tests call streams its output into a small folding pane under a timeout countdown, then
// folds to a one-line summary.
import { ATTR, uni, phase, spin, span } from './_ai.js';
import { sub, mark, runs, fitRows, beat, BEATS } from './_kit7.js';

const LOOP = 14, START = 1.0, STEP = 0.33, SLOW = 8, PAUSE = 2.2, FOLD = 10.0, NOTE = 10.6, R0 = 12.8, R1 = 13.5;
const RUN = '=== RUN', OUT = [
  'TestCreateOrder', 'PASS 0.04', 'TestCreateOrder_Duplicate', 'PASS 0.02', 'TestRefund_Partial', 'PASS 0.31', 'TestRefund_Full', 'PASS 0.12',
  'TestSettlement_Batch', 'PASS 6.12', 'TestLegacyExport', 'SKIP 0.00', 'TestWebhookRetry', 'PASS 1.40', 'TestInvoicePDF', 'SKIP 0.00',
  'TestSearch_Paging', 'PASS 0.08', 'ok',
];
// when each output line lands; the slow test holds the stream before its result
const AT = OUT.map((_, i) => START + i * STEP + (i > SLOW ? PAUSE : 0));
const END = AT[AT.length - 1], LIMIT = 140, WALL = 38.2;
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default {
  id: 'ai-tool-live-output',
  since: '0.3.0',
  title: 'Live Tool Output',
  category: 'Tool Calls',
  description: 'A long-running run_tests call streams its output into a folding pane under a timeout countdown, then folds to a one-line pass and skip summary.',
  tags: ['tool calls', 'tests', 'streaming output', 'timeout', 'agent', 'terminal'],
  kind: 'tui',
  size: { w: 64, h: 11 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 210,
  setup(ctx) {
    const th = ctx.theme;
    const line = (s, i) => {
      if (i % 2 === 0 && s !== 'ok') return [[RUN, sub(th)], [`   ${s}`, th.ink]];
      if (s === 'ok') return [['ok', th.ink, ATTR.BOLD], ['   acme/api/...', th.ink], [`   ${WALL}s`, sub(th)]];
      const [word, secs] = s.split(' ');
      return [[`--- ${word}:`, th.ink, ATTR.BOLD], [` ${OUT[i - 1]}`, th.ink], [` (${secs}s)`, sub(th), 0, true]];
    };
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', BAR = u ? '│' : '|', folded = p >= FOLD;
      const shown = OUT.map((s, i) => [s, i]).filter(([, i]) => p >= AT[i]);
      const tailN = Math.max(2, Math.min(5, H - 4)), fold = span(p, FOLD - 0.45, FOLD);
      const rows = fitRows([{ k: 'ask', drop: 2 }, { k: 'gap', drop: 3 }, { k: 'call' }, ...(folded ? [{ k: 'sum' }, { k: 'gap', drop: 4 }, { k: 'note', drop: 1 }]
        : [...Array.from({ length: tailN }, (_, i) => ({ k: 'tail', i })), { k: 'timeout', drop: 1 }])], H);
      // the pane folds up from the bottom before the summary replaces it
      const tail = rows.filter((r) => r.k === 'tail').length, keep = Math.ceil(tail * (1 - fold)), from = Math.max(0, shown.length - keep);
      let ti = 0;
      rows.forEach((r, y) => {
        if (r.k === 'ask') { const x = mark(ctx, b, 0, y, '›', '>', th.accent); runs(ctx, b, x + 1, y, W - x - 1, [['run the api tests with the race detector', th.ink, ATTR.BOLD]]); }
        else if (r.k === 'call') {
          const x = folded ? mark(ctx, b, 0, y, '✔', '+', th.pos) : (b.set(0, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD), 1);
          runs(ctx, b, x + 1, y, W - x - 1, [['run_tests', th.ink, ATTR.BOLD], ['  pkg=./api/... race=true', th.ink]]);
        } else if (r.k === 'tail') {
          const it = shown[from + ti++];
          if (ti > keep) return;
          b.text(2, y, BAR, th.muted);
          if (it) runs(ctx, b, 4, y, W - 4, line(...it));
        } else if (r.k === 'timeout' && fold === 0) {
          const used = Math.min(1, Math.max(0, (p - START) / (END - START))) * WALL;
          runs(ctx, b, 2, y, W - 2, [[`timeout in ${clock(LIMIT - used)}`, sub(th)], [p >= AT[SLOW] && p < AT[SLOW + 1] ? ` ${MID} waiting on TestSettlement_Batch` : '', sub(th), 0, true]]);
        } else if (r.k === 'sum') {
          b.text(2, y, u ? '⎿' : '\\_', th.muted);
          runs(ctx, b, u ? 4 : 5, y, W - 5, [['214 passed', th.ink, ATTR.BOLD], [` ${MID} 2 skipped ${MID} ${WALL}s`, th.ink]]);
        } else if (r.k === 'note' && p >= NOTE) runs(ctx, b, 0, y, W, [['All green; the race detector found nothing.', th.ink]]);
      });
    };
    const plan = BEATS.collapse(0);
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
