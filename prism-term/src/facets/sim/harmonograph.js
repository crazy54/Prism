// A rotary harmonograph: two damped pendulums per axis (near-integer frequency
// ratios with a little detune) trace a decaying Lissajous figure. Each cycle a
// pen draws the curve in, the figure breathes as its phases drift, then it
// fades and a fresh set of pendulums takes over. Color flows along the path.
import { mix, NONE } from '../../color.js';
import { rng, easing, smoothstep } from '../../easing.js';

const RATIOS = [[2, 3], [3, 4], [1, 2], [3, 5], [4, 5], [2, 5], [1, 3], [5, 6], [1, 1], [3, 2]];

export default {
  title: 'Harmonograph',
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['harmonograph', 'lissajous', 'pendulum', 'curves'],
  order: 20,
  description: 'Damped rotary harmonograph — a pen traces evolving Lissajous figures in braille, re-tuning its pendulums every cycle.',
  canvas: 'line',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas();
    const { width: W, height: H, aspect } = cv;
    const pal = ctx.palette();
    const C = ctx.param('cycle', 14);
    const Hv = H * aspect;
    const cx = W / 2, cy = H / 2, amp = Math.min(W, Hv) * 0.47, ampX = Math.min(W * 0.47, amp * 1.3);
    const CYCLES = 55, PER = 44; // pendulum swings drawn per figure, samples per swing
    const N = CYCLES * PER;
    const bg = ctx.bg === NONE ? 0 : ctx.bg;

    // Pendulum set for cycle k: x and y run at a near-integer ratio a:b, and
    // each axis sums two slightly detuned pendulums so the figure beats/rotates.
    const tune = (k) => {
      const r = rng((ctx.seed * 7919 + k * 104729) >>> 0);
      const [a, b] = RATIOS[Math.floor(r() * RATIOS.length)];
      const fx = a + (r() - 0.5) * 0.01, fy = b + (r() - 0.5) * 0.01;
      const det = () => (r() < 0.5 ? -1 : 1) * (0.004 + r() * 0.012) * Math.max(a, b);
      const S = (CYCLES * Math.PI * 2) / Math.max(a, b);
      const damp = () => (Math.log(12) / S) * (0.6 + r() * 0.7);
      const A = [0.45 + r() * 0.3, 0, 0.45 + r() * 0.3, 0];
      A[1] = 1 - A[0]; A[3] = 1 - A[2];
      return {
        S,
        f: [fx, fx + det(), fy, fy + det()],
        p: [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28],
        d: [damp(), damp(), damp(), damp()],
        A,
        rot: (r() - 0.5) * (1.2 / S),
        hue: r(),
      };
    };
    let cached = -1, P = null;

    return (t) => {
      const k = Math.floor(t / C), u = (t - k * C) / C;
      if (k !== cached) { P = tune(k); cached = k; }
      const progress = easing.inOutSine(Math.min(1, u / 0.55));
      const alpha = 1 - smoothstep(0.86, 1, u);
      const drift = (t - k * C) * 0.08;
      const { S, f, p, d, A, rot, hue } = P;
      cv.clear();
      const n = Math.max(2, Math.floor(N * progress));
      let px0 = 0, py0 = 0;
      for (let i = 0; i <= n; i++) {
        const s = (i / N) * S;
        let x = A[0] * Math.sin(f[0] * s + p[0] + drift) * Math.exp(-d[0] * s) + A[1] * Math.sin(f[1] * s + p[1]) * Math.exp(-d[1] * s);
        let y = A[2] * Math.sin(f[2] * s + p[2] - drift * 0.7) * Math.exp(-d[2] * s) + A[3] * Math.sin(f[3] * s + p[3]) * Math.exp(-d[3] * s);
        const a = rot * s, ca = Math.cos(a), sa = Math.sin(a);
        [x, y] = [x * ca - y * sa, x * sa + y * ca];
        const X = cx + x * ampX, Y = cy + (y * amp) / aspect;
        if (i > 0) {
          const along = i / N;
          const c = pal(hue + along * 0.5 + t * 0.015);
          cv.line(px0, py0, X, Y, mix(bg, c, alpha * (0.45 + 0.55 * (1 - along * 0.6))));
        }
        px0 = X; py0 = Y;
      }
      if (u < 0.55) {
        // The pen: a bright nib at the drawing point.
        const c = mix(pal(hue + (n / N) * 0.5 + t * 0.015), 0xffffff, 0.6);
        cv.ellipse(px0, py0, 1.5 * cv.sx / 2, (1.5 * cv.sx / 2) / aspect, c, true);
      }
      cv.paint(ctx.buffer);
    };
  },
};
