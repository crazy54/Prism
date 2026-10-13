// A multi-agent message log: agents post findings and hand work to each
// other, color-tagged, with handoffs marked and the newest line flashing.
import { ATTR, glyphs, uni, phase, fit, tint, stringWidth } from './_ai.js';

const AGENTS = { mainbrain: 'accent', collector: 'info', analyst: 'warn', fixer: 'pos' };
// [time, from, to | '', text]
const LOG = [
  [0.2, 'collector', '', 'ingesting checkout spans, 1.2k/s'],
  [0.9, 'collector', 'analyst', 'p99 2.4s on POST /checkout since 12:02'],
  [1.7, 'analyst', '', 'pool_wait_ms tracks p99 (r=0.94)'],
  [2.4, 'analyst', '', 'deploy v2.14.1 at 12:02 raised workers 8 -> 32'],
  [3.1, 'analyst', 'mainbrain', 'cause: db pool starvation (confidence 0.87)'],
  [3.8, 'mainbrain', 'fixer', 'draft the smallest safe fix'],
  [4.6, 'fixer', 'mainbrain', 'fix #142: DB_POOL_SIZE=40, needs approval'],
  [5.4, 'mainbrain', '', 'waiting on a human for #142'],
  [6.6, 'mainbrain', 'fixer', 'approved by on-call, apply #142'],
  [7.4, 'fixer', '', 'applied; p99 380ms and falling'],
];

export default {
  id: 'ai-multi-agent-log',
  title: 'Multi-Agent Log',
  category: 'Agents & Pipelines',
  description: 'A multi-agent message log: color-tagged agents post findings and hand work to one another, handoffs marked with arrows and the newest line flashing.',
  tags: ['multi-agent', 'log', 'handoff', 'agents', 'orchestration'],
  kind: 'tui',
  size: { w: 72, h: 10 },
  minSize: { w: 48, h: 6 },
  loop: 9,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      const shown = LOG.filter(([at]) => p >= at);
      const tagW = 9;
      shown.slice(-H).forEach(([at, from, to, text], y) => {
        const fresh = p - at < 0.5;
        if (fresh) b.fill(0, y, W, 1, ' ', undefined, tint(ctx, th[AGENTS[from]], 0.14));
        const ts = `12:04:${String(31 + Math.round(at * 2)).padStart(2, '0')}`;
        let x = W >= 60 ? b.text(0, y, ts, th.dim) + 1 : 0;
        x = b.text(x, y, from.padEnd(tagW), th[AGENTS[from]], undefined, ATTR.BOLD);
        if (to) {
          x = b.text(x, y, `${u ? '▸' : '>'} `, th.dim);
          x = b.text(x, y, to, th[AGENTS[to]], undefined, ATTR.BOLD) + 1;
        }
        const msg = u ? text.replace('->', '→') : text;
        b.text(x + 1, y, stringWidth(msg) <= W - x - 1 ? msg : fit(msg, Math.max(0, W - x - 1), undefined, ctx), fresh ? th.ink : th.muted, undefined, msg.startsWith('waiting') ? ATTR.ITALIC : 0);
      });
      if (!shown.length) b.text(0, 0, `${g.ellipsis} agents starting`, th.dim);
    };
  },
};
