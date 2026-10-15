// Easing and timing — the motion vocabulary. Refraction motion is ease-out-expo
// convergence (things arrive by resolving into focus), 240–600 ms.

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a0, a1, b0, b1) => lerp(b0, b1, clamp(invLerp(a0, a1, v)));
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

export const linear = (t) => t;
export const inQuad = (t) => t * t;
export const outQuad = (t) => 1 - (1 - t) * (1 - t);
export const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const inCubic = (t) => t * t * t;
export const outCubic = (t) => 1 - (1 - t) ** 3;
export const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const outQuart = (t) => 1 - (1 - t) ** 4;
export const inExpo = (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10));
export const outExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
export const inOutExpo = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2);
export const outBack = (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
export const inOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const outElastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1);

/** Damped spring response at time t (s) — 0 → 1 with overshoot set by damping. */
export function spring(t, { stiffness = 170, damping = 18 } = {}) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness), zeta = damping / (2 * w0);
  if (zeta >= 1) return 1 - (1 + w0 * t) * Math.exp(-w0 * t);
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
}

/** Position within a loop: phase(t, 4) → 0…1 every 4 s. */
export const phase = (t, period) => { const p = (t / period) % 1; return p < 0 ? p + 1 : p; };

/** 0 → 1 → 0 triangle wave over `period`. */
export const pingpong = (t, period = 1) => { const p = phase(t, period) * 2; return p <= 1 ? p : 2 - p; };

/** Smooth 0…1 pulse (cosine) over `period`. */
export const pulse = (t, period = 1) => 0.5 - 0.5 * Math.cos(phase(t, period) * Math.PI * 2);

/**
 * Progress of a transition that started `since` seconds ago and lasts `dur`
 * seconds, eased — e.g. a state change that converges in 0.36 s:
 *   const k = arrive(ctx.since, 0.36);
 */
export const arrive = (since, dur = 0.36, ease = outExpo) => ease(clamp(since / dur));

/** Wrap an angle to [0, 360). */
export const wrap360 = (a) => ((a % 360) + 360) % 360;
