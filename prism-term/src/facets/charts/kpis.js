// KPI Tiles: a tile row with sparklines and deltas, a big-number tile in a
// bitmap font, and a compact NOC wallboard.
import { mix } from '../../color.js';
import { kpi, lineChart } from '../../widgets/index.js';
import { drawBanner, measureBanner } from '../../text/index.js';
import { signal, glyphs, safe, frame, put, putR, num, clamp, memo, ATTR } from './_data.js';

const kpiRow = {
  id: 'charts-kpi-row',
  title: 'KPI Tile Row',
  category: 'KPI Tiles',
  description: 'Four boxed KPI tiles — throughput, latency, errors, saturation — each with a value, a colored delta and a trend sparkline.',
  tags: ['kpi', 'tiles', 'dashboard', 'delta', 'sparkline'],
  kind: 'chart',
  size: { w: 80, h: 5 },
  minSize: { w: 22, h: 4 },
  loop: 12,
  order: 10,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const defs = [
      { label: 'throughput', unit: 'rps', s: signal(ctx, { seed: 101, base: 2400, amp: 500, rate: 3, min: 200 }), color: 'info', goodWhen: 'up', f: (v) => num(v, 0) },
      { label: 'p95 latency', unit: 'ms', s: signal(ctx, { seed: 102, base: 230, amp: 60, spike: 160, rate: 3, min: 40 }), color: 'accent', goodWhen: 'down', f: (v) => num(v, 0) },
      { label: 'error rate', unit: '%', s: signal(ctx, { seed: 103, base: 0.4, amp: 0.3, spike: 1.6, rate: 3, min: 0 }), color: 'neg', goodWhen: 'down', f: (v) => v.toFixed(2) },
      { label: 'saturation', unit: '%', s: signal(ctx, { seed: 104, base: 62, amp: 14, rate: 3, min: 5, max: 99 }), color: 'warn', goodWhen: 'down', f: (v) => num(v, 0) },
    ];
    const n = Math.max(1, Math.min(defs.length, Math.floor(W / 20)));
    const tw = Math.floor(W / n);
    return (t) => {
      for (let i = 0; i < n; i++) {
        const d = defs[i], v = d.s.now(t), past = d.s.now(t - 10);
        kpi(b, i * tw, 0, (i === n - 1 ? W - i * tw : tw - 1), H, { label: d.label, value: d.f(v), unit: d.unit, delta: ((v - past) / (past || 1)) * 100, goodWhen: d.goodWhen, trend: d.s.window(t, 40), color: d.color, theme: th });
      }
    };
  },
};

const bigNumber = {
  id: 'charts-big-number',
  title: 'Big Number Tile',
  category: 'KPI Tiles',
  description: 'The wallboard hero tile: one metric in a bold bitmap font, its trend arrow and delta, and a sparkline underneath.',
  tags: ['big number', 'hero metric', 'bitmap font', 'kpi', 'wallboard'],
  kind: 'chart',
  size: { w: 56, h: 10 },
  minSize: { w: 24, h: 5 },
  loop: 12,
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const s = signal(ctx, { seed: 111, base: 12400, amp: 1600, rate: 1.2, min: 4000 });
    const mode = ctx.caps.unicode === false ? 'ascii' : 'half';
    return (t) => {
      const v = s.now(t), past = s.now(t - 15);
      const txt = Math.round(v).toLocaleString('en-US');
      b.text(0, 0, 'ORDERS / MIN', th.muted, undefined, ATTR.BOLD);
      const fonts = ['bold', 'standard', 'tiny'];
      let font = fonts.find((f) => { const m = measureBanner(txt, { font: f, mode }); return m.width <= W && m.height <= H - 3; }) || null;
      let y = 1;
      if (font) {
        const m = drawBanner(b, 0, 1, txt, { font, mode, fill: 'theme', theme: th, t, speed: 0.05 });
        y = 1 + m.height;
      } else { b.text(0, 1, txt, th.ink, undefined, ATTR.BOLD); y = 2; }
      const d = ((v - past) / past) * 100;
      const up = d >= 0;
      if (y < H) b.text(0, y, `${up ? g.up : g.down} ${Math.abs(d).toFixed(1)}% vs 15 s ago`, up ? th.pos : th.neg, undefined, ATTR.BOLD);
      if (y + 1 < H) {
        const data = s.window(t, W);
        const lo = Math.min(...data), hi = Math.max(...data);
        const bl = g.u ? '▁▂▃▄▅▆▇█' : '.:-=+*#@';
        for (let i = 0; i < W; i++) b.set(i, y + 1, bl[Math.round(((data[i] - lo) / (hi - lo || 1)) * 7)], mix(th.dim, th.accent, i / W));
      }
    };
  },
};

const wallboard = {
  id: 'charts-noc-wallboard',
  title: 'NOC Wallboard',
  category: 'KPI Tiles',
  description: 'A compact operations wallboard: headline KPIs, a latency chart and the top error sources, laid out to fill any screen.',
  tags: ['wallboard', 'noc', 'dashboard', 'kpi', 'errors'],
  kind: 'chart',
  size: { w: 80, h: 24 },
  minSize: { w: 44, h: 12 },
  loop: 14,
  glyphs: 'braille',
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const rps = signal(ctx, { seed: 121, base: 5200, amp: 900, rate: 3, min: 500 });
    const p95 = signal(ctx, { seed: 122, base: 210, amp: 50, spike: 200, rate: 3, min: 40 });
    const err = signal(ctx, { seed: 123, base: 0.35, amp: 0.25, spike: 1.4, rate: 3, min: 0 });
    const srcs = ['POST /checkout 503', 'GET /search 504', 'auth: token expired', 'payments: TLS reset', 'cart: pool timeout', 'GET /catalog 500'];
    const counts = srcs.map((_, i) => signal(ctx, { seed: 130 + i, base: 120 - i * 16, amp: 30, rate: 1, min: 1 }));
    const chart = memo();
    return (t) => {
      const tileH = 5, n = 3, tw = Math.floor(W / n);
      const defs = [
        ['requests', num(rps.now(t), 1), 'rps', rps, 'info', 'up'],
        ['p95 latency', num(p95.now(t), 0), 'ms', p95, 'accent', 'down'],
        ['errors', err.now(t).toFixed(2), '%', err, 'neg', 'down'],
      ];
      defs.forEach(([label, value, unit, s, color, goodWhen], i) => kpi(b, i * tw, 0, i === n - 1 ? W - i * tw : tw - 1, tileH, { label, value, unit, delta: ((s.now(t) - s.now(t - 10)) / (s.now(t - 10) || 1)) * 100, goodWhen, trend: s.window(t, 40), color, theme: th }));
      const restH = H - tileH;
      const listW = W >= 70 ? Math.floor(W * 0.36) : 0;
      const chartW = W - listW - (listW ? 1 : 0);
      const inner = frame(b, 0, tileH, chartW, restH, th.line, g, 'p95 latency · ms', th.ink);
      chart(b, inner.x, inner.y, inner.w, inner.h, Math.floor(t * 3), (buf) => lineChart(buf, 0, 0, buf.width, buf.height, [{ data: p95.window(t, inner.w * 2), color: th.accent, label: 'p95' }], { theme: th, min: 0, grid: true, legend: false }));
      if (listW) {
        const li = frame(b, chartW + 1, tileH, listW, restH, th.line, g, 'top errors · 5 min', th.ink);
        const rows = srcs.map((s, i) => ({ s, c: counts[i].now(t) })).sort((a, b2) => b2.c - a.c);
        const max = rows[0].c;
        rows.slice(0, Math.floor(li.h / 2)).forEach((r, i) => {
          const y = li.y + i * 2;
          put(b, li.x, y, r.s, li.w - 6, th.ink);
          putR(b, li.x + li.w, y, num(r.c, 0), th.neg, undefined, ATTR.BOLD);
          const bw = Math.round((r.c / max) * li.w);
          for (let k = 0; k < bw; k++) b.set(li.x + k, y + 1, g.u ? '▔' : '-', mix(th.bg, th.neg, 0.75 - i * 0.08));
        });
      }
    };
  },
};

export default [kpiRow, bigNumber, wallboard];
