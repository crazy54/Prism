// Change over a window: an error budget burning down with its forecast, an autoscaler chasing a surge,
// a month-over-month cost bridge and a before/after dumbbell. Pure functions of t % loop.
import { mix } from '../../color.js';
import { glyphs, safe, putR, num, lift, tint, ATTR, VBLOCKS } from './_data.js';
import { phase, ease, wrap, cyclic, cover } from './_loop.js';

const hash01 = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Evenly spread x tick labels that fit without touching: tries each candidate set, densest first. */
function xTicks(b, x0, w, y, sets, at, color) {
  for (const set of sets) {
    const spots = set.map((v) => { const s = String(v), x = Math.round(at(v)); return [Math.max(x0, Math.min(x0 + w - s.length, x - (s.length >> 1))), s]; });
    if (spots.every(([x, s], i) => i === 0 || x > spots[i - 1][0] + spots[i - 1][1].length)) { for (const [x, s] of spots) b.text(x, y, s, color); return; }
  }
}

// ── error budget burn-down: 30-day SLO window, ideal burn, forecast cone ────────────────────────
const BD_LOOP = 16, BD_DAY = 0.4, BD_END = 30 * BD_DAY;          // a day every 0.4 s; day 30 at 12 s
const BURN = Array.from({ length: 31 }, (_, d) => (d === 0 ? 0 : d === 12 ? 18 : d > 12 && d < 18 ? 0.5 + 0.4 * hash01(d) : 1.1 + 1.3 * hash01(d)));
const LEFT = BURN.reduce((a, v, i) => (a.push((a[i - 1] ?? 100) - (i ? v : 0)), a), []);   // budget left at the end of day d

const burndown = {
  id: 'charts-burndown',
  since: '0.3.0',
  title: 'Error Budget Burn-down',
  category: 'Line & Area',
  description: 'A 30-day SLO error budget burning down against the ideal line; an incident on day 12 drops it 18% and the forecast cone swings until the run-out day falls inside the window.',
  tags: ['slo', 'error budget', 'burn-down', 'forecast', 'reliability', 'sre', 'incident'],
  kind: 'chart',
  size: { w: 72, h: 16 },
  minSize: { w: 36, h: 8 },
  loop: BD_LOOP,
  color: '256',
  order: 200,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const tall = H >= 12, axW = 5, plotX = axW, plotW = Math.max(10, W - axW - 1);
    const top = tall ? 1 : 0, plotH = Math.max(3, H - 3), plotY = top;   // tall: title + readout above; short: readout below
    const cv = ctx.canvas('line', { cols: plotW, rows: plotH }), sx = cv.width / plotW, sy = cv.height / plotH;
    const X = (day) => ((day - 1) / 29) * (cv.width - 1), Y = (pct) => ((100 - pct) / 100) * (cv.height - 1);
    const left = (day) => { const d = Math.floor(day), f = day - d; return d >= 30 ? LEFT[30] : LEFT[d] - BURN[d + 1] * f; };
    const coneC = tint(th, th.accent, th.mode === 'light' ? 0.16 : 0.24), rich = ctx.caps.depth === 'truecolor';
    const CONE = g.u ? '░' : ':';                                   // below truecolor the cone is a shade glyph, not a tint
    return (t) => {
      const T = phase(t, BD_LOOP), fresh = T >= BD_END + 2.5;          // the last 1.5 s: a new window starts
      const today = fresh ? 1 : Math.min(30, 1 + T / BD_DAY), now = left(today);
      const recent = Math.max(1, Math.min(7, today - 1)), rate = Math.max(0.05, (left(Math.max(1, today - recent)) - now) / recent);
      const out = today + now / rate, inside = out <= 30;
      // The forecast cone: today's burn rate ±40%, shaded as a background tint by cell coverage.
      for (let cx = 0; cx < plotW && !fresh; cx++) {
        const day = 1 + ((cx + 0.5) * sx / (cv.width - 1)) * 29;
        if (day < today) continue;
        const hiP = Math.max(0, now - rate * 0.6 * (day - today)), loP = Math.max(0, now - rate * 1.4 * (day - today));
        for (let ry = 0; ry < plotH; ry++) {
          const c = cover(ry, sy, Y(hiP), Y(loP) + 1);
          if (c > 0 && rich) b.set(plotX + cx, plotY + ry, undefined, undefined, mix(th.bg, coneC, c));
          else if (c >= 0.15) b.set(plotX + cx, plotY + ry, CONE, th.accent);
        }
      }
      cv.clear();
      for (let x = 0; x < cv.width; x += 2) cv.set(x, Y(100 - (100 * x) / (cv.width - 1)), th.muted);   // the ideal burn, dotted
      if (!fresh) {
        let py = null;
        for (let x = 0; x <= Math.round(X(today)); x++) { const y = Math.round(Y(left(1 + (x / (cv.width - 1)) * 29))); if (py !== null) cv.line(x - 1, py, x, y, th.accent); py = y; }
        const cx = Math.round(X(today));
        for (let y = 0; y < cv.height; y += 2) cv.set(cx, y, th.ink);                            // today's cursor
      }
      cv.paint(b, plotX, plotY);
      for (const [pct, show] of [[100, true], [50, tall], [0, true]]) if (show) putR(b, axW - 1, plotY + Math.round((Y(pct) / (cv.height - 1)) * (plotH - 1)), `${pct}%`, th.muted);
      xTicks(b, plotX, plotW, plotY + plotH, [[1, 10, 20, 30], [1, 15, 30], [1, 30]], (d) => plotX + (X(d) / sx), th.muted);
      const msg = fresh ? 'new 30-day window: 100% left' : `${Math.round(now)}% left ${g.u ? '·' : '-'} runs out day ${out > 99 ? '99+' : Math.ceil(out)}`;
      // the readout is the hero: right of the title when both fit, else alone (tall) or under the chart (short)
      const warnIt = !fresh && inside, ry = tall ? 0 : H - 2, need = msg.length + (warnIt ? 2 : 0), title = 'error budget, 99.9% over 30 days';
      const withTitle = tall && title.length + 2 + need <= W, msgX = !tall ? plotX : withTitle ? W - need : 0;
      if (withTitle) b.text(0, 0, title, th.ink);
      if (msgX + need <= W) b.text(warnIt ? b.text(msgX, ry, g.u ? '⚠' : '!', th.neg, undefined, ATTR.BOLD) + 1 : msgX, ry, msg, warnIt ? th.neg : th.muted, undefined, warnIt ? ATTR.BOLD : 0);
      const roomy = W - plotX >= 34;
      let x = b.text(plotX, H - 1, g.u ? '━' : '-', th.accent);
      x = b.text(x + 1, H - 1, roomy ? 'remaining' : 'left', th.muted);
      x = b.text(x + 2, H - 1, g.u ? '┈' : '.', th.muted);
      x = b.text(x + 1, H - 1, 'ideal', th.muted);
      x = rich ? b.text(x + 2, H - 1, ' ', th.muted, coneC) : b.text(x + 2, H - 1, CONE, th.accent);
      if (x + 9 <= W) b.text(x + 1, H - 1, 'forecast', th.muted);
    };
  },
};

// ── autoscaler: desired vs ready replicas through a surge, request rate in its own strip ────────
const AS_LOOP = 20, AS_WIN = 10;                                   // chart minutes: one per second, 10 in view
const desiredAt = (m) => { m = wrap(m, AS_LOOP); return m < 4 ? 6 : m < 6 ? 14 : m < 12 ? 20 : m < 15 ? 12 : 6; };
const UP = [[4, 6, 14], [6, 14, 20]];                            // [minute, from, to]: the scale-ups
const readyAt = (m) => {                                           // pods turn ready in four batches, 24-72 s after a scale-up
  const mm = wrap(m, AS_LOOP);
  for (const [at, from, to] of UP) {
    const dt = mm - at;
    if (dt >= 0 && dt < 1.2) return from + Math.round(((to - from) * Math.max(0, Math.min(4, Math.floor((dt - 0.4) / 0.2) + 1))) / 4);
  }
  return desiredAt(mm);                                            // steady, or scaling down (immediate)
};

const autoscale = {
  id: 'charts-step-autoscale',
  since: '0.3.0',
  title: 'Autoscaler Replicas',
  category: 'Line & Area',
  description: 'An autoscaler through a traffic surge as step lines: desired replicas jump 6 to 14 to 20, ready replicas chase them with a lag, and the gap between is pods still starting.',
  tags: ['autoscaling', 'hpa', 'replicas', 'kubernetes', 'step chart', 'surge', 'capacity'],
  kind: 'chart',
  size: { w: 72, h: 14 },
  minSize: { w: 40, h: 8 },
  loop: AS_LOOP,
  color: '256',
  order: 210,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const strip = H >= 12, axW = 4, plotX = axW, plotW = Math.max(10, W - axW - 1);
    const plotY = 1, plotH = Math.max(3, H - 2 - (strip ? 3 : 0)), stripY = plotY + plotH + 1;
    const rate = cyclic(ctx, { seed: 71, amp: 60, period: 400 });
    const rps = (m) => 420 + 1380 * Math.exp(-(((wrap(m, AS_LOOP) - 7.5) / 3) ** 2)) + rate(Math.round(wrap(m, AS_LOOP) * 20));
    const row = (v) => plotY + Math.round(((24 - v) / 24) * (plotH - 1));
    const gapC = tint(th, th.warn, th.mode === 'light' ? 0.2 : 0.28), mono = ctx.caps.depth === 'mono', GAP = g.u ? '░' : ':';   // NO_COLOR: a glyph
    const step = (vals, color) => {
      for (let i = 0; i < plotW; i++) {
        const r = row(vals[i]), p = i ? row(vals[i - 1]) : r;
        if (r === p) { b.set(plotX + i, r, g.h, color); continue; }
        const up = r < p;
        for (let y = Math.min(r, p) + 1; y < Math.max(r, p); y++) b.set(plotX + i, y, g.v, color);
        b.set(plotX + i, p, up ? '┘' : '┐', color);
        b.set(plotX + i, r, up ? '┌' : '└', color);
      }
    };
    return (t) => {
      const T = phase(t, AS_LOOP), mAt = (i) => T - AS_WIN + ((i + 1) / plotW) * AS_WIN;
      const want = Array.from({ length: plotW }, (_, i) => desiredAt(mAt(i))), have = Array.from({ length: plotW }, (_, i) => readyAt(mAt(i)));
      for (let i = 0; i < plotW; i++) if (want[i] > have[i]) for (let y = row(want[i]) + 1; y < row(have[i]); y++) { if (mono) b.set(plotX + i, y, GAP, th.warn); else b.set(plotX + i, y, undefined, undefined, gapC); }
      for (const v of [24, 12, 0]) putR(b, axW - 1, row(v), String(v), th.muted);
      step(want, th.ink);
      step(have, th.accent);
      const pend = want[plotW - 1] - have[plotW - 1];
      b.text(0, 0, 'replicas, web', th.ink);
      let x = Math.max(16, W - 37);
      if (x + 35 <= W) {
        x = b.text(x, 0, g.h, th.ink); x = b.text(x + 1, 0, 'desired', th.muted);
        x = b.text(x + 2, 0, g.h, th.accent); x = b.text(x + 1, 0, 'ready', th.muted);
        x = mono ? b.text(x + 2, 0, GAP, th.warn) : b.text(x + 2, 0, ' ', th.muted, gapC); b.text(x + 1, 0, 'pending', th.muted);
      }
      if (pend > 0) putR(b, plotX + plotW, Math.max(plotY, row(want[plotW - 1]) - 1), `${pend} pending`, th.warn, undefined, ATTR.BOLD);
      const axY = plotY + plotH;
      b.text(plotX, axY, '-10m', th.dim); putR(b, plotX + plotW, axY, 'now', th.dim);
      if (strip) {                                                   // request rate on its own axis, never a second y-scale
        const vals = Array.from({ length: plotW }, (_, i) => rps(mAt(i))), hi = 2000;
        b.text(0, stripY, 'rps', th.muted);
        for (let i = 0; i < plotW; i++) {
          const h = Math.max(0.12, (vals[i] / hi) * 3), full = Math.floor(h), rem = Math.round((h - full) * 8);
          for (let k = 0; k < full && k < 3; k++) b.set(plotX + i, stripY + 2 - k, g.u ? '█' : '#', th.muted);
          if (rem && full < 3) b.set(plotX + i, stripY + 2 - full, g.u ? VBLOCKS[rem] : '.', th.muted);
        }
        putR(b, W, stripY, `${num(vals[plotW - 1], 1)}/s`, th.muted);
      }
    };
  },
};

// ── cost bridge: last month to this month through each driver ───────────────────────────────────
const CB_LOOP = 14;
const CB_NAMES = [['last mo.', 'last'], ['compute', 'comp'], ['egress', 'egrs'], ['storage', 'stor'], ['discount', 'disc'], ['downsize', 'dnsz'], ['this mo.', 'this']];
const MONTHS = [[41.8, 4.2, 1.6, 0.9, -2.4, -1.3], [44.8, 2.1, 2.8, 0.6, -2.4, -3.2]];   // $k: the total, then each driver
const CB_MIN = 36, CB_MAX = 52;

const costBridge = {
  id: 'charts-cost-bridge',
  since: '0.3.0',
  title: 'Cost Bridge',
  category: 'Bars & Histograms',
  description: "A month-over-month cost waterfall: last month's total, each driver floating up or down from the running level, then this month; next month eases every delta to new heights.",
  tags: ['waterfall', 'bridge', 'cost', 'finops', 'variance', 'bars', 'month over month'],
  kind: 'chart',
  size: { w: 72, h: 14 },
  minSize: { w: 40, h: 8 },
  loop: CB_LOOP,
  color: '256',
  order: 200,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const mono = ctx.caps.depth === 'mono', short = W < 60, axW = 5;
    const slot = Math.floor((W - axW) / 7), barW = Math.max(1, slot - 1), plotY = 1, plotH = Math.max(4, H - (H >= 10 ? 3 : 2));
    // the totals stand on a broken axis: the plot's last row is a break (the bars run on down to 0 behind it)
    const breakY = plotY + plotH - 1, scaleH = plotH - 1, BREAK = g.u ? '≈' : '~';
    const yOf = (v) => plotY + scaleH - ((v - CB_MIN) / (CB_MAX - CB_MIN)) * scaleH;   // fractional row of a value's edge
    const up = mix(th.warn, th.neg, 0.25), down = th.info;
    // One bar spanning values a..z (a < z) with eighth-cell edges: lower blocks on top, inverse blocks at the bottom.
    const bar = (x, a, z, color) => {
      const yt = mono ? Math.floor(yOf(z) + 0.06) : yOf(z), yb = mono ? Math.ceil(yOf(a) - 0.06) : yOf(a);   // mono: whole cells, outward
      for (let y = Math.floor(yt); y < Math.ceil(yb); y++) {
        const from = Math.max(yt, y), to = Math.min(yb, y + 1), part = to - from;
        if (part <= 0.06) continue;
        const k = Math.round(part * 8), flushBottom = to >= y + 1 - 1e-9;
        for (let i = 0; i < barW; i++) {
          if (part >= 0.94 || (mono && part >= 0.5)) b.set(x + i, y, g.u ? '█' : '#', color);
          else if (flushBottom) b.set(x + i, y, g.u ? VBLOCKS[k] : '_', color);
          else if (!mono) b.set(x + i, y, g.u ? VBLOCKS[8 - k] : '"', th.bg, color);
        }
      }
    };
    return (t) => {
      const T = phase(t, CB_LOOP);
      // build month one bar by bar, hold, ease to month two, hold, then fold right-to-left back to empty
      const mix2 = ease((T - 6.5) / 2), m = MONTHS[0].map((v, i) => v + (MONTHS[1][i] - v) * mix2);
      const grow = (i) => (T < 12 ? ease((T - 0.3 - i * 0.55) / 0.5) : 1 - ease((T - 12 - (6 - i) * 0.2) / 0.5));
      // labels show rounded parts, and the new total is their sum, so the bridge always adds up (also mid-ease)
      const shown = m.map((v) => Math.round(v * 10) / 10), sum = Math.round(shown.reduce((s, v) => s + v, 0) * 10) / 10;
      const levels = [m[0]];
      for (let i = 1; i < 6; i++) levels.push(levels[i - 1] + m[i]);
      for (const v of [CB_MAX, (CB_MIN + CB_MAX) / 2, CB_MIN]) putR(b, axW - 1, Math.min(breakY - 1, Math.floor(yOf(v))), `${v}k`, th.muted);
      putR(b, axW - 1, breakY, `${BREAK} 0`, th.muted);
      b.text(0, 0, 'cloud cost, $ per month', th.ink);
      const labels = [];
      for (let i = 0; i < 7; i++) {
        const x = axW + i * slot, k = grow(i);
        if (k <= 0) continue;
        let a, z, color, label;
        if (i === 0 || i === 6) { const v = i ? levels[5] : m[0]; a = CB_MIN; z = CB_MIN + (v - CB_MIN) * k; color = th.accent; label = `$${(i ? sum : shown[0]).toFixed(1)}k`; }
        else { const from = levels[i - 1], to = from + m[i] * k; a = Math.min(from, to); z = Math.max(from, to); color = m[i] >= 0 ? up : down; label = `${shown[i] >= 0 ? '+' : '-'}$${Math.abs(shown[i]).toFixed(1)}k`; }
        bar(x, a, z, color);
        if (i === 0 || i === 6) for (let c = 0; c < barW; c++) b.set(x + c, breakY, BREAK, th.muted);
        if (i < 6 && grow(i + 1) > 0) { const lv = yOf(i ? levels[i] : m[0]), ly = !mono ? Math.round(lv - 0.5) : i === 0 || m[i] >= 0 ? Math.floor(lv + 0.06) : Math.ceil(lv - 0.06) - 1; for (let c = x + barW; c < x + slot; c++) if (c < W) b.set(c, ly, g.u ? '┈' : '.', th.dim); }
        if (Math.floor(yOf(z)) - 1 >= plotY) labels.push([x, Math.floor(yOf(z)) - 1, short ? label.replace('$', '') : label, i]);
        const nm = CB_NAMES[i][short ? 1 : 0];
        b.text(x, plotY + plotH, nm.slice(0, Math.max(1, slot - 1)), th.muted);
      }
      // totals first, then the drivers left to right; a label that would touch a placed one (same row, < 1 space) drops
      const placed = [];
      for (const [x0, y, s, i] of [...labels].sort((p, q) => (q[3] % 6 === 0) - (p[3] % 6 === 0) || p[3] - q[3])) {
        const x = Math.min(x0, W - s.length);
        if (placed.some(([px, py, pw]) => py === y && x < px + pw + 1 && px < x + s.length + 1)) continue;
        placed.push([x, y, s.length]);
        b.text(x, y, s, th.ink, undefined, ATTR.BOLD);
      }
      if (H >= 10) {
        const y = H - 1;
        let x = b.text(axW, y, g.u ? '█' : '#', th.accent); x = b.text(x + 1, y, 'total', th.muted);
        x = b.text(x + 2, y, g.u ? '█' : '#', up); x = b.text(x + 1, y, 'increase', th.muted);
        x = b.text(x + 2, y, g.u ? '█' : '#', down); b.text(x + 1, y, 'saving', th.muted);
      }
    };
  },
};

// ── dumbbell: p95 per endpoint before and after a release ───────────────────────────────────────
const DB_LOOP = 14;
const ENDPOINTS = [['/checkout', 212, [292, 221]], ['/search', 148, [184, 184]], ['/cart', 96, [92, 92]], ['/login', 120, [104, 104]],
  ['/api/orders', 238, [226, 226]], ['/api/users', 84, [80, 80]], ['/assets', 42, [37, 37]], ['/health', 9, [9, 9]]];

const dumbbell = {
  id: 'charts-dumbbell',
  since: '0.3.0',
  title: 'Before / After Release',
  category: 'Bars & Histograms',
  description: 'p95 latency per endpoint before and after a release as dumbbells sorted by change, so two regressions jump out; a hotfix then eases the worst one back.',
  tags: ['dumbbell', 'before after', 'latency', 'release', 'regression', 'comparison', 'endpoints'],
  kind: 'chart',
  size: { w: 64, h: 12 },
  minSize: { w: 36, h: 6 },
  loop: DB_LOOP,
  color: '256',
  order: 210,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const nameW = W >= 48 ? 12 : 8, chgW = 8, head = H >= 10, axisRow = H >= 5, legend = H >= 6;
    const rows = Math.min(ENDPOINTS.length, H - (head ? 2 : 0) - (axisRow ? 1 : 0) - (legend ? 1 : 0));
    const plotX = nameW, plotW = Math.max(10, W - nameW - chgW - 1), MAX = 320;
    const xOf = (ms) => plotX + Math.round((ms / MAX) * (plotW - 1));
    const beforeC = tint(th, th.accent, th.mode === 'light' ? 0.45 : 0.55), y0 = head ? 2 : 0;
    // after = before, then the release (eased), then the hotfix, then back to before at the wrap
    const state = (T) => {
      const rel = ease((T - 0.5) / 2), fix = ease((T - 7) / 1.8), back = ease((T - 12) / 1.5);
      return ENDPOINTS.map(([name, before, [after, fixed]]) => {
        const a = before + (after - before) * rel + (fixed - after) * fix, v = a + (before - a) * back;
        return { name, before, after: v, chg: (v - before) / before };
      });
    };
    const settled = (T) => (T < 2.6 ? 0 : T < 8.9 ? 2.6 : T < 13.6 ? 8.9 : 0);   // rows re-sort once the dots settle
    return (t) => {
      const T = phase(t, DB_LOOP), now = state(T), order = state(settled(T)).map((r, i) => [r.chg, i]).sort((p, q) => q[0] - p[0] || p[1] - q[1]).map(([, i]) => i);
      if (head) b.text(0, 0, 'p95 latency by endpoint', th.ink);
      if (legend) {
        let x = b.text(plotX, H - 1, g.dot, beforeC); x = b.text(x + 1, H - 1, 'before', th.muted);
        x = b.text(x + 2, H - 1, g.dot, th.accent); b.text(x + 1, H - 1, W - x >= 15 ? 'after release' : 'after', th.muted);
      }
      order.slice(0, rows).forEach((i, r) => {
        const { name, before, after, chg } = now[i], y = y0 + r, xb = xOf(before), xa = xOf(after);
        b.text(0, y, name.slice(0, nameW - 1), th.ink);
        for (let x = Math.min(xb, xa) + 1; x < Math.max(xb, xa); x++) b.set(x, y, g.h, th.muted);
        b.set(xb, y, g.dot, beforeC);
        b.set(xa, y, g.dot, th.accent);
        const pct = Math.round(chg * 100), worse = pct >= 5;
        const txt = pct === 0 ? '0%' : `${pct > 0 ? g.up : g.down} ${pct > 0 ? '+' : '-'}${Math.abs(pct)}%`;
        putR(b, W, y, txt, worse ? th.neg : th.muted, undefined, worse ? ATTR.BOLD : 0);
      });
      if (axisRow) {
        const y = y0 + rows;
        for (let x = plotX; x < plotX + plotW; x++) b.set(x, y, g.h, th.dim);
        xTicks(b, plotX, plotW, y, [[0, 100, 200, 300], [0, 150, 300], [0, 300]], (ms) => xOf(ms), th.muted);
        if (W - plotX - plotW > 3) b.text(plotX + plotW + 1, y, 'ms', th.muted);
      }
    };
  },
};

export default [burndown, autoscale, costBridge, dumbbell];
