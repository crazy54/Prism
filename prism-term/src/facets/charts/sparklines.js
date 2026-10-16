// Sparklines: word-sized trend lines — eighth-block bars, braille, dots, and a wall of them.
import { mix, scale } from '../../color.js';
import { signal, glyphs, safe, vbar, put, putR, num, clamp, light, lift, ATTR, VBLOCKS } from './_data.js';

const METRICS = [
  { key: 'cpu', label: 'cpu', unit: '%', base: 46, amp: 22, max: 100, warn: 75, crit: 90, seed: 1 },
  { key: 'mem', label: 'mem', unit: '%', base: 61, amp: 10, max: 100, warn: 80, crit: 92, seed: 2 },
  { key: 'net', label: 'net', unit: 'MB/s', base: 38, amp: 26, max: 120, warn: 95, crit: 110, seed: 3, spike: 18 },
  { key: 'err', label: 'err', unit: '%', base: 0.6, amp: 0.5, max: 8, warn: 2, crit: 4, seed: 4, spike: 1.2, min: 0 },
];

const levelColor = (th, m, v) => (v >= m.crit ? th.neg : v >= m.warn ? th.warn : th.pos);

const sparkBars = {
  id: 'charts-spark-bars',
  title: 'Sparkline Rows',
  category: 'Sparklines',
  description: 'Four live metrics as eighth-block sparklines with labels, window min/max, current values and threshold coloring — the classic `spark` look.',
  tags: ['sparkline', 'trend', 'metrics', 'eighth blocks', 'cpu'],
  kind: 'chart',
  size: { w: 66, h: 5 },
  minSize: { w: 22, h: 2 },
  loop: 10,
  color: '256',
  order: 10,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const streams = METRICS.map((m) => ({ m, s: signal(ctx, { seed: m.seed, base: m.base, amp: m.amp, spike: m.spike || 0, min: m.min ?? 0, max: m.max, rate: 3 }) }));
    const rows = Math.min(METRICS.length, H);
    const labelW = W >= 30 ? 5 : 0, valueW = W >= 26 ? 9 : 0, rangeW = W >= 60 ? 14 : 0;
    const sw = Math.max(4, W - labelW - valueW - rangeW);
    const short = (v) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
    return (t) => {
      for (let r = 0; r < rows; r++) {
        const { m, s } = streams[r];
        const data = s.window(t, sw), v = s.now(t);
        const y = r + Math.max(0, Math.floor((H - rows) / 2));
        if (labelW) b.text(0, y, m.label.padEnd(labelW - 1), th.muted);
        // Autoscale with headroom, like `spark`: the shape matters, the readout gives the value.
        let lo = Math.min(...data), hi = Math.max(...data);
        const pad = (hi - lo) * 0.15 || 1;
        lo = Math.max(0, lo - pad); hi += pad;
        for (let i = 0; i < sw; i++) {
          const k = clamp((data[i] - lo) / (hi - lo), 0, 1);
          const idx = Math.max(1, Math.round(k * 8));
          const c = levelColor(th, m, data[i]);
          b.set(labelW + i, y, g.u ? VBLOCKS[idx] : ' ._-=+*#@'[idx], i === sw - 1 ? lift(th, c, 0.35) : th.mode === 'light' ? mix(th.bg, c, 0.55 + 0.45 * (i / sw)) : scale(c, 0.55 + 0.45 * (i / sw)));
        }
        if (rangeW) {
          // Window min and max, like `spark --range`.
          const mn = Math.min(...data), mx = Math.max(...data);
          const x = labelW + sw + 1;
          let e = b.text(x, y, g.down, th.dim);
          e = b.text(e, y, short(mn), th.muted);
          e = b.text(e + 1, y, g.up, th.dim);
          b.text(e, y, short(mx), th.muted);
        }
        if (valueW) {
          const txt = `${v < 10 ? v.toFixed(1) : Math.round(v)}${m.unit === '%' ? '%' : ' ' + m.unit}`;
          putR(b, W, y, txt, levelColor(th, m, v), undefined, ATTR.BOLD);
        }
      }
    };
  },
};

const sparkBraille = {
  id: 'charts-spark-braille',
  title: 'Braille Sparklines',
  category: 'Sparklines',
  description: 'High-resolution braille sparklines (2×4 dots per cell) with min/max markers, a glowing last-value point and a live readout.',
  tags: ['sparkline', 'braille', 'high resolution', 'min max', 'latency'],
  kind: 'chart',
  size: { w: 56, h: 9 },
  minSize: { w: 24, h: 3 },
  loop: 12,
  glyphs: 'braille',
  canvas: 'line',
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const defs = [
      { label: 'p95 latency', unit: 'ms', s: signal(ctx, { seed: 11, base: 180, amp: 70, spike: 90, min: 20, rate: 6 }), c: th.accent },
      { label: 'requests', unit: '/s', s: signal(ctx, { seed: 12, base: 1400, amp: 420, rate: 6 }), c: th.pos },
      { label: 'queue depth', unit: '', s: signal(ctx, { seed: 13, base: 22, amp: 18, spike: 30, min: 0, rate: 6 }), c: th.crit },
    ];
    const per = H >= 9 ? 3 : H >= 6 ? 2 : 1;
    const rows = Math.max(1, Math.min(defs.length, Math.floor(H / per)));
    const textH = per >= 2 ? 1 : 0;
    const cvRows = Math.max(1, per - textH);
    const cv = ctx.canvas('line', { cols: W, rows: cvRows, threshold: 0 });
    return (t) => {
      for (let r = 0; r < rows; r++) {
        const d = defs[r], y0 = r * per;
        const n = cv.width;
        const data = d.s.window(t, n);
        let lo = Infinity, hi = -Infinity, iLo = 0, iHi = 0;
        data.forEach((v, i) => { if (v < lo) { lo = v; iLo = i; } if (v > hi) { hi = v; iHi = i; } });
        const span = hi - lo || 1;
        const py = (v) => (cv.height - 1) - ((v - lo) / span) * (cv.height - 1);
        cv.clear();
        let prev = null;
        for (let i = 0; i < n; i++) {
          const y = py(data[i]);
          const c = mix(scale(d.c, 0.45), d.c, i / n);
          if (prev !== null) cv.line(i - 1, prev, i, y, c); else cv.set(i, y, c);
          prev = y;
        }
        cv.set(iHi, py(hi), th.warn); cv.set(iHi, py(hi) - 1, th.warn);
        cv.set(iLo, py(lo), th.info); cv.set(iLo, py(lo) + 1, th.info);
        cv.set(n - 1, py(data[n - 1]), light(th)); cv.set(n - 2, py(data[n - 1]), light(th));
        cv.paint(b, 0, y0 + textH);
        if (textH) {
          const v = d.s.now(t);
          b.text(0, y0, d.label, th.muted);
          const val = `${num(v, v < 10 ? 1 : 0)}${d.unit}`;
          const right = W >= 40 ? `${g.down}${num(lo, 0)}  ${g.up}${num(hi, 0)}  ` : '';
          putR(b, W - val.length, y0, right, th.dim);
          putR(b, W, y0, val, d.c, undefined, ATTR.BOLD);
        }
      }
    };
  },
};

const sparkDots = {
  id: 'charts-spark-dots',
  title: 'Dot Sparkline & Threshold',
  category: 'Sparklines',
  description: 'A dot-plot sparkline against a dashed SLO threshold: points that breach glow red and are counted live.',
  tags: ['sparkline', 'dots', 'threshold', 'slo', 'breach'],
  kind: 'chart',
  size: { w: 60, h: 6 },
  minSize: { w: 24, h: 3 },
  loop: 10,
  canvas: 'line',
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const s = signal(ctx, { seed: 21, base: 215, amp: 120, spike: 420, min: 40, rate: 5 });
    const LIMIT = 290;
    const rows = Math.max(1, H - 1);
    const cv = ctx.canvas('line', { cols: W, rows, threshold: 0 });
    return (t) => {
      const n = Math.floor(cv.width / 2);
      const data = s.window(t, n);
      const lo = 0, hi = Math.max(LIMIT * 1.35, Math.max(...data) * 1.08);
      const py = (v) => (cv.height - 1) - clamp((v - lo) / (hi - lo), 0, 1) * (cv.height - 1);
      cv.clear();
      const ly = Math.round(py(LIMIT));
      for (let x = 0; x < cv.width; x += 3) cv.set(x, ly, mix(th.bg, th.warn, 0.8));
      let breaches = 0;
      data.forEach((v, i) => {
        const bad = v > LIMIT;
        if (bad) breaches++;
        const x = i * 2 + 1, y = py(v);
        const c = bad ? th.neg : mix(th.info, th.accent, i / n);
        cv.set(x, y, c); cv.set(x, y + 1, scale(c, 0.7));
        if (bad) { cv.set(x, y - 1, c); cv.set(x - 1, y, scale(c, 0.6)); cv.set(x + 1, y, scale(c, 0.6)); }
      });
      cv.paint(b, 0, 1);
      put(b, 0, 0, 'checkout p95', W, th.muted);
      const msg = `${breaches} over ${LIMIT} ms`;
      if (W >= 30) putR(b, W, 0, msg, breaches ? th.neg : th.pos, undefined, ATTR.BOLD);
      if (W >= 46) putR(b, W - msg.length - 2, 0, `${g.dash.repeat(2)} SLO`, th.warn);
    };
  },
};

const SERVICES = ['api-gw', 'auth', 'cart', 'checkout', 'search', 'catalog', 'payments', 'orders', 'rx-orders', 'loyalty', 'notify', 'inventory'];

const sparkWall = {
  id: 'charts-spark-wall',
  title: 'Sparkline Wall',
  category: 'Sparklines',
  description: 'A NOC wall of a dozen services: name, a mini sparkline and the current rate, each tinted by health.',
  tags: ['sparkline', 'wallboard', 'noc', 'services', 'grid'],
  kind: 'chart',
  size: { w: 80, h: 8 },
  minSize: { w: 26, h: 3 },
  loop: 12,
  color: '256',
  order: 40,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const cellW = 26;
    const cols = Math.max(1, Math.floor((W + 1) / cellW));
    const perCol = Math.max(1, H);
    const count = Math.min(SERVICES.length, cols * perCol);
    const streams = SERVICES.slice(0, count).map((name, i) => {
      const base = 300 + (i * 97) % 900;
      return { name, base, s: signal(ctx, { seed: 40 + i, base, amp: base * 0.22, spike: i === 3 ? base * 1.4 : 0, min: 5, rate: 3 }) };
    });
    const w = Math.min(cellW - 1, W);
    return (t) => {
      streams.forEach((st, i) => {
        const cx = Math.floor(i / perCol) * cellW, cy = i % perCol;
        const sw = Math.max(4, w - 16);
        const data = st.s.window(t, sw);
        const max = Math.max(...data), min = Math.min(...data);
        const v = st.s.now(t);
        const health = v > st.base * 1.9 ? 0.3 : v > st.base * 1.45 ? 0.6 : 1;
        const c = health >= 0.8 ? th.pos : health >= 0.5 ? th.warn : th.neg;
        b.set(cx, cy, g.dot, c);
        put(b, cx + 2, cy, st.name, 9, th.ink);
        for (let k = 0; k < sw; k++) {
          const idx = Math.max(1, Math.round(((data[k] - min) / (max - min || 1)) * 7) + 1);
          b.set(cx + 11 + k, cy, g.u ? VBLOCKS[Math.min(8, idx)] : '.:-=+*#%@'[Math.min(8, idx)], scale(c, 0.5 + 0.5 * (k / sw)));
        }
        putR(b, cx + w, cy, num(v, 0), c, undefined, ATTR.BOLD);
      });
    };
  },
};

export default [sparkBars, sparkBraille, sparkDots, sparkWall];
