// A network map learned passively from telemetry: hosts, switches and the
// gateway appear as they are first seen in incoming data (no scanning),
// links draw in once both ends are known.
import { ATTR, glyphs, uni, phase, tint, fit, stringWidth } from '../callouts/_kit.js';
import { LineGrid, nodeBox, box, tap, DIR } from './_lines.js';

// id: [label, ip, tier, column(0..5), seen at, source]
const NODES = {
  edge: ['edge-lb', '203.0.113.10', 0, 2.5, 3.3, 'access log X-Forwarded-For'],
  core: ['core-gw', '10.20.0.1', 1, 2.5, 2.0, 'default gateway in netflow'],
  swWeb: ['sw-web', '10.20.1.0/24', 2, 1, 1.2, 'subnet of web-01, web-02'],
  swData: ['sw-data', '10.20.2.0/24', 2, 4, 2.4, 'subnet of db-01'],
  web1: ['web-01', '10.20.1.11', 3, 0, 0.2, 'OTLP resource host.name'],
  web2: ['web-02', '10.20.1.12', 3, 1, 0.8, 'OTLP resource host.name'],
  web3: ['web-03', '10.20.1.13', 3, 2, 3.8, 'syslog hostname'],
  db1: ['db-01', '10.20.2.41', 3, 3, 1.6, 'postgres log peer address'],
  cache1: ['cache-01', '10.20.2.51', 3, 4, 2.8, 'redis client span peer'],
  queue1: ['queue-01', '10.20.2.61', 3, 5, 4.3, 'consumer group metadata'],
};
const LINKS = [['edge', 'core'], ['core', 'swWeb'], ['core', 'swData'], ['swWeb', 'web1'], ['swWeb', 'web2'], ['swWeb', 'web3'], ['swData', 'db1'], ['swData', 'cache1'], ['swData', 'queue1']];
const TIER_Y = [0, 4, 8, 12];

export default {
  id: 'diagrams-network-topology',
  title: 'Learned Network Map',
  category: 'Networks & Topologies',
  description: 'A network map that builds itself passively from telemetry: hosts, subnets and the gateway appear as they show up in incoming data, and links draw in.',
  tags: ['network', 'topology', 'discovery', 'subnet', 'passive'],
  kind: 'diagram',
  size: { w: 76, h: 18 },
  minSize: { w: 66, h: 18 },
  loop: 9,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 9);
      const colW = Math.floor(W / 6);
      const B = {};
      for (const [id, [label, , tier, col]] of Object.entries(NODES)) {
        const w = Math.min(colW - 1, stringWidth(label) + 4);
        const cx = Math.round(col * colW + colW / 2);
        B[id] = box(cx - Math.floor(w / 2), TIER_Y[tier], w, 3);
      }
      const known = (id) => p >= NODES[id][4];
      const fresh = (id) => known(id) && p < NODES[id][4] + 0.7;

      const grid = new LineGrid(W, H - 1), taps = [];
      for (const [a, z] of LINKS) {
        if (!known(a) || !known(z)) continue;
        const A = B[a], Z = B[z], c = fresh(a) || fresh(z) ? th.accent : undefined;
        // Bus on the row between tiers, tapped into both box borders.
        const my = A.y + 3;
        if (A.cx === Z.cx) grid.bits(A.cx, my, DIR.N | DIR.S, c);
        else { grid.hline(A.cx, Z.cx, my, c); grid.bits(A.cx, my, DIR.N, c); grid.bits(Z.cx, my, DIR.S, c); }
        taps.push([A.cx, A.y + 2, 'bottom', c], [Z.cx, Z.y, 'top', c]);
      }
      grid.paint(ctx, b, 0, 0, { style: 'round' });
      for (const [id, [label, ip, tier]] of Object.entries(NODES)) {
        if (!known(id)) continue;
        const bx = B[id];
        const c = fresh(id) ? th.accent : tier === 0 ? th.warn : tier < 3 ? th.info : th.line;
        nodeBox(ctx, b, bx.x, bx.y, label, { w: bx.w, color: c, bg: fresh(id) ? tint(ctx, th.accent, 0.2) : undefined, attr: fresh(id) ? ATTR.BOLD : 0 });
        // Address under hosts; beside the box for the upper tiers.
        if (tier === 3) b.text(bx.cx - Math.floor(ip.length / 2), bx.y + 3, ip, th.dim);
        else if (bx.x + bx.w + 1 + ip.length <= W) b.text(bx.x + bx.w + 1, bx.cy, ip, th.dim);
      }
      for (const [x, y, side, c] of taps) tap(ctx, b, x, y, side, c ?? th.line);
      // Learning log.
      const seen = Object.entries(NODES).filter(([id]) => known(id)).sort((a, z) => a[1][4] - z[1][4]);
      const hosts = seen.filter(([, n]) => n[2] === 3).length;
      const last = seen[seen.length - 1];
      const line = last && p < 5
        ? `${g.spark} learned ${last[1][0]} (${last[1][1]}) from ${last[1][5]}`
        : `${hosts} hosts ${g.mid} 2 subnets ${g.mid} learned passively from 2.1k events`;
      b.text(0, H - 1, fit(line, W, undefined, ctx), p < 5 ? th.accent : th.muted, undefined, p < 5 ? ATTR.BOLD : 0);
      if (!seen.length) b.text(0, H - 1, fit(`${g.ellipsis} waiting for telemetry`, W, undefined, ctx), th.dim);
    };
  },
};
