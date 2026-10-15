// Shared drawing for the apps gallery: palettes on the Spectrum, per-key glass under
// span apps, and small instrument pieces (meters, sparkline heads, readouts).

import { keyInto, compose, rect, path, circle, n, P, linearGradient, url } from '../../scene/index.js';
import { hexToOklch, mix } from '../../scene/color.js';
import { clamp, lerp } from '../../scene/easing.js';

// Palettes are hue walks on the active theme's Spectrum (so Night/Day and every theme
// keep their own lightness and chroma). 'signature' is the website's violet → periwinkle
// → mint; 'spectrum' is a prism's dispersion, red (low) → violet (high); 'accent' stays
// near the theme's accent hue (monochrome materials such as CRT phosphor).
const RAMPS = {
  signature: [[0, 300], [0.35, 268], [0.7, 205], [1, 165]],
  spectrum: [[0, 22], [0.18, 58], [0.34, 95], [0.52, 150], [0.7, 205], [0.86, 258], [1, 300]],
  ember: [[0, 28], [0.5, 52], [1, 80]],
};
const MONO_TAGS = ['crt', 'phosphor', 'mono', 'monochrome', 'blueprint', 'paper', 'ink'];

export const PALETTE_OPTIONS = ['auto', 'signature', 'spectrum', 'accent'];

/** The palette a facet uses: 'auto' → 'accent' on monochrome materials, else 'signature'. */
export function paletteOf(ctx, name = 'auto') {
  if (name !== 'auto') return name;
  return ctx.theme.tags?.some((t) => MONO_TAGS.includes(t)) ? 'accent' : 'signature';
}

/** Hue (OKLCH degrees) at f ∈ [0, 1] along a palette. */
export function hueAt(ctx, name, f) {
  const p = paletteOf(ctx, name);
  if (p === 'accent') { const h = hexToOklch(ctx.colors.accent)[2] || ctx.hue; return h - 14 + 28 * clamp(f); }
  const ramp = RAMPS[p] || RAMPS.signature;
  const x = clamp(f);
  for (let i = 1; i < ramp.length; i++) if (x <= ramp[i][0]) { const [a, ha] = ramp[i - 1], [b, hb] = ramp[i]; return lerp(ha, hb, (x - a) / (b - a || 1)); }
  return ramp[ramp.length - 1][1];
}

/** Color at f along a palette in the active theme (tier: vivid | ink | wash). */
export const colorAt = (ctx, name, f, tier = 'vivid') => ctx.theme.spectral(hueAt(ctx, name, f), { tier });

/** Gradient stops along a palette: n stops, opacity(f) optional. */
export function paletteStops(ctx, name, count = 6, opacity, tier = 'vivid') {
  return Array.from({ length: count }, (_, i) => { const f = i / (count - 1); return [f, colorAt(ctx, name, f, tier), opacity ? clamp(opacity(f)) : undefined]; });
}

/** A horizontal (or vertical) userSpace gradient over [a, b] → url(). */
export function rampFill(s, stops, { x1 = 0, y1 = 0, x2 = s.w, y2 = 0, name = 'ramp' } = {}) {
  const id = s.id(name);
  s.def(linearGradient(id, stops, { x1, y1, x2, y2, gradientUnits: 'userSpaceOnUse' }));
  return url(id);
}

/** The light of "white" in this mode: white at night, the theme's ink by day. */
export const whiteOf = (s) => (s.dark ? '#ffffff' : s.colors.ink);

/** A lifted (lighter at night / deeper by day) version of a color, for cores and highlights. */
export const lift = (s, c, k = 0.45) => mix(c, s.dark ? '#ffffff' : s.colors.ink, k);

/**
 * Every key of a span gets its own material — the app paints over it. index: false draws the
 * theme's panel glass (no spectral index / state ring), for apps whose light is the content.
 */
export function keyGlass(d, grid, { tone = 'idle', toneOf, index = true } = {}) {
  d.add(rect({ width: d.w, height: d.h, fill: '#000000' }));
  for (const cell of grid.cells) {
    const draw = (k) => { k.background({ tone: toneOf ? toneOf(cell) : tone }); };
    if (index) keyInto(d, cell, draw, { tag: `g${cell.i}`, clip: false });
    else compose(d, cell, draw, { kind: 'screen', tag: `g${cell.i}`, clip: false });
  }
}

/** Columns of a span grid: [{ col, x, w }] left → right (the visible key windows). */
export function gridCols(grid) {
  const seen = new Map();
  for (const c of grid.cells) if (!seen.has(c.col)) seen.set(c.col, { col: c.col, x: c.x, w: c.w });
  return [...seen.values()].sort((a, b) => a.x - b.x);
}
/** Rows of a span grid: [{ row, y, h }] top → bottom. */
export function gridRows(grid) {
  const seen = new Map();
  for (const c of grid.cells) if (!seen.has(c.row)) seen.set(c.row, { row: c.row, y: c.y, h: c.h });
  return [...seen.values()].sort((a, b) => a.y - b.y);
}

/** Smooth closed band between an upper and a lower polyline (points left → right). */
export function bandPath(top, bottom) {
  const p = P();
  const curve = (pts, first) => {
    if (!pts.length) return;
    if (first) p.M(pts[0][0], pts[0][1]); else p.L(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      p.Q(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      if (i === pts.length - 1) p.L(x1, y1);
    }
  };
  curve(top, true);
  curve([...bottom].reverse(), false);
  return p.Z().d;
}

/** Open smooth line through points. */
export function smoothLine(pts) {
  const p = P();
  if (!pts.length) return '';
  p.M(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    p.Q(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    if (i === pts.length - 1) p.L(x1, y1);
  }
  return p.d;
}

/** A soft round glow (concentric circles; no filters in the deck subset). */
export function glowDot(s, { cx, cy, r, color, opacity = 0.5, rings = 3, core = true }) {
  let out = '';
  for (let i = rings; i >= 1; i--) out += circle({ cx, cy, r: r * (1 + i * 0.9), fill: color, fillOpacity: n(opacity * 0.16 * (1 + (rings - i) * 0.5), 3) });
  if (core) out += circle({ cx, cy, r, fill: color });
  return out;
}

/** Horizontal meter: track + value + optional peak tick. */
export function meterBar(s, { x, y, w, h, value, color, track, peak, radius = h / 2 }) {
  const v = clamp(value ?? 0);
  let out = rect({ x, y, width: w, height: h, rx: radius, fill: track ?? s.colors.line, fillOpacity: s.dark ? null : 0.8 });
  if (v > 0.003) out += rect({ x, y, width: Math.max(h, w * v), height: h, rx: radius, fill: color });
  if (peak !== undefined && peak !== null) out += rect({ x: x + w * clamp(peak) - s.m.hair / 2, y: y - h * 0.35, width: Math.max(1, s.m.hair), height: h * 1.7, fill: whiteOf(s), fillOpacity: 0.85 });
  return out;
}

/** A vertical hairline that fades at both ends (dividers that catch a glint). */
export function vHair(s, { x, y, h, color, opacity = 0.5, name = 'vh' }) {
  const id = s.id(name);
  const c = color ?? (s.colors.beam || whiteOf(s));
  s.def(linearGradient(id, [[0, c, 0], [0.5, c, 1], [1, c, 0]], { x1: 0, y1: 0, x2: 0, y2: 1 }));
  return rect({ x: x - s.m.hair / 2, y, width: s.m.hair, height: h, fill: url(id), fillOpacity: n(opacity, 3) });
}

/** Path of a rounded bar (vertical) from the baseline y0 up by hgt. */
export const barPath = (x, y0, w, hgt, r) => {
  const rr = Math.min(r, w / 2, hgt / 2);
  if (hgt <= 0.01) return '';
  return P().M(x, y0).V(y0 - hgt + rr).Q(x, y0 - hgt, x + rr, y0 - hgt).H(x + w - rr).Q(x + w, y0 - hgt, x + w, y0 - hgt + rr).V(y0).Z().d;
};

export { path, rect, circle, n, P, clamp, lerp, mix };
