// A wall clock in braille: a double bezel, minute and hour ticks, numerals,
// tapered baton hands that pass over the numerals, a sweeping second hand with
// a counterweight, and a date window. Time starts at 10:08:36 — the
// watchmaker's favorite pose — and runs in real seconds.
import { ATTR } from '../../buffer.js';
import { blend } from './_raster.js';

export default {
  title: 'Analog Clock',
  gallery: 'objects',
  category: 'Mechanical',
  kind: 'widget',
  tags: ['clock', 'time', 'watch', 'braille', 'hands'],
  order: 20,
  description: 'A braille wall clock with a bezel, ticks, numerals, tapered baton hands and a smoothly sweeping second hand.',
  size: { w: 40, h: 20 },
  minSize: { w: 14, h: 7 },
  loop: 60,
  canvas: 'line',
  palette: 'prism',
  params: { rate: { default: 1, min: 1, max: 600, label: 'Time multiplier' } },
  setup(ctx) {
    const cv = ctx.canvas('line');
    const rate = ctx.param('rate', 1);
    const th = ctx.theme;
    const W = cv.width, H = cv.height, asp = cv.aspect;
    const R = Math.min(W / 2 - 1.5, (H * asp) / 2 - 1.5);
    const cx = W / 2, cy = H / 2;
    // Clock-face polar → canvas pixels (angle 0 at twelve, clockwise).
    const P = (a, r) => [cx + Math.sin(a) * r, cy - (Math.cos(a) * r) / asp];
    // Baton hand: a quad from a short tail behind the hub to a narrow tip.
    const hand = (a, len, tail, width, color) => {
      const ox = Math.cos(a) * width * 0.5, oy = (Math.sin(a) * width * 0.5) / asp;
      const t0 = P(a + Math.PI, tail), t1 = P(a, len);
      cv.polygon([[t0[0] - ox, t0[1] - oy], [t0[0] + ox, t0[1] + oy], [t1[0] + ox * 0.25, t1[1] + oy * 0.25], [t1[0] - ox * 0.25, t1[1] - oy * 0.25]], color);
      cv.line(t0[0], t0[1], t1[0], t1[1], color);
    };
    const bezel = blend(th.line, th.ink, 0.35);
    const minor = blend(th.bg, th.muted, 0.85);
    const start = 10 * 3600 + 8 * 60 + 36;
    const cellX = (x) => Math.round(x / cv.sx - 0.5), cellY = (y) => Math.round(y / cv.sy - 0.5);
    return (t) => {
      cv.clear();
      const b = ctx.buffer, cw = ctx.width, ch = ctx.height;
      const secs = start + t * rate;
      // Layered like a real dial: bezel and ticks, then numerals and date over
      // them (as text), then the hands painted over everything.
      cv.ellipse(cx, cy, R, R / asp, bezel);
      if (R > 12) for (const d of [0.7, 1.4]) cv.ellipse(cx, cy, R - d, (R - d) / asp, bezel);
      for (let m = 0; m < 60; m++) {
        const a = (m / 60) * Math.PI * 2;
        const major = m % 5 === 0;
        if (!major && R < 12) continue;
        const [x0, y0] = P(a, R * (major ? (m % 15 ? 0.82 : 0.78) : 0.89)), [x1, y1] = P(a, R * 0.94);
        cv.line(x0, y0, x1, y1, major ? th.ink : minor);
      }
      cv.paint(b);
      cv.clear();
      if (R > 8) {
        const all = R >= 30;
        for (let n = 1; n <= 12; n++) {
          if (!all && n % 3) continue;
          const label = String(n);
          const [x, y] = P((n / 12) * Math.PI * 2, R * 0.7);
          const X = Math.min(cw - label.length, Math.max(0, cellX(x) - (label.length >> 1)));
          b.text(X, Math.min(ch - 1, Math.max(0, cellY(y))), label, n % 3 ? th.muted : th.ink, undefined, ATTR.BOLD);
        }
      }
      if (R >= 22) {
        const day = String(13 + (Math.floor(secs / 86400) % 18));
        const [x, y] = P(Math.PI / 2, R * 0.42);
        b.text(cellX(x) - 1, cellY(y), day, th.bg, th.muted, ATTR.BOLD);
      }
      // Hands: the hour and minute advance continuously, the second hand sweeps.
      const s = secs % 60, mi = (secs / 60) % 60, h = (secs / 3600) % 12;
      hand((h / 12) * Math.PI * 2, R * 0.5, R * 0.1, Math.max(1, R * 0.12), th.ink);
      hand((mi / 60) * Math.PI * 2, R * 0.8, R * 0.12, Math.max(1, R * 0.08), blend(th.ink, th.info, 0.3));
      const sa = (s / 60) * Math.PI * 2;
      const st = P(sa, R * 0.88), sb = P(sa + Math.PI, R * 0.2);
      cv.line(sb[0], sb[1], st[0], st[1], th.neg);
      if (R > 12) { const [wx, wy] = P(sa + Math.PI, R * 0.17); cv.circle(wx, wy, R * 0.035 + 0.6, th.neg, true); }
      cv.circle(cx, cy, Math.max(1, R * 0.05), th.neg, true);
      cv.paint(b);
    };
  },
};
