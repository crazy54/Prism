// A six-string harp played in an arpeggio. Each string is a real 1-D wave
// equation (finite differences, fixed ends, light damping and a touch of
// stiffness) plucked into a triangle and left to ring, so you see the kink
// split into two traveling waves, reflect off the bridges and settle into
// the fundamental. Lower strings swing slower and wider; ringing strings glow,
// and a dotted envelope traces each string's recent swing — the blur your eye
// sees on a real vibrating string, which single frames would otherwise miss.
import { mix } from '../../color.js';
import { fadeMark } from '../../palettes.js';

const STRINGS = 6, N = 72, HZ = 900;
const PLUCK = 0.5; // seconds between plucks
const PATTERN = [0, 2, 4, 5, 3, 1, 2, 4, 3, 5, 1, 0];

export default {
  title: 'Plucked Strings',
  gallery: 'sim',
  category: 'Physics',
  kind: 'scene',
  tags: ['wave equation', 'strings', 'harp', 'standing waves', 'pluck', 'braille'],
  order: 40,
  description: 'A six-string harp plucked in an arpeggio: real wave-equation strings that split, reflect and ring down.',
  size: { w: 60, h: 20 },
  minSize: { w: 20, h: 7 },
  loop: PATTERN.length * PLUCK,
  canvas: 'line',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const cv = ctx.canvas('line');
    const W = cv.width, H = cv.height, th = ctx.theme;
    const pal = ctx.palette();
    // Wave speed per string (Courant number ≤ 1), lowest string first.
    const c = Array.from({ length: STRINGS }, (_, k) => 0.42 + k * 0.11);
    const y = Array.from({ length: STRINGS }, () => new Float32Array(N));
    const yp = Array.from({ length: STRINGS }, () => new Float32Array(N));
    const yn = new Float32Array(N);
    const energy = new Float32Array(STRINGS);
    const env = Array.from({ length: STRINGS }, () => new Float32Array(N));
    const cols = Array.from({ length: STRINGS }, (_, k) => pal(k / STRINGS));
    const x0 = Math.max(2, W * 0.06), x1 = W - 1 - Math.max(2, W * 0.06);
    const gap = H / STRINGS;
    let acc = 0, plucked = -1;
    const pluck = (k, at, amp) => {
      const p = Math.round(N * at);
      for (let i = 0; i < N; i++) y[k][i] = yp[k][i] = i <= p ? (amp * i) / p : (amp * (N - 1 - i)) / (N - 1 - p);
    };
    const step = () => {
      for (let k = 0; k < STRINGS; k++) {
        const Y = y[k], P = yp[k], c2 = c[k] * c[k];
        let e = 0;
        for (let i = 1; i < N - 1; i++) {
          const lap = Y[i - 1] - 2 * Y[i] + Y[i + 1];
          const stiff = i > 1 && i < N - 2 ? Y[i - 2] - 4 * Y[i - 1] + 6 * Y[i] - 4 * Y[i + 1] + Y[i + 2] : 0;
          yn[i] = (2 * Y[i] - P[i] * 0.9993 + c2 * lap - 0.004 * stiff) / 1.0007;
          e += Math.abs(yn[i]);
        }
        yn[0] = yn[N - 1] = 0;
        P.set(Y); Y.set(yn);
        const E = env[k];
        for (let i = 0; i < N; i++) { const a = yn[i] < 0 ? -yn[i] : yn[i]; E[i] = a > E[i] ? a : E[i] * 0.9988; }
        energy[k] = e / N;
      }
    };

    return (t, dt) => {
      const n = Math.floor(t / PLUCK);
      if (n !== plucked) {
        plucked = n;
        const k = PATTERN[((n % PATTERN.length) + PATTERN.length) % PATTERN.length];
        pluck(k, 0.18 + (n % 3) * 0.07, 1 - k * 0.05);
      }
      acc += Math.min(0.25, Math.max(0, dt)) * HZ;
      for (let s = 0; acc >= 1 && s < 240; s++, acc--) step();
      if (acc > 240) acc = 0;
      cv.clear();
      for (let k = 0; k < STRINGS; k++) {
        const base = gap * (k + 0.5), amp = gap * 0.9;
        const glow = Math.min(1, energy[k] * 4);
        const col = mix(mix(th.bg, th.muted, 0.85), cols[k], glow);
        const haze = fadeMark(th, cols[k], 0.25 + 0.45 * glow);
        const Y = y[k], E = env[k];
        let px = x0, py = base;
        for (let s = 1; s <= Math.ceil(x1 - x0); s++) {
          const f = s / (x1 - x0), u = f * (N - 1), i = Math.min(N - 2, Math.floor(u)), fr = u - i;
          const v = Y[i] * (1 - fr) + Y[i + 1] * fr;
          const nx = x0 + s, ny = base + v * amp;
          // Envelope edges, every other pixel so they read as a blur, not a second string.
          const e = (E[i] * (1 - fr) + E[i + 1] * fr) * amp;
          if (e > 1.2 && (s & 1) === 0) { cv.set(nx, base - e, haze); cv.set(nx, base + e, haze); }
          cv.line(px, py, nx, ny, col);
          px = nx; py = ny;
        }
        // Pegs and bridge pins.
        cv.set(x0 - 1, base, th.ink); cv.set(x0 - 2, base, th.ink);
        cv.set(x1 + 1, base, th.ink);
      }
      cv.paint(ctx.buffer);
    };
  },
};
