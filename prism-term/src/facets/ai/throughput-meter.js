// An inference throughput panel: concurrent streams with progress and
// per-stream rates, an aggregate tok/s sparkline, TTFT, cache hits and cost.
import { ATTR, glyphs, uni, phase, fit, hbar, panel, mix } from './_ai.js';

// [id, output tokens, start, tok/s, ttft ms]
const REQS = [['7f3a', 900, 0.0, 54, 280], ['2c91', 700, 0.8, 61, 340], ['9be0', 480, -4.0, 48, 310], ['d41e', 620, 3.2, 66, 260]];
const LOOP = 10;

export default {
  id: 'ai-throughput-meter',
  title: 'Throughput Meter',
  category: 'Token Streams',
  description: 'An inference panel with concurrent streams, per-stream progress and tok/s, an aggregate throughput sparkline, TTFT, cache hit rate and a running cost.',
  tags: ['throughput', 'tok/s', 'inference', 'dashboard', 'latency'],
  kind: 'widget',
  size: { w: 70, h: 8 },
  minSize: { w: 50, h: 8 },
  loop: LOOP,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme;
    return (t) => {
      const b = ctx.buffer, W = ctx.width, H = ctx.height, g = glyphs(ctx), u = uni(ctx);
      const p = phase(t, LOOP);
      const state = (r, at) => {
        const [, total, start, rate, ttft] = r;
        const el = at - start - ttft / 1000;
        if (at < start) return { s: 'queued', n: 0 };
        if (el < 0) return { s: 'ttft', n: 0 };
        const n = Math.min(total, Math.floor(el * rate * (1 + 0.15 * Math.sin(el * 3))));
        return { s: n >= total ? 'done' : 'stream', n };
      };
      const aggregate = (at) => REQS.reduce((sum, r) => sum + (state(r, at).s === 'stream' ? r[3] : 0), 0);
      const inner = panel(ctx, b, 0, 0, W, H, { title: `reasoning-large ${g.mid} ${REQS.filter((r) => state(r, p).s === 'stream').length} streaming`, footer: `$${(0.0112 + p * 0.0031).toFixed(4)}`, color: th.line });
      const iw = inner.width;
      REQS.forEach((r, i) => {
        const [id, total, , rate, ttft] = r;
        const st = state(r, p);
        const y = i;
        if (y >= inner.height - 2) return;
        inner.text(0, y, `req ${id}`, st.s === 'done' ? th.dim : th.ink, undefined, st.s === 'stream' ? ATTR.BOLD : 0);
        const bw = Math.max(6, iw - 40);
        hbar(ctx, inner, 9, y, bw, st.n / total, st.s === 'done' ? th.pos : th.accent);
        let x = 10 + bw;
        x = inner.text(x, y, `${String(st.n).padStart(3)}/${total}`, th.muted) + 2;
        const tail = st.s === 'done' ? `${g.check} done` : st.s === 'ttft' ? `waiting ${ttft}ms` : st.s === 'queued' ? 'queued' : `${rate} t/s  ttft ${ttft}ms`;
        inner.text(x, y, fit(tail, Math.max(0, iw - x), undefined, ctx).trimEnd(), st.s === 'done' ? th.pos : st.s === 'stream' ? th.ink : th.dim);
      });
      // Aggregate throughput sparkline (last ~5 s).
      const sy = inner.height - 2;
      const LV = u ? ' ▁▂▃▄▅▆▇█' : ' .:-=+*#%';
      inner.text(0, sy, 'throughput', th.muted);
      const sw = Math.max(8, iw - 26);
      for (let i = 0; i < sw; i++) {
        const v = aggregate(p - (sw - 1 - i) * 0.2) / 200;
        inner.set(11 + i, sy, LV[Math.max(1, Math.min(8, Math.round(v * 8)))], mix(th.info, th.accent, v));
      }
      inner.text(12 + sw, sy, `${String(aggregate(p)).padStart(3)} tok/s`, th.ink, undefined, ATTR.BOLD);
      inner.text(0, sy + 1, fit(`cache hits 62% ${g.mid} input 18.2k ${g.mid} output ${(1.1 + p * 0.09).toFixed(1)}k ${g.mid} p95 ttft 340ms`, iw, undefined, ctx), th.dim);
    };
  },
};
