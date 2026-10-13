// Grouped key/value blocks with dotted leaders, live values and status pills.
import { ATTR, uni, phase } from './_kit.js';

export default {
  id: 'callouts-key-value',
  title: 'Key-Value Details',
  category: 'Key-Value',
  description: 'Grouped key/value details with dotted leaders to right-aligned values, live-updating numbers and status pills — the "describe" view of every CLI.',
  tags: ['key value', 'details', 'describe', 'leaders', 'properties'],
  kind: 'widget',
  size: { w: 56, h: 16 },
  minSize: { w: 32, h: 8 },
  loop: 10,
  color: '16',
  order: 20,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, u = uni(ctx);
      const p = phase(t, 10);
      const healthy = !(p > 5.5 && p < 8);
      const groups = [
        ['Service', [
          ['Name', 'checkout'],
          ['Version', 'v2.14.1'],
          ['Replicas', `${healthy ? 2 : 1} / 2`, healthy ? 'pos' : 'warn'],
          ['Status', healthy ? 'Running' : 'Degraded', healthy ? 'pos' : 'warn', true],
        ]],
        ['Traffic', [
          ['Requests', `${(612 + Math.round(Math.sin(t * 1.1) * 24)).toLocaleString('en-US')} rps`],
          ['p95 latency', `${Math.round(healthy ? 212 + Math.sin(t) * 9 : 840 + Math.sin(t * 3) * 60)} ms`, healthy ? null : 'warn'],
          ['Error rate', `${(healthy ? 0.15 : 2.4 + Math.sin(t * 2) * 0.3).toFixed(2)} %`, healthy ? null : 'neg'],
        ]],
        ['Network', [
          ['Address', '10.20.2.31:8085'],
          ['Upstream', 'pg-orders-primary-01'],
        ]],
      ];
      let y = 0;
      for (const [name, rows] of groups) {
        if (y >= H) break;
        b.text(0, y, name.toUpperCase(), th.muted, undefined, ATTR.BOLD);
        y++;
        for (const [k, v, tone, pill] of rows) {
          if (y >= H) break;
          const vw = v.length + (pill ? 2 : 0);
          const lead = Math.max(1, W - 2 - k.length - vw - 2);
          b.text(2, y, k, th.ink);
          b.text(2 + k.length + 1, y, (u ? '·' : '.').repeat(lead), th.line);
          const vx = W - vw;
          if (pill) {
            const c = th[tone];
            b.text(vx, y, ` ${v} `, th.bg, c, ATTR.BOLD);
          } else b.text(vx, y, v, tone ? th[tone] : th.ink, undefined, tone ? ATTR.BOLD : 0);
          y++;
        }
        y++;
      }
    };
  },
};
