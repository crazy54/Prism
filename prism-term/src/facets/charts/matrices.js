// Part-to-whole and two-way tables: a cost treemap, a 100-host rollout waffle, a retention-cohort
// triangle and a joint density with marginals. Pure functions of t % loop.
import { mix, parse, to256, ansi16Bg, ansi16Text, ANSI16 } from '../../color.js';
import { contrastRatio, terminalScheme } from '../../palettes.js';
import { glyphs, safe, putR, light, lift, onFill, ATTR, VBLOCKS, HBLOCKS } from './_data.js';
import { phase, ease, bump } from './_loop.js';

const hash01 = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Split n cells by weights with largest remainders, so the parts sum to n exactly. */
function split(n, weights) {
  const tot = weights.reduce((s, w) => s + w, 0) || 1, raw = weights.map((w) => (w / tot) * n), out = raw.map(Math.floor);
  let left = n - out.reduce((s, v) => s + v, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((p, q) => q[0] - p[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return out;
}

/** Text that never runs past a tile: cut to w columns. */
const fit = (b, x, y, w, s, fg, bg, attr) => { if (w > 0) b.text(x, y, s.length > w ? s.slice(0, w) : s, fg, bg, attr); };
const usd = (k) => `$${k.toFixed(1)}k`;                          // $k amounts
const pct = (f) => { const r = Math.round(f * 100); return r === 0 ? '0%' : `${r > 0 ? '+' : '-'}${Math.abs(r)}%`; };
const ell = (s, w) => (s.length <= w ? s : w <= 1 ? s.slice(0, w) : `${s.slice(0, w - 1)}…`);   // never a mid-word cut

// ── treemap: monthly spend by team and service; area is cost, color is the change ───────────────
const TM_LOOP = 14;
const TEAMS = [
  ['platform', [['kubernetes', 18.4], ['postgres', 9.8], ['kafka', 6.2], ['redis', 3.1]]],
  ['data', [['warehouse', 14.6], ['spark', 7.9], ['etl', 3.4]]],
  ['ml', [['gpu-train', 11.2], ['inference', 6.4], ['notebooks', 1.9]]],
  ['web', [['api', 8.7], ['cdn', 5.2], ['frontend', 4.1]]],
];
const GROWER = 'gpu-train';

const treemap = {
  id: 'charts-treemap',
  since: '0.3.0',
  title: 'Cost Treemap',
  category: 'Heatmaps & Matrices',
  description: 'Monthly spend by team and service as a slice-and-dice treemap: tile area is cost, color is the change since last month, and GPU training swells 40% and warms.',
  tags: ['treemap', 'cost', 'finops', 'hierarchy', 'part to whole', 'diverging', 'teams'],
  kind: 'chart',
  size: { w: 80, h: 16 },
  minSize: { w: 40, h: 8 },
  loop: TM_LOOP,
  color: '256',
  order: 200,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const neutral = th.panel2, warm = mix(th.warn, th.neg, 0.3), cool = th.info, legendRow = H >= 8;
    const tileC = (chg) => { const k = Math.max(-1, Math.min(1, chg / 0.2)); return k >= 0 ? mix(neutral, warm, k) : mix(neutral, cool, -k); };
    // below truecolor a fill would quantize away: a shade glyph by the size of the change, in a token color
    const rich = ctx.caps.depth === 'truecolor';
    const tex = (chg) => {
      const k = Math.max(-1, Math.min(1, chg / 0.2)), a = Math.abs(k), i = a < 0.35 ? 0 : a < 0.75 ? 1 : 2;
      return [g.u ? '░▒▓'[i] : '.:#'[i], k > 0.15 ? th.warn : k < -0.15 ? th.info : th.dim];
    };
    const areaH = H - (legendRow ? 1 : 0), gut = TEAMS.length - 1;
    return (t) => {
      const u = phase(t, TM_LOOP) / TM_LOOP;
      // Each service drifts a few percent (one or two whole cycles a loop); GPU training swells 40% and settles back.
      const teams = TEAMS.map(([team, svcs], ti) => ({
        team,
        svcs: svcs.map(([name, last], si) => {
          const drift = 0.05 * Math.sin(2 * Math.PI * ((1 + (si % 2)) * u + hash01(ti * 9 + si))), grow = name === GROWER ? 0.4 * bump(u, 0.55, 0.2) : 0;
          return { name, last, now: last * (1 + drift + grow) };
        }),
      }));
      teams.forEach((tm) => { tm.now = tm.svcs.reduce((s, v) => s + v.now, 0); tm.last = tm.svcs.reduce((s, v) => s + v.last, 0); });
      const widths = split(W - gut, teams.map((tm) => tm.now));
      let x = 0;
      teams.forEach((tm, ti) => {
        const w = widths[ti];
        const hdr = `${tm.team} ${usd(tm.now)}`;
        fit(b, x, 0, w, hdr.length <= w ? hdr : ell(tm.team, w), th.ink, undefined, ATTR.BOLD);
        // every service is always a tile; only tiles with room (8x2+) are labelled, tiny ones stay unlabelled slivers
        const bodyH = areaH - 1, heights = split(bodyH, tm.svcs.map((s) => s.now));
        {
          let y = 1;
          tm.svcs.forEach((s, si) => {
            const h = heights[si], chg = s.now / s.last - 1, c = tileC(chg), fillC = rich ? c : undefined, txt = rich ? onFill(th, c) : th.ink;
            if (h <= 0) return;
            if (rich) b.fill(x, y, w, h, ' ', undefined, c); else { const [ch, fg] = tex(chg); b.fill(x, y, w, h, ch, fg); }
            // a thin rule closes each tile but the last, on its own row: labels never share it
            const sep = si < tm.svcs.length - 1 && h >= 3, room = h - (sep ? 1 : 0);
            if (sep) for (let xx = x; xx < x + w; xx++) b.set(xx, y + h - 1, g.u ? '▁' : '_', rich ? mix(c, th.bg, 0.45) : th.dim, fillC);
            if (w >= 8 && room >= 2) {
              fit(b, x + 1, y, w - 1, ell(s.name, w - 1), txt, fillC, ATTR.BOLD);
              fit(b, x + 1, y + 1, w - 1, usd(s.now), txt, fillC);
              if (room >= 3) fit(b, x + 1, y + 2, w - 1, pct(chg), txt, fillC);
            }
            y += h;
          });
        }
        x += w + 1;
      });
      if (legendRow) {
        const y = H - 1, n = Math.min(21, W - 24);
        let xx = b.text(0, y, '-20%', th.muted) + 1;
        for (let i = 0; i < n; i++) { const v = ((i / (n - 1)) * 2 - 1) * 0.2; if (rich) b.set(xx + i, y, ' ', undefined, tileC(v)); else { const [ch, fg] = tex(v); b.set(xx + i, y, ch, fg); } }
        xx = b.text(xx + n + 1, y, '+20%', th.muted);
        if (xx + 17 <= W) b.text(xx + 2, y, 'area = cost', th.muted);
      }
    };
  },
};

// ── waffle: 100 hosts through a kernel patch rollout, filled in reading order ───────────────────
const WF_LOOP = 16, EXCLUDED = new Set([37, 81]), FAILS = [24, 58, 63, 90], RETRY_OK = new Set([24, 63]);
const ORDER = Array.from({ length: 100 }, (_, i) => i).filter((i) => !EXCLUDED.has(i));   // the rollout order: reading order
const flipAt = (rank) => (rank < 2 ? 0.8 : 1.8 + Math.floor((rank - 2) / 10) * 1.05 + ((rank - 2) % 10) * 0.03);
const RANK = new Map(ORDER.map((h, r) => [h, r]));

const waffle = {
  id: 'charts-waffle',
  since: '0.3.0',
  title: 'Patch Rollout Waffle',
  category: 'Heatmaps & Matrices',
  description: 'A 10x10 waffle of 100 hosts through a kernel patch rollout: a 2-host canary, then waves of ten fill in reading order, four fail, and two pass on retry.',
  tags: ['waffle', 'rollout', 'patching', 'fleet', 'part to whole', 'progress', 'hosts'],
  kind: 'chart',
  size: { w: 64, h: 12 },
  minSize: { w: 32, h: 11 },
  loop: WF_LOOP,
  color: '256',
  order: 210,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const side = W >= 50, gx = 0, gy = side ? Math.max(0, Math.floor((H - 10) / 2)) : 0;
    const SQ = g.u ? { ok: '██', pend: '░░', fail: '✖✖', excl: '··' } : { ok: '##', pend: '..', fail: 'xx', excl: '--' };
    return (t) => {
      const T = phase(t, WF_LOOP), reset = T >= 14.6;            // the last 1.4 s: back to all-pending for the next patch
      const counts = { ok: 0, pend: 0, fail: 0, excl: 0 };
      for (let h = 0; h < 100; h++) {
        let st = 'pend';
        if (EXCLUDED.has(h)) st = 'excl';
        else if (!reset || T < 14.6 + (99 - h) * 0.012) {
          const at = flipAt(RANK.get(h));
          if (T >= at) st = FAILS.includes(h) && !(RETRY_OK.has(h) && T >= 11.6) ? 'fail' : 'ok';
        }
        counts[st]++;
        const cx = gx + (h % 10) * 3, cy = gy + Math.floor(h / 10);
        const col = st === 'ok' ? th.accent : st === 'fail' ? th.neg : st === 'excl' ? th.dim : th.muted;
        const fresh = st === 'ok' && T - flipAt(RANK.get(h)) < 0.25 && T < 14.6;
        b.text(cx, cy, SQ[st], fresh ? lift(th, col, 0.5) : col, undefined, st === 'fail' ? ATTR.BOLD : 0);
      }
      const done = ORDER.filter((h) => T >= flipAt(RANK.get(h))).length;
      const wave = reset || T < 0.8 ? 'next patch' : done <= 2 ? 'canary' : T >= 11.6 ? 'retried' : `wave ${Math.min(10, Math.ceil((done - 2) / 10))}/10`;
      const items = [['ok', 'patched'], ['pend', 'pending'], ['fail', 'failed'], ['excl', 'excluded']];
      const colOf = { ok: th.accent, pend: th.muted, fail: th.neg, excl: th.dim };
      if (side) {
        const x0 = 32;
        b.text(x0, gy, 'kernel 6.8.0-49', th.ink, undefined, ATTR.BOLD);
        b.text(x0, gy + 1, wave, th.muted);
        items.forEach(([k, label], i) => { let x = b.text(x0, gy + 3 + i, SQ[k], colOf[k]); x = b.text(x + 1, gy + 3 + i, label.padEnd(9), th.muted); b.text(x, gy + 3 + i, String(counts[k]).padStart(3), th.ink, undefined, ATTR.BOLD); });
      } else if (H >= 11) {
        let x = 0;
        for (const [k] of items) { x = b.text(x, 10, SQ[k][0], colOf[k]); x = b.text(x, 10, String(counts[k]), th.ink) + 1; if (x >= W - 3) break; }
      }
    };
  },
};

// ── cohorts: weekly signup cohorts by weeks since signup, as a triangle ─────────────────────────
const CH_LOOP = 14, CH_STEP = 1.6;
const COHORTS = [['Aug 31', 1204], ['Sep 7', 1311], ['Sep 14', 987], ['Sep 21', 1450], ['Sep 28', 1102], ['Oct 5', 1263], ['Oct 12', 1178]];
const CURVE = [100, 62, 48, 41, 37, 34, 32], DIP = 4;          // DIP: the calendar week a product change landed
const XT_CUBE = [0, 95, 135, 175, 215, 255];
const rgb256 = (i) => { if (i >= 232) { const v = 8 + (i - 232) * 10; return (v << 16) | (v << 8) | v; } const k = i - 16; return (XT_CUBE[(k / 36) | 0] << 16) | (XT_CUBE[((k / 6) | 0) % 6] << 8) | XT_CUBE[k % 6]; };

/** [fill, ink] for v = 0..100: the ink holds 4.5:1 on the fill as this terminal shows it (mono: today's pair). */
function heatInks(th, depth, fillAt, kOf) {
  const plain = (v) => { const f = fillAt(kOf(v)); return [f, onFill(th, f)]; };
  if (depth === 'mono') return Array.from({ length: 101 }, (_, v) => plain(v));
  const lt = th.mode === 'light', sc = depth === '16' ? terminalScheme(th.id) : null;
  const A = sc ? sc.ansi.map(parse) : ANSI16, dFg = sc ? parse(sc.foreground) : lt ? 0x000000 : 0xe5e5e5, dBg = sc ? parse(sc.background) : lt ? 0xffffff : 0x000000;
  const ratio = depth === '16' ? (ink, f) => { const a = ansi16Text(ink, f, lt), z = ansi16Bg(f); return contrastRatio(a < 0 ? dFg : A[a], z < 0 ? dBg : A[z]); }
    : depth === '256' ? (ink, f) => contrastRatio(rgb256(to256(ink)), rgb256(to256(f))) : contrastRatio;
  const best = (f) => { const a = onFill(th, f), z = a === 0xffffff ? (lt ? th.ink : th.bg) : 0xffffff, ra = ratio(a, f), rz = ratio(z, f); return rz > ra ? [f, z, rz] : [f, a, ra]; };
  return Array.from({ length: 101 }, (_, v) => {
    const k0 = kOf(v);
    for (let d = 0; d <= 0.3; d += 0.0025) for (const k of d ? [k0 - d, k0 + d] : [k0]) if (k >= 0 && k <= 1) { const r = best(fillAt(k)); if (r[2] >= 4.5) return [r[0], r[1]]; }
    const [f, ink] = best(fillAt(k0));
    return [f, ink];
  });
}

const cohort = {
  id: 'charts-cohort',
  since: '0.3.0',
  title: 'Retention Cohorts',
  category: 'Heatmaps & Matrices',
  description: 'Weekly signup cohorts by weeks since signup, as a triangle heat table of the share still active; a product change shows as a weaker diagonal, ringed when it lands.',
  tags: ['cohort', 'retention', 'triangle', 'product analytics', 'heat table', 'sequential', 'churn'],
  kind: 'chart',
  size: { w: 72, h: 12 },
  minSize: { w: 40, h: 8 },
  loop: CH_LOOP,
  color: '256',
  order: 220,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const head = H >= 11, n = Math.max(1, Math.min(COHORTS.length, H - (head ? 4 : 3)));
    const labW = W >= 60 ? 16 : 7, cellW = Math.max(4, Math.min(6, Math.floor((W - labW) / n)));
    const value = (i, w) => (w === 0 ? 100 : Math.round(CURVE[w] + 3 * (hash01(i * 7 + w) - 0.5) - (i + w === DIP ? 8 : 0)));
    const heat = heatInks(th, ctx.caps.depth, (k) => mix(th.bg, th.accent, k), (v) => (th.mode === 'light' ? 0.12 + 0.88 * (v / 100) : 0.1 + 0.9 * (v / 100)));
    const txt = (v) => (cellW >= 6 ? `${v}%` : String(v));
    return (t) => {
      const T = phase(t, CH_LOOP), shown = T >= 13.2 || T < 0.4 ? -1 : Math.min(n - 1, Math.floor((T - 0.4) / CH_STEP));   // diagonals filled so far
      const y0 = head ? 2 : 1;
      if (head) b.text(0, 0, 'weekly signup cohorts, % still active', th.ink);
      for (let w = 0; w < n; w++) putR(b, labW + (w + 1) * cellW - 1, y0 - 1, `W${w}`, th.muted);
      const avg = [];
      for (let i = 0; i < n; i++) {
        const [name, size] = COHORTS[i], y = y0 + i;
        b.text(0, y, name, th.ink);
        if (labW >= 16) b.text(7, y, `n=${size.toLocaleString('en-US')}`, th.muted);
        for (let w = 0; w < n - i; w++) {
          const d = i + w;
          if (d > shown) continue;
          const v = value(i, w), [c, ink] = heat[Math.max(0, Math.min(100, v))], ring = d === DIP && shown === DIP && w > 0;
          (avg[w] ??= []).push(v);
          b.fill(labW + w * cellW, y, cellW - 1, 1, ' ', undefined, c);
          const s = !ring ? txt(v) : cellW >= 5 ? `[${v}]` : `*${v}`;   // the ring survives without color: brackets, or a star when tight
          putR(b, labW + (w + 1) * cellW - 1, y, s, ink, c, ring ? ATTR.BOLD : 0);
        }
      }
      const ay = y0 + n;
      b.text(0, ay, 'avg', th.muted);
      avg.forEach((vs, w) => { if (vs?.length) putR(b, labW + (w + 1) * cellW - 1, ay, txt(Math.round(vs.reduce((s, v) => s + v, 0) / vs.length)), th.ink, undefined, ATTR.BOLD); });
      if (H >= 12 && shown >= DIP) {
        const note = [`${g.u ? '◂' : '<'} the weaker diagonal: release 2.4 landed that week`, `${g.u ? '◂' : '<'} weaker diagonal: release 2.4`].find((s) => labW + s.length <= W);
        if (note) b.text(labW, H - 1, note, th.muted);
      }
    };
  },
};

// ── joint density: latency against payload size, with marginal histograms ──────────────────────
const JD_LOOP = 16;
const XT = [['1KB', 0], ['10KB', 0.25], ['100KB', 0.5], ['1MB', 0.75], ['10MB', 1]], YT = [['10s', 0], ['1s', 0.25], ['100ms', 0.5], ['10ms', 0.75], ['1ms', 1]];

const jointDensity = {
  id: 'charts-joint-density',
  since: '0.3.0',
  title: 'Joint Distribution',
  category: 'Heatmaps & Matrices',
  description: 'Request latency against payload size as a 2-D density heatmap with marginals on top and right; a cluster of large, slow uploads grows mid-loop and the crosshair glides to it.',
  tags: ['density', 'heatmap', 'joint distribution', 'marginals', 'latency', 'payload', 'log scale'],
  kind: 'chart',
  size: { w: 72, h: 18 },
  minSize: { w: 44, h: 10 },
  loop: JD_LOOP,
  color: '256',
  canvas: 'field',
  order: 230,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const right = W >= 60, top = H >= 12, axW = 6, gx = axW, gy = top ? 3 : 0;
    const gw = Math.max(8, W - axW - (right ? 9 : 1)), gh = Math.max(3, H - gy - 2);
    const cv = ctx.canvas('field', { cols: gw, rows: gh }), n2 = ctx.noise.noise2;
    const rich = ctx.caps.depth === 'truecolor', RAMP = g.u ? ' ░▒▓█' : ' .:+#';
    const hue = (d) => (d < 0.5 ? mix(th.bg, th.accent, d * 2) : mix(th.accent, light(th), (d - 0.5) * 1.2));
    // Density in log-log space (0..1 both ways, y up): the main mass, a ridge, and a second cluster on a periodic weight.
    const dens = (x, y, u, w2) => {
      const a = Math.exp(-(((x - 0.32) / 0.13) ** 2 + ((y - 0.3) / 0.11) ** 2)), ridge = 0.35 * Math.exp(-(((y - 0.15 - 0.6 * x) / 0.07) ** 2)) * (x < 0.8 ? 1 : 0.3);
      const c = w2 * 0.9 * Math.exp(-(((x - 0.82) / 0.07) ** 2 + ((y - 0.8) / 0.08) ** 2));
      const tex = 0.85 + 0.3 * n2(x * 9 + 2 * Math.cos(2 * Math.PI * u), y * 9 + 2 * Math.sin(2 * Math.PI * u));
      return Math.max(0, (a + ridge + c) * tex);
    };
    return (t) => {
      const T = phase(t, JD_LOOP), u = T / JD_LOOP, w2 = bump(u, 0.55, 0.16);
      const pw = cv.width, ph = cv.height, colSum = new Float64Array(pw), rowSum = new Float64Array(ph);
      for (let py = 0; py < ph; py++) for (let px = 0; px < pw; px++) {
        const d = dens(px / (pw - 1), 1 - py / (ph - 1), u, w2);
        if (rich) cv.set(px, py, d < 0.04 ? -1 : hue(Math.min(1, d)));
        colSum[px] += d; rowSum[py] += d;
      }
      if (rich) cv.paint(b, gx, gy);
      else for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {   // below truecolor: a glyph ramp, never a bare tint
        const fx = cx / Math.max(1, gw - 1), d = Math.min(1, Math.max(dens(fx, 1 - (2 * cy) / (2 * gh - 1), u, w2), dens(fx, 1 - (2 * cy + 1) / (2 * gh - 1), u, w2)));
        if (d >= 0.04) b.set(gx + cx, gy + cy, RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(d * (RAMP.length - 1)))], d > 0.66 ? light(th) : th.accent);
      }
      // The crosshair wanders, then glides to the second cluster while it is there.
      const wx = 0.4 + 0.25 * Math.sin(2 * Math.PI * u), wy = 0.4 + 0.2 * Math.sin(4 * Math.PI * u + 1);
      const cxN = wx + (0.82 - wx) * ease(w2 * 1.4), cyN = wy + (0.8 - wy) * ease(w2 * 1.4);
      const cx = gx + Math.round(cxN * (gw - 1)), cy = gy + Math.round((1 - cyN) * (gh - 1));
      b.set(cx, cy, g.u ? '┼' : '+', th.ink, undefined, ATTR.BOLD);
      const count = Math.round(dens(cxN, cyN, u, w2) * 140);
      if (top) {                                                   // the payload marginal: 3 rows of eighth blocks
        const cs = Array.from({ length: gw }, (_, c) => (colSum[Math.floor(((c + 0.5) * pw) / gw)] ?? 0)), mx = Math.max(...cs) || 1;
        cs.forEach((v, c) => { const h = (v / mx) * 3, full = Math.floor(h), rem = Math.round((h - full) * 8); for (let k = 0; k < full; k++) b.set(gx + c, 2 - k, g.u ? '█' : '#', th.accent); if (rem && full < 3) b.set(gx + c, 2 - full, g.u ? VBLOCKS[rem] : '.', th.accent); });
      }
      if (right) {                                                 // the latency marginal: 8 columns of horizontal eighths
        const rs = Array.from({ length: gh }, (_, r) => (rowSum[Math.floor(((r + 0.5) * ph) / gh)] ?? 0)), mx = Math.max(...rs) || 1;
        rs.forEach((v, r) => { const len = (v / mx) * 8, full = Math.floor(len), rem = Math.round((len - full) * 8); for (let k = 0; k < full; k++) b.set(gx + gw + 1 + k, gy + r, g.u ? '█' : '#', th.accent); if (rem && full < 8) b.set(gx + gw + 1 + full, gy + r, g.u ? HBLOCKS[rem] : '-', th.accent); });
      }
      const ends = W < 60;
      for (const [s, f] of YT) if (!ends || f === 0 || f === 1) putR(b, axW - 1, gy + Math.round(f * (gh - 1)), s, th.muted);
      for (const [s, f] of XT) if (!ends || f === 0 || f === 1) b.text(Math.min(gx + gw - s.length, Math.max(gx, gx + Math.round(f * (gw - 1)) - (s.length >> 1))), gy + gh, s, th.muted);
      const kb = 10 ** (cxN * 4), ms = 10 ** (cyN * 4);
      const read = `${kb >= 1000 ? `${(kb / 1000).toFixed(1)}MB` : `${Math.round(kb)}KB`} ${g.u ? '·' : '-'} ${ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`} ${g.u ? '·' : '-'} ${count} req`;
      b.text(gx, H - 1, read, th.ink);
      if (W >= 60) putR(b, W, H - 1, 'last 60s', th.muted);
      if (top && W >= 60) b.text(0, 0, 'payload', th.muted);
    };
  },
};

export default [treemap, waffle, cohort, jointDensity];
