// A cubic-bézier timing editor, the kind in every browser's devtools. The two
// handles glide between the CSS presets (and a couple of custom curves); the
// curve redraws, a dot runs it by *time* (x solved for the curve parameter by
// Newton's method, as browsers do), and a swatch slides along a track with
// exactly that timing beside the live cubic-bezier(…) readout.
import { easing } from '../../easing.js';
import { mix } from '../../color.js';
import { put } from './_lab.js';

const PRESETS = [
  ['ease', [0.25, 0.1, 0.25, 1]],
  ['ease-in', [0.42, 0, 1, 1]],
  ['ease-out', [0, 0, 0.58, 1]],
  ['ease-in-out', [0.42, 0, 0.58, 1]],
  ['back-out', [0.34, 1.56, 0.64, 1]],
  ['anticipate', [0.68, -0.55, 0.27, 1.55]],
];
const HOLD = 2.4, MORPH = 0.6;

const bez = (a, b, s) => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s;
const dbez = (a, b, s) => 3 * a * (1 - s) * (1 - s) + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
function solve(x1, x2, x) {
  let s = x;
  for (let i = 0; i < 6; i++) { const d = dbez(x1, x2, s); if (Math.abs(d) < 1e-6) break; s -= (bez(x1, x2, s) - x) / d; }
  if (s < 0 || s > 1 || Math.abs(bez(x1, x2, s) - x) > 1e-4) { // fall back to bisection
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { s = (lo + hi) / 2; if (bez(x1, x2, s) < x) lo = s; else hi = s; }
  }
  return s;
}

export default {
  id: 'lab-bezier',
  title: 'Cubic-Bézier Timing',
  gallery: 'lab',
  category: 'Easing & Timing',
  kind: 'chart',
  tags: ['bezier', 'cubic-bezier', 'css', 'timing function', 'easing', 'devtools'],
  order: 30,
  description: 'A devtools-style cubic-bézier editor: handles glide between CSS presets while a dot and a swatch run the timing.',
  size: { w: 64, h: 20 },
  minSize: { w: 24, h: 8 },
  loop: PRESETS.length * (HOLD + MORPH),
  canvas: 'line',
  palette: 'theme',
  params: {},
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    // Square-ish plot on the left (in pixels), readout and swatch on the right.
    const plotCells = Math.min(ctx.width - 2, Math.max(10, Math.round((ctx.height - 1) * 2.1)));
    const P = { x: cv.sx * 2, y: cv.sy * 1, w: (plotCells - 3) * cv.sx, h: (ctx.height - 3) * cv.sy };
    const VMIN = -0.6, VMAX = 1.6;
    const X = (u) => P.x + u * P.w, Y = (v) => P.y + (1 - (v - VMIN) / (VMAX - VMIN)) * P.h;
    const guide = mix(th.bg, th.muted, 0.45), handleC = th.info;
    const right = plotCells + 1;
    return (t) => {
      cv.clear();
      const per = HOLD + MORPH, n = Math.floor(t / per), ph = t - n * per;
      const A = PRESETS[((n % PRESETS.length) + PRESETS.length) % PRESETS.length], B = PRESETS[(((n + 1) % PRESETS.length) + PRESETS.length) % PRESETS.length];
      const m = ph < HOLD ? 0 : easing.inOutCubic((ph - HOLD) / MORPH);
      const c = A[1].map((v, i) => v + (B[1][i] - v) * m);
      const [x1, y1, x2, y2] = c;
      // Frame: dotted unit square.
      for (let x = 0; x <= P.w; x += 2) { cv.set(X(0) + x, Y(0), guide); cv.set(X(0) + x, Y(1), guide); }
      for (let y = Y(1); y <= Y(0); y += 2) { cv.set(X(0), y, guide); cv.set(X(1), y, guide); }
      // Handles.
      cv.line(X(0), Y(0), X(x1), Y(y1), handleC); cv.line(X(1), Y(1), X(x2), Y(y2), handleC);
      cv.circle(X(x1), Y(y1), 1.5, handleC, true); cv.circle(X(x2), Y(y2), 1.5, handleC, true);
      // Curve.
      let px = X(0), py = Y(0);
      for (let i = 1; i <= 80; i++) {
        const s = i / 80, nx = X(bez(x1, x2, s)), ny = Y(bez(y1, y2, s));
        cv.line(px, py, nx, ny, th.ink); px = nx; py = ny;
      }
      // Run it by time.
      const run = Math.min(1, Math.max(0, (ph - 0.3) / (HOLD - 0.6)));
      const s = solve(x1, x2, run), v = bez(y1, y2, s);
      cv.circle(X(run), Y(v), 1.5, th.accent, true);
      for (let y = Y(Math.max(0, Math.min(1, v))); y <= Y(0); y += 3) cv.set(X(run), y, guide);
      // Swatch on a track, on the right.
      const tx0 = (right + 1) * cv.sx, tx1 = (ctx.width - 2) * cv.sx, ty = Math.round(ctx.height * 0.62) * cv.sy;
      if (tx1 - tx0 > 8) {
        for (let x = tx0; x <= tx1; x += 2) cv.set(x, ty + cv.sy, guide);
        const sx = tx0 + Math.max(-0.6, Math.min(1.6, v)) * (tx1 - tx0 - 4);
        for (let yy = 0; yy < cv.sy; yy++) for (let xx = 0; xx < 4; xx++) cv.set(sx + xx, ty + yy, th.accent);
      }
      cv.paint(ctx.buffer);
      const name = m < 0.5 ? A[0] : B[0];
      put(ctx.buffer, right, 1, name, th.ink, undefined, undefined, ctx.width - right);
      const vals = c.map((v) => v.toFixed(2)), rw = ctx.width - right;
      if (rw >= 34) put(ctx.buffer, right, 2, `cubic-bezier(${vals.join(', ')})`, th.muted, undefined, undefined, rw);
      else { put(ctx.buffer, right, 2, 'cubic-bezier(', th.muted, undefined, undefined, rw); put(ctx.buffer, right + 1, 3, `${vals[0]}, ${vals[1]},`, th.muted, undefined, undefined, rw - 1); put(ctx.buffer, right + 1, 4, `${vals[2]}, ${vals[3]})`, th.muted, undefined, undefined, rw - 1); }
      put(ctx.buffer, right, 6, `t ${run.toFixed(2)} → ${v.toFixed(2)}`, th.info, undefined, undefined, rw);
      put(ctx.buffer, 0, ctx.height - 1, ' time →', th.muted, undefined, undefined, plotCells);
    };
  },
};
