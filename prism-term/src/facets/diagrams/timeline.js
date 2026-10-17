// An incident timeline: a playhead sweeps the axis, events pop in on
// alternating label lanes, and MTTA / MTTR spans draw in once resolved.
import { ATTR, glyphs, uni, phase, fit, stringWidth } from '../callouts/_kit.js';

// [minute after 12:00, label, tone]
const EVENTS = [
  [2, 'deploy v2.14.1', 'info'], [9, 'p99 alert fires', 'neg'], [11, 'on-call paged', 'warn'], [13, 'acknowledged', 'warn'],
  [20, 'cause: db pool', 'accent'], [24, 'fix #142 approved', 'accent'], [27, 'mitigated', 'pos'], [41, 'resolved', 'pos'],
];
const SPANS = [['MTTA', 9, 13], ['MTTR', 9, 41]];
const SPAN_M = 45, SWEEP = 7;
// Label lanes: [row, side] cycling up-far, down-near, up-near, down-far.
const LANES = [[0, 'up'], [7, 'down'], [2, 'up'], [9, 'down']];
const AXIS = 5;

export default {
  id: 'diagrams-timeline',
  title: 'Incident Timeline',
  category: 'Sequence & Timelines',
  description: 'An incident timeline: a playhead sweeps from deploy to resolution, events pop in on alternating label lanes, and MTTA and MTTR spans draw in at the end.',
  tags: ['timeline', 'incident', 'postmortem', 'mttr', 'events'],
  kind: 'diagram',
  size: { w: 76, h: 14 },
  minSize: { w: 64, h: 14 },
  loop: 9,
  color: '16',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      const nowM = Math.min(1, p / SWEEP) * SPAN_M;
      const x = (m) => 1 + Math.round((m / SPAN_M) * (W - 3));
      // Axis, bold up to the playhead, with 15-minute ticks.
      for (let i = 0; i < W; i++) b.set(i, AXIS, u ? (i <= x(nowM) ? '━' : '─') : (i <= x(nowM) ? '=' : '-'), i <= x(nowM) ? th.ink : th.line);
      for (let m = 0; m <= SPAN_M; m += 15) {
        b.set(x(m), AXIS, u ? (m <= nowM ? '╋' : '┼') : '+', m <= nowM ? th.ink : th.line);
        b.text(Math.max(0, Math.min(W - 5, x(m) - 2)), AXIS + 1, `12:${String(m).padStart(2, '0')}`, th.dim);
      }
      const laneEnd = LANES.map(() => -2);
      // Events.
      EVENTS.forEach(([m, label, tone], k) => {
        if (nowM < m) return;
        const ex = x(m), c = th[tone];
        const [ly, side] = LANES[k % LANES.length];
        const text = `12:${String(m).padStart(2, '0')} ${label}`;
        const tw = stringWidth(text);
        // Centered on the marker, but never over the previous label in this lane.
        const lane = k % LANES.length;
        const lx = Math.max(laneEnd[lane] + 2, Math.max(0, Math.min(W - tw, ex - Math.floor(tw / 2))));
        b.text(lx, ly, fit(text, Math.max(0, W - lx), undefined, ctx).trimEnd(), c, undefined, nowM - m < 2 ? ATTR.BOLD : 0);
        laneEnd[lane] = lx + tw;
        // Stub from the label to the axis.
        const [y0, y1] = side === 'up' ? [ly + 1, AXIS - 1] : [AXIS + 1, ly - 1];
        for (let y = y0; y <= y1; y++) if (b.get(ex, y)?.ch === ' ') b.set(ex, y, u ? '│' : '|', th.line);
        b.set(ex, AXIS, u ? '●' : 'o', c, undefined, ATTR.BOLD);
      });
      // Playhead.
      if (p < SWEEP) b.set(x(nowM), AXIS, u ? '◆' : '#', th.accent, undefined, ATTR.BOLD);
      // Spans, once resolved.
      if (nowM >= 41) {
        SPANS.forEach(([name, a, z], i) => {
          const y = 11 + i;
          if (y >= H - 1) return;
          const xa = x(a), xz = x(z);
          for (let xx = xa; xx <= xz; xx++) b.set(xx, y, u ? '─' : '-', th.muted);
          b.set(xa, y, u ? '├' : '|', th.muted); b.set(xz, y, u ? '┤' : '|', th.muted);
          const lab = ` ${name} ${z - a}m `;
          const lx = xz - xa > lab.length + 1 ? xa + Math.floor((xz - xa - lab.length) / 2) + 1 : xz + 2;
          b.text(lx, y, lab, name === 'MTTR' ? th.pos : th.warn, undefined, ATTR.BOLD);
        });
      }
      const live = EVENTS.filter(([m]) => nowM >= m).pop();
      const msg = nowM >= 41 ? `${g.check} INC-3127 resolved ${g.mid} customer impact 25m ${g.mid} postmortem due Thu`
        : live ? `INC-3127 ${g.mid} 12:${String(Math.floor(nowM)).padStart(2, '0')} ${g.mid} ${live[1]}` : `INC-3127 ${g.mid} 12:00`;
      b.text(0, H - 1, fit(msg, W, undefined, ctx), nowM >= 41 ? th.pos : th.muted);
    };
  },
};
