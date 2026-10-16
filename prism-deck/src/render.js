// Surfaces — render a facet for one instant and slice it for the hardware.
//
//   renderFacet(facet, opts)  → SVG string of the facet's whole canvas
//   render(facet, opts)       → { surface, svg, w, h, keys?, segments?, widgets?, screen? } — what runtimes consume
//     key     { svg }                                  one key at the device's native key px
//     span    { svg, keys: [{ i, col, row, svg }] }    the block incl. gaps, sliced per key (the bezel hides the gaps)
//     strip   { svg, segments: [svg] }                 full strip (or one dial's segment), sliced per 200×100 dial segment
//     screen  { svg, widgets?: [{ dial, layer, x, y, w, h, svg }] } Galleon screen (+ its 4 2:1 widget windows), Neo info bar, …
//     deck    { svg, keys, segments?, screen?, widgets? } the whole panel, sliced into keys / strip segments / screen
//                                                      (+ Galleon widget windows, x / y in the panel)
//
// opts: { device, theme ('prism' | 'prism:light'), mode, t, state, since, pressed, pressAge, value, values,
//         params, seed, data, now, tzOffset, reduced, idPrefix, size (keys), span, segments, screen,
//         outScale (slice output px multiplier, e.g. 2 for @2x), uniqueIds (suffix ids per slice — for many
//         slices inline in one HTML page), cull (default true: slices keep only what they show), pressKey }

import { createContext } from './scene/context.js';
import { svgWindow, suffixIds, n, SVG_NS } from './scene/svg.js';
import { prepareCull, cullInner } from './scene/cull.js';

/** Render the facet's whole canvas. Throws if render(ctx) doesn't return a string. */
export function renderFacet(facet, opts = {}) {
  const ctx = createContext(facet, opts);
  const out = facet.render(ctx);
  if (typeof out !== 'string') throw new Error(`${facet.id}: render(ctx) must return a string, got ${typeof out}`);
  return out;
}

/** Render + context (for callers that need the geometry). */
export function renderWithContext(facet, opts = {}) {
  const ctx = createContext(facet, opts);
  const svg = facet.render(ctx);
  if (typeof svg !== 'string') throw new Error(`${facet.id}: render(ctx) must return a string, got ${typeof svg}`);
  return { ctx, svg };
}

/**
 * A slice of the canvas as its own SVG. With culling (default; opts.cull === false turns it
 * off) only the elements whose bounds touch the window and the defs they use are kept, so
 * a slice whose pixels didn't change is byte-identical frame to frame.
 */
function windowFor(svg, prep, r, opts, suffix) {
  const outW = r.w * (opts.outScale || 1), outH = r.h * (opts.outScale || 1);
  if (!prep) return svgWindow(svg, { x: r.x, y: r.y, w: r.w, h: r.h, outW, outH, idSuffix: opts.uniqueIds ? suffix : '' });
  const inner = cullInner(prep, r);
  return `<svg xmlns="${SVG_NS}" width="${n(outW)}" height="${n(outH)}" viewBox="${n(r.x)} ${n(r.y)} ${n(r.w)} ${n(r.h)}">${opts.uniqueIds ? suffixIds(inner, suffix) : inner}</svg>`;
}

/** One frame, sliced for the surface. */
export function render(facet, opts = {}) {
  const { ctx, svg } = renderWithContext(facet, opts);
  const out = { surface: ctx.kind, svg, w: ctx.w, h: ctx.h, device: ctx.device.id };
  const sliced = ctx.kind === 'span' || ctx.kind === 'deck' || ctx.kind === 'strip' || (ctx.kind === 'screen' && ctx.screen.widgets);
  const prep = sliced && opts.cull !== false ? prepareCull(svg) : null;
  const win = (s, r, o, suffix) => windowFor(s, prep, r, o, suffix);
  if (ctx.kind === 'span') out.keys = ctx.grid.cells.map((c) => ({ i: c.i, col: c.col, row: c.row, svg: win(svg, c, opts, `k${c.i}`) }));
  else if (ctx.kind === 'strip') out.segments = Array.from({ length: ctx.strip.segments }, (_, i) => win(svg, { x: i * 200, y: 0, w: 200, h: 100 }, opts, `s${i}`));
  else if (ctx.kind === 'screen' && ctx.screen.widgets) {
    // Galleon widgets: 2:1 windows (360×180) centered in each 360×192 quadrant — the app scales the
    // whole 200×100 layout uniformly, so a 2:1 window maps onto it without squash
    const { cols, rows, w, h, pitchX = w, pitchY = h, insetX = 0, insetY = 0 } = ctx.screen.widgets;
    out.widgets = [];
    for (let layer = 0; layer < rows; layer++) for (let dial = 0; dial < cols; dial++) {
      const r = { x: dial * pitchX + insetX, y: layer * pitchY + insetY, w, h };
      out.widgets.push({ dial, layer, ...r, svg: win(svg, r, opts, `w${dial}${layer}`) });
    }
  } else if (ctx.kind === 'deck') {
    out.keys = ctx.deck.keys.map((c) => ({ i: c.i, col: c.col, row: c.row, svg: win(svg, c, opts, `k${c.i}`) }));
    if (ctx.deck.strip) out.segments = Array.from({ length: ctx.deck.strip.segments }, (_, i) => win(svg, { x: ctx.deck.strip.x + i * (ctx.deck.strip.w / ctx.deck.strip.segments), y: ctx.deck.strip.y, w: ctx.deck.strip.w / ctx.deck.strip.segments, h: ctx.deck.strip.h }, opts, `s${i}`));
    if (ctx.deck.screen) out.screen = win(svg, ctx.deck.screen, opts, 'scr');
    // Galleon: its four widget windows too (API 1.5.1), as for screen facets — x / y in the deck canvas
    const G = ctx.deck.screen && ctx.device.screen?.widgets;
    if (G) {
      const S = ctx.deck.screen, { cols, rows, w, h, pitchX = w, pitchY = h, insetX = 0, insetY = 0 } = G;
      out.widgets = [];
      for (let layer = 0; layer < rows; layer++) for (let dial = 0; dial < cols; dial++) {
        const r = { x: S.x + dial * pitchX + insetX, y: S.y + layer * pitchY + insetY, w, h };
        out.widgets.push({ dial, layer, ...r, svg: win(svg, r, opts, `w${dial}${layer}`) });
      }
    }
  }
  return out;
}

export const renderKey = (facet, opts) => renderFacet(facet, opts);
export const renderSpan = (facet, opts) => render(facet, opts);
export const renderStrip = (facet, opts) => render(facet, opts);
export const renderScreen = (facet, opts) => render(facet, opts);
export const renderDeck = (facet, opts) => render(facet, opts);

/** A representative instant for stills: the facet's own `still` (API 1.5.1), else 40% into the loop (capped at 6 s), never 0 for animated facets. */
export const stillTime = (facet) => (typeof facet.still === 'number' && Number.isFinite(facet.still) ? Math.max(0, facet.still) : facet.animated ? Math.min(facet.loop * 0.4, 6) : 0);

/** Next state index after a press, per the facet's press mode (cycle → +1 wrapping; toggle → 0 ↔ 1; momentary / none → same). */
export function nextState(facet, state) {
  const n = facet.states?.length || 0;
  if (!n || facet.press === 'momentary' || facet.press === 'none') return state;
  return (state + 1) % n;
}
