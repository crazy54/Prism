// The same question at low, medium and high effort side by side: each thinks for its own time and tokens, and
// only the high-effort answer catches the edge case.
import { ATTR, uni, phase, spin, reveal, wrapLines, ease } from './_ai.js';
import { mark, runs, kilo, fitRows, fitText } from './_kit7.js';

const LOOP = 14, T0 = 0.3, MAXTOK = 4800, STAR = 11.1, R0 = 12.8, R1 = 13.5;
// [name, seconds, tokens, answer]
const LEVELS = [
  ['low', 0.9, 210, 'Wrap the map in a mutex.'],
  ['medium', 3.4, 1200, 'Use sync.Map; reads far outnumber writes.'],
  ['high', 9.0, 4800, 'Use sync.Map, and copy the keys before ranging: a Delete during Range can skip entries.'],
];
const secs = (s) => (s < 10 ? s.toFixed(1) : String(Math.round(s)));

export default {
  id: 'ai-effort-levels',
  since: '0.3.0',
  title: 'Effort Levels',
  category: 'Thinking States',
  description: 'One question answered at low, medium and high effort side by side: each thinks for its own time and tokens, and only high effort catches the edge case.',
  tags: ['effort', 'reasoning', 'thinking time', 'compare', 'tokens', 'assistant'],
  kind: 'tui',
  size: { w: 72, h: 8 },
  minSize: { w: 48, h: 6 },
  loop: LOOP,
  color: '16',
  order: 250,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, at) => {
      const kb = at >= R0 && at < R1 ? (at - R0) / (R1 - R0) : -1;
      if (kb >= 0.9) return draw(b, 0);
      const p = kb >= 0 ? R0 : at, drain = kb >= 0 ? 1 - ease(Math.min(1, kb / 0.6), 0, 1) : 1, quiet = kb >= 0.25;
      const W = b.width, H = b.height, u = uni(ctx), MID = u ? '·' : '-', cw = Math.floor((W - 4) / 3);
      // the question and the spacer give way first, so at least three answer rows remain
      const star = p >= STAR && kb < 0.15, top = fitRows([{ k: 'ask', drop: 2 }, { k: 'gap', drop: 3 }, { k: 'name' }, { k: 'stats' }, { k: 'bar' }], Math.max(3, Math.min(5, H - 3)));
      let y = 0;
      for (const r of top) {
        if (r.k === 'ask') { const x = mark(ctx, b, 0, y, '›', '>', th.accent); runs(ctx, b, x + 1, y, W - x - 1, [['make the session cache safe for concurrent use', th.ink, ATTR.BOLD]]); }
        LEVELS.forEach(([name, s, tok], i) => {
          const x0 = i * (cw + 2), el = Math.max(0, Math.min(s, p - T0)), done = p - T0 >= s, k = el / s;
          if (r.k === 'name') {
            let x = b.text(x0, y, name, th.ink, undefined, ATTR.BOLD) + 1;
            if (!done) b.set(x, y, spin(ctx, p + i * 0.2), th.accent, undefined, ATTR.BOLD);
            else x = mark(ctx, b, x, y, '✔', '+', th.pos) + 1;
            if (i === 2 && star && x < x0 + cw) mark(ctx, b, x, y, '★', '*', th.accent);
          } else if (r.k === 'stats' && !quiet) fitText(b, x0, y, cw, [`${secs(el)}s ${MID} ${kilo(tok * k)} tok`, `${secs(el)}s ${MID} ${kilo(tok * k)}`], th.ink);
          else if (r.k === 'bar') {
            const n = Math.round(((tok * k * drain) / MAXTOK) * cw);
            for (let c = 0; c < cw; c++) b.set(x0 + c, y, c < n ? (u ? '█' : '#') : (u ? '░' : '.'), c < n ? th.accent : th.mode === 'light' ? th.ink : th.muted);
          }
        });
        y++;
      }
      // answers stream in once each level has finished thinking; the high one ends with its edge case
      LEVELS.forEach(([, s, , answer], i) => {
        const x0 = i * (cw + 2), at = T0 + s + 0.2;
        if (p < at || quiet) return;
        const room = H - y - (i === 2 ? 1 : 0), lines = wrapLines(reveal(answer, p, at, 14).text.trimStart(), cw);
        // the last row that fits ends with an ellipsis when the answer runs on; the edge-case row always shows
        // a row that runs on ends at a word, then the ellipsis
        const E = u ? '…' : '...', cut = (s) => { while (s.length + 1 + E.length > cw && s.includes(' ')) s = s.slice(0, s.lastIndexOf(' ')); return `${s} ${E}`; };
        lines.slice(0, Math.max(0, room)).forEach((line, j) => runs(ctx, b, x0, y + j, cw, [[j === room - 1 && lines.length > room ? cut(line) : line, th.ink]]));
        if (i === 2 && star && room >= 0) { const sy = y + Math.min(lines.length, room), x = mark(ctx, b, x0, sy, '★', '*', th.accent); fitText(b, x + 1, sy, cw - 2, ['edge case found', 'edge case'], th.ink, undefined, ATTR.BOLD); }
      });
    };
    return (t) => { const p = phase(t, LOOP); draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
