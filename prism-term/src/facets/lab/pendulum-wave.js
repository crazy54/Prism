// A pendulum wave seen from above: fifteen pendulums whose lengths are tuned
// so pendulum k swings 20 + k times every 30 seconds. They start in a line,
// drift into traveling snakes, split into two and three interleaved rows,
// dissolve into apparent chaos — and all line up again at the end of the loop.
import { mix } from '../../color.js';
import { put } from './_lab.js';

const N = 15, T = 30, BASE = 20;

export default {
  id: 'lab-pendulum-wave',
  title: 'Pendulum Wave',
  gallery: 'lab',
  category: 'Loops & Cycles',
  kind: 'scene',
  tags: ['pendulum wave', 'harmonics', 'phase', 'beats', 'realignment', 'loop'],
  order: 40,
  description: 'Fifteen pendulums tuned to 20–34 swings per 30 s: snakes, interleaved rows, chaos, then perfect realignment.',
  size: { w: 60, h: 20 },
  minSize: { w: 20, h: 7 },
  loop: T,
  canvas: 'field',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const label = ctx.height >= 8;
    const cv = ctx.canvas('field', { rows: label ? ctx.height - 1 : ctx.height });
    const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme, pal = ctx.palette();
    const gap = W / N, R = Math.max(1, Math.min(gap * 0.38, H * asp * 0.08)), amp = H * 0.5 - R / asp - 1;
    const rail = mix(th.bg, th.line, 0.8), snake = mix(th.bg, th.muted, 0.5);
    return (t) => {
      cv.clear();
      const tl = ((t % T) + T) % T, cy = H / 2;
      for (let x = 0; x < W; x += 2) cv.set(x, cy, rail);
      const pos = Array.from({ length: N }, (_, k) => [gap * (k + 0.5), cy + Math.cos((Math.PI * 2 * (BASE + k) * tl) / T) * amp]);
      for (let k = 1; k < N; k++) cv.line(pos[k - 1][0], pos[k - 1][1], pos[k][0], pos[k][1], snake);
      pos.forEach(([x, y], k) => {
        const col = pal(k / N);
        for (let yy = Math.floor(y - R / asp) - 1; yy <= y + R / asp + 1; yy++) for (let xx = Math.floor(x - R) - 1; xx <= x + R + 1; xx++) {
          const nx = (xx + 0.5 - x) / R, ny = ((yy + 0.5 - y) * asp) / R, q = nx * nx + ny * ny;
          if (q <= 1) cv.set(xx, yy, mix(mix(0x000000, col, 0.4 + 0.6 * Math.max(0, 0.6 - nx * 0.4 - ny * 0.5 + 0.3 * Math.sqrt(1 - q))), 0xffffff, Math.max(0, -nx - ny - 1.1) * 0.6));
        }
      });
      cv.paint(ctx.buffer);
      if (label) put(ctx.buffer, 1, ctx.height - 1, `pendulum k swings ${BASE}+k times per ${T} s · t = ${tl.toFixed(1).padStart(4)} s`, th.muted, undefined, undefined, ctx.width - 2);
    };
  },
};
