// KPI tiles that carry their context: a signup funnel whose connectors hold the conversion rates,
// ratios shown with both of their counters, and capacity tiles that project when each resource is full.
import { NONE } from '../../color.js';
import { drawBanner, measureBanner } from '../../text/index.js';
import { glyphs, safe, frame, putR, ATTR } from './_data.js';
import { phase, ease, cyclic } from './_loop.js';
import { stringWidth } from '../../width.js';

// Words are ink; muted only where it holds 4.5:1 on every palette (dark themes). Semantic color goes on glyphs.
const sub = (th) => (th.mode === 'light' ? th.ink : th.muted);
const comma = (v) => Math.round(v).toLocaleString('en-US');
const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1)}k` : v >= 1000 ? `${(v / 1e3).toFixed(1)}k` : String(Math.round(v)));
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
function bar(b, g, x, y, w, frac, color, track) {
  const e = Math.round(Math.max(0, Math.min(1, frac)) * w * 8), full = Math.floor(e / 8), rem = e % 8;
  for (let i = 0; i < w; i++) {
    if (i < full) b.set(x + i, y, g.u ? '█' : '#', color);
    else if (i === full && rem) b.set(x + i, y, g.u ? EIGHTHS[rem] : '#', color);
    else if (track) b.set(x + i, y, g.u ? '░' : '.', track);
  }
}

// ── funnel: stage tiles linked by connectors that carry the conversion ───────────────────────────
const FN_LOOP = 14, FN_RATE = 4, FN_P = FN_LOOP * FN_RATE;
const STAGES = [['visits', 'visits'], ['signups', 'sign'], ['activated', 'act'], ['paid', 'paid']];

const funnel = {
  id: 'charts-kpi-funnel',
  since: '0.3.0',
  title: 'Funnel Tiles',
  category: 'KPI Tiles',
  description: 'A signup funnel as linked stage tiles, visits to signups to activated to paid, with each conversion on the connector between them, through a broken activation email.',
  tags: ['funnel', 'conversion', 'signups', 'activation', 'kpi', 'growth', 'product analytics'],
  kind: 'chart',
  size: { w: 80, h: 6 },
  minSize: { w: 44, h: 5 },
  loop: FN_LOOP,
  color: '256',
  order: 220,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const n = [0, 1, 2, 3].map((i) => cyclic(ctx, { seed: 321 + i, amp: 1, period: FN_P }));
    const MINUS = g.u ? '−' : '-', MID = g.u ? '·' : '-';
    const CW = W >= 79 ? 9 : W >= 62 ? 6 : 4, T0 = Math.floor((W - 3 * CW) / 4), tileH = H >= 6 ? 5 : 4, bars = tileH >= 5;
    const at = (T) => {
      const k = Math.floor(T * FN_RATE + 1e-9), visits = 12840 + 260 * n[0](k);
      const act = 0.41 - 0.29 * ease((T - 4) / 1) * (1 - ease((T - 9) / 1.5));   // the activation email breaks, then is fixed
      const rates = [0.096 + 0.0015 * n[1](k), act + 0.006 * n[2](k), 0.2 + 0.006 * n[3](k)];
      const counts = [visits];
      rates.forEach((r) => counts.push(counts[counts.length - 1] * r));
      return { counts: counts.map(Math.round), rates, norm: [0.096, 0.41, 0.2] };
    };
    const pct = (r) => (r < 0.1 ? `${(r * 100).toFixed(1)}%` : `${Math.round(r * 100)}%`);
    return (t) => {
      const T = phase(t, FN_LOOP), s = at(T), cy = 2;
      for (let i = 0; i < 4; i++) {
        const x = i * (T0 + CW), w = i === 3 ? W - x : T0, inner = frame(b, x, 0, w, tileH, th.line, g, '', th.ink);
        const [name, abbr] = STAGES[i], c = s.counts[i];
        b.text(inner.x, inner.y, stringWidth(name) <= inner.w ? name : abbr, th.ink);
        b.text(inner.x, inner.y + 1, stringWidth(comma(c)) <= inner.w ? comma(c) : short(c), th.ink, undefined, ATTR.BOLD);
        if (bars) bar(b, g, inner.x, inner.y + 2, inner.w, Math.max(1 / (8 * inner.w), c / s.counts[0]), th.accent);
        if (i === 3) break;
        // the connector after this tile: its conversion, and how far it has fallen when it breaks
        const cx = x + w, r = s.rates[i], d = Math.round((r - s.norm[i]) * 100), broken = d <= -5;
        const label = CW >= 9 ? `${g.h} ${pct(r)} ${g.arrowR}` : CW >= 6 ? `${pct(r)}${g.arrowR}` : pct(r);
        const lx = cx + Math.max(0, Math.floor((CW - stringWidth(label)) / 2));
        if (CW >= 9) { b.text(lx, cy, g.h, sub(th)); b.text(lx + 2, cy, pct(r), th.ink, undefined, ATTR.BOLD); b.text(lx + 2 + stringWidth(pct(r)) + 1, cy, g.arrowR, broken ? th.warn : sub(th)); }
        else { b.text(lx, cy, pct(r), th.ink, undefined, ATTR.BOLD); if (CW >= 6) b.text(lx + stringWidth(pct(r)), cy, g.arrowR, broken ? th.warn : sub(th)); }
        if (broken) {
          const dy = tileH >= 5 ? cy + 1 : Math.min(H - 1, tileH), txt = CW >= 9 ? `${MINUS}${-d} pts` : `${MINUS}${-d}`;
          const dx = cx + Math.max(0, Math.floor((CW - stringWidth(txt) - 2) / 2));
          if (dy < H) { b.text(dx, dy, g.down, th.warn, undefined, ATTR.BOLD); b.text(dx + (CW >= 6 ? 2 : 1), dy, txt, th.ink, undefined, ATTR.BOLD); }
        }
      }
      const conv = `${((s.counts[3] / s.counts[0]) * 100).toFixed(2)}%`;
      const foot = [`last 60 min ${MID} visits ${g.u ? '→' : '->'} paid ${conv}`, `visits ${g.u ? '→' : '->'} paid ${conv}`].find((f) => stringWidth(f) <= W);
      if (H >= 6 && foot) b.text(0, H - 1, foot, sub(th));
    };
  },
};

// ── ratio tiles: each rate over both of its counters, so a scary % reads against its n ───────────
const RT_LOOP = 12;
const RATIOS = [
  { label: 'error rate', unit: 'req', num: 1284, den: 305112, rate: 4, seed: 331, low: true },
  { label: 'cache hit', unit: 'lookups', num: 981230, den: 1010532, rate: 2, seed: 332 },
  { label: 'retries', unit: 'jobs', num: 214, den: 11890, rate: 1, seed: 333 },
];

const ratio = {
  id: 'charts-kpi-ratio',
  since: '0.3.0',
  title: 'Ratio Tiles',
  category: 'KPI Tiles',
  description: 'Rates shown with their parts, errors over requests, hits over lookups, retries over jobs, so a low-traffic minute that jumps the error rate to 6% reads against its tiny n.',
  tags: ['ratio', 'error rate', 'cache hit', 'denominator', 'sample size', 'kpi', 'counters'],
  kind: 'chart',
  size: { w: 72, h: 6 },
  minSize: { w: 40, h: 5 },
  loop: RT_LOOP,
  color: '256',
  order: 230,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g), mono = ctx.caps.depth === 'mono';
    const noise = RATIOS.map((r) => [cyclic(ctx, { seed: r.seed, amp: 1, period: RT_LOOP * r.rate }), cyclic(ctx, { seed: r.seed + 50, amp: 1, period: RT_LOOP * r.rate })]);
    const n = W >= 66 ? 3 : 2, tw = Math.floor(W / n);
    const at = (i, T) => {
      const r = RATIOS[i], k = Math.floor(T * r.rate + 1e-9);
      let num = r.num * (1 + 0.012 * noise[i][0](k)), den = r.den * (1 + 0.006 * noise[i][1](k));
      if (r.low) {   // a low-traffic minute: requests fall to ~50 and the error ratio jumps on 3 of them
        const lw = ease((T - 5) / 0.6) * (1 - ease((T - 8.6) / 0.8));
        num = Math.exp(Math.log(num) * (1 - lw) + Math.log(3) * lw); den = Math.exp(Math.log(den) * (1 - lw) + Math.log(50) * lw);
      }
      return { num: Math.round(num), den: Math.max(1, Math.round(den)) };
    };
    const big = (x, y, w, h, txt) => {   // the ratio, in a bitmap font where it fits (solid glyphs under NO_COLOR)
      if (!g.u || h < 4) { b.text(x, y, txt, th.ink, undefined, ATTR.BOLD); return 1; }
      const m = measureBanner(txt, { font: 'tiny', mode: 'half' });
      if (m.width > w || m.height > h - 1) { b.text(x, y, txt, th.ink, undefined, ATTR.BOLD); return 1; }
      drawBanner(b, x, y, txt, { font: 'tiny', mode: 'half', fill: 'ink', theme: th });
      if (mono) for (let yy = y; yy < y + m.height; yy++) for (let xx = x; xx < x + m.width; xx++) { const c = b.get(xx, yy); if (c && c.bg !== NONE && c.bg !== ctx.bg) b.set(xx, yy, '█', th.ink, ctx.bg); }
      return m.height;
    };
    return (t) => {
      const T = phase(t, RT_LOOP);
      for (let i = 0; i < n; i++) {
        const r = RATIOS[i], s = at(i, T), x = i * tw, w = i === n - 1 ? W - x : tw - 1;
        const inner = frame(b, x, 0, w, H, th.line, g, r.label, th.ink);
        const p = (s.num / s.den) * 100, txt = `${p >= 10 ? p.toFixed(1) : p.toFixed(2)}%`;
        const used = big(inner.x, inner.y, inner.w, inner.h, txt), y = inner.y + used, lowN = s.den < 100;
        const parts = [`${comma(s.num)} / ${comma(s.den)} ${r.unit}`, `${short(s.num)} / ${short(s.den)} ${r.unit}`, `${short(s.num)} / ${short(s.den)}`];
        const tag = [`${g.up} low n (<100)`, `${g.up} low n`];
        const line = parts.find((o) => stringWidth(o) <= inner.w) ?? parts[2];
        const cy = Math.min(inner.y + inner.h - 1, y);
        b.text(inner.x, cy, line, sub(th));
        if (lowN) {
          const fitTag = tag.find((o) => stringWidth(line) + 1 + stringWidth(o) <= inner.w);
          const [tx, ty, tt] = fitTag ? [inner.x + stringWidth(line) + 1, cy, fitTag] : [inner.x, Math.min(inner.y + inner.h - 1, cy + 1), tag.find((o) => stringWidth(o) <= inner.w) ?? tag[1]];
          if (ty !== cy || fitTag) { b.text(tx, ty, g.up, th.warn, undefined, ATTR.BOLD); b.text(tx + 2, ty, tt.slice(2), th.ink, undefined, ATTR.BOLD); }
        }
      }
    };
  },
};

// ── capacity runway: used, growth, and when each resource is full ─────────────────────────────────
const RW_LOOP = 16, TODAY = [10, 12];   // Nov 12 (month index, day)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const RES = [
  { name: 'db volume', used: 71.2, grow: 1.2, job: 2.8 },
  { name: 'object store', used: 48, grow: 0.6 },
  { name: 'IP pool', used: 81, grow: 0.4 },
  { name: 'license seats', used: 92, grow: 0.1 },
];
const dateIn = (days) => { let [m, d] = TODAY; d += days; while (d > MDAYS[m]) { d -= MDAYS[m]; m = (m + 1) % 12; } return `${MONTHS[m]} ${d}`; };

const runway = {
  id: 'charts-kpi-runway',
  since: '0.3.0',
  title: 'Capacity Runway Tiles',
  category: 'KPI Tiles',
  description: 'Capacity tiles that project when each resource runs out: used, growth per day, then full in N days and the date, as a backfill job shortens the database runway.',
  tags: ['capacity', 'forecast', 'runway', 'disk', 'quota', 'kpi', 'planning'],
  kind: 'chart',
  size: { w: 80, h: 6 },
  minSize: { w: 44, h: 5 },
  loop: RW_LOOP,
  color: '256',
  order: 240,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const n = W >= 76 ? 4 : 2, tw = Math.floor(W / n), MID = g.u ? '·' : '-';
    return (t) => {
      const T = phase(t, RW_LOOP);
      for (let i = 0; i < n; i++) {
        const r = RES[i], x = i * tw, w = i === n - 1 ? W - x : tw - 1, inner = frame(b, x, 0, w, H, th.line, g, r.name, th.ink);
        const grow = r.grow + (r.job ?? 0) * ease((T - 4) / 2) * (1 - ease((T - 10) / 3));   // a backfill job, then growth relaxes
        const days = Math.max(1, Math.round((100 - r.used) / grow)), soon = days < 14;
        b.text(inner.x, inner.y, `${Math.round(r.used)}% used`, th.ink, undefined, ATTR.BOLD);
        if (soon && inner.w >= 16) { putR(b, inner.x + inner.w - 5, inner.y, g.up, th.warn, undefined, ATTR.BOLD); putR(b, inner.x + inner.w, inner.y, 'soon', th.ink, undefined, ATTR.BOLD); }
        // meter: used, the next 14 days of growth, then the free rest
        const mw = inner.w - 1, used = (r.used / 100) * mw, proj = Math.min(100, r.used + 14 * grow) / 100 * mw;
        for (let k = 0; k < mw; k++) b.set(inner.x + k, inner.y + 1, k < Math.round(used) ? (g.u ? '█' : '#') : k < Math.round(proj) ? (g.u ? '▒' : ':') : g.u ? '░' : '.', k < Math.round(used) ? th.accent : k < Math.round(proj) ? (soon ? th.warn : th.accent) : sub(th));
        b.set(inner.x + mw, inner.y + 1, g.u ? '┃' : '|', th.ink);
        let y = inner.y + 2;
        if (inner.h >= 4) b.text(inner.x, y++, `+${grow.toFixed(1)}%/day`, sub(th));
        if (y < inner.y + inner.h) {
          const full = `full in ${days}d`, date = [` ${MID} ${dateIn(days)}`, ` ${dateIn(days)}`].find((d) => stringWidth(full + d) <= inner.w);
          b.text(inner.x, y, full, th.ink, undefined, ATTR.BOLD);
          if (date) b.text(inner.x + stringWidth(full), y, date, sub(th));
        }
      }
    };
  },
};

export default [funnel, ratio, runway];
