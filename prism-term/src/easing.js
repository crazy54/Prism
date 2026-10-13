// Easing curves (t ∈ [0,1] → [0,1], some overshoot) and small interpolation helpers.

const { PI, sin, cos, pow, sqrt } = Math;

export const easing = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - pow(1 - t, 4),
  inOutSine: (t) => -(cos(PI * t) - 1) / 2,
  outSine: (t) => sin((t * PI) / 2),
  inExpo: (t) => (t === 0 ? 0 : pow(2, 10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - pow(2, -10 * t)),
  inOutExpo: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2),
  outCirc: (t) => sqrt(1 - pow(t - 1, 2)),
  outBack: (t) => 1 + 2.70158 * pow(t - 1, 3) + 1.70158 * pow(t - 1, 2),
  inOutBack: (t) => {
    const c = 1.70158 * 1.525;
    return t < 0.5 ? (pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * sin((t * 10 - 0.75) * ((2 * PI) / 3)) + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const fract = (x) => x - Math.floor(x);
/** Map v from [a,b] to [c,d]. */
export const remap = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
/** Triangle wave 0→1→0 with period 1. */
export const pingpong = (t) => 1 - Math.abs((t % 2 + 2) % 2 - 1);

/** Progress of a tween that starts at `start` seconds and lasts `dur`, eased. */
export function tween(t, start, dur, ease = easing.inOutCubic) {
  return ease(clamp((t - start) / dur));
}

/** Seeded PRNG (mulberry32) — deterministic scenes and snapshots. */
export function rng(seed = 0x9e3779b9) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.gauss = () => { const u = 1 - next(), v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return next;
}
