// Two requests sharing a long prefix: the first computes every block, the second reuses the cached prefix and
// computes only its new suffix, so time to first token drops.
import { ATTR, uni, phase, span } from './_ai.js';
import { sub, runs, putR, fitRows } from './_kit7.js';

const LOOP = 12, A0 = 0.5, A1 = 2.9, B0 = 4.0, B1 = 4.4, SUM = 4.8, R0 = 10.8, R1 = 11.5;
// [block, tokens]; everything but the last is the shared prefix
const BLOCKS = [['system', 1200, 'sys'], ['tools', 3400], ['docs', 9800], ['history', 2600], ['new', 1600]];
const TOTAL = BLOCKS.reduce((n, [, t]) => n + t, 0), PREFIX = TOTAL - BLOCKS[BLOCKS.length - 1][1];

export default {
  id: 'ai-prompt-cache',
  since: '0.3.0',
  title: 'Prompt Cache',
  category: 'Model Internals',
  description: 'Two requests share a long prompt prefix: the first computes every block, the second reuses the cached prefix and computes only its new suffix, so first-token time drops.',
  tags: ['prompt caching', 'kv cache', 'prefix', 'latency', 'ttft', 'model'],
  kind: 'tui',
  size: { w: 72, h: 9 },
  minSize: { w: 48, h: 6 },
  loop: LOOP,
  color: '16',
  order: 220,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', AR = u ? '→' : '->';
      const G = { calc: [u ? '█' : '#', th.accent], cached: [u ? '▓' : '=', th.mode === 'light' ? th.ink : th.muted], todo: [u ? '░' : '.', th.line] };
      const edges = [], cell = (tok) => Math.round((tok / TOTAL) * W);
      BLOCKS.reduce((at, [, t]) => { edges.push(cell(at)); return at + t; }, 0);
      const pctCached = Math.round((PREFIX / TOTAL) * 100);
      // the beat empties both strips block by block, right to left
      const nb = kb >= 0 ? Math.max(0, BLOCKS.length - Math.floor(Math.min(1, kb / 0.8) * (BLOCKS.length + 1))) : BLOCKS.length;
      const keepTok = BLOCKS.slice(0, nb).reduce((n, [, t]) => n + t, 0);
      const rows = fitRows([{ k: 'head', drop: 2 }, { k: 'gap', drop: 4 }, { k: 'label', r: 0 }, { k: 'strip', r: 0 }, { k: 'names', drop: 3 }, { k: 'label', r: 1 }, { k: 'strip', r: 1 },
        { k: 'gap', drop: 5 }, { k: 'sum', drop: 1 }], H);
      rows.forEach((row, y) => {
        if (row.k === 'head') runs(ctx, b, 0, y, W, [['prompt cache', th.ink, ATTR.BOLD], [` ${MID} 2 requests, same ${(PREFIX / 1000).toFixed(1)}k-token prefix`, th.ink, 0, true]]);
        else if (row.k === 'label') {
          const done = row.r === 0 ? p >= A1 : p >= B1, started = row.r === 0 ? p >= A0 : p >= B0;
          b.text(0, y, `request ${row.r + 1}`, th.ink, undefined, ATTR.BOLD);
          const note = nb === 0 ? 'waiting' : done ? (row.r === 0 ? 'TTFT 2.4s' : `TTFT 0.4s ${MID} ${pctCached}% cached`) : started ? 'computing' : 'waiting';
          putR(b, W, y, note, done ? th.ink : sub(th), done ? ATTR.BOLD : 0);
        } else if (row.k === 'strip') {
          // request 1 computes left to right; request 2 lights its cached prefix at once, then computes the rest
          const upto = keepTok >= TOTAL ? (row.r === 0 ? span(p, A0, A1) * TOTAL : p < B0 ? 0 : PREFIX + span(p, B0, B1) * (TOTAL - PREFIX)) : keepTok;
          for (let x = 0; x < W; x++) {
            const tok = ((x + 0.5) / W) * TOTAL, kind = tok > upto ? 'todo' : row.r === 1 && tok <= PREFIX ? 'cached' : 'calc';
            b.set(x, y, G[kind][0], G[kind][1]);
          }
        } else if (row.k === 'names') {
          BLOCKS.forEach(([long, , short], i) => {
            const x = edges[i], next = i + 1 < edges.length ? edges[i + 1] : W + 1;
            b.set(x, y, u ? '╵' : '|', th.line);
            const name = [long, short].find((n) => n && x + 1 + n.length < next);
            if (name) b.text(x + 1, y, name, sub(th));
          });
        } else if (row.k === 'sum' && p >= SUM && kb < 0) {
          runs(ctx, b, 0, y, W, [['TTFT 2.4s ', th.ink], [AR, th.accent, ATTR.BOLD], [' 0.4s', th.ink, ATTR.BOLD], [` ${MID} ${pctCached}% from cache`, th.ink, 0, true],
            [` ${MID} ${G.cached[0]} cached ${G.calc[0]} computed`, sub(th), 0, true]]);
        }
      });
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
