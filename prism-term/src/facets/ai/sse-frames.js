// The transport under a stream: server-sent event frames arrive on the left (a keep-alive ping among them) and
// their text assembles into the reply on the right.
import { ATTR, uni, phase } from './_ai.js';
import { sub, inv, runs, flow, beat, BEATS } from './_kit7.js';

const LOOP = 12, R0 = 10.8, R1 = 11.5;
const DELTAS = ['The dep', 'loy fini', 'shed at ', '14:02. A', 'll 3 reg', 'ions are', ' healthy', ' and p99', ' latency', ' is back', ' to 180 ', 'ms.'];
// [arrives, event, data]
const FRAMES = [[0.5, 'start', '{"id":"r_7f2c"}']];
DELTAS.forEach((d, i) => {
  FRAMES.push([0.9 + i * 0.6, 'delta', JSON.stringify({ text: d })]);
  if (i === 5) FRAMES.push([0.9 + i * 0.6 + 0.3, 'ping', '{}']);
});
FRAMES.push([0.9 + DELTAS.length * 0.6, 'done', '{"reason":"stop"}']);

export default {
  id: 'ai-sse-frames',
  since: '0.3.0',
  title: 'Stream Frames',
  category: 'Token Streams',
  description: 'The protocol under a streamed reply: server-sent event frames arrive on the left, a keep-alive ping among them, and their text assembles into the reply on the right.',
  tags: ['server-sent events', 'sse', 'streaming', 'protocol', 'deltas', 'api'],
  kind: 'tui',
  size: { w: 72, h: 10 },
  minSize: { w: 48, h: 7 },
  loop: LOOP,
  color: '16',
  order: 250,
  setup(ctx) {
    const th = ctx.theme;
    const draw = (b, p) => {
      const W = b.width, H = b.height, u = uni(ctx), V = u ? '│' : '|';
      const wide = W >= 64, lw = wide ? Math.min(38, Math.floor(W * 0.52)) : Math.floor(W * 0.5), rx = lw + 2, rw = W - rx;
      const got = FRAMES.filter(([t]) => p >= t), text = got.filter(([, e]) => e === 'delta').map(([, , d]) => JSON.parse(d).text).join('');
      b.text(0, 0, `frames ${got.length}`, sub(th), undefined, ATTR.BOLD);
      b.text(rx, 0, got.some(([, e]) => e === 'done') ? `reply ${u ? '·' : '-'} done` : 'reply', sub(th), undefined, ATTR.BOLD);
      for (let y = 0; y < H; y++) b.set(lw + 1, y, V, th.line);
      // two lines per frame when wide; one short line per frame (pings left out) when narrow
      const lines = [];
      for (const [t, ev, data] of got) {
        const cur = p - t < 0.35;
        if (wide) { lines.push({ cur, parts: [['event: ', sub(th)], [ev, th.ink, ATTR.BOLD]] }, { cur, parts: [['data: ', sub(th)], [data, th.ink]] }); }
        else if (ev !== 'ping') lines.push({ cur, parts: [[ev, th.ink, ATTR.BOLD], [ev === 'delta' ? ` '${JSON.parse(data).text}'` : '', th.ink]] });
      }
      const room = H - 1;
      lines.slice(Math.max(0, lines.length - room)).forEach((l, i) => {
        const y = 1 + i;
        if (l.cur) inv(ctx, b, 0, y, l.parts.map(([s]) => s).join('').slice(0, lw).padEnd(Math.min(lw, l.parts.map(([s]) => s).join('').length)));
        else runs(ctx, b, 0, y, lw, l.parts);
      });
      // the reply wraps on whole words in the right pane
      const words = (text.match(/\s*\S+/g) || []).map((t) => ({ t, fg: th.ink }));
      const done = got.some(([, e]) => e === 'done'), rows = flow(words, rw - 1);   // a column kept for the cursor
      rows.slice(Math.max(0, rows.length - room)).forEach((l, i) => l.forEach((it) => b.text(rx + it.x, 1 + i, it.t, it.fg)));
      if (!done && rows.length) {
        const l = rows[rows.length - 1], end = l.length ? l[l.length - 1].x + l[l.length - 1].t.length : 0, y = Math.min(rows.length, room);
        if (end < rw) b.set(rx + end, y, u ? '▌' : '_', th.accent);
      }
    };
    const plan = BEATS.scroll(1);
    return (t) => { const p = phase(t, LOOP); if (!beat(ctx, ctx.buffer, draw, p, R0, R1, plan)) draw(ctx.buffer, p >= R1 ? 0 : p); };
  },
};
