// Shared print-shop helpers for D5's themes (`paper`, `mono`): a layered glyph painter,
// halftone screens, paper fibers and a string hash for per-key (deterministic) texture.
//
//   layeredPaint(pen, (prim, i) => [{ layer, a }], { layers, offsets })   paint a glyph pass by pass
//   halftone({ x, y, w, h, pitch, from, color, opacity })                  a 45° dot screen, dots grow downward
//   fibers(seed, { x, y, w, h, count, len })                               short curved hairlines (cotton fibers)
//
// Everything is pure (no Date / Math.random): the same key always gets the same paper.

import { attrs, n } from '../scene/svg.js';
import { clamp } from '../scene/easing.js';
import { rng } from '../scene/noise.js';

/** FNV-1a over a string → uint32 (for per-key texture seeds from the render's idPrefix). */
export function strHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const keyOf = (a) => JSON.stringify(a);

/**
 * Paint a glyph pass by pass (every lip, then every ink body, then every core) instead of
 * primitive by primitive, so one primitive's under-layer never covers another's ink.
 * entriesOf(prim, i) → [{ layer, a: attrs-without-d, d? }]. Runs of identical paint merge
 * into one <path>. offsets: { [layer]: [dx, dy] } in grid units (registration, impression lips).
 */
export function layeredPaint(pen, entriesOf, { layers, offsets = {} } = {}) {
  const cache = new Map();
  let idx = 0;
  const entries = (p) => {
    let e = cache.get(p);
    if (!e) {
      e = (entriesOf(p, idx++) || []).filter(Boolean).map((x) => ({ ...x, d: x.d ?? p.d, key: keyOf(x.a) }));
      cache.set(p, e);
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
        if (!inner) continue;
        out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
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
    out += off && (off[0] || off[1]) ? `<g transform="translate(${n(off[0])} ${n(off[1])})">${body}</g>` : body;
  }
  return out;
}

/** Stroke / fill attribute helpers for layeredPaint entries. */
export const strokeA = (color, width, opacity = 1, { cap = 'round', join = 'round', dash = null } = {}) => ({
  fill: 'none', stroke: color, strokeWidth: n(width), strokeOpacity: opacity < 0.999 ? n(clamp(opacity), 3) : null,
  strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash,
});
export const fillA = (color, opacity = 1) => ({ fill: color, fillOpacity: opacity < 0.999 ? n(clamp(opacity), 3) : null });

/**
 * A halftone screen: dots on a 45° grid (`pitch` px between columns, rows at half pitch,
 * alternate rows offset), radius 0 at `from` (fraction of h from the top) growing to
 * `maxR` × pitch at the bottom edge. Each row is ONE dashed line (near-zero dashes with
 * round caps = dots), so a screen costs ~70 bytes a row whatever its width.
 */
export function halftone({ x = 0, y = 0, w, h, pitch, from = 0.5, maxR = 0.32, gamma = 1.25, color, opacity = 1 }) {
  let rows = '';
  const row = pitch / 2, top = y + h * from, span = h * (1 - from);
  for (let j = 0; ; j++) {
    const cy = y + h - row * (j + 0.35);
    if (cy < top) break;
    const r = maxR * pitch * Math.pow(clamp((cy - top) / span), gamma);
    if (r < 0.3) continue;
    const x0 = x + (j % 2) * pitch / 2 + pitch / 4, x1 = x + w - pitch * 0.1;
    if (x1 > x0) rows += `<path d="M${n(x0, 1)} ${n(cy, 1)}H${n(x1, 1)}" stroke-width="${n(2 * r, 2)}"/>`;
  }
  return rows ? `<g${attrs({ fill: 'none', stroke: color, strokeOpacity: opacity < 0.999 ? n(clamp(opacity), 3) : null, strokeLinecap: 'round', strokeDasharray: `0.01 ${n(pitch - 0.01, 2)}` })}>${rows}</g>` : '';
}

/** Cotton fibers: `count` short curved hairlines + a few flecks, seeded. → { fibers: d, flecks: d } */
export function fibers(seed, { x = 0, y = 0, w, h, count = 12, len = 8, fleck = 1 }) {
  const r = rng(seed);
  let d = '', f = '';
  for (let i = 0; i < count; i++) {
    const x0 = x + r() * w, y0 = y + r() * h, a = r() * Math.PI, L = len * (0.45 + r() * 0.8);
    const dx = Math.cos(a) * L, dy = Math.sin(a) * L, bend = (r() - 0.5) * L * 0.7;
    d += `M${n(x0, 1)} ${n(y0, 1)}q${n(dx / 2 - dy * bend / L, 1)} ${n(dy / 2 + dx * bend / L, 1)} ${n(dx, 1)} ${n(dy, 1)}`;
  }
  const flecks = Math.round(count / 3);
  for (let i = 0; i < flecks; i++) {
    const cx = x + r() * w, cy = y + r() * h, rr = fleck * (0.4 + r() * 0.6);
    f += `M${n(cx - rr, 1)} ${n(cy, 1)}a${n(rr, 2)} ${n(rr, 2)} 0 1 0 ${n(2 * rr, 2)} 0a${n(rr, 2)} ${n(rr, 2)} 0 1 0 ${n(-2 * rr, 2)} 0`;
  }
  return { fibers: d, flecks: f };
}
