// Gauges & Meters: arc and ring gauges, a stereo VU meter with peak hold,
// bullet charts, a sweeping donut and a morphing radar plot.
import { mix, scale, gradient } from '../../color.js';
import { gauge } from '../../widgets/index.js';
import { signal, glyphs, safe, put, putR, num, clamp, smooth, light, ATTR } from './_data.js';

const gaugeArc = {
  id: 'charts-gauge-arc',
  title: 'Arc Gauges',
  category: 'Gauges & Meters',
  description: 'CPU, memory and disk as braille arc gauges with warning and critical zones, sweeping needles and centered readouts.',
  tags: ['gauge', 'arc', 'needle', 'speedometer', 'zones'],
  kind: 'chart',
  size: { w: 72, h: 12 },
  minSize: { w: 20, h: 6 },
  loop: 12,
  glyphs: 'braille',
  order: 10,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const defs = [['CPU', 61, 0.25], ['Memory', 62, 0.12], ['Disk', 63, 0.06]].map(([label, seed, amp]) => ({ label, s: signal(ctx, { seed, base: label === 'Disk' ? 0.82 : 0.55, amp, rate: 1.5, min: 0.02, max: 0.99 }) }));
    const n = Math.max(1, Math.min(defs.length, Math.floor(W / 18)));
    const slot = Math.floor(W / n);
    // Gauges read best at dial size; past that they only cost more to draw.
    const gw = Math.min(slot - 1, 30), gh = Math.min(H, 13);
    const ox = Math.floor((slot - 1 - gw) / 2), oy = Math.floor((H - gh) / 2);
    return (t) => {
      for (let i = 0; i < n; i++) gauge(b, i * slot + ox, oy, gw, gh, defs[i].s.now(t), { label: defs[i].label, theme: th });
    };
  },
};

const gaugeRing = {
  id: 'charts-gauge-ring',
  title: 'Ring Gauges',
  category: 'Gauges & Meters',
  description: 'Four full-circle ring gauges — availability, cache hits, error budget, saturation — filling and draining in real time.',
  tags: ['gauge', 'ring', 'donut', 'percent', 'slo'],
  kind: 'chart',
  size: { w: 72, h: 11 },
  minSize: { w: 18, h: 6 },
  loop: 14,
  glyphs: 'braille',
  order: 20,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const defs = [
      ['Availability', signal(ctx, { seed: 71, base: 0.97, amp: 0.02, rate: 1, min: 0.9, max: 0.9999 }), [[0, 'neg'], [0.95, 'warn'], [0.99, 'pos']], th.pos],
      ['Cache hits', signal(ctx, { seed: 72, base: 0.84, amp: 0.08, rate: 1, min: 0.5, max: 0.99 }), undefined, th.accent],
      ['Error budget', signal(ctx, { seed: 73, base: 0.58, amp: 0.15, rate: 0.5, min: 0.05, max: 0.98 }), [[0, 'neg'], [0.25, 'warn'], [0.5, 'pos']], th.pos],
      ['Saturation', signal(ctx, { seed: 74, base: 0.63, amp: 0.2, rate: 1, min: 0.05, max: 0.98 }), undefined, th.info],
    ];
    const n = Math.max(1, Math.min(defs.length, Math.floor(W / 17)));
    const slot = Math.floor(W / n);
    const gw = Math.min(slot - 1, 26), gh = Math.min(H, 12);
    const ox = Math.floor((slot - 1 - gw) / 2), oy = Math.floor((H - gh) / 2);
    return (t) => {
      for (let i = 0; i < n; i++) {
        const [label, s, zones, color] = defs[i];
        const v = s.now(t);
        gauge(b, i * slot + ox, oy, gw, gh, v, { label, style: 'ring', theme: th, thresholds: zones, color, valueText: v > 0.995 ? `${(v * 100).toFixed(2)}%` : `${(v * 100).toFixed(0)}%` });
      }
    };
  },
};

const vu = {
  id: 'charts-vu-meter',
  title: 'Stereo VU Meter',
  category: 'Gauges & Meters',
  description: 'Left and right LED ladders with fast attack, slow release, peak-hold markers and a dB scale — straight off a mixing desk.',
  tags: ['vu meter', 'led', 'audio', 'peak hold', 'db'],
  kind: 'chart',
  size: { w: 60, h: 6 },
  minSize: { w: 20, h: 2 },
  loop: 8,
  order: 30,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const ch = [{ name: 'L', ph: 0 }, { name: 'R', ph: 1.7 }];
    const level = (t, ph) => {
      const beat = Math.max(0, Math.sin(t * Math.PI * 2 * 2.1 + ph)) ** 6;
      const v = 0.45 + 0.25 * beat + 0.12 * ctx.noise.noise2(t * 6 + ph, ph) + 0.1 * Math.sin(t * 0.7 + ph);
      return clamp(v, 0, 1);
    };
    const labelW = 2, meterW = Math.max(6, W - labelW - (W >= 30 ? 6 : 0));
    const segs = Math.floor(meterW / (g.u ? 1 : 1));
    const heat = (k) => (k > 0.88 ? th.neg : k > 0.7 ? th.warn : th.pos);
    return (t) => {
      const rows = Math.min(2, H);
      for (let r = 0; r < rows; r++) {
        const y = H >= 4 ? r * 2 + (H >= 6 ? 1 : 0) : r;
        // Fast attack / slow release, evaluated as a peak over the recent past.
        let v = 0;
        for (let k = 0; k < 6; k++) v = Math.max(v, level(t - k * 0.03, ch[r].ph) * (1 - k * 0.09));
        let peak = 0;
        for (let k = 0; k < 40; k++) peak = Math.max(peak, level(t - k * 0.05, ch[r].ph));
        b.text(0, y, ch[r].name, th.muted, undefined, ATTR.BOLD);
        const lit = Math.round(v * segs), pk = Math.min(segs - 1, Math.round(peak * segs));
        for (let i = 0; i < segs; i++) {
          const k = i / segs, on = i < lit;
          b.set(labelW + i, y, g.u ? (on ? '▮' : '▯') : on ? '#' : '.', on ? heat(k) : mix(th.bg, heat(k), 0.25));
        }
        b.set(labelW + pk, y, g.u ? '▮' : '|', light(th));
        if (W >= 30) putR(b, W, y, `${(20 * Math.log10(Math.max(0.001, v)) + 3).toFixed(1)}`, heat(v));
      }
      if (H >= 5) {
        const y = H - 1;
        for (const [db, k] of [[-20, 0.1], [-10, 0.32], [-5, 0.56], [-3, 0.7], [0, 0.88], [3, 0.98]]) {
          const x = labelW + Math.round(k * (segs - 1));
          if (x < W - 2) b.text(x, y, String(db), db >= 0 ? th.neg : th.dim);
        }
      }
    };
  },
};

const bullet = {
  id: 'charts-bullet',
  title: 'Bullet Charts',
  category: 'Gauges & Meters',
  description: 'Stephen Few-style bullet charts: qualitative bands, the actual value as a bar and a target tick, one KPI per row.',
  tags: ['bullet chart', 'kpi', 'target', 'bands', 'goals'],
  kind: 'chart',
  size: { w: 60, h: 8 },
  minSize: { w: 28, h: 2 },
  loop: 12,
  order: 40,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const kpis = [
      ['Revenue', 'k$', 320, 260, signal(ctx, { seed: 81, base: 270, amp: 40, rate: 0.6, min: 50, max: 340 })],
      ['Signups', '', 1200, 950, signal(ctx, { seed: 82, base: 880, amp: 140, rate: 0.6, min: 100, max: 1190 })],
      ['NPS', '', 100, 60, signal(ctx, { seed: 83, base: 54, amp: 9, rate: 0.6, min: 0, max: 99 })],
      ['Uptime', '%', 100, 99.9, signal(ctx, { seed: 84, base: 99.93, amp: 0.05, rate: 0.6, min: 99.6, max: 99.999 })],
    ];
    const step = H >= 8 ? 2 : 1;
    const rows = Math.min(kpis.length, Math.floor(H / step));
    const nameW = 9, valW = 9;
    const barW = Math.max(8, W - nameW - valW);
    return (t) => {
      for (let r = 0; r < rows; r++) {
        const [name, unit, max, target, s] = kpis[r];
        const y = r * step;
        const lo = name === 'Uptime' ? 99.5 : 0;
        const X = (v) => Math.round(clamp((v - lo) / (max - lo), 0, 1) * (barW - 1));
        put(b, 0, y, name, nameW - 1, th.ink);
        const bands = [0.6, 0.85, 1].map((k) => lo + (max - lo) * k);
        for (let i = 0; i < barW; i++) {
          const v = lo + ((max - lo) * i) / (barW - 1);
          const band = v <= bands[0] ? 0.16 : v <= bands[1] ? 0.26 : 0.36;
          b.set(nameW + i, y, ' ', undefined, mix(th.bg, th.muted, band));
        }
        const v = s.now(t);
        const len = X(v);
        for (let i = 0; i <= len; i++) b.set(nameW + i, y, g.u ? '▬' : '=', v >= target ? th.pos : th.warn, undefined, ATTR.BOLD);
        b.set(nameW + X(target), y, g.u ? '┃' : '|', light(th), undefined, ATTR.BOLD);
        putR(b, W, y, `${name === 'Uptime' ? v.toFixed(2) : num(v, 0)}${unit}`, v >= target ? th.pos : th.warn, undefined, ATTR.BOLD);
      }
    };
  },
};

const pie = {
  id: 'charts-pie',
  title: 'Sweeping Donut',
  category: 'Gauges & Meters',
  description: 'A cost-by-service donut that sweeps in segment by segment, then slowly turns, with a legend of shares beside it.',
  tags: ['pie', 'donut', 'share', 'cost', 'legend'],
  kind: 'chart',
  size: { w: 56, h: 14 },
  minSize: { w: 24, h: 6 },
  loop: 12,
  canvas: 'hires',
  order: 50,
  setup(ctx) {
    const th = ctx.theme, g = glyphs(ctx), W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const parts = [['compute', 0.38, th.accent], ['storage', 0.22, th.pos], ['network', 0.16, th.warn], ['database', 0.14, th.crit], ['other', 0.1, th.dim]];
    const legendW = W >= 40 ? 20 : 0;
    const cols = W - legendW;
    const cv = ctx.canvas('hires', { cols, rows: H });
    // The ring's pixels never move — precompute each one's angle and shade once.
    const A = cv.aspect;
    const cx = cv.width / 2, cy = cv.height / 2;
    const R = Math.min(cv.width / 2, (cv.height / 2) * A, 28) * 0.95, r0 = R * 0.55;
    const ring = [];
    for (let y = Math.max(0, Math.floor(cy - R / A)); y < Math.min(cv.height, Math.ceil(cy + R / A)); y++) {
      for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(cv.width, Math.ceil(cx + R)); x++) {
        const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * A, d = Math.hypot(dx, dy);
        if (d > R || d < r0) continue;
        const a0 = (Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI * 2);
        const k = (d > R - 1.2 ? 1.15 : 1) * (0.75 + 0.25 * (d - r0) / (R - r0));
        ring.push([x, y, a0, k]);
      }
    }
    const shades = parts.map((p) => Array.from({ length: 12 }, (_, i) => scale(p[2], 0.75 + i * 0.04)));
    const bounds = parts.reduce((acc, p) => { acc.push((acc.at(-1) ?? 0) + p[1]); return acc; }, []);
    return (t) => {
      const cycle = t % 12;
      const sweep = smooth(clamp(cycle / 2.5, 0, 1));
      const rot = (t * 0.15) / (Math.PI * 2);
      cv.clear();
      for (const [x, y, a0, k] of ring) {
        let a = a0 - rot; a -= Math.floor(a);
        if (a > sweep) continue;
        let seg = 0;
        while (seg < parts.length - 1 && a > bounds[seg]) seg++;
        cv.px[y * cv.width + x] = shades[seg][Math.min(11, Math.round((k - 0.75) / 0.04))];
      }
      cv.paint(b);
      const total = '$48.2k';
      const tx = Math.round(cols / 2 - total.length / 2), ty = Math.floor(H / 2);
      if (cols >= 20) { b.text(tx, ty, total, th.ink, undefined, ATTR.BOLD); if (H >= 10) b.text(Math.round(cols / 2 - 3), ty + 1, '/month', th.dim); }
      if (legendW) {
        parts.forEach(([name, share, c], i) => {
          const y = Math.floor((H - parts.length * 2) / 2) + i * 2;
          b.set(cols + 1, y, '■', c);
          b.text(cols + 3, y, name, th.ink);
          putR(b, W, y, `${Math.round(share * 100 * Math.min(1, sweep * 1.4))}%`, th.muted);
        });
      }
    };
  },
};

const radar = {
  id: 'charts-radar',
  title: 'Radar Profile',
  category: 'Gauges & Meters',
  description: 'A six-axis spider chart comparing a service to its baseline: the live profile morphs as the service degrades and heals.',
  tags: ['radar', 'spider chart', 'profile', 'comparison', 'braille'],
  kind: 'chart',
  size: { w: 56, h: 16 },
  minSize: { w: 26, h: 8 },
  loop: 16,
  glyphs: 'braille',
  canvas: 'line',
  order: 60,
  setup(ctx) {
    const th = ctx.theme, W = ctx.width, H = ctx.height, b = safe(ctx.buffer, glyphs(ctx));
    const axes = ['latency', 'errors', 'saturation', 'traffic', 'cost', 'availability'];
    const base = [0.35, 0.15, 0.45, 0.6, 0.4, 0.92];
    const bad = [0.85, 0.7, 0.8, 0.55, 0.5, 0.6];
    const cv = ctx.canvas('line', { cols: W, rows: H, threshold: 0 });
    return (t) => {
      const k = smooth(0.5 + 0.5 * Math.sin((t / 16) * Math.PI * 2));
      const live = base.map((v, i) => v + (bad[i] - v) * k + 0.03 * Math.sin(t * 2 + i));
      const A = cv.aspect, cx = cv.width / 2, cy = cv.height / 2;
      const R = Math.min(cv.width / 2 - 8, (cv.height / 2) * A - 4);
      const pt = (i, v) => { const a = -Math.PI / 2 + (i / axes.length) * Math.PI * 2; return [cx + Math.cos(a) * R * v, cy + (Math.sin(a) * R * v) / A]; };
      cv.clear();
      for (const ring of [0.33, 0.66, 1]) cv.path(axes.map((_, i) => pt(i, ring)), mix(th.bg, th.line, 0.9), true);
      axes.forEach((_, i) => { const [x, y] = pt(i, 1); cv.line(cx, cy, x, y, mix(th.bg, th.line, 0.8)); });
      cv.path(base.map((v, i) => pt(i, v)), th.dim, true);
      const poly = live.map((v, i) => pt(i, clamp(v, 0, 1)));
      cv.path(poly, mix(th.accent, th.neg, k), true);
      for (const [x, y] of poly) { cv.set(x, y, light(th)); cv.set(x + 1, y, light(th)); }
      cv.paint(b);
      axes.forEach((name, i) => {
        const [x, y] = pt(i, 1.12);
        const cxl = Math.round(x / cv.sx), cyl = Math.round(y / cv.sy);
        const label = W >= 40 ? name : name.slice(0, 3);
        b.text(clamp(cxl - Math.floor(label.length / 2), 0, W - label.length), clamp(cyl, 0, H - 1), label, th.muted);
      });
    };
  },
};

export default [gaugeArc, gaugeRing, vu, bullet, pie, radar];
