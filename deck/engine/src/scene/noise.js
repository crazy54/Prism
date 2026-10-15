// Seeded randomness and smooth noise — the only sources of "random" a facet may use.
// Same seed → same numbers, in Node, in the browser and on the device.

/** mulberry32: tiny, fast, good enough for visuals. Returns () → [0, 1). */
export function rng(seed = 7) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash → [0, 1). Stateless, so it is safe to call per element per frame. */
export function hash(...ints) {
  let h = 0x811c9dc5;
  for (const v of ints) {
    h ^= (v | 0) + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

/** 1D value noise in [0, 1], smooth, period-free. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = hash(i, seed), b = hash(i + 1, seed);
  return a + (b - a) * fade(f);
}

/** 2D value noise in [0, 1]. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal (fBm) 1D noise in [0, 1]. */
export function fbm1(x, seed = 0, octaves = 3) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) { sum += amp * noise1(x * f, seed + o * 101); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

/**
 * A plausible live metric in [lo, hi] at time t: a slow drift plus a faster
 * jitter, deterministic for the seed. Use it for the fictional "CPU 42%" a key
 * shows when no real data is wired in.
 */
export function metric(t, seed = 0, { lo = 0.15, hi = 0.85, speed = 0.35, jitter = 0.18 } = {}) {
  const drift = fbm1(t * speed, seed, 3);
  const fast = noise1(t * speed * 6, seed + 977) - 0.5;
  const v = drift + fast * jitter;
  return lo + (hi - lo) * Math.min(1, Math.max(0, v));
}

/**
 * The last `count` samples of a metric ending at time t, oldest first, sampled
 * every `step` seconds. Sparklines scroll naturally because the window slides
 * with t, and it is still a pure function of (t, seed).
 */
export function series(t, seed = 0, count = 24, { step = 0.5, ...opts } = {}) {
  const end = Math.floor(t / step);
  const frac = t / step - end;
  const out = [];
  for (let i = count - 1; i >= 0; i--) out.push(metric((end - i) * step, seed, opts));
  return { values: out, frac };
}
