// A sequence diagram: lifelines for four participants, call arrows that grow
// from caller to callee, dashed returns, activation bars and a note.
import { ATTR, glyphs, uni, phase, ease, fit, clip, stringWidth } from '../callouts/_kit.js';
import { nodeBox } from './_lines.js';

const WHO = ['client', 'gateway', 'checkout', 'postgres'];
// [from, to, label, kind, start]
const MSGS = [
  [0, 1, 'POST /checkout', 'call', 0.4],
  [1, 2, 'createOrder()', 'call', 1.0],
  [2, 3, 'BEGIN; INSERT order', 'call', 1.6],
  [2, 2, 'pool 20/20 busy, waited 840ms', 'note', 2.3],
  [3, 2, 'ok 12ms', 'ret', 3.3],
  [2, 1, '201 Created', 'ret', 3.9],
  [1, 0, '201  1.12s', 'ret', 4.5],
];
const GROW = 0.35;

export default {
  id: 'diagrams-sequence',
  title: 'Sequence Diagram',
  category: 'Sequence & Timelines',
  description: 'A sequence diagram of one checkout request: call arrows grow between lifelines, activation bars mark who is busy, a note flags pool wait, returns come back dashed.',
  tags: ['sequence diagram', 'uml', 'lifeline', 'request', 'trace'],
  kind: 'diagram',
  size: { w: 72, h: 19 },
  minSize: { w: 60, h: 13 },
  loop: 9,
  color: '16',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      const xs = WHO.map((_, i) => Math.floor((W / WHO.length) * (i + 0.5)));
      WHO.forEach((name, i) => {
        const w = stringWidth(name) + 4;
        nodeBox(ctx, b, xs[i] - Math.floor(w / 2), 0, name, { w, color: th.accent, attr: ATTR.BOLD });
      });
      const top = 3, rowsAvail = H - top - 1;
      const step = rowsAvail >= MSGS.length * 2 ? 2 : 1;
      const rowOf = (k) => top + 1 + k * step;
      // Lifelines.
      for (let y = top; y < H - 1; y++) xs.forEach((x) => b.set(x, y, u ? '┊' : ':', th.dim));
      // Activation bars: from a call's arrival until the matching return leaves.
      const bar = (who, y0, y1) => { for (let y = y0; y <= y1; y++) b.set(xs[who], y, u ? '┃' : '#', th.accent, undefined, ATTR.BOLD); };
      const shown = MSGS.filter((m) => p >= m[4]).length;
      const lastRow = rowOf(Math.max(0, shown - 1));
      MSGS.forEach(([from, to, , kind, at], k) => {
        if (kind !== 'call' || p < at + GROW) return;
        const ret = MSGS.findIndex((m, j) => j > k && m[3] === 'ret' && m[0] === to && m[1] === from);
        const end = ret >= 0 && p >= MSGS[ret][4] ? rowOf(ret) : lastRow;
        bar(to, rowOf(k) + (step === 2 ? 1 : 0), end + (step === 2 ? 1 : 0));
      });
      // Messages.
      MSGS.forEach(([from, to, label, kind, at], k) => {
        if (p < at) return;
        // With room, labels ride on their own row above the arrow.
        const y = rowOf(k) + (step === 2 && kind !== 'note' ? 1 : 0);
        if (y >= H - 1) return;
        if (kind === 'note') {
          const text = ` ${label} `;
          const nx = Math.max(0, Math.min(W - stringWidth(text), xs[from] - Math.floor(stringWidth(text) / 2)));
          b.text(nx, y, fit(text, W - nx, undefined, ctx), th.bg, th.warn, ATTR.BOLD);
          return;
        }
        const grow = ease(p, at, at + GROW);
        const dir = to > from ? 1 : -1;
        const x0 = xs[from] + dir, x1 = xs[to] - dir;
        const len = Math.abs(x1 - x0);
        const reach = Math.round(len * grow);
        const ch = kind === 'ret' ? (u ? '╌' : '.') : (u ? '─' : '-');
        const c = kind === 'ret' ? th.muted : th.ink;
        for (let s = 0; s <= reach; s++) b.set(x0 + dir * s, y, ch, c);
        if (grow >= 1) {
          b.set(x1, y, dir > 0 ? (u ? '▶' : '>') : (u ? '◀' : '<'), c, undefined, ATTR.BOLD);
          const lab = step === 2 ? label : ` ${label} `;
          const room = step === 2 ? len + 6 : len - 1;
          const shownLab = clip(ctx, lab, Math.max(0, room));
          const lx = Math.min(x0, x1) + Math.floor((len - stringWidth(shownLab)) / 2) + 1;
          b.text(lx, step === 2 ? y - 1 : y, shownLab, kind === 'ret' ? th.muted : th.ink, undefined, kind === 'call' ? ATTR.BOLD : 0);
        }
      });
      const done = p >= MSGS[MSGS.length - 1][4] + GROW;
      b.text(0, H - 1, fit(done ? `${g.check} 201 in 1.12s ${g.mid} 840ms of it waiting for a db connection` : `trace 4bf92f35 ${g.mid} ${shown}/${MSGS.length} spans`, W, undefined, ctx), done ? th.warn : th.muted);
    };
  },
};
