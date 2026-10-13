// A job lifecycle state machine: the current state lights up and a token
// rides each labeled transition — one failure, a retry with backoff, success.
import { ATTR, glyphs, uni, phase, tint, fit } from '../callouts/_kit.js';
import { LineGrid, nodeBox, box, polyline, along } from './_lines.js';

const S = {
  PENDING: [4, 1, 12], RUNNING: [26, 1, 11], SUCCEEDED: [49, 1, 13],
  RETRYING: [4, 9, 12], FAILED: [26, 9, 11], DEAD: [52, 9, 8],
};
// [start time, edge id] — each transition takes HOP seconds.
const HOP = 0.45;
const SCRIPT = [[0.2, 'start'], [0.9, 'schedule'], [1.9, 'exit1'], [2.9, 'retry'], [3.8, 'backoff'], [4.9, 'schedule'], [5.9, 'exit0'], [7.0, 'end']];

export default {
  id: 'diagrams-state-machine',
  title: 'State Machine',
  category: 'Boxes & Flows',
  description: 'A job lifecycle state machine with labeled transitions: the active state lights up and a token rides each edge through a failure, a backoff retry and success.',
  tags: ['state machine', 'fsm', 'lifecycle', 'transitions', 'retry'],
  kind: 'diagram',
  size: { w: 70, h: 14 },
  minSize: { w: 68, h: 14 },
  loop: 10,
  color: '16',
  order: 40,
  setup(ctx) {
    const th = ctx.theme;
    const B = Object.fromEntries(Object.entries(S).map(([k, [x, y, w]]) => [k, box(x, y, w, 3)]));
    const startDot = [1, B.PENDING.cy], endDot = [B.SUCCEEDED.x + B.SUCCEEDED.w + 4, B.SUCCEEDED.cy];
    // id: [from, to, corners, label]
    const E = {
      start: [null, 'PENDING', [[2, B.PENDING.cy], B.PENDING.left], ''],
      schedule: ['PENDING', 'RUNNING', [B.PENDING.right, B.RUNNING.left], 'schedule'],
      exit0: ['RUNNING', 'SUCCEEDED', [B.RUNNING.right, B.SUCCEEDED.left], 'exit 0'],
      end: ['SUCCEEDED', null, [B.SUCCEEDED.right, [endDot[0] - 1, endDot[1]]], ''],
      exit1: ['RUNNING', 'FAILED', [B.RUNNING.bottom, B.FAILED.top], 'exit 1'],
      retry: ['FAILED', 'RETRYING', [B.FAILED.left, B.RETRYING.right], 'retry <=3'],
      backoff: ['RETRYING', 'PENDING', [B.RETRYING.top, B.PENDING.bottom], 'backoff 4s'],
      dead: ['FAILED', 'DEAD', [B.FAILED.right, B.DEAD.left], 'exhausted'],
    };
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 10);
      let state = null, moving = null, f = 0, attempt = 1, last = null;
      for (const [at, id] of SCRIPT) {
        if (p < at) break;
        if (p < at + HOP) { moving = id; f = (p - at) / HOP; state = null; } else { state = E[id][1]; moving = null; }
        if (id === 'backoff') attempt = 2;
        last = id;
      }
      const grid = new LineGrid(W, H - 1);
      for (const [id, [, , corners]] of Object.entries(E)) grid.path(corners, { c: id === moving ? th.accent : undefined, arrow: true });
      grid.paint(ctx, b, 0, 0, { style: 'round' });
      for (const [id, [, , corners, label]] of Object.entries(E)) {
        if (!label) continue;
        const [[ax, ay], [bx, by]] = corners;
        const hot = id === moving;
        const shown = u ? label.replace('<=', '≤') : label;
        if (ay === by) b.text(Math.min(ax, bx) + Math.floor((Math.abs(bx - ax) - shown.length) / 2) + 1, ay - 1, shown, hot ? th.accent : th.muted, undefined, hot ? ATTR.BOLD : 0);
        else b.text(ax + 2, Math.floor((ay + by) / 2), shown, hot ? th.accent : th.muted, undefined, hot ? ATTR.BOLD : 0);
      }
      b.set(startDot[0], startDot[1], u ? '●' : '*', th.ink, undefined, ATTR.BOLD);
      b.text(endDot[0], endDot[1], u ? '◉' : '@', state === null && last === 'end' && !moving ? th.pos : th.muted, undefined, ATTR.BOLD);
      for (const [name, bx] of Object.entries(B)) {
        const on = name === state;
        const tone = name === 'FAILED' || name === 'DEAD' ? th.neg : name === 'SUCCEEDED' ? th.pos : name === 'RETRYING' ? th.warn : th.accent;
        nodeBox(ctx, b, bx.x, bx.y, name, {
          w: bx.w, color: on ? tone : th.line, bg: on ? tint(ctx, tone, 0.22) : undefined,
          fg: on ? th.ink : name === 'DEAD' ? th.dim : th.muted, attr: on ? ATTR.BOLD : 0,
        });
      }
      if (moving) {
        const at = along(polyline(E[moving][2]), f);
        if (at) b.set(at[0], at[1], u ? '●' : 'o', th.accent, undefined, ATTR.BOLD);
      }
      // Event line: the last transition, as a log entry.
      const [from, to] = last ? E[last] : [null, null];
      const ev = !last ? 'job queued' : `${from || 'start'} ${g.right} ${to || 'end'}${E[last][3] ? ` (${E[last][3]})` : ''}`;
      const ts = `12:04:${String(31 + Math.floor(p * 2)).padStart(2, '0')}`;
      let x = b.text(0, H - 1, ts, th.dim);
      x = b.text(x + 1, H - 1, `job/reindex-8812 attempt ${attempt}/3`, th.muted);
      b.text(x + 2, H - 1, fit(ev, Math.max(0, W - x - 2), undefined, ctx), to === 'FAILED' ? th.neg : to === 'SUCCEEDED' || last === 'end' ? th.pos : th.ink);
    };
  },
};
