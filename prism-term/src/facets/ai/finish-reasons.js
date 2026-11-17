// Three short streams that end three ways: a clean stop, a cut at the token limit, and a hand-off to a tool call.
import { ATTR, uni, phase, reveal, spin, ell } from './_ai.js';
import { sub, mark, runs, runsWidth, flow, beat, BEATS } from './_kit7.js';

const LOOP = 14, TPS = 14, R0 = 12.8, R1 = 13.5;
// [asked, streams from, text, reason, finished at]
const BLOCKS = [
  [0, 0.6, 'A bad config push; the rollback fixed it in 6 minutes.', 'stop', 2.6],
  [3.0, 3.3, 'Affected: /v1/search, /v1/orders, /v1/users, /v1/carts, /v1/inventory, /v1/pay', 'length', 6.3],
  [6.8, 7.1, 'Checking the live error rate.', 'tool', 8.6],
];
const ASKS = ['summarize the incident', 'list every affected endpoint', 'what is the error rate now?'];
const TOOL_AT = 8.2;

export default {
  id: 'ai-finish-reasons',
  since: '0.3.0',
  title: 'Finish Reasons',
  category: 'Token Streams',
  description: 'Three short streams that end three ways: a clean stop, a cut mid-sentence at the token limit, and a hand-off to a tool call, each with its finish reason.',
  tags: ['finish reason', 'stop', 'max tokens', 'tool use', 'streaming', 'assistant'],
  kind: 'tui',
  size: { w: 64, h: 10 },
  minSize: { w: 44, h: 7 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx);
      const CHIP = { stop: [u ? '■' : '#', th.muted, 'stop'], length: [u ? '▲' : '!', th.warn, 'length'], tool: [u ? '⚙' : '*', th.accent, 'tool_use'] };
      const blocks = [];
      BLOCKS.forEach(([asked, from, text, why, fin], i) => {
        if (p < asked) return;
        const rows = [{ k: 'ask', i, chip: p >= fin ? CHIP[why] : null }];
        blocks.push(rows);
        const r = reveal(text, p, from, TPS), cut = why === 'length' && r.done;
        const said = why === 'tool' && p >= TOOL_AT ? text : r.text.trimStart();
        const pieces = (said.match(/\s*\S+/g) || []).map((t) => ({ t, fg: th.ink }));
        if (cut) pieces.push({ t: ell(ctx), fg: th.ink }, { t: ' [max tokens]', fg: th.ink, attr: ATTR.BOLD });
        flow(pieces, W - 2).forEach((l) => rows.push({ k: 'text', l }));
        if (why === 'tool' && p >= TOOL_AT) rows.push({ k: 'tool', running: p < fin });
      });
      // whole blocks, newest last: older blocks leave the top when they no longer fit
      const stack = (list, gap) => list.flatMap((rs, i) => (i && gap ? [{ k: 'gap' }, ...rs] : rs));
      let rows = blocks.slice(-1)[0];
      for (let n = 2; n <= blocks.length; n++) {
        const some = blocks.slice(-n), next = [true, false].map((g) => stack(some, g)).find((rs) => rs.length <= H);
        if (!next) break;
        rows = next;
      }
      rows.slice(Math.max(0, rows.length - H)).forEach((r, y) => {
        if (r.k === 'ask') {
          const chip = r.chip ? [[r.chip[0], r.chip[1], ATTR.BOLD], [` ${r.chip[2]}`, th.ink, ATTR.BOLD]] : [];
          const cw = r.chip ? runsWidth(chip) + 2 : 0, x = mark(ctx, b, 0, y, '›', '>', th.accent);
          runs(ctx, b, x + 1, y, W - x - 1 - cw, [[ASKS[r.i], th.ink, ATTR.BOLD]]);
          if (r.chip) runs(ctx, b, W - cw + 2, y, cw - 2, chip);
        } else if (r.k === 'text') r.l.forEach((it) => b.text(2 + it.x, y, it.t, it.fg, undefined, it.attr));
        else if (r.k === 'tool') {
          const x = r.running ? (b.set(2, y, spin(ctx, p), th.accent, undefined, ATTR.BOLD), 3) : mark(ctx, b, 2, y, '⚙', '*', th.accent);
          runs(ctx, b, x + 1, y, W - x - 1, [['query_metrics', th.ink, ATTR.BOLD], ['(error_rate, window=5m)', sub(th)]]);
        }
      });
    };
    const plan = BEATS.clear('top');
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
