// The easing-curve wall chart, animated: a grid of the standard easings, each
// plotted in braille against dotted 0 and 1 guides (with room for back and
// elastic overshoot), a dot running the curve in lock-step across every panel,
// and a value bar on the right of each that shows what the eased value does.
import { easing } from '../../easing.js';
import { mix } from '../../color.js';
import { grid, put, pxRect } from './_lab.js';

const CURVES = ['linear', 'inQuad', 'outQuad', 'inOutCubic', 'inOutSine', 'inExpo', 'outExpo', 'outCirc', 'outBack', 'inOutBack', 'outElastic', 'outBounce'];
const RUN = 1.6, HOLD = 0.7, VMIN = -0.35, VMAX = 1.35;

export default {
  id: 'lab-easing-gallery',
  title: 'Easing Curves',
  gallery: 'lab',
  category: 'Easing & Timing',
  kind: 'chart',
  tags: ['easing', 'curves', 'tween', 'timing', 'ease in out', 'overshoot', 'braille'],
  order: 10,
  description: 'Twelve standard easings plotted in braille, each with a dot running its curve and a bar showing the eased value.',
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 6 },
  loop: RUN + HOLD,
  canvas: 'line',
  palette: 'theme',
  params: {},
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const cols = Math.max(1, Math.min(4, Math.floor(ctx.width / 18))), rows = Math.max(1, Math.min(3, Math.floor(ctx.height / 7)));
    const panels = grid(ctx.width, ctx.height, cols, rows, 2, 1).slice(0, CURVES.length);
    const guide = mix(th.bg, th.muted, 0.45), curveC = mix(th.muted, th.ink, 0.25);
    return (t) => {
      cv.clear();
      const ph = ((t % (RUN + HOLD)) + RUN + HOLD) % (RUN + HOLD);
      const u = Math.min(1, ph / RUN);
      const labels = [];
      panels.forEach((r, k) => {
        const name = CURVES[k], fn = easing[name];
        const P = pxRect(cv, { x: r.x, y: r.y + 1, w: r.w - 2, h: r.h - 1 });
        const X = (s) => P.x + s * (P.w - 1), Y = (v) => P.y + (1 - (v - VMIN) / (VMAX - VMIN)) * (P.h - 1);
        // Dotted guides at 0 and 1.
        for (let x = 0; x < P.w; x += 2) { cv.set(P.x + x, Y(0), guide); cv.set(P.x + x, Y(1), guide); }
        // The curve, then the part already traveled in the accent.
        const n = Math.max(8, P.w * 2);
        let px = X(0), py = Y(fn(0));
        for (let i = 1; i <= n; i++) {
          const s = i / n, nx = X(s), ny = Y(fn(s));
          cv.line(px, py, nx, ny, s <= u ? th.accent : curveC);
          px = nx; py = ny;
        }
        const v = fn(u);
        cv.circle(X(u), Y(v), Math.max(1, cv.sx * 0.75), th.ink, true);
        // Value bar: a vertical track to the right of the plot.
        const bx = (r.x + r.w - 1) * cv.sx + Math.floor(cv.sx / 2);
        for (let y = Y(1); y <= Y(0); y++) cv.set(bx, y, guide);
        for (let y = Math.min(Y(0), Y(v)); y <= Math.max(Y(0), Y(v)); y++) cv.set(bx, y, th.info);
        labels.push([r, name]);
      });
      cv.paint(ctx.buffer);
      for (const [r, name] of labels) put(ctx.buffer, r.x, r.y, name, th.ink, undefined, undefined, r.w);
    };
  },
};
