// A service mesh on a braille canvas: services ring the frame, diagonal call
// edges carry traffic comets, and one edge turns hot during a latency spike.
import { ATTR, glyphs, uni, phase, mix, fit, stringWidth } from '../callouts/_kit.js';

const SVCS = ['gateway', 'checkout', 'payments', 'notify', 'inventory', 'search', 'users'];
// [from, to, relative rate]
const CALLS = [[0, 1, 1.2], [0, 5, 1.0], [0, 6, 0.6], [1, 2, 0.8], [1, 4, 0.9], [1, 3, 0.4], [5, 4, 0.7], [2, 3, 0.5]];
const HOT = [1, 2], SPIKE = [3.0, 6.0];

export default {
  id: 'diagrams-service-mesh',
  title: 'Service Mesh',
  category: 'Networks & Topologies',
  description: 'A service mesh on a braille canvas: services ring the frame, diagonal call edges carry traffic comets, and one edge runs hot red during a latency spike.',
  tags: ['service mesh', 'graph', 'traffic', 'braille', 'latency'],
  kind: 'diagram',
  canvas: 'line',
  size: { w: 64, h: 18 },
  minSize: { w: 44, h: 12 },
  loop: 8,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, 8);
      const spike = p >= SPIKE[0] && p < SPIKE[1];
      const DH = H - 1;
      const cv = ctx.canvas('line', { cols: W, rows: DH });
      // Services on an ellipse (cell coordinates), gateway on the left.
      const rx = W / 2 - 9, ry = DH / 2 - 1.2;
      const pos = SVCS.map((_, i) => {
        const a = Math.PI + (i / SVCS.length) * Math.PI * 2;
        return [W / 2 + rx * Math.cos(a), DH / 2 + ry * Math.sin(a)];
      });
      const px = ([x, y]) => [(x + 0.5) * cv.sx, (y + 0.5) * cv.sy];
      // Edges, then traffic comets traveling them.
      for (const [a, z, rate] of CALLS) {
        const hot = spike && a === HOT[0] && z === HOT[1];
        const [x0, y0] = px(pos[a]), [x1, y1] = px(pos[z]);
        cv.line(x0, y0, x1, y1, hot ? mix(th.bg, th.neg, 0.7) : mix(th.line, th.muted, 0.45));
        const n = hot ? 1 : 2;
        for (let k = 0; k < n; k++) {
          const f = phase(t * rate * (hot ? 0.35 : 0.6) + k / n + a * 0.13, 1);
          for (let tail = 0; tail < 4; tail++) {
            const ff = f - tail * 0.025;
            if (ff < 0) continue;
            const c = mix(th.bg, hot ? th.neg : th.accent, 1 - tail * 0.22);
            cv.set(x0 + (x1 - x0) * ff, y0 + (y1 - y0) * ff, c);
            cv.set(x0 + (x1 - x0) * ff + 1, y0 + (y1 - y0) * ff, c);
          }
        }
      }
      cv.paint(b);
      // Hot-edge label at its midpoint.
      if (spike) {
        const [ax, ay] = pos[HOT[0]], [zx, zy] = pos[HOT[1]];
        const label = ' p99 2.4s ';
        b.text(Math.round((ax + zx) / 2 - label.length / 2), Math.round((ay + zy) / 2), label, th.bg, th.neg, ATTR.BOLD);
      }
      // Service labels sit on top of the lines.
      SVCS.forEach((name, i) => {
        const [x, y] = pos[i];
        const bad = spike && (i === HOT[0] || i === HOT[1]);
        const label = `${u ? '●' : '*'} ${name}`;
        const lx = Math.max(0, Math.min(W - stringWidth(label) - 2, Math.round(x - stringWidth(label) / 2) - 1));
        b.text(lx, Math.round(y), ` ${label} `, th.ink, th.panel, i === 0 ? ATTR.BOLD : 0);
        b.set(lx + 1, Math.round(y), u ? '●' : '*', bad ? th.neg : th.pos, th.panel);
      });
      const msg = spike ? `${g.cross} checkout ${g.right} payments p99 2.4s ${g.mid} retries 3.1%` : `${CALLS.length} edges ${g.mid} 1.4k rps ${g.mid} mTLS on ${g.mid} 0 errors`;
      b.text(0, H - 1, fit(msg, W, undefined, ctx), spike ? th.neg : th.muted, undefined, spike ? ATTR.BOLD : 0);
    };
  },
};
