// Line & Area: braille line charts, dithered areas, smooth streaming, btop-style
// graphs, stacked areas, and x/y plots (scatter, bubble).
import { mix, scale, gradient } from '../../color.js';
import { lineChart } from '../../widgets/index.js';
import { signal, glyphs, safe, put, putR, num, clamp, frame, memo, lift, onFill, ATTR } from './_data.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/** Y-axis labels on the left of a plot area; returns the label column width. */
function yAxis(b, x, y, h, lo, hi, color, fmt = (v) => num(v, 0)) {
  const labels = [hi, (hi + lo) / 2, lo].map(fmt);
  const w = Math.max(...labels.map((l) => l.length)) + 1;
  if (h >= 3) {
    b.text(x + w - 1 - labels[0].length, y, labels[0], color);
    b.text(x + w - 1 - labels[1].length, y + Math.floor((h - 1) / 2), labels[1], color);
    b.text(x + w - 1 - labels[2].length, y + h - 1, labels[2], color);
  }
  return w;
}

const lineMulti = {
  id: 'charts-line-multi',
  title: 'Latency Percentiles',
  category: 'Line & Area',
  description: 'p50, p95 and p99 as a braille multi-series line chart with y-axis ticks, gridlines, time labels and a legend.',
  tags: ['line chart', 'latency', 'percentiles', 'braille', 'legend'],
  kind: 'chart',
  size: { w: 72, h: 16 },
  minSize: { w: 24, h: 6 },
  loop: 12,
  glyphs: 'braille',
  order: 10,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const p50 = signal(ctx, { seed: 31, base: 110, amp: 18, rate: 4, min: 40 });
    const p95 = signal(ctx, { seed: 32, base: 260, amp: 60, spike: 120, rate: 4, min: 90 });
    const p99 = signal(ctx, { seed: 33, base: 520, amp: 140, spike: 340, rate: 4, min: 200 });
    const title = H >= 8;
    const cached = memo();
    return (t) => {
      const n = Math.max(20, (W - 7) * 2);
      if (title) { b.text(0, 0, 'Latency', th.ink, undefined, ATTR.BOLD); b.text(8, 0, '(ms) · last 60 s', th.dim); }
      // The chart only changes when a new sample arrives (4 Hz).
      cached(b, 0, title ? 1 : 0, W, H - (title ? 1 : 0), Math.floor(t * 4), (buf) => lineChart(buf, 0, 0, buf.width, buf.height, [
        { data: p50.window(t, n), label: 'p50', color: th.pos },
        { data: p95.window(t, n), label: 'p95', color: th.warn },
        { data: p99.window(t, n), label: 'p99', color: th.neg },
      ], { theme: th, min: 0, grid: H >= 10, labels: W >= 40 ? ['-60s', '-30s', 'now'] : undefined, legend: H >= 8 }));
    };
  },
};

const areaDither = {
  id: 'charts-area-dither',
  title: 'Dithered Area',
  category: 'Line & Area',
  description: 'An area chart whose fill fades toward the baseline with ordered dithering — a bright crest line over a halftone body.',
  tags: ['area chart', 'dither', 'halftone', 'braille', 'throughput'],
  kind: 'chart',
  size: { w: 64, h: 12 },
  minSize: { w: 20, h: 4 },
  loop: 12,
  glyphs: 'braille',
  canvas: 'line',
  order: 20,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const s = signal(ctx, { seed: 41, base: 620, amp: 220, rate: 5, min: 50 });
    const head = H >= 5 ? 1 : 0;
    const cv = ctx.canvas('line', { cols: W, rows: H - head, threshold: 0 });
    const ramp = gradient([th.info, th.accent, th.crit]);
    // Shade table per column (8 depth levels) so the inner loop is a lookup.
    const shades = Array.from({ length: cv.width }, (_, x) => Array.from({ length: 8 }, (_, d) => scale(ramp(x / cv.width), 0.55 + 0.45 * (1 - d / 7))));
    const crest = Array.from({ length: cv.width }, (_, x) => lift(th, ramp(x / cv.width), 0.35));
    return (t) => {
      const n = cv.width, data = s.window(t, n);
      const lo = 0, hi = Math.max(...data) * 1.15;
      cv.clear();
      for (let x = 0; x < n; x++) {
        const top = (cv.height - 1) * (1 - (data[x] - lo) / (hi - lo));
        const span = Math.max(1, cv.height - top), sh = shades[x];
        for (let y = Math.ceil(top); y < cv.height; y++) {
          const depth = (y - top) / span;
          const density = 0.85 * (1 - depth) * (1 - depth * 0.3);
          if (BAYER[(y & 3) * 4 + (x & 3)] < density) cv.set(x, y, sh[(depth * 7) | 0]);
        }
        cv.set(x, top, crest[x]);
      }
      cv.paint(b, 0, head);
      if (head) {
        b.text(0, 0, 'egress', th.muted);
        putR(b, W, 0, `${num(s.now(t), 0)} Mb/s`, th.accent, undefined, ATTR.BOLD);
      }
    };
  },
};

const streamScroll = {
  id: 'charts-stream-scroll',
  title: 'Smooth Streaming Line',
  category: 'Line & Area',
  description: 'A live line that scrolls a sub-sample at a time with dotted gridlines, axis labels and a pinned current-value tag.',
  tags: ['streaming', 'line chart', 'realtime', 'scroll', 'grid'],
  kind: 'chart',
  size: { w: 70, h: 14 },
  minSize: { w: 24, h: 5 },
  loop: 10,
  glyphs: 'braille',
  canvas: 'line',
  order: 30,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const RATE = 6;
    const s = signal(ctx, { seed: 51, base: 48, amp: 22, spike: 25, rate: RATE, min: 0, max: 100 });
    const axisW = W >= 30 ? 5 : 0;
    const cv = ctx.canvas('line', { cols: W - axisW, rows: H, threshold: 0 });
    return (t) => {
      const px = cv.width, py = cv.height;
      const spp = 1.5; // samples per pixel column
      const x0 = t * RATE;
      const val = (i) => { const k = x0 - (px - 1 - i) / spp; const k0 = Math.floor(k); return s.at(k0) + (s.at(k0 + 1) - s.at(k0)) * (k - k0); };
      const Y = (v) => (py - 1) * (1 - v / 100);
      cv.clear();
      for (const g of [25, 50, 75]) for (let x = (Math.floor(x0 * spp) % 4 + 4) % 4; x < px; x += 4) cv.set(px - 1 - x, Math.round(Y(g)), mix(th.bg, th.line, 0.9));
      let prev = Y(val(0));
      for (let i = 1; i < px; i++) {
        const y = Y(val(i));
        cv.line(i - 1, prev, i, y, mix(th.mode === 'light' ? mix(th.bg, th.accent, 0.6) : scale(th.accent, 0.75), lift(th, th.accent, 0.25), i / px));
        prev = y;
      }
      cv.paint(b, axisW, 0);
      if (axisW) for (const g of [100, 50, 0]) b.text(0, Math.round(((H - 1) * (100 - g)) / 100), String(g).padStart(3) + '%', th.dim);
      const v = val(px - 1), tag = ` ${v.toFixed(1)}% `;
      const row = clamp(Math.round(((H - 1) * (100 - v)) / 100), 0, H - 1);
      b.text(W - tag.length, row, tag, th.bg, th.accent, ATTR.BOLD);
    };
  },
};

const btopCpu = {
  id: 'charts-btop-cpu',
  title: 'btop-style CPU',
  category: 'Line & Area',
  description: 'A btop-inspired CPU panel: filled braille history colored by height, per-core bars with percentages, and load averages.',
  tags: ['btop', 'cpu', 'cores', 'system monitor', 'braille'],
  kind: 'chart',
  size: { w: 80, h: 16 },
  minSize: { w: 34, h: 7 },
  loop: 12,
  glyphs: 'braille',
  canvas: 'line',
  order: 40,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const total = signal(ctx, { seed: 61, base: 42, amp: 20, spike: 30, rate: 5, min: 2, max: 100 });
    const cores = Array.from({ length: 8 }, (_, i) => signal(ctx, { seed: 70 + i, base: 30 + (i * 13) % 35, amp: 26, spike: i === 2 ? 40 : 0, rate: 5, min: 1, max: 100 }));
    const heat = gradient([th.pos, th.warn, th.neg]);
    const coreW = W >= 56 ? 24 : 0;
    const inner = frame(b, 0, 0, W, H, th.line, g, 'cpu', th.accent);
    const gw = inner.w - coreW - (coreW ? 1 : 0);
    const cv = ctx.canvas('line', { cols: Math.max(4, gw), rows: Math.max(1, inner.h - 1), threshold: 0 });
    return (t) => {
      frame(b, 0, 0, W, H, th.line, g, 'cpu', th.accent);
      const n = cv.width, data = total.window(t, n);
      cv.clear();
      for (let x = 0; x < n; x++) {
        const top = Math.round((cv.height - 1) * (1 - data[x] / 100));
        for (let y = top; y < cv.height; y++) cv.set(x, y, heat(1 - y / Math.max(1, cv.height - 1)));
      }
      cv.paint(b, inner.x, inner.y);
      const v = total.now(t);
      put(b, inner.x, inner.y + inner.h - 1, `total ${v.toFixed(0).padStart(3)}%`, gw, heat(v / 100), undefined, ATTR.BOLD);
      const la = [1, 5, 15].map((m, i) => (total.now(t - i * 3) / 100) * 8 * (1 - i * 0.08));
      if (gw >= 34) putR(b, inner.x + gw, inner.y + inner.h - 1, `load ${la.map((l) => l.toFixed(2)).join(' ')}`, th.muted);
      if (coreW) {
        const cx = inner.x + gw + 1;
        for (let y = inner.y; y < inner.y + inner.h; y++) b.set(cx - 1, y, g.v, th.line);
        const rows = Math.min(cores.length, inner.h);
        for (let i = 0; i < rows; i++) {
          const cv2 = cores[i].now(t), y = inner.y + i;
          b.text(cx, y, `c${i}`, th.dim);
          const bw = coreW - 9;
          const fill = (cv2 / 100) * bw;
          for (let k = 0; k < bw; k++) {
            const on = k < Math.floor(fill);
            b.set(cx + 3 + k, y, on ? (g.u ? '■' : '#') : (g.u ? '·' : '.'), on ? heat(k / bw) : th.line);
          }
          putR(b, cx + coreW - 1, y, `${Math.round(cv2)}%`, heat(cv2 / 100));
        }
      }
    };
  },
};

const stackedArea = {
  id: 'charts-stacked-area',
  title: 'Stacked Area',
  category: 'Line & Area',
  description: 'Traffic by region as stacked half-block areas — each layer keeps its color, the stack keeps its total.',
  tags: ['stacked area', 'regions', 'traffic', 'half blocks', 'composition'],
  kind: 'chart',
  size: { w: 64, h: 12 },
  minSize: { w: 20, h: 4 },
  loop: 14,
  canvas: 'field',
  order: 50,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const layers = [
      { name: 'us-east', c: th.accent, s: signal(ctx, { seed: 81, base: 40, amp: 10, rate: 3, min: 5 }) },
      { name: 'eu-west', c: th.pos, s: signal(ctx, { seed: 82, base: 26, amp: 8, rate: 3, min: 4 }) },
      { name: 'ap-south', c: th.crit, s: signal(ctx, { seed: 83, base: 18, amp: 9, rate: 3, min: 3 }) },
    ];
    const legend = H >= 5 ? 1 : 0;
    const cv = ctx.canvas('field', { cols: W, rows: H - legend });
    return (t) => {
      const n = cv.width;
      const series = layers.map((l) => l.s.window(t, n));
      const totals = series[0].map((_, x) => series.reduce((a, s) => a + s[x], 0));
      const hi = Math.max(...totals) * 1.1;
      cv.clear();
      for (let x = 0; x < n; x++) {
        let acc = 0;
        layers.forEach((l, k) => {
          const y1 = cv.height * (1 - acc / hi);
          acc += series[k][x];
          const y0 = cv.height * (1 - acc / hi);
          for (let y = Math.max(0, Math.floor(y0)); y < Math.min(cv.height, Math.ceil(y1)); y++) cv.set(x, y, y === Math.floor(y0) ? lift(th, l.c, 0.25) : th.mode === 'light' ? mix(th.bg, l.c, 0.7) : scale(l.c, 0.7));
        });
      }
      cv.paint(b, 0, legend);
      if (legend) {
        let x = 0;
        for (const l of layers) { b.set(x, 0, '■', l.c); x = b.text(x + 2, 0, l.name, th.muted) + 2; if (x > W - 10) break; }
        putR(b, W, 0, `${num(totals[n - 1], 0)} k rps`, th.ink, undefined, ATTR.BOLD);
      }
    };
  },
};

const scatter = {
  id: 'charts-scatter',
  title: 'Scatter & Trend',
  category: 'Line & Area',
  description: 'Latency against payload size for three services as drifting braille clusters, with a least-squares trend line.',
  tags: ['scatter', 'regression', 'clusters', 'braille', 'correlation'],
  kind: 'chart',
  size: { w: 60, h: 16 },
  minSize: { w: 24, h: 6 },
  loop: 16,
  glyphs: 'braille',
  canvas: 'line',
  order: 60,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const groups = [
      { name: 'search', c: th.accent, cx: 0.25, cy: 0.3, k: 0.18 },
      { name: 'checkout', c: th.warn, cx: 0.6, cy: 0.62, k: 0.16 },
      { name: 'catalog', c: th.pos, cx: 0.45, cy: 0.42, k: 0.2 },
    ];
    const pts = [];
    for (const gr of groups) for (let i = 0; i < 70; i++) pts.push({ gr, u: ctx.rng.gauss() * gr.k, v: ctx.rng.gauss() * gr.k * 0.7, p: ctx.rng() * 6.28 });
    const axisL = 2, legend = H >= 8 ? 1 : 0;
    const cv = ctx.canvas('line', { cols: W - axisL, rows: H - 1 - legend, threshold: 0 });
    return (t) => {
      const X = (x) => clamp(x, 0, 1) * (cv.width - 1), Y = (y) => (1 - clamp(y, 0, 1)) * (cv.height - 1);
      cv.clear();
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const p of pts) {
        const x = p.gr.cx + p.u + 0.02 * Math.sin(t * 0.7 + p.p), y = p.gr.cy + p.v + p.u * 0.6 + 0.02 * Math.cos(t * 0.9 + p.p);
        sx += x; sy += y; sxx += x * x; sxy += x * y;
        cv.set(X(x), Y(y), p.gr.c);
      }
      const n = pts.length, slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
      for (let i = 0; i < cv.width; i += 2) { const x = i / (cv.width - 1); cv.set(i, Y(icpt + slope * x), mix(th.bg, th.ink, 0.7)); }
      cv.paint(b, axisL, legend);
      for (let y = legend; y < H - 1; y++) b.set(axisL - 1, y, g.v, th.line);
      b.text(axisL - 1, H - 1, g.cornerL + g.h.repeat(Math.max(0, W - axisL)), th.line);
      if (W >= 30) putR(b, W, H - 1, ' payload KB →', th.dim);
      b.text(0, legend, g.up, th.dim);
      if (legend) {
        let x = 0;
        for (const gr of groups) { b.set(x, 0, g.dot, gr.c); x = b.text(x + 2, 0, gr.name, th.muted) + 2; if (x > W - 12) break; }
        if (W >= 52) putR(b, W, 0, `r = ${(slope / 1.4).toFixed(2)}`, th.ink);
      }
    };
  },
};

const bubble = {
  id: 'charts-bubble',
  title: 'Bubble Chart',
  category: 'Line & Area',
  description: 'Services plotted by request rate and error rate, bubble area showing cost — bubbles breathe as traffic shifts.',
  tags: ['bubble chart', 'cost', 'services', 'blocks', 'x y'],
  kind: 'chart',
  size: { w: 64, h: 16 },
  minSize: { w: 24, h: 6 },
  loop: 14,
  canvas: 'hires',
  order: 70,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const items = [
      { name: 'search', x: 0.2, y: 0.25, r: 0.09, c: th.accent },
      { name: 'checkout', x: 0.55, y: 0.7, r: 0.13, c: th.neg },
      { name: 'catalog', x: 0.75, y: 0.3, r: 0.11, c: th.pos },
      { name: 'auth', x: 0.38, y: 0.45, r: 0.07, c: th.crit },
      { name: 'notify', x: 0.85, y: 0.78, r: 0.06, c: th.warn },
    ];
    const cv = ctx.canvas('hires', { cols: W, rows: H });
    return (t) => {
      cv.clear();
      const A = cv.aspect;
      const pos = items.map((it, i) => {
        const breathe = 1 + 0.12 * Math.sin(t * 0.9 + i * 1.7);
        const x = (0.08 + it.x * 0.84 + 0.02 * Math.sin(t * 0.3 + i)) * cv.width;
        const y = (1 - (0.1 + it.y * 0.8)) * cv.height;
        const r = it.r * Math.min(cv.width, cv.height * A) * breathe;
        return { it, x, y, r };
      });
      for (const p of pos) {
        cv.ellipse(p.x, p.y, p.r, p.r / A, mix(th.bg, p.it.c, 0.35), true);
        cv.ellipse(p.x, p.y, p.r, p.r / A, p.it.c);
      }
      cv.paint(b);
      for (const p of pos) {
        const cx = Math.round(p.x / cv.sx), cy = Math.round(p.y / cv.sy);
        if (W >= 30) b.text(Math.max(0, cx - Math.floor(p.it.name.length / 2)), Math.min(H - 1, cy), p.it.name, onFill(th, mix(th.bg, p.it.c, 0.35)), undefined, ATTR.BOLD);
      }
      if (W >= 40) { b.text(0, H - 1, 'requests →', th.dim); b.text(0, 0, '↑ errors', th.dim); }
    };
  },
};

export default [lineMulti, areaDither, streamScroll, btopCpu, stackedArea, scatter, bubble];
