// Instrument shapes: arcs, rings, gauges, ticks, needles, sparklines, bars.
// Angles are in degrees, 0° = 12 o'clock, clockwise — the way a dial reads.
// Every function returns SVG markup (strings) or path data; none touch the DOM.

import { P, path, el, n, line as lineEl, circle } from './svg.js';
import { clamp, lerp } from './easing.js';
import { oklch, hexToOklch } from './color.js';

const RAD = Math.PI / 180;

/** Point on a circle: polar(cx, cy, r, deg) → [x, y]. */
export const polar = (cx, cy, r, deg) => [cx + r * Math.sin(deg * RAD), cy - r * Math.cos(deg * RAD)];

/** Path data for an arc from a0 to a1 (degrees, clockwise). Full circles are split in two. */
export function arcPath(cx, cy, r, a0, a1) {
  let span = a1 - a0;
  if (Math.abs(span) < 1e-6) return '';
  if (Math.abs(span) >= 359.999) {
    const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a0 + 180);
    return P().M(x0, y0).A(r, r, 0, 0, 1, x1, y1).A(r, r, 0, 0, 1, x0, y0).d;
  }
  const sweep = span > 0;
  span = Math.abs(span);
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return P().M(x0, y0).A(r, r, 0, span > 180, sweep, x1, y1).d;
}

/** Closed annular sector (a donut slice) between radii r0 < r1. */
export function sectorPath(cx, cy, r0, r1, a0, a1) {
  const large = Math.abs(a1 - a0) > 180;
  const [ax, ay] = polar(cx, cy, r1, a0), [bx, by] = polar(cx, cy, r1, a1);
  const [cx2, cy2] = polar(cx, cy, r0, a1), [dx, dy] = polar(cx, cy, r0, a0);
  return P().M(ax, ay).A(r1, r1, 0, large, true, bx, by).L(cx2, cy2).A(r0, r0, 0, large, false, dx, dy).Z().d;
}

/** A stroked arc element. */
export function arc({ cx, cy, r, from, to, color, width = 4, opacity, cap = 'round', ...rest }) {
  const d = arcPath(cx, cy, r, from, to);
  if (!d) return '';
  return path(d, { fill: 'none', stroke: color, strokeWidth: width, strokeOpacity: opacity, strokeLinecap: cap, ...rest });
}

/**
 * Ring gauge: track + value arc. value 0–1 maps onto [from, to].
 * → markup string
 */
export function ring({ cx, cy, r, width = 6, from = -135, to = 135, value = 0, color, track, trackOpacity = 1, cap = 'round' }) {
  const v = clamp(value);
  const end = lerp(from, to, v);
  return arc({ cx, cy, r, from, to, color: track, width, opacity: trackOpacity, cap })
    + (v > 0.002 ? arc({ cx, cy, r, from, to: end, color, width, cap }) : '');
}

/**
 * Spectral arc: SVG has no conic gradients, so the value arc is drawn as short
 * butt-capped segments whose hue walks h0 → h1 (OKLCH, constant L/C), with a
 * round cap at both ends. Looks like light dispersed along the dial.
 */
export function spectrumArc({ cx, cy, r, width = 6, from = -135, to = 135, value = 1, h0 = 300, h1 = 160, l = 0.8, c = 0.13, segments = 24, opacity }) {
  const v = clamp(value);
  if (v <= 0.002) return '';
  const end = lerp(from, to, v);
  const count = Math.max(2, Math.round(segments * v));
  const step = (end - from) / count;
  let out = '';
  for (let i = 0; i < count; i++) {
    const a0 = from + step * i, a1 = from + step * (i + 1) + (i < count - 1 ? step * 0.08 : 0);
    const color = oklch(l, c, lerp(h0, h1, (i + 0.5) / count * v));
    out += arc({ cx, cy, r, from: a0, to: a1, color, width, cap: 'butt', opacity });
  }
  const capAt = (a, k) => { const [x, y] = polar(cx, cy, r, a); return circle({ cx: x, cy: y, r: width / 2, fill: oklch(l, c, lerp(h0, h1, k * v)), fillOpacity: opacity }); };
  return out + capAt(from, 0) + capAt(end, 1);
}

/** Tick marks around [from, to]: count ticks, every `major`-th one longer. */
export function ticks({ cx, cy, r, len = 4, majorLen = len * 1.8, from = -135, to = 135, count = 11, major = 5, color, width = 1, opacity, majorOpacity }) {
  let d = '', dm = '';
  for (let i = 0; i < count; i++) {
    const a = lerp(from, to, count === 1 ? 0 : i / (count - 1));
    const isMajor = major && i % major === 0;
    const L = isMajor ? majorLen : len;
    const [x0, y0] = polar(cx, cy, r, a), [x1, y1] = polar(cx, cy, r - L, a);
    const seg = `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`;
    if (isMajor) dm += seg; else d += seg;
  }
  return (d ? path(d, { stroke: color, strokeWidth: width, strokeOpacity: opacity, strokeLinecap: 'round' }) : '')
    + (dm ? path(dm, { stroke: color, strokeWidth: width * 1.4, strokeOpacity: majorOpacity ?? opacity, strokeLinecap: 'round' }) : '');
}

/** A tapered needle from the hub to radius r at angle a. */
export function needle({ cx, cy, r, angle, color, width = 3, hub = width * 1.4, tail = r * 0.14 }) {
  const [tx, ty] = polar(cx, cy, r, angle);
  const [bx, by] = polar(cx, cy, tail, angle + 180);
  const [lx, ly] = polar(cx, cy, width / 2, angle - 90), [rx, ry] = polar(cx, cy, width / 2, angle + 90);
  return path(P().M(bx, by).L(lx, ly).L(tx, ty).L(rx, ry).Z().d, { fill: color }) + circle({ cx, cy, r: hub, fill: color });
}

/**
 * Sparkline path data through values (0–1) inside the box [x, y, w, h].
 * smooth → Catmull-Rom converted to cubic Béziers (passes through every point).
 * shift (0–1) slides the series left by a fraction of a step, for smooth scrolling.
 */
/**
 * Points of a scrolling sparkline. Samples are `step = w / (k − 2)` apart and
 * slide left by `shift` (0–1) of a step; both ends are clipped to the box by
 * interpolation, so the line never leaves [x, x + w] and is continuous when a
 * new sample arrives (shift wraps 1 → 0 as the window advances one sample).
 */
export function sparkPoints(values, { x = 0, y = 0, w, h, shift = 0, lo = 0, hi = 1 }) {
  const k = values.length;
  if (k < 3) return values.map((v, i) => [x + (k > 1 ? (i / (k - 1)) * w : 0), y + h - clamp((v - lo) / (hi - lo || 1)) * h]);
  const step = w / (k - 2);
  const pts = values.map((v, i) => [x + (i - shift) * step, y + h - clamp((v - lo) / (hi - lo || 1)) * h]);
  const cut = (a, b, X) => { const f = (X - a[0]) / (b[0] - a[0] || 1); return [X, a[1] + (b[1] - a[1]) * f]; };
  if (pts[0][0] < x) pts[0] = cut(pts[0], pts[1], x);
  if (pts[k - 1][0] > x + w) pts[k - 1] = cut(pts[k - 2], pts[k - 1], x + w);
  return pts;
}

/** Path data through the points (smooth → Catmull-Rom as cubic Béziers, through every point). */
export function sparkPath(values, opts) {
  const pts = sparkPoints(values, opts);
  if (pts.length < 2) return '';
  const p = P().M(...pts[0]);
  if (opts.smooth === false) { for (let i = 1; i < pts.length; i++) p.L(...pts[i]); return p.d; }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    p.C(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  return p.d;
}

/** The newest (right-most) point of a sparkline — where the live "head" dot goes. */
export const sparkHead = (values, opts) => { const pts = sparkPoints(values, opts); return pts[pts.length - 1]; };

/** Sparkline stroke (+ optional area fill to the baseline). */
export function sparkline(values, { x = 0, y = 0, w, h, color, width = 1.5, smooth = true, shift = 0, area, areaOpacity = 1, lo, hi }) {
  const opts = { x, y, w, h, smooth, shift, lo, hi };
  const d = sparkPath(values, opts);
  if (!d) return '';
  const pts = sparkPoints(values, opts);
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0];
  return (area ? path(`${d}L${n(x1)} ${n(y + h)}L${n(x0)} ${n(y + h)}Z`, { fill: area, fillOpacity: areaOpacity < 1 ? areaOpacity : null }) : '')
    + path(d, { fill: 'none', stroke: color, strokeWidth: width, strokeLinecap: 'round', strokeLinejoin: 'round' });
}

/** Vertical bars for values 0–1 in [x, y, w, h]; color(i, v) → hex. */
export function bars(values, { x = 0, y = 0, w, h, gap = 1, radius = 0, color, minH = 0, opacity }) {
  const k = values.length;
  const bw = (w - gap * (k - 1)) / k;
  let out = '';
  values.forEach((v, i) => {
    const bh = Math.max(minH, clamp(v) * h);
    if (bh <= 0) return;
    out += el('rect', { x: x + i * (bw + gap), y: y + h - bh, width: bw, height: bh, rx: Math.min(radius, bw / 2, bh / 2) || null, fill: typeof color === 'function' ? color(i, v) : color, fillOpacity: opacity });
  });
  return out;
}

/** A row of `count` segments, the first round(value·count) lit. Good for battery / signal / level meters. */
export function segments({ x, y, w, h, count = 10, value = 0, gap = 1.5, radius = 1, on, off, offOpacity = 0.35, vertical = false }) {
  const lit = Math.round(clamp(value) * count);
  const len = ((vertical ? h : w) - gap * (count - 1)) / count;
  let out = '';
  for (let i = 0; i < count; i++) {
    const isOn = i < lit;
    const color = typeof on === 'function' ? on(i, count) : on;
    const a = vertical
      ? { x, y: y + h - (i + 1) * len - i * gap, width: w, height: len }
      : { x: x + i * (len + gap), y, width: len, height: h };
    out += el('rect', { ...a, rx: radius || null, fill: isOn ? color : off, fillOpacity: isOn ? null : offOpacity });
  }
  return out;
}

/** Hairline straight line. */
export const hairline = (x1, y1, x2, y2, color, width = 1, opacity) => lineEl({ x1, y1, x2, y2, stroke: color, strokeWidth: width, strokeOpacity: opacity, strokeLinecap: 'round' });

/** Gradient stops walking the spectrum between two hues at the color's L/C (or given l, c). */
export function spectrumStops(h0, h1, { n: count = 5, l = 0.8, c = 0.13, opacity } = {}) {
  return Array.from({ length: count }, (_, i) => [i / (count - 1), oklch(l, c, lerp(h0, h1, i / (count - 1))), opacity]);
}

/** Stops for a color fading out (glows): [[0, c, a], [1, c, 0]]. */
export const glowStops = (color, a = 0.6, mid = 0.35) => [[0, color, a], [mid, color, a * 0.4], [1, color, 0]];

/** L and C of a hex, for building spectra that match a theme color's weight. */
export const weightOf = (hex) => { const [L, C] = hexToOklch(hex); return { l: L, c: C }; };
