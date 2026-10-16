// D4's shared kit for the Dials & Strips gallery.
//
// How a dial segment speaks (Stream Deck + / + XL encoders, 200 × 100 per dial; the
// Galleon 100 SD shows the same 200 × 100 art scaled into a ≈ 360 × 192 screen widget):
//   rotate  → ctx.value (0–1, `step` per detent) and ctx.ticks (accumulated detents);
//             every detent moves something you can see, even at the limits
//   push    → ctx.pressed / ctx.pressAge (the theme's own press feedback, applied by
//             finish()) and, for toggle / cycle facets, the next state
//   touch   → a tap on the + strip arrives as a push of that dial; the Galleon has no
//             touch and its long-press switches widget layers, so nothing here needs either
// Budget: a segment is static at rest (runtimes dedupe identical frames to zero
// updates); it animates on arrival, on a state change, on a press, or while it shows
// live data (≤ 8 fps per segment, ≤ 4–6 fps for whole-strip panoramas, drawn per segment
// so the culled slices that didn't change stay byte-identical).
// Layout: content stays inside the theme's safe inset (k.m.safe ≈ 8.7 px) and clear of
// the bottom 6 px, where themes draw their light pipe / glaze band — so the art survives
// the Galleon's scaling (uniform or stretched, ± 6 px of crop) and the bezel.

import { svgDoc, path, n, P } from '../../scene/svg.js';
import { arcPath, polar } from '../../scene/shapes.js';
import { arrive, clamp, lerp, outExpo } from '../../scene/easing.js';

/** Finish a panel: the theme's press feedback (the same physical language as its keys) while the dial is pushed. */
export function finish(k) {
  const ctx = k.ctx;
  const fx = ctx.pressed || ctx.pressAge < 2 ? k.theme.press(k, { pressed: ctx.pressed, age: ctx.pressAge }) : null;
  if (!fx) return k.svg();
  const body = fx.transform ? `<g transform="${fx.transform}">${k.body}</g>` : k.body;
  return svgDoc({ w: k.w, h: k.h, defs: k.defs, body: (fx.under || '') + body + (fx.overlay || '') });
}

/** Refraction arrival (0 → 1): the segment converges into place when it appears or changes state. */
export const arrival = (ctx, dur = 0.45) => (ctx.reduced ? 1 : arrive(ctx.since, dur, outExpo));

/** A spectral hue ramp around the facet's hue: f 0–1 → color in this theme (vivid tier). */
export const ramp = (ctx, f, spread = 110, center = 0) => ctx.theme.spectral(ctx.hue + center + spread / 2 - f * spread);

/**
 * A value arc dispersed across the Spectrum in the active theme: butt segments whose
 * hue walks along the ramp, round caps at both ends. → markup
 */
export function spectralArc(ctx, { cx, cy, r, width, from, to, value, spread = 110, opacity = 1, segments = 28 }) {
  const v = clamp(value);
  if (v <= 0.002) return '';
  const end = lerp(from, to, v), count = Math.max(2, Math.round(segments * v)), step = (end - from) / count;
  let out = '';
  for (let i = 0; i < count; i++) {
    const a0 = from + step * i, a1 = from + step * (i + 1) + (i < count - 1 ? step * 0.12 : 0);
    out += path(arcPath(cx, cy, r, a0, a1), { fill: 'none', stroke: ramp(ctx, ((i + 0.5) / count) * v, spread), strokeWidth: n(width), strokeOpacity: opacity < 1 ? n(opacity, 3) : null });
  }
  const cap = (a, f) => { const [x, y] = polar(cx, cy, r, a); return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(width / 2)}" fill="${ramp(ctx, f * v, spread)}"${opacity < 1 ? ` fill-opacity="${n(opacity, 3)}"` : ''}/>`; };
  return out + cap(from, 0) + cap(end, 1);
}

/** Radial tick marks as one path: count ticks over [from, to]; major every `major`. → { minor, major } path data */
export function tickPaths(cx, cy, r, len, majorLen, from, to, count, major = 0) {
  const a = P(), b = P();
  for (let i = 0; i < count; i++) {
    const ang = lerp(from, to, count === 1 ? 0 : i / (count - 1));
    const isMajor = major && i % major === 0, L = isMajor ? majorLen : len;
    const [x0, y0] = polar(cx, cy, r, ang), [x1, y1] = polar(cx, cy, r - L, ang);
    (isMajor ? b : a).M(x0, y0).L(x1, y1);
  }
  return { minor: a.d, major: b.d };
}

/** Live 0–1 signal: data first, else a seeded simulation. */
export function signal(ctx, key, { speed = 0.35, lo = 0.12, hi = 0.88 } = {}) {
  const d = ctx.data?.[key];
  if (typeof d === 'number') return clamp(d);
  if (d && typeof d.level === 'number') return clamp(d.level);
  return ctx.noise.metric(ctx.reduced ? 2 : ctx.t, { lo, hi, speed });
}

/** Gain in dB for a 0–1 fader, floored at –60 (an en dash is the minus: the deck charset has no U+2212). */
export const dbOf = (v) => (v >= 0.9995 ? '0.0' : `–${Math.min(60, -20 * Math.log10(Math.max(0.001, v))).toFixed(1)}`);

/** A small downward pointer (triangle) at x, y with half-width s. */
export const pointer = (x, y, s) => P().M(x - s, y).L(x + s, y).L(x, y + s * 1.3).Z().d;
