// Layered glyph painting for luminous materials (neon, ember) — D1's shared helper.
//
// A glowing stroke is several strokes stacked (halo → body → hot core). Painting
// them per primitive interleaves the layers (one primitive's halo would cover the
// previous primitive's core) and repeats every attribute. `layered()` walks the
// glyph's pen tree once per LAYER instead: every halo of the glyph, then every body,
// then every core — which is how light actually composites — and merges runs of
// identical paint into one <path>, so a 17-primitive chip stays a handful of paths.
//
//   layered(pen, (prim, i) => [{ layer: 0, a: { fill: 'none', stroke, strokeWidth } }, …], { layers: 5, offsets: { 4: [-0.4, -0.4] } })
//
// entriesOf returns, per primitive, the layers it paints into: { layer, a (attrs
// without d), d? (path data, default prim.d) }. offsets translate a whole layer
// (cast shadows, specular glints) in grid units.

import { attrs, n } from '../scene/svg.js';
import { pathBounds } from '../scene/geom.js';

export function layered(pen, entriesOf, { layers, offsets = {} } = {}) {
  const cache = new Map();
  let idx = 0;
  const entries = (p) => {
    let e = cache.get(p);
    if (!e) {
      // 1 decimal everywhere: at 160 px a tenth of a grid unit is 0.18 px (and soft layers could take less)
      e = (entriesOf(p, idx++) || []).filter(Boolean).map((x) => ({ ...x, d: coarse(x.d ?? p.d, x.soft ? 1 : 1), key: keyOf(x.a) }));
      cache.set(p, e);
    }
    return e;
  };
  // Soft entries (halos, glows) commute — a blurred halo drawn before or after its neighbour's
  // looks the same — so consecutive soft entries of one layer merge by paint, not just by run:
  // a glyph whose primitives each paint two halos into layer 0 emits two halo paths, not 2 × n
  // (API 1.4: the Stream Deck app slows down past ~300 elements per frame).
  const walk = (node, L) => {
    let out = '', run = null, soft = null;
    const flushRun = () => { if (run) { out += `<path${attrs({ d: run.d, ...run.a })}/>`; run = null; } };
    const flushSoft = () => { if (soft) { for (const s of soft.values()) out += `<path${attrs({ d: s.d, ...s.a })}/>`; soft = null; } };
    const flush = () => { flushRun(); flushSoft(); };
    for (const c of node.children) {
      if (c.group) {
        flush();
        const inner = walk(c, L);
        if (!inner) continue;
        out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
        continue;
      }
      for (const e of entries(c)) {
        if (e.layer !== L) continue;
        if (e.soft) {
          flushRun();
          soft ??= new Map();
          const s = soft.get(e.key);
          if (s) s.d += e.d; else soft.set(e.key, { a: e.a, d: e.d });
        } else {
          flushSoft();
          if (run && run.key === e.key) run.d += e.d;
          else { flushRun(); run = { key: e.key, a: e.a, d: e.d }; }
        }
      }
    }
    flush();
    return out;
  };
  let out = '';
  for (let L = 0; L < layers; L++) {
    const body = walk(pen.root, L);
    if (!body) continue;
    const off = offsets[L];
    out += off ? `<g transform="translate(${n(off[0])} ${n(off[1])})">${body}</g>` : body;
  }
  return out;
}

const coarseMemo = new Map();
/**
 * Path data at 1 decimal — for soft layers (halos, glows, cast shadows) where a twentieth
 * of a grid unit is invisible under the blur but the bytes are not.
 */
export function coarse(d, decimals = 1) {
  const key = decimals + d;
  let v = coarseMemo.get(key);
  if (v === undefined) {
    v = d.replace(/-?\d*\.\d+/g, (m) => { const r = (+m).toFixed(decimals).replace(/\.0+$/, ''); return r === '-0' ? '0' : r; });
    if (coarseMemo.size > 6000) coarseMemo.clear();
    coarseMemo.set(key, v);
  }
  return v;
}

const keyOf = (a) => { let s = ''; for (const k in a) if (a[k] !== null && a[k] !== undefined) s += `${k}=${a[k]};`; return s; };

/** A one-primitive "pen" (for theme.paint(k, prim, style) — the per-primitive entry point). */
export const onePen = (prim) => ({ root: { group: true, children: [prim] } });

/** Text outlines: the glyph pen marks them `text: true` (Pen.text); the filled-Q test covers prims built elsewhere. */
export const isLettering = (prim) => prim.text === true || (prim.text === undefined && prim.fill === true && /Q/.test(prim.d));

const boundsMemo = new Map();
/** Smallest side of a primitive's bounds, grid units (memoized — glyph geometry repeats every frame). */
export function minSide(prim) {
  let v = boundsMemo.get(prim.d);
  if (v === undefined) {
    const b = pathBounds(prim.d);
    v = Math.min(b.w, b.h);
    if (boundsMemo.size > 4000) boundsMemo.clear();
    boundsMemo.set(prim.d, v);
  }
  return v;
}

/** Stroke attrs with the usual null-skipping. */
export const strokeA = (color, width, opacity, { cap = 'round', join = 'round', dash = null, dashOffset = null } = {}) => ({
  fill: 'none', stroke: color, strokeWidth: n(width, 3), strokeOpacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null,
  strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash, strokeDashoffset: dashOffset,
});
export const fillA = (color, opacity) => ({ fill: color, fillOpacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null });
