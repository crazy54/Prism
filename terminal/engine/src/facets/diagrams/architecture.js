// A service architecture: clients → load balancer → three app servers →
// postgres / replica / redis, with request packets flowing along the edges.
// Mid-loop app-2 fails its health checks and traffic shifts to its peers.
import { ATTR, glyphs, uni, phase, fit } from '../callouts/_kit.js';
import { LineGrid, nodeBox, box, polyline, along } from './_lines.js';

const DOWN = [3.4, 5.8];
const PACKETS = 14;

export default {
  id: 'diagrams-architecture',
  title: 'Service Architecture',
  category: 'Boxes & Flows',
  description: 'Clients, load balancer, three app servers and the data tier, with request packets flowing along routed edges; app-2 fails health checks and traffic reroutes.',
  tags: ['architecture', 'load balancer', 'traffic', 'topology', 'failover'],
  kind: 'diagram',
  size: { w: 76, h: 18 },
  minSize: { w: 58, h: 14 },
  loop: 8,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 8);
      const down = p >= DOWN[0] && p < DOWN[1];
      const DH = H - 1;
      // Columns.
      const cw = [11, 11, 9, 12];
      const gap = Math.max(3, Math.floor((W - cw.reduce((a, c) => a + c, 0)) / 3));
      const xs = [0];
      for (let i = 1; i < 4; i++) xs.push(xs[i - 1] + cw[i - 1] + gap);
      // Rows: three tiers, centered vertically.
      const step = Math.min(5, Math.floor((DH - 3) / 2));
      const y0 = Math.max(0, Math.floor((DH - (2 * step + 3)) / 2));
      const ys = [y0, y0 + step, y0 + 2 * step];
      const clients = box(xs[0], ys[1], cw[0], 3), lb = box(xs[1], ys[1], cw[1], 3);
      const apps = ys.map((y) => box(xs[2], y, cw[2], 3));
      const data = ys.map((y) => box(xs[3], y, cw[3], 3));
      const busA = lb.x + lb.w + Math.floor(gap / 2), busB = xs[2] + cw[2] + Math.floor(gap / 2);

      // Edges.
      const grid = new LineGrid(W, DH);
      grid.path([clients.right, lb.left], { arrow: true });
      grid.hline(lb.right[0], busA, lb.cy);
      grid.vline(busA, apps[0].cy, apps[2].cy);
      apps.forEach((a, k) => {
        const c = down && k === 1 ? th.neg : undefined;
        grid.path([[busA, a.cy], a.left], { c, arrow: true });
        grid.path([a.right, [busB, a.cy]], { c });
      });
      grid.vline(busB, apps[0].cy, apps[2].cy);
      data.forEach((d) => grid.path([[busB, d.cy], d.left], { arrow: true }));
      grid.paint(ctx, b, 0, 0, { style: 'round' });

      // Nodes.
      nodeBox(ctx, b, clients.x, clients.y, 'clients', { w: cw[0], color: th.muted });
      nodeBox(ctx, b, lb.x, lb.y, 'edge-lb', { w: cw[1], color: th.accent, attr: ATTR.BOLD });
      apps.forEach((a, k) => {
        const bad = down && k === 1;
        nodeBox(ctx, b, a.x, a.y, bad ? `app-2 ${g.cross}` : `app-${k + 1}`, { w: cw[2], color: bad ? th.neg : th.info, fg: bad ? th.neg : th.ink, attr: bad ? ATTR.BOLD : 0 });
        if (step >= 5) {
          const rps = down ? (k === 1 ? '0 rps' : '620 rps') : `${[412, 405, 418][k]} rps`;
          b.text(a.x + Math.floor((a.w - rps.length) / 2), a.y + 3, rps, bad ? th.neg : th.dim);
        }
      });
      const DATA = [['postgres', th.accent], ['replica', th.info], ['redis', th.pos]];
      data.forEach((d, k) => nodeBox(ctx, b, d.x, d.y, DATA[k][0], { w: cw[3], color: DATA[k][1] }));
      if (step >= 5) b.text(data[0].x + 2, data[0].y + 3, u ? '↓ repl' : 'v repl', th.dim);

      // Packets: client → lb → app → data store.
      for (let i = 0; i < PACKETS; i++) {
        const f = phase(p / 2.2 + i / PACKETS, 1);
        let k = i % 3;
        if (down && k === 1) k = i % 2 ? 0 : 2;
        const tgt = i % 3 === 2 ? 2 : i % 2;
        const a = apps[k], d = data[tgt];
        // Hop node to node: the packet is hidden while it's "inside" a box.
        const pts = [
          ...polyline([clients.right, lb.left]),
          ...polyline([lb.right, [busA, lb.cy], [busA, a.cy], a.left]),
          ...polyline([a.right, [busB, a.cy], [busB, d.cy], d.left]),
        ];
        const at = along(pts, f);
        if (!at) continue;
        b.set(at[0], at[1], u ? '●' : 'o', DATA[tgt][1], undefined, ATTR.BOLD);
      }

      if (y0 >= 2) b.text(0, 0, fit(`checkout ${g.mid} prod-us-east-2`, W, undefined, ctx), th.dim);
      // Status line.
      const msg = down
        ? `${g.cross} app-2 failing health checks ${g.mid} traffic on app-1, app-3`
        : p >= DOWN[1] && p < DOWN[1] + 1.4
          ? `${g.check} app-2 passing again ${g.mid} 3/3 healthy`
          : `rps 1.2k ${g.mid} p99 180ms ${g.mid} 3/3 healthy`;
      b.text(0, H - 1, fit(msg, W, undefined, ctx), down ? th.neg : p >= DOWN[1] && p < DOWN[1] + 1.4 ? th.pos : th.muted, undefined, down ? ATTR.BOLD : 0);
    };
  },
};
