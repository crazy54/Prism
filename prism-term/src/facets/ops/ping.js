// ping — replies streaming once a second, a latency sparkline, and the live rtt min/avg/max/mdev summary.
import { C, ATTR, writer, walk, hash, spark, fixed } from './_kit.js';

export default {
  id: 'ops-ping',
  title: 'ping',
  category: 'Network',
  description: 'ping streaming replies (with the odd late or lost packet), a latency sparkline of recent RTTs and the running rtt min/avg/max/mdev line.',
  tags: ['ping', 'icmp', 'latency', 'rtt', 'network', 'sparkline'],
  kind: 'tui',
  size: { w: 78, h: 14 },
  minSize: { w: 46, h: 5 },
  loop: 30,
  glyphs: 'ascii',
  color: '16',
  setup(ctx) {
    const w = writer(ctx), c = C(ctx);
    const W = ctx.width, H = ctx.height;
    const rtt = (k) => {
      if (hash(k, 7) > 0.975) return null; // lost
      const base = 22 + walk(ctx, 1, k, 0.05) * 6;
      const spike = hash(k, 3) > 0.93 ? 30 + hash(k, 4) * 60 : 0;
      return base + hash(k, 5) * 2.4 + spike;
    };
    return (t) => {
      const n = Math.floor(t) + 1;
      w.put(0, 0, 'PING api.example (192.0.2.80) 56(84) bytes of data.', c.fg, undefined, ATTR.BOLD);
      const footer = H >= 8 ? 3 : 0;
      const rows = Math.max(0, H - 1 - footer);
      for (let i = 0; i < rows; i++) {
        const seq = n - rows + i + 1;
        if (seq < 1) continue;
        const r = rtt(seq), y = 1 + i;
        if (r === null) { w.put(0, y, `no answer yet for icmp_seq=${seq}`, c.red); continue; }
        w.seg(0, y, [['64 bytes from ', c.fg], ['api.example (192.0.2.80)', c.cyan], [`: icmp_seq=${seq} ttl=56 time=`, c.fg], [`${fixed(r, r >= 100 ? 0 : 1)} ms`, r > 50 ? c.yellow : c.green, r > 50 ? ATTR.BOLD : 0]]);
      }
      if (!footer) return;
      const hist = [];
      for (let k = Math.max(1, n - (W - 12) + 1); k <= n; k++) hist.push(rtt(k));
      const ok = hist.filter((x) => x !== null);
      const min = Math.min(...ok), max = Math.max(...ok), avg = ok.reduce((a, b) => a + b, 0) / ok.length;
      const mdev = Math.sqrt(ok.reduce((a, b) => a + (b - avg) ** 2, 0) / ok.length);
      let lostN = 0;
      for (let k = 1; k <= n; k++) if (rtt(k) === null) lostN++; // over the whole run, so the totals add up
      w.put(0, H - 3, 'rtt ', c.muted);
      spark(w, ctx, 4, H - 3, hist.map((x) => (x === null ? 1 : Math.min(1, (x - 15) / 70))), c.cyan);
      hist.forEach((x, i) => { if (x === null) w.put(4 + i, H - 3, '!', c.red, undefined, ATTR.BOLD); });
      w.put(0, H - 2, `${n} packets transmitted, ${n - lostN} received, ${fixed(lostN / n * 100, 0)}% packet loss, time ${n * 1001}ms`, c.fg);
      w.put(0, H - 1, `rtt min/avg/max/mdev = ${fixed(min, 3)}/${fixed(avg, 3)}/${fixed(max, 3)}/${fixed(mdev, 3)} ms`, c.fg, undefined, ATTR.BOLD);
    };
  },
};
