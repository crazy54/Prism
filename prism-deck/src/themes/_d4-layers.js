// D4's shared painting helpers for material themes (chrome, porcelain).
//
// A material stroke is a stack: a cast shadow or lower lip (offset down-right), a
// highlight or inner shadow (offset up-left), the body, and a specular core. Painting
// the stack per primitive would let one primitive's shadow cover the previous one's
// body, so `stack()` walks the glyph's pen tree once per LAYER — every shadow of the
// glyph, then every highlight, every body, every core — and merges runs of identical
// paint into a single <path>. Group transforms are kept; layer offsets are applied
// outside them, in grid units, so light always comes from the same corner.
//
//   stack(pen, (prim) => [{ layer: 3, a: strokeOf('#fff', 3) }, …], { layers: 5, offsets: { 1: [0.7, 0.9] } })

import { attrs, n } from '../scene/svg.js';
import { pathBounds } from '../scene/geom.js';

export function stack(pen, entriesOf, { layers, offsets = {} } = {}) {
  const memo = new Map();
  const entries = (p) => {
    let e = memo.get(p);
    if (!e) {
      e = (entriesOf(p) || []).filter(Boolean).map((x) => ({ ...x, d: x.d ?? p.d, key: keyOf(x.a) }));
      memo.set(p, e);
    }
    return e;
  };
  const walk = (node, L) => {
    let out = '', run = null;
    const flush = () => { if (run) { out += `<path${attrs({ d: run.d, ...run.a })}/>`; run = null; } };
    for (const c of node.children) {
      if (c.group) {
        flush();
        const inner = walk(c, L);
        if (inner) out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
        continue;
      }
      for (const e of entries(c)) {
        if (e.layer !== L) continue;
        if (run && run.key === e.key) run.d += e.d;
        else { flush(); run = { key: e.key, a: e.a, d: e.d }; }
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
    out += off && (off[0] || off[1]) ? `<g transform="translate(${n(off[0], 3)} ${n(off[1], 3)})">${body}</g>` : body;
  }
  return out;
}

const keyOf = (a) => { let s = ''; for (const k in a) if (a[k] !== null && a[k] !== undefined) s += `${k}=${a[k]};`; return s; };

/** A one-primitive pen (for theme.paint(k, prim, style), the per-primitive entry point). */
export const onePen = (prim) => ({ root: { group: true, children: [prim] } });

/** Glyph lettering is the only pen geometry built from quadratic curves. */
export const isLettering = (prim) => prim.text === true || (prim.text === undefined && prim.fill === true && /Q/.test(prim.d));

const sideMemo = new Map();
/** Smallest side of a primitive's bounds in grid units (memoized: glyph geometry repeats every frame). */
export function minSide(prim) {
  let v = sideMemo.get(prim.d);
  if (v === undefined) {
    const b = pathBounds(prim.d);
    v = Math.min(b.w, b.h);
    if (sideMemo.size > 4000) sideMemo.clear();
    sideMemo.set(prim.d, v);
  }
  return v;
}

/** Stroke attributes (null-skipping, opacity only when < 1). */
export const strokeOf = (color, width, opacity = 1, { cap = 'round', join = 'round', dash = null } = {}) => ({
  fill: 'none', stroke: color, strokeWidth: n(width, 3), strokeOpacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null,
  strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash,
});
export const fillOf = (color, opacity = 1, extra = {}) => ({ fill: color, fillOpacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null, ...extra });

/** Stroke options of a primitive under a role style. */
export const strokeOpts = (p, st) => ({ cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null });

/** Per-surface memo: define a gradient (or anything) once per render surface. */
export function once(k, key, make) {
  const m = k._d4 || (k._d4 = new Map());
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}

/** Replace every fill color of text-outline markup (from defaultText) and wrap it in a translate — a cast copy for embossing. */
export function castText(markup, color, dx, dy, opacity) {
  const body = markup.replace(/ fill="#[0-9a-fA-F]{6}"/g, ` fill="${color}"`).replace(/ fill-opacity="[^"]*"/g, '');
  return `<g transform="translate(${n(dx)} ${n(dy)})"${opacity < 1 ? ` opacity="${n(opacity, 3)}"` : ''}>${body}</g>`;
}
