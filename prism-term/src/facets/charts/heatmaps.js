// Heatmaps & Matrices: a scrolling latency heatmap, a contributions calendar
// and a live correlation matrix.
import { mix, gradient } from '../../color.js';
import { palette as makePalette } from '../../palettes.js';
import { monoHint } from '../../canvas.js';
import { signal, glyphs, safe, put, putR, clamp, smooth, memo, lift, onFill, ATTR } from './_data.js';

/**
 * The heat ramp. Magma's near-black floor reads as "nothing" on Night glass;
 * on Day pearl it would be a black slab, so Day climbs from the pearl itself
 * through the brand violet to the warm end. --set palette=… always wins.
 */
const heatRamp = (ctx) => {
  const th = ctx.theme;
  if (th.mode !== 'light' || ctx.params.palette) return ctx.palette('magma');
  return gradient([th.bg, mix(th.bg, th.accent, 0.35), th.accent, th.crit, th.warn]);
};

const heatLatency = {
  id: 'charts-heatmap-latency',
  title: 'Latency Heatmap',
  category: 'Heatmaps & Matrices',
  description: 'Request latency as a scrolling heatmap — log-spaced buckets over time in half-blocks, hot where requests pile up.',
  tags: ['heatmap', 'latency', 'histogram over time', 'half blocks', 'magma'],
  kind: 'chart',
  size: { w: 72, h: 14 },
  minSize: { w: 24, h: 5 },
  loop: 16,
  palette: 'magma',
  order: 10,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const pal = heatRamp(ctx);
    const p50 = signal(ctx, { seed: 91, base: 0.32, amp: 0.06, rate: 2, min: 0.1, max: 0.8 });
    const tail = signal(ctx, { seed: 92, base: 0.1, amp: 0.25, rate: 0.5, min: 0, max: 1 });
    const axisW = W >= 32 ? 7 : 0, foot = H >= 7 ? 1 : 0;
    const cols = W - axisW, rowsPx = (H - foot) * 2;
    const labels = ['5s', '1s', '200ms', '50ms', '10ms'];
    const cached = memo();
    // Mono depth: no color for the heat, so each cell is a luminance-ramp glyph of its value.
    const mono = monoHint(ctx.buffer), ramp = mono?.ramp, last = ramp ? ramp.length - 1 : 0;
    return (t) => {
      const k0 = Math.floor(t * 2) - cols + 1;
      cached(b, 0, 0, W, H, k0, (buf) => draw(buf, k0));
    };
    function draw(b, k0) {
      for (let c = 0; c < cols; c++) {
        const k = k0 + c;
        const m = p50.at(k), tl = tail.at(Math.floor(k / 4));
        for (let r = 0; r < rowsPx; r += 2) {
          const heat = (rr) => {
            const y = 1 - rr / (rowsPx - 1); // 0 fast (bottom) .. 1 slow (top)
            return clamp(Math.exp(-(((y - m) / 0.11) ** 2)) + tl * 0.6 * Math.exp(-(((y - (m + 0.38)) / 0.14) ** 2)) + 0.06 * Math.abs(ctx.noise.noise2(k * 0.7, rr * 0.9)), 0, 1);
          };
          if (mono) b.set(axisW + c, Math.floor(r / 2), ramp[Math.round(((heat(r) + heat(r + 1)) / 2) * last)], -1);
          else b.set(axisW + c, Math.floor(r / 2), '▀', pal(heat(r)), pal(heat(r + 1)));
        }
      }
      if (axisW) labels.forEach((l, i) => { const y = Math.round((i / (labels.length - 1)) * (H - foot - 1)); b.text(0, y, l.padStart(axisW - 1), th.dim); });
      if (foot) { b.text(axisW, H - 1, '-60s', th.dim); putR(b, W, H - 1, 'now', th.dim); if (W >= 50) b.text(axisW + Math.floor(cols / 2) - 6, H - 1, 'checkout p95', th.muted); }
    }
  },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const calendar = {
  id: 'charts-calendar',
  title: 'Contribution Calendar',
  category: 'Heatmaps & Matrices',
  description: 'A GitHub-style contributions calendar — weeks by weekday, five intensity levels, month labels and a "today" cell filling in.',
  tags: ['calendar', 'github', 'contributions', 'activity', 'heatmap'],
  kind: 'chart',
  size: { w: 80, h: 10 },
  minSize: { w: 24, h: 8 },
  loop: 12,
  order: 20,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const levels = [mix(th.bg, th.line, 0.55), mix(th.bg, th.pos, 0.35), mix(th.bg, th.pos, 0.55), mix(th.bg, th.pos, 0.78), th.pos];
    const labW = 4;
    const cw = W - labW >= 70 ? 2 : 1;
    const weeks = Math.max(4, Math.floor((W - labW) / cw));
    const top = H >= 9 ? 1 : 0;
    const days = Array.from({ length: weeks * 7 }, (_, i) => {
      const n = ctx.noise.noise2(i * 0.11, 4.2) + 0.35 * ctx.noise.noise2(i * 0.9, 9.1);
      const weekend = i % 7 >= 5 ? -0.25 : 0;
      return clamp(Math.floor((n + 0.25 + weekend) * 7), 0, 4);
    });
    return (t) => {
      const today = weeks * 7 - 3;
      const grow = Math.floor((t % 12) / 2.4);
      if (top) for (let w = 0; w < weeks; w += 4) {
        const month = MONTHS[Math.floor(((w / weeks) * 12 + 2) % 12)];
        if (labW + w * cw + 3 < W) b.text(labW + w * cw, 0, month, th.dim);
      }
      ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach((d, i) => { if (d) b.text(0, top + i, d, th.dim); });
      for (let i = 0; i < weeks * 7; i++) {
        const w = Math.floor(i / 7), d = i % 7;
        if (i > today) continue;
        let lv = days[i];
        if (i === today) lv = clamp(grow, 0, 4);
        const ch = g.u ? (cw === 2 ? '■' : '▪') : '#';
        b.set(labW + w * cw, top + d, ch, i === today && Math.floor(t * 2) % 2 ? lift(th, levels[lv], 0.4) : levels[lv]);
      }
      if (H >= 9) {
        const y = top + 7;
        const total = days.slice(0, today).reduce((a, v) => a + v * 3, 0) + grow * 3;
        b.text(labW, y, `${total.toLocaleString('en-US')} contributions in the last year`, th.muted);
        if (W >= 60) {
          let x = W - 17;
          x = b.text(x, y, 'Less ', th.dim);
          for (const c of levels) b.set(x++, y, g.u ? '■' : '#', c);
          b.text(x + 1, y, 'More', th.dim);
        }
      }
    };
  },
};

const corr = {
  id: 'charts-corr-matrix',
  title: 'Correlation Matrix',
  category: 'Heatmaps & Matrices',
  description: 'Pairwise correlations between six service metrics on a diverging scale, with coefficients printed in every cell.',
  tags: ['correlation', 'matrix', 'diverging', 'statistics', 'metrics'],
  kind: 'chart',
  size: { w: 52, h: 9 },
  minSize: { w: 30, h: 7 },
  loop: 16,
  color: '256',
  order: 30,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const names = ['cpu', 'mem', 'rps', 'p95', 'err', 'gc'];
    const base = [
      [1, 0.4, 0.82, 0.55, 0.3, 0.45], [0.4, 1, 0.3, 0.48, 0.2, 0.78], [0.82, 0.3, 1, 0.42, 0.15, 0.25],
      [0.55, 0.48, 0.42, 1, 0.71, 0.62], [0.3, 0.2, 0.15, 0.71, 1, 0.35], [0.45, 0.78, 0.25, 0.62, 0.35, 1],
    ];
    const div = gradient([th.info, mix(th.bg, th.ink, 0.15), th.neg]);
    const n = Math.min(names.length, H - 1);
    const labW = 5, cw = Math.max(4, Math.min(7, Math.floor((W - labW) / n)));
    return (t) => {
      names.slice(0, n).forEach((nm, j) => b.text(labW + j * cw + Math.floor((cw - nm.length) / 2), 0, nm, th.muted));
      for (let i = 0; i < n; i++) {
        b.text(0, i + 1, names[i], th.muted);
        for (let j = 0; j < n; j++) {
          const wob = i === j ? 0 : 0.18 * ctx.noise.noise2((i * 7 + j * 3 + Math.min(i, j)) * 0.3, t * 0.25 + (i + j) * 0.1);
          const v = clamp(i === j ? 1 : base[Math.min(i, j)][Math.max(i, j)] + wob - 0.12, -1, 1);
          const bg = div((v + 1) / 2);
          const txt = (v >= 0 ? ' ' : '') + v.toFixed(2).replace(/^(-?)0/, '$1');
          for (let k = 0; k < cw - 1; k++) b.set(labW + j * cw + k, i + 1, ' ', undefined, bg);
          if (cw >= 5) b.text(labW + j * cw + Math.floor((cw - 1 - txt.length) / 2), i + 1, txt, Math.abs(v) > 0.6 ? onFill(th, bg) : th.ink, bg, Math.abs(v) > 0.6 ? ATTR.BOLD : 0);
        }
      }
    };
  },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const heatWeek = {
  id: 'charts-heatmap-week',
  title: 'Hour × Weekday Heatmap',
  category: 'Heatmaps & Matrices',
  description: 'Requests by hour of day and weekday: a weekly traffic heatmap with the current hour filling in live and a cursor reading cells.',
  tags: ['heatmap', 'weekday', 'hourly', 'traffic', 'punch card'],
  kind: 'chart',
  size: { w: 80, h: 10 },
  minSize: { w: 30, h: 8 },
  loop: 14,
  palette: 'magma',
  order: 15,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, g);
    const pal = heatRamp(ctx);
    const labW = 4, cw = clamp(Math.floor((W - labW) / 24), 1, 3);
    const top = H >= 9 ? 1 : 0;
    // Weekday office-hours hump, an evening shoulder, quieter weekends, plus noise.
    const val = Array.from({ length: 7 * 24 }, (_, i) => {
      const d = Math.floor(i / 24), h = i % 24;
      const work = Math.exp(-(((h - 13.5) / 3.6) ** 2)), eve = 0.55 * Math.exp(-(((h - 20.5) / 1.8) ** 2));
      const wk = d >= 5 ? 0.55 : 1;
      return clamp(0.06 + (work * wk + eve * (d >= 4 ? 1.15 : 0.9)) * 0.8 + 0.12 * ctx.noise.noise2(d * 1.3, h * 0.4), 0, 1);
    });
    const NOW = 6 * 24 + 15; // Sunday 15:00
    let peak = 0;
    for (let i = 0; i < NOW; i++) if (val[i] > val[peak]) peak = i;
    return (t) => {
      const lt = t % 14;
      const fill = smooth(clamp((lt % 7) / 6, 0, 1));
      if (top) for (let h = 0; h < 24; h += cw >= 3 ? 3 : 6) b.text(labW + h * cw, 0, String(h).padStart(2, '0'), th.dim);
      // The cursor hops between filled cells, reading one out every two-thirds of a second.
      const cur = (Math.floor(lt * 1.5) * 37) % (NOW + 1);
      for (let d = 0; d < 7; d++) {
        const y = top + d;
        if (y >= H) break;
        b.text(0, y, DAYS[d], d >= 5 ? th.dim : th.muted);
        for (let h = 0; h < 24; h++) {
          const i = d * 24 + h;
          if (i > NOW) { for (let k = 0; k < cw - (cw > 1 ? 1 : 0); k++) b.set(labW + h * cw + k, y, g.u ? '·' : '.', mix(th.bg, th.line, 0.5)); continue; }
          const v = i === NOW ? val[i] * fill : val[i];
          const c = pal(0.08 + 0.9 * v);
          const hot = i === cur;
          for (let k = 0; k < cw - (cw > 1 ? 1 : 0); k++) b.set(labW + h * cw + k, y, g.u ? '█' : '#', hot ? lift(th, c, 0.45) : c);
          if (i === NOW && Math.floor(t * 3) % 2 && cw > 1) b.set(labW + h * cw + cw - 1, y, g.u ? '◂' : '<', th.ink);
        }
      }
      if (top + 7 < H) {
        const d = Math.floor(cur / 24), h = cur % 24;
        const v = cur === NOW ? val[NOW] * fill : val[cur];
        put(b, labW, top + 7, `${DAYS[d]} ${String(h).padStart(2, '0')}:00  ${(v * 61.4).toFixed(1)}k req/h`, W - labW - 12, th.ink);
        if (W >= 60) putR(b, W, top + 7, `peak ${DAYS[Math.floor(peak / 24)]} ${String(peak % 24).padStart(2, '0')}:00`, th.muted);
      }
    };
  },
};

export default [heatLatency, heatWeek, calendar, corr];
