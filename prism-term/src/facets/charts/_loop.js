// Loop-closed data for the context charts: every stream repeats exactly after `period` samples and
// every event is a function of the loop phase, so frame(t) and frame(t + loop) are identical.
import { clamp } from './_data.js';

const TAU = Math.PI * 2;

/** t within the loop, snapped to microseconds so t and t + loop land on the same side of every cue. */
export const phase = (t, loop) => {
  const T = Math.round((((t % loop) + loop) % loop) * 1e6) / 1e6;
  return T >= loop ? T - loop : T;
};

export const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** Index within a period, for negative k too. */
export const wrap = (k, n) => ((k % n) + n) % n;

/**
 * A periodic metric stream: the two noise octaves of signal() (_data.js) sampled on a circle, so the
 * spatial frequency per sample is the same but at(k) === at(k + period).
 */
export function cyclic(ctx, { seed = 1, base = 0, amp = 1, period, min = -Infinity, max = Infinity }) {
  const n2 = ctx.noise.noise2, s = seed * 17.31 + 3.7;
  const r1 = (period * 0.085) / TAU, r2 = (period * 0.29) / TAU;
  return (k) => {
    const a = (TAU * wrap(k, period)) / period, c = Math.cos(a), sn = Math.sin(a);
    return clamp(base + amp * (1.15 * n2(r1 * c, s + r1 * sn) + 0.7 * n2(r2 * c + 41.7, s + 9.1 + r2 * sn)), min, max);
  };
}

/** A bump of height 1 at loop phase c (0..1) and half-width w, smooth across the wrap. */
export const bump = (u, c, w) => {
  let d = Math.abs(u - c) % 1;
  d = Math.min(d, 1 - d);
  return Math.exp(-((d / w) ** 2));
};

/** A smooth step up at phase a and back down at phase b (0..1, a < b), each edge `e` wide. */
export const plateau = (u, a, b, e) => {
  const up = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  return up((u - a) / e + 0.5) * (1 - up((u - b) / e + 0.5));
};

/** How much of the pixel rows [p0, p1) of a cell (rows y*sy .. y*sy+sy) a band [lo, hi) covers, 0..1. */
export const cover = (y, sy, lo, hi) => clamp((Math.min(hi, (y + 1) * sy) - Math.max(lo, y * sy)) / sy, 0, 1);
