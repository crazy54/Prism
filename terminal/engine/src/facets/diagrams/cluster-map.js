// A cluster map: three nodes with their pods, CPU and memory. node-b goes
// NotReady, its pods are evicted and reschedule onto the healthy nodes one
// by one (Pending → Running), then node-b comes back empty.
import { ATTR, glyphs, uni, phase, fit, hbar, panel, mix } from '../callouts/_kit.js';

const SVC = { c: ['checkout', 'accent'], p: ['payments', 'pos'], s: ['search', 'info'], i: ['inventory', 'warn'] };
const BASE = { a: 'ccpsic', b: 'cppsis', c: 'psicc' };
// node-b's pods, where they land and when (Pending at t, Running at t + 0.6).
const MOVES = [['c', 'a', 3.5], ['p', 'c', 3.9], ['p', 'a', 4.3], ['s', 'c', 4.7], ['i', 'a', 5.1], ['s', 'c', 5.5]];
const DOWN = 2.8, EVICT = 3.2, BACK = 7.6;
const NODES = [['a', 'node-a', '10.20.3.11'], ['b', 'node-b', '10.20.3.12'], ['c', 'node-c', '10.20.3.13']];

export default {
  id: 'diagrams-cluster-map',
  title: 'Cluster Map',
  category: 'Networks & Topologies',
  description: 'Three cluster nodes with pods colored by service plus CPU and memory; node-b goes NotReady, its pods are evicted and reschedule onto healthy nodes.',
  tags: ['kubernetes', 'cluster', 'pods', 'scheduling', 'nodes'],
  kind: 'diagram',
  size: { w: 72, h: 12 },
  minSize: { w: 54, h: 10 },
  loop: 10,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 10);
      const sick = p >= DOWN && p < BACK;
      const pods = { a: [...BASE.a].map((s) => [s, 'run']), b: p < EVICT ? [...BASE.b].map((s) => [s, sick ? 'term' : 'run']) : [], c: [...BASE.c].map((s) => [s, 'run']) };
      for (const [s, to, at] of MOVES) if (p >= at) pods[to].push([s, p < at + 0.6 ? 'pend' : 'run']);
      const nw = Math.floor((W - 2) / 3);
      NODES.forEach(([id, name, ip], i) => {
        const x = i * (nw + 1);
        const down = id === 'b' && sick;
        const n = pods[id].filter(([, st]) => st === 'run').length;
        const title = down ? (nw >= 22 ? `${g.cross} ${name} NotReady` : `${g.cross} ${name}`) : nw >= 20 ? `${name} ${g.mid} ${n} pods` : name;
        const inner = panel(ctx, b, x, 0, nw, 6, { title, titleColor: down ? th.neg : th.ink, color: down ? th.neg : th.line, footer: nw >= 20 ? ip : '' });
        const iw = inner.width;
        const list = pods[id];
        const perRow = Math.max(1, Math.floor((iw - 1) / 2));
        list.forEach(([s, st], k) => {
          const r = Math.floor(k / perRow), cx = 1 + (k % perRow) * 2;
          if (r > 1) return;
          const c = th[SVC[s][1]];
          const ch = st === 'pend' ? (u ? '□' : 'o') : st === 'term' ? (u ? '▪' : 'x') : (u ? '■' : '#');
          inner.set(cx, r, ch, st === 'term' ? mix(th.bg, c, 0.45) : c, undefined, st === 'pend' ? ATTR.BLINK : ATTR.BOLD);
        });
        if (!list.length) inner.text(1, 0, fit(down ? 'evicted' : 'no pods', iw - 2, undefined, ctx), down ? th.neg : th.dim, undefined, ATTR.ITALIC);
        const running = list.filter(([, st]) => st === 'run').length;
        const cpu = down ? 0 : Math.max(0.02, Math.min(0.97, 0.08 * running + 0.05 * Math.sin(t * 1.3 + i)));
        const mem = down ? 0 : Math.min(0.95, 0.07 * running + 0.18);
        const bw = Math.max(4, iw - 10);
        inner.text(1, 2, 'cpu', th.muted);
        hbar(ctx, inner, 5, 2, bw, cpu, cpu > 0.75 ? th.warn : th.accent);
        inner.text(6 + bw, 2, `${Math.round(cpu * 100)}%`.padStart(3), th.dim);
        inner.text(1, 3, 'mem', th.muted);
        hbar(ctx, inner, 5, 3, bw, mem, mem > 0.75 ? th.warn : th.info);
        inner.text(6 + bw, 3, `${Math.round(mem * 100)}%`.padStart(3), th.dim);
      });
      // Legend.
      let lx = 0;
      for (const [, [name, tone]] of Object.entries(SVC)) {
        if (lx + name.length + 3 > W) break;
        b.set(lx, 6, u ? '■' : '#', th[tone], undefined, ATTR.BOLD);
        lx = b.text(lx + 2, 6, name, th.muted) + 2;
      }
      if (lx + 9 <= W) b.text(lx, 6, `${u ? '□' : 'o'} pending`, th.dim);
      // Event log (newest last).
      const EV = [
        [DOWN, th.neg, `${g.cross} node-b NotReady: kubelet stopped posting status`],
        [EVICT, th.warn, `${g.warn} evicting 6 pods from node-b`],
        [3.5, th.info, `${g.right} rescheduling onto node-a, node-c`],
        [6.1, th.pos, `${g.check} 6/6 pods running ${g.mid} 0 lost`],
        [BACK, th.pos, `${g.check} node-b Ready (cordoned, no pods)`],
      ].filter(([at]) => p >= at);
      const rows = H - 8;
      EV.slice(-rows).forEach(([, c, text], r) => b.text(0, 8 + r, fit(text, W, undefined, ctx), c));
      if (!EV.length) b.text(0, 8, fit(`${g.check} 3/3 nodes Ready ${g.mid} 17 pods`, W, undefined, ctx), th.muted);
    };
  },
};
