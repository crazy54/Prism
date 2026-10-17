// Shared bits for the idle + alert motion facets (designer D2).
//
//   glyphId(ctx, want, fallback)     a glyph id that exists (params may name one that doesn't)
//   litState(g) / restState(g)       the glyph's "on" state / its resting state
//   themeBox(k, labeled)             where the active theme puts a glyph (so motion can offset it
//                                    and stay on the theme's pixel grid)
//   cellOf(k, box)                   pixel themes (tag 'pixel') lay glyphs on a 15-cell matrix over
//                                    the 36-unit safe area: one cell = box.size / 20 px. 0 elsewhere.
//   snapTo(v, cell)                  whole px, or whole cells on a pixel theme
//   layer(k, tone, draw?)            the theme's material for another tone, as markup you can fade
//                                    (a crossfade between two of the theme's own states)
//   cellRing(…)                      an arc drawn as lattice squares (pixel themes)
//   breath(p)                        the sleep-light curve: quick inhale, long exhale, 0 at the wrap

import { KeySurface, PanelSurface } from '../../scene/surface.js';
import { childContext } from '../../scene/compose.js';
import { n, attrs } from '../../scene/svg.js';
import { polar } from '../../scene/shapes.js';

export function glyphId(ctx, want, fallback = 'power') {
  if (want && ctx.glyphs.has(want)) return want;
  if (ctx.glyphs.has(fallback)) return fallback;
  return ctx.glyphs.keys().next().value;
}

const LIT = ['active', 'alert', 'ok', 'warn', 'crit', 'info'];
export function litState(g) {
  for (const tone of LIT) { const s = g.stateNames.find((x) => g.states[x] === tone); if (s) return s; }
  return g.defaultState;
}
export function restState(g) {
  return g.stateNames.find((x) => g.states[x] === 'idle' || g.states[x] === 'off') || g.defaultState;
}
/** A state of the glyph with one of these tones (first match), else its default. */
export function stateWithTone(g, tones) {
  for (const tone of tones) { const s = g.stateNames.find((x) => g.states[x] === tone); if (s) return s; }
  return g.defaultState;
}

export const themeBox = (k, labeled = true) => k.theme.glyphBox(k, { labeled });

export function cellOf(k, box) {
  return (k.theme.tags || []).includes('pixel') ? box.size / 20 : 0;
}
export const snapTo = (v, cell) => (cell ? Math.round(v / cell) * cell : Math.round(v));

/** The theme's material for `tone`, rendered off to the side: { body, defs }. */
export function layer(k, tone, draw) {
  const ctx = childContext(k.ctx, { x: 0, y: 0, w: k.w, h: k.h }, { kind: k.ctx.kind, tag: `l${tone}${(k._d2l = (k._d2l || 0) + 1)}`, tone });
  const sub = ctx.kind === 'key' ? new KeySurface(ctx) : new PanelSurface(ctx);
  sub.background({ tone });
  if (draw) draw(sub);
  if (sub.defs) k.def(sub.defs);
  return sub.body;
}
/** Add markup faded to opacity (skipped when ~0). */
export function addFaded(k, markup, opacity) {
  if (opacity <= 0.01 || !markup) return;
  k.add(opacity >= 0.99 ? markup : `<g${attrs({ opacity: n(opacity, 3) })}>${markup}</g>`);
}

/** Squares of `cell` px on the lattice along an arc (degrees, 0 = up, clockwise). */
export function cellRing(cx, cy, r, from, to, cell, { ox = 0, oy = 0 } = {}) {
  const seen = new Set(), cells = [];
  const steps = Math.max(8, Math.ceil((Math.abs(to - from) / 360) * 2 * Math.PI * r / (cell * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const [x, y] = polar(cx, cy, r, from + ((to - from) * i) / steps);
    const gx = Math.round((x - ox) / cell - 0.5), gy = Math.round((y - oy) / cell - 0.5);
    const key = `${gx},${gy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push([ox + gx * cell, oy + gy * cell]);
  }
  return cells;
}
export const squaresPath = (cells, cell) => cells.map(([x, y]) => `M${n(x)} ${n(y)}h${n(cell)}v${n(cell)}h${n(-cell)}Z`).join('');

/** Sleep-light breath over p ∈ [0, 1): inhale in 40%, exhale in 60%, exactly 0 at both ends. */
export function breath(p) {
  const q = p < 0.4 ? (p / 0.4) * 0.5 : 0.5 + ((p - 0.4) / 0.6) * 0.5;
  return (Math.exp(Math.sin(2 * Math.PI * q - Math.PI / 2)) - 1 / Math.E) / (Math.E - 1 / Math.E);
}

/** Whole-cell steps for pixel themes (8-bit motion steps instead of easing). */
export const stepped = (v, cell, steps = 4) => (cell ? Math.round(v * steps) / steps : v);

/**
 * Time for a glyph inside a motion facet: the glyph's own idle loop is re-timed so it
 * completes a whole number of cycles per facet loop (seamless at the wrap); frozen at
 * the glyph's still instant under reduced motion.
 */
export function glyphTime(ctx, g) {
  const gl = g.loop || 0;
  if (ctx.reduced) return gl * 0.4;
  const L = ctx.facet.loop;
  if (!gl || !L) return ctx.t;
  const cycles = Math.max(1, Math.round(L / gl));
  const p = (ctx.t % L + L) % L;
  return (p / L) * cycles * gl;
}
