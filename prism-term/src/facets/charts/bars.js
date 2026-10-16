// Bars & Histograms: eased vertical bars, a re-ranking leaderboard, stacked
// segments, a live latency histogram, OHLC candlesticks and box plots.
import { mix, scale } from '../../color.js';
import { signal, glyphs, safe, vbar, hbar, put, putR, num, clamp, smooth, lift, onFill, ATTR } from './_data.js';

/** Eased step between sample values: holds, then glides to the next target. */
function stepped(s, t, period) {
  const k = Math.floor(t / period), f = smooth(clamp((t / period - k) / 0.35, 0, 1));
  return s.at(k - 1) + (s.at(k) - s.at(k - 1)) * f;
}

const barsVertical = {
  id: 'charts-bars-vertical',
  title: 'Eased Column Chart',
  category: 'Bars & Histograms',
  description: 'Columns that glide to new values with eighth-block precision, value labels riding on top and a labeled baseline.',
  tags: ['bar chart', 'columns', 'eighth blocks', 'animated', 'hourly'],
  kind: 'chart',
  size: { w: 56, h: 12 },
  minSize: { w: 20, h: 5 },
  loop: 12,
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const labels = ['00', '03', '06', '09', '12', '15', '18', '21'];
    const n = Math.max(3, Math.min(labels.length, Math.floor((W + 1) / 4)));
    const streams = labels.slice(0, n).map((_, i) => signal(ctx, { seed: 90 + i, base: 55 + 25 * Math.sin(i * 0.8), amp: 22, min: 4, max: 100, rate: 1 }));
    const bw = Math.max(1, Math.floor((W - (n - 1)) / n) - 1);
    const gap = Math.floor((W - n * bw) / Math.max(1, n));
    const plotH = H - 2;
    return (t) => {
      const base = H - 2;
      for (let x = 0; x < W; x++) b.set(x, base + 1, g.h, th.line);
      streams.forEach((s, i) => {
        const v = stepped(s, t + i * 0.12, 2);
        const x0 = i * (bw + gap) + Math.floor(gap / 2);
        const hgt = (v / 100) * Math.max(1, plotH - 1);
        const c = mix(th.accent, th.crit, v / 100);
        for (let dx = 0; dx < bw; dx++) vbar(b, x0 + dx, base, hgt, dx === 0 && bw > 2 ? lift(th, c, 0.2) : c, g);
        const label = String(Math.round(v));
        const ly = Math.max(0, base - Math.ceil(hgt));
        if (bw >= label.length) b.text(x0 + Math.floor((bw - label.length) / 2), ly, label, th.ink, undefined, ATTR.BOLD);
        put(b, x0 + Math.floor((bw - 2) / 2), H - 1, labels[i], Math.max(2, bw), th.dim);
      });
    };
  },
};

const TEAMS = ['payments', 'search', 'checkout', 'catalog', 'auth', 'notify', 'cart', 'orders'];

const leaderboard = {
  id: 'charts-bars-leaderboard',
  title: 'Live Leaderboard',
  category: 'Bars & Histograms',
  description: 'Horizontal bars ranked by throughput that re-sort as values change, with rank numbers and movement arrows.',
  tags: ['leaderboard', 'ranking', 'horizontal bars', 'sorting', 'top n'],
  kind: 'chart',
  size: { w: 56, h: 10 },
  minSize: { w: 24, h: 3 },
  loop: 16,
  color: '256',
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const streams = TEAMS.map((name, i) => ({ name, s: signal(ctx, { seed: 110 + i, base: 600 - i * 45, amp: 180, rate: 0.8, min: 20 }) }));
    const rows = Math.min(TEAMS.length, H);
    return (t) => {
      const now = streams.map((st) => ({ ...st, v: st.s.now(t), past: st.s.now(t - 3) }));
      const rankPast = [...now].sort((a, b2) => b2.past - a.past).map((x) => x.name);
      now.sort((a, b2) => b2.v - a.v);
      const max = now[0].v;
      const nameW = W >= 36 ? 10 : 0, valW = 7;
      const barW = Math.max(2, W - 4 - nameW - valW);
      now.slice(0, rows).forEach((st, i) => {
        const y = i;
        const moved = rankPast.indexOf(st.name) - i;
        b.text(0, y, String(i + 1).padStart(2), i === 0 ? th.warn : th.dim, undefined, i === 0 ? ATTR.BOLD : 0);
        b.set(2, y, moved > 0 ? g.up : moved < 0 ? g.down : ' ', moved > 0 ? th.pos : th.neg);
        if (nameW) put(b, 4, y, st.name, nameW - 1, th.ink);
        const len = (st.v / max) * barW;
        hbar(b, 4 + nameW, y, len, mix(th.pos, th.accent, i / rows), g);
        putR(b, W, y, num(st.v, 0), th.muted);
      });
    };
  },
};

const stacked = {
  id: 'charts-bars-stacked',
  title: 'Stacked Status Codes',
  category: 'Bars & Histograms',
  description: 'Per-region request mix as stacked horizontal segments — 2xx, 3xx, 4xx, 5xx — with a legend and live totals.',
  tags: ['stacked bars', 'http status', 'segments', 'regions', 'composition'],
  kind: 'chart',
  size: { w: 60, h: 9 },
  minSize: { w: 24, h: 3 },
  loop: 12,
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1', 'sa-east-1', 'ca-central'];
    const codes = [['2xx', th.pos], ['3xx', th.info], ['4xx', th.warn], ['5xx', th.neg]];
    const streams = regions.map((r, i) => codes.map(([, ], k) => signal(ctx, { seed: 130 + i * 4 + k, base: [80, 8, 6, 1.5][k], amp: [6, 3, 3, i === 2 ? 4 : 1][k], rate: 1.5, min: 0.2 })));
    const legend = H >= 4 ? 1 : 0;
    const rows = Math.min(regions.length, H - legend);
    const nameW = W >= 40 ? 11 : 0, totW = W >= 30 ? 7 : 0;
    const barW = Math.max(4, W - nameW - totW - 1);
    return (t) => {
      if (legend) {
        let x = 0;
        for (const [n, c] of codes) { b.set(x, 0, '■', c); x = b.text(x + 2, 0, n, th.muted) + 2; }
      }
      for (let r = 0; r < rows; r++) {
        const y = r + legend;
        const parts = streams[r].map((s) => s.now(t));
        const total = parts.reduce((a, v) => a + v, 0);
        if (nameW) put(b, 0, y, regions[r], nameW - 1, th.ink);
        let x = nameW, acc = 0;
        parts.forEach((p, k) => {
          const from = Math.round((acc / total) * barW); acc += p;
          const to = Math.round((acc / total) * barW);
          for (let i = from; i < to; i++) b.set(x + i, y, g.u ? '█' : '#', codes[k][1]);
        });
        if (totW) putR(b, W, y, `${((parts[3] / total) * 100).toFixed(1)}%`, parts[3] / total > 0.03 ? th.neg : th.dim);
      }
    };
  },
};

const histogram = {
  id: 'charts-histogram-live',
  title: 'Live Latency Histogram',
  category: 'Bars & Histograms',
  description: 'A latency distribution that reshapes every second, with p50, p95 and p99 marker lines and a long tail you can watch grow.',
  tags: ['histogram', 'distribution', 'percentiles', 'latency', 'tail'],
  kind: 'chart',
  size: { w: 64, h: 14 },
  minSize: { w: 24, h: 6 },
  loop: 14,
  order: 40,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const tail = signal(ctx, { seed: 150, base: 0.4, amp: 0.4, rate: 0.5, min: 0, max: 1 });
    const n = Math.max(8, W);
    return (t) => {
      const tailK = tail.now(t);
      const bins = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        const x = i / n;
        bins[i] = Math.exp(-(((x - 0.22) / 0.09) ** 2)) + (0.12 + 0.25 * tailK) * Math.exp(-(((x - 0.6) / (0.15 + 0.1 * tailK)) ** 2)) + 0.05 * ctx.noise.noise2(i * 0.6, Math.floor(t)) ** 2;
      }
      const max = Math.max(...bins);
      const plotH = H - 2;
      const total = bins.reduce((a, v) => a + v, 0);
      const pct = (q) => { let acc = 0; for (let i = 0; i < n; i++) { acc += bins[i]; if (acc >= q * total) return i; } return n - 1; };
      const marks = [[0.5, 'p50', th.pos], [0.95, 'p95', th.warn], [0.99, 'p99', th.neg]].map(([q, l, c]) => ({ x: pct(q), l, c }));
      for (let i = 0; i < n && i < W; i++) {
        const c = i >= marks[2].x ? th.neg : i >= marks[1].x ? th.warn : th.accent;
        vbar(b, i, H - 2, (bins[i] / max) * plotH, c, g);
      }
      for (const m of marks) {
        for (let y = 1; y < H - 1; y++) if (b.get(m.x, y)?.ch === ' ') b.set(m.x, y, g.v === '|' ? ':' : '┊', m.c);
        if (W >= 30) b.text(Math.min(W - 3, m.x), 0, m.l, m.c, undefined, ATTR.BOLD);
      }
      for (let x = 0; x < W; x++) b.set(x, H - 1, g.h, th.line);
      if (W >= 40) { b.text(0, H - 1, '0 ms', th.dim); putR(b, W, H - 1, '2 s', th.dim); }
    };
  },
};

const candles = {
  id: 'charts-candles',
  title: 'Candlesticks',
  category: 'Bars & Histograms',
  description: 'OHLC candlesticks at half-cell precision with wicks, green and red bodies, a volume strip and a right-hand price scale.',
  tags: ['candlestick', 'ohlc', 'finance', 'trading', 'volume'],
  kind: 'chart',
  size: { w: 72, h: 16 },
  minSize: { w: 28, h: 7 },
  loop: 20,
  canvas: 'field',
  order: 50,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const price = signal(ctx, { seed: 170, base: 142, amp: 9, rate: 4, trend: 0.004 });
    const volH = H >= 10 ? 2 : 0, axisW = W >= 40 ? 8 : 0;
    const cv = ctx.canvas('field', { cols: W - axisW, rows: H - volH });
    const cw = 3; // pixels per candle (body 2 + gap 1)
    return (t) => {
      const per = 4; // samples per candle
      const nC = Math.floor(cv.width / cw);
      const k0 = Math.floor(t * 1.2) - nC + 1;
      const cs = [];
      for (let i = 0; i < nC; i++) {
        const ks = [0, 1, 2, 3].map((j) => price.at((k0 + i) * per + j));
        const body = Math.max(0.4, Math.abs(ks[3] - ks[0]));
        const wickUp = body * (0.35 + 1.6 * Math.abs(ctx.noise.noise2((k0 + i) * 0.37, 3.3)));
        const wickDn = body * (0.35 + 1.6 * Math.abs(ctx.noise.noise2((k0 + i) * 0.37, 7.7)));
        cs.push({ o: ks[0], c: ks[3], h: Math.max(...ks) + wickUp, l: Math.min(...ks) - wickDn, v: 0.4 + body });
      }
      const hi = Math.max(...cs.map((c) => c.h)), lo = Math.min(...cs.map((c) => c.l));
      const Y = (p) => (cv.height - 1) * (1 - (p - lo) / (hi - lo || 1));
      cv.clear();
      cs.forEach((c, i) => {
        const x = i * cw, up = c.c >= c.o, col = up ? th.pos : th.neg;
        cv.line(x + 1, Y(c.h), x + 1, Y(c.l), scale(col, 0.75));
        const y0 = Math.min(Y(c.o), Y(c.c)), y1 = Math.max(Y(c.o), Y(c.c));
        cv.rect(x, y0, 2, Math.max(1, y1 - y0 + 1), col, true);
      });
      cv.paint(b, 0, 0);
      if (volH) {
        const vmax = Math.max(...cs.map((c) => c.v));
        cs.forEach((c, i) => {
          const hgt = (c.v / vmax) * volH;
          const col = mix(th.bg, c.c >= c.o ? th.pos : th.neg, 0.55);
          const cx = Math.floor((i * cw) / 1);
          for (let dx = 0; dx < 2; dx++) for (let k = 0; k < Math.ceil(hgt); k++) b.set(cx + dx, H - 1 - k, k + 1 <= hgt ? '█' : '▄', col);
        });
      }
      if (axisW) {
        for (const p of [hi, (hi + lo) / 2, lo]) b.text(W - axisW + 1, Math.round(((H - volH - 1) * (hi - p)) / (hi - lo || 1)), p.toFixed(2), th.dim);
        const last = cs[cs.length - 1].c;
        const row = Math.round(((H - volH - 1) * (hi - last)) / (hi - lo || 1));
        b.text(W - axisW, row, ` ${last.toFixed(2)}`, th.bg, last >= cs[cs.length - 1].o ? th.pos : th.neg, ATTR.BOLD);
      }
    };
  },
};

const boxplot = {
  id: 'charts-boxplot',
  title: 'Box Plots',
  category: 'Bars & Histograms',
  description: 'Response-time box plots per service: whiskers, interquartile box, median tick and outlier dots on a shared scale.',
  tags: ['box plot', 'quartiles', 'statistics', 'outliers', 'distribution'],
  kind: 'chart',
  size: { w: 60, h: 11 },
  minSize: { w: 28, h: 3 },
  loop: 14,
  order: 60,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const svcs = ['search', 'checkout', 'catalog', 'auth', 'cart'];
    const st = svcs.map((s, i) => ({ s, med: signal(ctx, { seed: 190 + i, base: 120 + i * 40, amp: 25, rate: 0.6, min: 30 }), iqr: signal(ctx, { seed: 200 + i, base: 60 + i * 10, amp: 15, rate: 0.6, min: 15 }) }));
    const scaleRow = H >= 4 ? 1 : 0;
    const rows = Math.min(svcs.length, Math.floor((H - scaleRow) / (H >= 9 ? 2 : 1)));
    const step = H >= 9 ? 2 : 1;
    const nameW = 10, plotW = Math.max(10, W - nameW);
    const MAX = 600;
    const X = (v) => nameW + Math.round(clamp(v / MAX, 0, 1) * (plotW - 1));
    return (t) => {
      for (let r = 0; r < rows; r++) {
        const y = r * step;
        const m = st[r].med.now(t), q = st[r].iqr.now(t);
        const q1 = m - q * 0.45, q3 = m + q * 0.55, lo = Math.max(5, q1 - q * 1.2), hi = q3 + q * 1.6;
        put(b, 0, y, svcs[r], nameW - 1, th.ink);
        for (let x = X(lo); x <= X(hi); x++) b.set(x, y, g.h, th.muted);
        b.set(X(lo), y, g.u ? '├' : '|', th.muted); b.set(X(hi), y, g.u ? '┤' : '|', th.muted);
        for (let x = X(q1); x <= X(q3); x++) b.set(x, y, g.u ? '█' : '#', mix(th.bg, th.accent, 0.7));
        b.set(X(m), y, g.u ? '┃' : '|', onFill(th, mix(th.bg, th.accent, 0.7)), mix(th.bg, th.accent, 0.7), ATTR.BOLD);
        for (let o = 0; o < 2; o++) {
          const ov = hi + q * (0.6 + o * 0.9 + 0.3 * Math.sin(t + r + o));
          if (ov < MAX) b.set(X(ov), y, g.u ? '•' : 'o', th.warn);
        }
      }
      if (scaleRow) {
        for (let x = nameW; x < W; x++) b.set(x, H - 1, g.h, th.line);
        for (const v of [0, 200, 400, 600]) { const x = X(v); b.set(x, H - 1, g.tick, th.line); if (plotW > 30) b.text(Math.min(W - 3, x + 1), H - 1, String(v), th.dim); }
      }
    };
  },
};

export default [barsVertical, leaderboard, stacked, histogram, candles, boxplot];
