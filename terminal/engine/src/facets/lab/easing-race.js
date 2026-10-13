// An easing race with an animator's spacing chart. Every lane covers the same
// distance in the same time, but with a different easing; the tick marks are
// where the ball is at equal time steps, so you can read ease-in (ticks
// bunched at the start), ease-out (bunched at the end) and overshoot at a glance.
import { easing } from '../../easing.js';
import { mix } from '../../color.js';
import { put } from './_lab.js';

const LANES = ['linear', 'inQuad', 'outQuad', 'inOutCubic', 'outBack', 'outBounce', 'outElastic', 'inOutExpo'];
const RUN = 1.8, HOLD = 0.8, TICKS = 12;

export default {
  id: 'lab-easing-race',
  title: 'Easing Race',
  gallery: 'lab',
  category: 'Easing & Timing',
  kind: 'chart',
  tags: ['easing', 'spacing chart', 'timing', 'race', 'ease in', 'ease out', 'animation principles'],
  order: 20,
  description: 'Balls racing the same distance in the same time with different easings, over an animator-style spacing chart.',
  size: { w: 64, h: 18 },
  minSize: { w: 24, h: 6 },
  loop: (RUN + HOLD) * 2,
  canvas: 'hires',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const lanes = LANES.slice(0, Math.max(1, Math.floor(ctx.height / 2)));
    const labelW = Math.min(11, Math.max(0, ctx.width - 14));
    const cv = ctx.canvas('hires', { cols: ctx.width - labelW });
    const th = ctx.theme, pal = ctx.palette();
    const W = cv.width, laneH = (ctx.height / lanes.length) * cv.sy;
    const x0 = cv.sx * 1, x1 = W - cv.sx * 1.5;
    const track = mix(th.bg, th.line, 0.9), tick = mix(th.bg, th.muted, 0.8);
    return (t) => {
      cv.clear();
      const period = RUN + HOLD, n = Math.floor(t / period), ph = t - n * period;
      const forward = n % 2 === 0, u = Math.min(1, ph / RUN);
      lanes.forEach((name, k) => {
        const fn = easing[name], cy = laneH * (k + 0.5), col = pal(k / lanes.length);
        for (let x = x0; x <= x1; x += 2) cv.set(x, cy + laneH * 0.3, track);
        // Spacing chart: positions at equal time steps.
        for (let i = 0; i <= TICKS; i++) {
          const v = fn(i / TICKS), x = x0 + (forward ? v : 1 - v) * (x1 - x0);
          for (let d = 0; d < Math.max(1, laneH * 0.2); d++) cv.set(x, cy + laneH * 0.3 - d, tick);
        }
        const v = fn(u), x = x0 + (forward ? v : 1 - v) * (x1 - x0);
        cv.circle(x, cy, Math.max(1, laneH * 0.22 * cv.aspect), col, true);
      });
      cv.paint(ctx.buffer, labelW, 0);
      if (labelW) lanes.forEach((name, k) => put(ctx.buffer, 0, Math.floor((ctx.height / lanes.length) * (k + 0.5)), name, th.muted, undefined, undefined, labelW - 1));
    };
  },
};
