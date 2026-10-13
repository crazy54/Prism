// Spring and damper tuning: four masses on identical springs, differing only
// in damping ratio ζ — underdamped (rings), lightly damped, critically damped
// (fastest with no overshoot) and overdamped (sluggish). The target steps back
// and forth; each lane draws the coil and mass, and plots x(t) against the target.
import { mix } from '../../color.js';
import { put } from './_lab.js';

const LANES = [[0.15, 'ringing'], [0.4, 'light'], [1, 'critical'], [2, 'overdamped']];
const STEP = 2.5, HZ = 240, W0 = Math.PI * 2 * 1.1, HIST = 180; // history samples (60 Hz → 3 s)

export default {
  id: 'lab-spring',
  title: 'Spring & Damper',
  gallery: 'lab',
  category: 'Springs & Physics',
  kind: 'chart',
  tags: ['spring', 'damping', 'damping ratio', 'critical damping', 'overshoot', 'physics animation'],
  order: 10,
  description: 'Four springs differing only in damping ratio chase a stepping target, each plotting its response against it.',
  size: { w: 72, h: 20 },
  minSize: { w: 30, h: 8 },
  loop: STEP * 2,
  canvas: 'line',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme, pal = ctx.palette();
    const lanes = LANES.slice(0, Math.max(1, Math.floor(ctx.height / 4)));
    const labelW = 11, split = labelW + Math.floor((ctx.width - labelW) * 0.48);
    const laneH = (ctx.height / lanes.length) * cv.sy;
    const sx0 = labelW * cv.sx, sx1 = split * cv.sx - cv.sx, px0 = (split + 1) * cv.sx, px1 = cv.width - cv.sx;
    const S = lanes.map(() => ({ x: 0.2, v: 0, hist: [] }));
    const guide = mix(th.bg, th.muted, 0.45);
    let acc = 0, rec = 0, simT = 0;
    const target = (tt) => (Math.floor(tt / STEP) % 2 === 0 ? 0.8 : 0.2);
    return (t, dt) => {
      acc += Math.min(0.25, Math.max(0, dt)) * HZ;
      for (; acc >= 1; acc--) {
        simT += 1 / HZ;
        const g = target(simT);
        lanes.forEach(([z], k) => { const s = S[k]; s.v += (-W0 * W0 * (s.x - g) - 2 * z * W0 * s.v) / HZ; s.x += s.v / HZ; });
        if (++rec % 4 === 0) S.forEach((s) => { s.hist.push([s.x, g]); if (s.hist.length > HIST) s.hist.shift(); });
      }
      cv.clear();
      lanes.forEach(([z], k) => {
        const s = S[k], col = pal(k / lanes.length), top = k * laneH, cy = top + laneH * 0.5;
        const X = (v) => sx0 + cv.sx + v * (sx1 - sx0 - cv.sx * 3);
        // Wall, coil, mass.
        for (let y = top + laneH * 0.2; y < top + laneH * 0.8; y++) cv.set(sx0, y, th.muted);
        const mx = X(s.x), coils = 9, amp = laneH * 0.18;
        let lx = sx0, ly = cy;
        for (let i = 1; i <= coils * 2; i++) {
          const nx = sx0 + ((mx - sx0) * i) / (coils * 2), ny = cy + (i === coils * 2 ? 0 : (i % 2 ? -amp : amp));
          cv.line(lx, ly, nx, ny, mix(th.muted, th.ink, 0.3)); lx = nx; ly = ny;
        }
        cv.circle(mx + cv.sx, cy, Math.max(1.5, laneH * 0.22), col, true);
        const gx = X(target(simT));
        for (let y = top + laneH * 0.15; y < top + laneH * 0.85; y += 2) cv.set(gx + cv.sx, y, guide);
        // Response plot: target (dotted) and x(t), newest on the right.
        const h = s.hist, ph = laneH * 0.7, py = (v) => top + laneH * 0.15 + (1 - (v + 0.1) / 1.2) * ph;
        for (let i = 1; i < h.length; i++) {
          const xa = px1 - ((h.length - i) / HIST) * (px1 - px0), xb = px1 - ((h.length - i - 1) / HIST) * (px1 - px0);
          if (i % 2) cv.set(xb, py(h[i][1]), guide);
          cv.line(xa, py(h[i - 1][0]), xb, py(h[i][0]), col);
        }
      });
      cv.paint(ctx.buffer);
      lanes.forEach(([z, word], k) => {
        const row = Math.floor((ctx.height / lanes.length) * k + (ctx.height / lanes.length) / 2) - (ctx.height >= 12 ? 1 : 0);
        put(ctx.buffer, 0, row, `ζ ${z.toFixed(2)}`, th.ink, undefined, undefined, labelW - 1);
        if (ctx.height >= 12) put(ctx.buffer, 0, row + 1, word, th.muted, undefined, undefined, labelW - 1);
      });
    };
  },
};
