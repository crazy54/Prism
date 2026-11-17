// Sparklines in context: win/loss polarity, folded horizon bands, the usual range, last week's ghost
// and an event lane. Every stream is periodic in its loop (charts/_loop.js), so each loop closes exactly.
import { mix } from '../../color.js';
import { glyphs, safe, putR, lift, tint, ATTR, VBLOCKS } from './_data.js';
import { phase, wrap, cyclic, bump, plateau, cover } from './_loop.js';

const hash01 = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const signed = (v, d = 1) => `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(d)}`;

/** A braille (or forced-mode) line through one value per pixel column; null values break it. */
function plot(cv, n, at, lo, hi, colorAt, thick = false) {
  const H = cv.height - 1, dy = thick && cv.height >= 8 ? 1 : 0;   // thick: the wire doubled one dot down
  let py = null;
  for (let x = 0; x < n; x++) {
    const v = at(x);
    if (v === null) { py = null; continue; }
    const y = Math.max(0, Math.min(H - dy, Math.round(((hi - v) / (hi - lo)) * (H - dy))));
    for (let o = 0; o <= dy; o++) { if (py === null) cv.set(x, y + o, colorAt(x, v)); else cv.line(x - 1, py + o, x, y + o, colorAt(x, v)); }
    py = y;
  }
}

/** "-10m ……… now" under a strip of w cells at x0. */
function axis(b, x0, y, w, left, right, color) {
  if (w < left.length + right.length + 2) return;
  b.text(x0, y, left, color);
  putR(b, x0 + w, y, right, color);
}

// ── win/loss: deploy outcomes per service, one tick per deploy ─────────────────────────────────
const WL_NAMES = ['checkout', 'search', 'auth', 'catalog', 'payments'];
const WL_CYCLE = [14, 13, 12, 11, 10];                 // results per loop for each row = its history's period
const WL_LOSS = [[3], [6, 10], [9], [7], [4]];         // rollbacks within each row's cycle
const WL_EVERY = 0.8, WL_LOOP = 48;                     // 60 results a loop, one every 0.8 s
const WL_ORDER = (() => {                                // which row each result lands on: a fixed shuffle
  const out = WL_CYCLE.flatMap((n, r) => Array(n).fill(r));
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(hash01(i + 7) * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
})();

const winLoss = {
  id: 'charts-spark-winloss',
  since: '0.3.0',
  title: 'Win/Loss Sparklines',
  category: 'Sparklines',
  description: 'Deploy outcomes per service as win/loss sparklines: one tick per deploy, up for success and down for a rollback, with the current streak and success rate.',
  tags: ['sparkline', 'win/loss', 'deploys', 'rollback', 'streak', 'tufte', 'binary'],
  kind: 'chart',
  size: { w: 64, h: 7 },
  minSize: { w: 32, h: 3 },
  loop: WL_LOOP,
  color: '256',
  order: 200,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const wide = W >= 40, nameW = wide ? 10 : 7, streakW = wide ? 5 : 0, rateW = 5;
    const tickW = Math.max(4, W - nameW - streakW - rateW);
    const head = H >= 6, legend = H >= 7, rows = Math.min(WL_NAMES.length, H - (head ? 1 : 0) - (legend ? 1 : 0));
    const y0 = head ? 1 : 0;
    // no color: half-line ticks above or below the midline, so polarity reads by position alone
    const mono = ctx.caps.depth === 'mono', WIN = !g.u ? "'" : mono ? '╹' : '▀', LOSS = !g.u ? '.' : mono ? '╻' : '▄';
    const lost = (r, j) => WL_LOSS[r].includes(wrap(j, WL_CYCLE[r]));
    return (t) => {
      const T = phase(t, WL_LOOP), e = Math.min(WL_ORDER.length, Math.floor(T / WL_EVERY) + 1);
      const seen = WL_CYCLE.map(() => 0);
      for (let i = 0; i < e; i++) seen[WL_ORDER[i]]++;
      const fresh = T - (e - 1) * WL_EVERY < 0.35 ? WL_ORDER[e - 1] : -1;
      if (head) {
        b.text(0, 0, 'service'.slice(0, nameW - 1), th.muted);
        putR(b, W, 0, wide ? 'streak  rate' : 'rate', th.muted);
      }
      for (let r = 0; r < rows; r++) {
        const y = y0 + r, newest = seen[r] + 3 * r;   // per-row offset so the rows start out of step
        b.text(0, y, WL_NAMES[r].slice(0, nameW - 1), th.ink);
        let wins = 0;
        for (let i = 0; i < tickW; i++) {
          const j = newest - tickW + 1 + i, l = lost(r, j);
          if (!l) wins++;
          const c = l ? th.neg : th.pos;
          b.set(nameW + i, y, l ? LOSS : WIN, i === tickW - 1 && fresh === r ? lift(th, c, 0.5) : c);
        }
        const l0 = lost(r, newest);
        let run = 1;
        while (run < WL_CYCLE[r] && lost(r, newest - run) === l0) run++;
        if (streakW) b.text(nameW + tickW + 1, y, `${l0 ? 'L' : 'W'}${run}`, th.ink, undefined, ATTR.BOLD);
        putR(b, W, y, `${Math.round((100 * wins) / tickW)}%`, th.muted);
      }
      if (legend) {
        let x = b.text(nameW, H - 1, WIN, th.pos);
        x = b.text(x + 1, H - 1, 'deployed', th.muted);
        x = b.text(x + 2, H - 1, LOSS, th.neg);
        b.text(x + 1, H - 1, 'rolled back', th.muted);
      }
    };
  },
};

// ── horizon: CPU deviation from the fleet mean, three folded bands per one-row strip ────────────
const HZ_HOSTS = ['web-01', 'web-02', 'web-03', 'web-04', 'api-01', 'api-02', 'batch-01', 'batch-02'];
const HZ_LOOP = 14, HZ_RATE = 4, HZ_P = HZ_LOOP * HZ_RATE, HZ_BAND = 10;   // percentage points per band

const horizon = {
  id: 'charts-spark-horizon',
  since: '0.3.0',
  title: 'Horizon Sparklines',
  category: 'Sparklines',
  description: "Eight hosts' CPU deviation from the fleet mean as one-row horizon charts: three bands fold into deepening shades, warm above the mean and cool below, as a batch job migrates.",
  tags: ['sparkline', 'horizon', 'bands', 'deviation', 'fleet', 'cpu', 'diverging'],
  kind: 'chart',
  size: { w: 72, h: 10 },
  minSize: { w: 30, h: 4 },
  loop: HZ_LOOP,
  color: '256',
  order: 210,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const mono = ctx.caps.depth === 'mono';
    // Deviation from the fleet mean, sample by sample over one period (it repeats exactly).
    const cpu = HZ_HOSTS.map((_, i) => cyclic(ctx, { seed: 30 + i, base: 46 + (i % 3) * 4, amp: 7, period: HZ_P }));
    const dev = HZ_HOSTS.map(() => new Float64Array(HZ_P));
    for (let k = 0; k < HZ_P; k++) {
      const u = k / HZ_P, raw = cpu.map((f, i) => f(k) + 34 * bump(u, 0.06 + i * 0.11, 0.05));
      const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
      raw.forEach((v, i) => { dev[i][k] = v - mean; });
    }
    const warm = [tint(th, th.warn, 0.35), tint(th, th.warn, 0.65), th.warn];
    const cool = [tint(th, th.info, 0.35), tint(th, th.info, 0.65), th.info];
    const POS = " ':+#", NEG = ' ,;-=', SHADE = g.u ? ' ░▒▓█' : NEG;   // 7-bit: high marks above the mean, low below
    const axisRow = H >= 6, legend = H >= 10;
    const rows = Math.min(HZ_HOSTS.length, H - (axisRow ? 1 : 0) - (legend ? 1 : 0) - (H < 6 ? 1 : 0));
    const valW = W >= 48 ? 7 : 0, labelW = W >= 40 ? 10 : 9, stripW = Math.max(6, W - labelW - valW - 1);
    const y0 = axisRow ? 1 : 0;
    const cell = (x, y, v) => {
      const a = Math.abs(v), shades = v >= 0 ? warm : cool;
      if (mono) {   // unfolded magnitude, and a floor mark wherever truecolor draws one (|Δ| >= 1/16 band)
        const k = Math.min(1, a / (3 * HZ_BAND)), lv = Math.round(k * (v >= 0 && g.u ? 8 : 4));
        if (lv === 0 && a >= HZ_BAND / 16) return v >= 0 ? b.set(x, y, g.u ? VBLOCKS[1] : POS[1], th.ink) : b.set(x, y, g.u ? '·' : '.', th.dim, undefined, ATTR.DIM);
        return b.set(x, y, v >= 0 ? (g.u ? VBLOCKS : POS)[lv] : SHADE[lv], th.ink);
      }
      const band = Math.min(2, Math.floor(a / HZ_BAND)), f = Math.min(1, (a - band * HZ_BAND) / HZ_BAND);
      if (!g.u) return b.set(x, y, (v >= 0 ? POS : NEG)[Math.min(4, band + (f >= 0.5 ? 2 : 1))], shades[band]);
      const i = Math.round(f * 8);
      b.set(x, y, i ? VBLOCKS[i] : ' ', shades[band], band ? shades[band - 1] : undefined);
    };
    return (t) => {
      const T = phase(t, HZ_LOOP), k0 = Math.floor(T * HZ_RATE + 1e-9);
      if (axisRow) { b.text(0, 0, (g.u ? 'cpu Δ pts' : 'cpu dev').slice(0, labelW - 1), th.muted); axis(b, labelW, 0, stripW, '-10m', 'now', th.dim); }
      for (let r = 0; r < rows; r++) {
        const y = y0 + r;
        b.text(0, y, HZ_HOSTS[r].slice(0, labelW - 1), th.ink);
        for (let i = 0; i < stripW; i++) cell(labelW + i, y, dev[r][wrap(k0 - stripW + 1 + i, HZ_P)]);
        if (valW) putR(b, W, y, signed(dev[r][wrap(k0, HZ_P)]), th.muted);
      }
      if (legend || H < 6) {
        const y = H - 1, k = g.u ? ['▃', '▆', '█'] : ['.', ':', '#'], long = W - labelW >= 30;
        let x = labelW;
        for (let i = 0; i < 3; i++) x = b.text(x, y, k[i], warm[i]);
        x = b.text(x + 1, y, long ? 'above mean' : 'above', th.muted) + 2;
        for (let i = 0; i < 3; i++) x = b.text(x, y, k[i], cool[i]);
        b.text(x + 1, y, long ? 'below mean' : 'below', th.muted);
      }
    };
  },
};

// ── normal band: each metric against its usual range for this hour ──────────────────────────────
const NB = [
  { label: 'p95 ms', base: 268, lo: 210, hi: 340, amp: 62, fmt: (v) => `${Math.round(v)}ms`, seed: 41, spike: 1 },
  { label: 'req/s', base: 1240, lo: 1080, hi: 1410, amp: 150, fmt: (v) => `${Math.round(v)}`, seed: 42 },
  { label: 'errors', base: 0.44, lo: 0.24, hi: 0.66, amp: 0.19, fmt: (v) => `${v.toFixed(2)}%`, seed: 43 },
  { label: 'cpu', base: 56, lo: 45, hi: 67, amp: 10, fmt: (v) => `${Math.round(v)}%`, seed: 44 },
];
const NB_LOOP = 12, NB_P = 96;                          // samples a loop, one per pixel column

const normalBand = {
  id: 'charts-spark-band',
  since: '0.3.0',
  title: 'Sparklines with Normal Band',
  category: 'Sparklines',
  description: "Each metric against its usual range for this hour, shaded as a recessive band; when p95 latency breaks above it the segment turns amber and an 'above normal' tag appears.",
  tags: ['sparkline', 'band', 'baseline', 'anomaly', 'normal range', 'latency', 'braille'],
  kind: 'chart',
  size: { w: 64, h: 9 },
  minSize: { w: 30, h: 4 },
  loop: NB_LOOP,
  color: '256',
  order: 220,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const labelW = W >= 40 ? 9 : 8, normal = W >= 40, rightW = normal ? 24 : 8;
    const stripW = Math.max(6, W - labelW - rightW - 1), axisRow = H >= 9;
    const n = Math.min(NB.length, Math.floor((H - (axisRow ? 1 : 0)) / 2));
    // truecolor shades the band; below that a tint would quantize away, so its body is a field of dots instead
    const rich = ctx.caps.depth === 'truecolor', DOT = g.u ? '·' : '.';
    const bandC = mix(th.bg, th.info, th.mode === 'light' ? 0.2 : 0.3), edgeC = rich ? mix(th.bg, th.info, th.mode === 'light' ? 0.55 : 0.6) : th.dim;
    const metrics = NB.slice(0, n).map((m) => {
      const noise = cyclic(ctx, { seed: m.seed, amp: m.amp, period: NB_P }), w = m.hi - m.lo;
      const drift = (k) => w * 0.16 * Math.sin((2 * Math.PI * k) / NB_P + m.seed);   // the time-of-day profile
      const band = (k) => [m.lo + drift(k), m.hi + drift(k)];
      const value = (k) => m.base + drift(k) + noise(k) + (m.spike ? w * 0.85 * bump(wrap(k, NB_P) / NB_P, 0.55, 0.07) : 0);
      const cv = ctx.canvas('line', { cols: stripW, rows: 2 }), edges = ctx.canvas('line', { cols: stripW, rows: 2 });
      return { m, band, value, cv, edges, lo: m.lo - w * 0.45, top: m.hi + w * (m.spike ? 1 : 0.45) };   // headroom: the band takes about the middle half
    });
    return (t) => {
      const T = phase(t, NB_LOOP), k0 = Math.floor((T / NB_LOOP) * NB_P + 1e-9);
      metrics.forEach(({ m, band, value, cv, edges, lo, top }, i) => {
        const y = i * 2, px = cv.width, sy = cv.height / 2, sx = cv.width / stripW, K = (x) => k0 - (px - 1) + x;
        const toPx = (v) => ((top - v) / (top - lo)) * (cv.height - 1);
        // The band: a stepped background tint (in-band, partial, none) plus its p10/p90 edges as dotted rules.
        for (let cx = 0; cx < stripW; cx++) {
          const [blo, bhi] = band(K(Math.floor((cx + 0.5) * sx)));
          for (let ry = 0; ry < 2; ry++) {
            const c = cover(ry, sy, toPx(bhi), toPx(blo) + 1);
            if (c >= 0.3) { if (rich) b.set(labelW + cx, y + ry, undefined, undefined, mix(th.bg, bandC, c >= 0.7 ? 1 : 0.55)); else b.set(labelW + cx, y + ry, DOT, th.dim); }
          }
        }
        edges.clear(); cv.clear();
        for (let x = 0; x < px; x += 2) { const [blo, bhi] = band(K(x)); edges.set(x, Math.round(toPx(bhi)), edgeC); edges.set(x, Math.round(toPx(blo)), edgeC); }
        plot(cv, px, (x) => value(K(x)), lo, top, (x, v) => (v > band(K(x))[1] ? th.warn : th.ink));
        edges.paint(b, labelW, y);
        cv.paint(b, labelW, y);   // the line wins any cell it shares with an edge
        const v = value(k0), [blo, bhi] = band(k0), above = v > bhi;
        b.text(0, y, m.label.slice(0, labelW - 1), th.ink);
        let x = b.text(labelW + stripW + 1, y, m.fmt(v), above ? th.warn : th.ink, undefined, ATTR.BOLD);
        const tag = above ? `${g.up} above normal` : `normal ${m.fmt(blo).replace(/[a-z%]+$/, '')}${g.u ? '–' : '-'}${m.fmt(bhi)}`;
        if (normal && x + 1 + tag.length <= W) b.text(x + 1, y, tag, above ? th.warn : th.muted);   // the range text drops before it would clip
      });
      if (axisRow) axis(b, labelW, H - 1, stripW, '-1m', 'now', th.dim);
    };
  },
};

// ── ghost: this week against the same hours last week ───────────────────────────────────────────
const GH = [
  { label: 'sign-ups', unit: '/min', base: 42, amp: 6, lift: 0.12, seed: 51 },
  { label: 'checkouts', unit: '/min', base: 118, amp: 14, lift: 0.02, dip: 0.3, seed: 52 },
  { label: 'p95', unit: 'ms', base: 231, amp: 22, lift: -0.03, seed: 53 },
];
const GH_LOOP = 12, GH_P = 96;

const ghost = {
  id: 'charts-spark-ghost',
  since: '0.3.0',
  title: 'This Week vs Last Week',
  category: 'Sparklines',
  description: "Sparklines with the same hours last week as a dotted ghost, so a departure from the metric's own history stands out: checkouts dip 30% under their ghost, then recover.",
  tags: ['sparkline', 'comparison', 'week over week', 'ghost', 'baseline', 'emphasis', 'braille'],
  kind: 'chart',
  size: { w: 64, h: 8 },
  minSize: { w: 28, h: 3 },
  loop: GH_LOOP,
  color: '256',
  order: 230,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const labelW = W >= 40 ? 10 : 9, delta = W >= 36, rightW = delta ? 18 : 9;   // value on a metric's first row, delta on its second
    const stripW = Math.max(6, W - labelW - rightW - 1), axisRow = H >= 8;
    const n = Math.min(GH.length, Math.floor((H - 1 - (axisRow ? 1 : 0)) / 2));
    const series = GH.slice(0, n).map((m) => {
      const day = (k) => 1 + 0.18 * Math.sin((2 * Math.PI * k) / GH_P + m.seed);   // the shared hourly shape
      const last = cyclic(ctx, { seed: m.seed, amp: m.amp, period: GH_P }), wobble = cyclic(ctx, { seed: m.seed + 9, amp: m.amp * 0.6, period: GH_P });
      const was = (k) => m.base * day(k) + last(k);
      const now = (k) => (m.base * day(k) + wobble(k)) * (1 + m.lift) * (1 - (m.dip ?? 0) * plateau(wrap(k, GH_P) / GH_P, 0.42, 0.6, 0.06));
      const vals = Array.from({ length: GH_P }, (_, k) => [was(k), now(k)]).flat();
      return { m, was, now, lo: Math.min(...vals) * 0.96, hi: Math.max(...vals) * 1.03,
        ghostCv: ctx.canvas('line', { cols: stripW, rows: 2 }), cv: ctx.canvas('line', { cols: stripW, rows: 2 }) };
    });
    return (t) => {
      const T = phase(t, GH_LOOP), k0 = Math.floor((T / GH_LOOP) * GH_P + 1e-9);
      const roomy = W - labelW >= 24;
      let x = b.text(labelW, 0, g.u ? '━' : '-', th.accent);
      x = b.text(x + 1, 0, roomy ? 'this week' : 'now', th.muted);
      x = b.text(x + 2, 0, g.u ? '┈' : '.', th.muted);
      b.text(x + 1, 0, roomy ? 'last week' : 'last wk', th.muted);
      series.forEach(({ m, was, now, lo, hi, ghostCv, cv }, i) => {
        const y = 1 + i * 2, px = cv.width, K = (xx) => k0 - (px - 1) + xx;
        ghostCv.clear(); cv.clear();
        plot(ghostCv, px, (xx) => (xx % 2 ? null : was(K(xx))), lo, hi, () => th.muted);   // dotted: every other column
        plot(cv, px, (xx) => now(K(xx)), lo, hi, () => th.accent, true);   // the current week: two dots thick
        ghostCv.paint(b, labelW, y);
        cv.paint(b, labelW, y);   // the current week wins any shared cell
        b.text(0, y, m.label.slice(0, labelW - 1), th.ink);
        const v = now(k0), d = (v - was(k0)) / was(k0);
        const xv = b.text(labelW + stripW + 1, y, `${v.toFixed(m.base < 100 ? 1 : 0)}${m.unit}`, th.ink, undefined, ATTR.BOLD);
        if (delta && xv) b.text(labelW + stripW + 1, y + 1, `${d >= 0 ? g.up : g.down} ${signed(d * 100, 0)}% vs last wk`, d < -0.1 ? th.neg : th.muted);
      });
      if (axisRow) axis(b, labelW, H - 1, stripW, '-1h', 'now', th.dim);
    };
  },
};

// ── events: a latency sparkline with deploys, an incident and a rollback on its top edge ────────
const EV_LOOP = 16, EV_P = 128;
// deploys carry short commit SHAs, not ordered versions: the cycle repeats, and a SHA never reads as going backwards
const EVENTS = [[0.05, 'deploy', 'a3f9e'], [0.3, 'deploy', '7b2d0'], [0.4, 'incident', 'INC-1042'], [0.55, 'rollback', 'a3f9e'], [0.8, 'deploy', 'c81e4']];

const events = {
  id: 'charts-spark-events',
  since: '0.3.0',
  title: 'Annotated Sparkline',
  category: 'Sparklines',
  description: 'p95 latency with deploy, incident and rollback markers along its top edge: a step up after a deploy reads as cause and effect, and the rollback brings it back down.',
  tags: ['sparkline', 'annotations', 'deploys', 'incident', 'rollback', 'latency', 'events'],
  kind: 'chart',
  size: { w: 72, h: 8 },
  minSize: { w: 36, h: 4 },
  loop: EV_LOOP,
  color: '256',
  order: 240,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const head = H >= 7, readout = W >= 48, small = W < 48 || H < 6;
    const rightW = readout ? 15 : 0, stripW = Math.max(8, W - rightW - (readout ? 1 : 0));
    const laneY = head ? 1 : 0, lineY = laneY + 1, lineH = Math.max(2, H - lineY - 1);
    const noise = cyclic(ctx, { seed: 61, amp: 26, period: EV_P });
    const value = (k) => 141 + noise(k) + 88 * plateau(wrap(k, EV_P) / EV_P, 0.33, 0.57, 0.015);
    const cv = ctx.canvas('line', { cols: stripW, rows: lineH }), rule = ctx.canvas('line', { cols: stripW, rows: lineH });
    const lo = 95, hi = 268, sx = cv.width / stripW;
    const MARK = { deploy: [g.u ? '▼' : 'v', th.muted], incident: [g.u ? '◆' : '*', th.neg], rollback: [g.u ? '↺' : '<', th.info] };
    return (t) => {
      const T = phase(t, EV_LOOP), k0 = Math.floor((T / EV_LOOP) * EV_P + 1e-9), px = cv.width, K = (x) => k0 - (px - 1) + x;
      const vals = Array.from({ length: px }, (_, x) => value(K(x)));
      const med = [...vals].sort((p, q) => p - q)[px >> 1];
      rule.clear(); cv.clear();
      const ry = Math.round(((hi - med) / (hi - lo)) * (rule.height - 1));
      for (let x = 0; x < px; x += 3) rule.set(x, ry, th.dim);
      plot(cv, px, (x) => vals[x], lo, hi, () => th.accent);
      rule.paint(b, 0, lineY);
      cv.paint(b, 0, lineY);
      // Markers ride in from the right with the line; a label that would collide gives way to the newer one.
      const marks = [];
      for (let cycle = -Math.ceil(px / EV_P); cycle <= 0; cycle++) for (const [u, kind, label] of EVENTS) {
        const k = Math.floor(u * EV_P) + cycle * EV_P;
        if (k <= k0 && k0 - k < px) marks.push({ x: Math.floor((px - 1 - (k0 - k)) / sx), kind, label });
      }
      marks.sort((p, q) => p.x - q.x);   // oldest on the left, newest on the right
      marks.forEach((mk, i) => {
        const [ch, col] = MARK[mk.kind], stop = i + 1 < marks.length ? marks[i + 1].x - 1 : stripW;
        b.set(mk.x, laneY, ch, col);
        // the incident outranks deploy labels: its full id when there is room, else the short '#1042'
        const label = mk.kind === 'incident' && mk.x + 1 + mk.label.length >= stop ? `#${mk.label.split('-')[1]}` : mk.label;
        if (!small && mk.x + 1 + label.length < stop) b.text(mk.x + 2, laneY, label, mk.kind === 'incident' ? th.neg : th.muted);
      });
      if (head) {
        b.text(0, 0, 'p95 latency, api', th.ink);
        let x = W >= 60 ? W - 37 : -1;
        if (x > 18) for (const k of ['deploy', 'incident', 'rollback']) { x = b.text(x, 0, MARK[k][0], MARK[k][1]); x = b.text(x + 1, 0, k, th.muted) + 2; }
      }
      axis(b, 0, H - 1, stripW, '-2m', 'now', th.dim);
      if (readout) {
        const v = vals[px - 1], x0 = stripW + 1;
        b.text(x0, lineY, `${Math.round(v)} ms`, v > med * 1.35 ? th.warn : th.ink, undefined, ATTR.BOLD);
        b.text(x0, lineY + 1, `median ${Math.round(med)}`, th.muted);
      }
    };
  },
};

export default [winLoss, horizon, normalBand, ghost, events];
