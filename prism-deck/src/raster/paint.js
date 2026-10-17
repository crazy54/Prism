// Paint: the deck color syntax and gradient paint servers.
//
// Colors are sRGB and blended in sRGB space — SVG's default
// `color-interpolation: sRGB`, which is what Chrome and Qt do — with
// premultiplied alpha. Gradient stops interpolate unpremultiplied (as Blink
// does for SVG gradients) into a 1024-entry premultiplied lookup table.
//
// Gradient geometry: device → gradient space through the inverse of
//   CTM · (objectBoundingBox ? bbox : I) · gradientTransform
// linear t = projection on (x1,y1)→(x2,y2); radial = two-point conical
// (focal circle radius 0 at (fx,fy) → end circle r at (cx,cy)), so a focal
// point outside the circle draws the SVG 2 / Chrome cone.

import { RasterError, mul, invert, parseTransform } from './geometry.js';

const HEX6 = /^#([0-9a-fA-F]{6})$/, HEX3 = /^#([0-9a-fA-F]{3})$/, URL = /^url\(#([^)]+)\)$/;

/** '#rrggbb' | '#rgb' | 'white' | 'black' → [r, g, b] in 0–1; 'none' → null; 'url(#id)' → { ref }. Throws otherwise. */
export function parsePaint(v, attr = 'fill') {
  const s = String(v).trim();
  let m;
  if (s === 'none') return null;
  if ((m = HEX6.exec(s))) { const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  if ((m = HEX3.exec(s))) { const h = m[1]; return [0, 1, 2].map((i) => (parseInt(h[i], 16) * 17) / 255); }
  if (s === 'white') return [1, 1, 1];
  if (s === 'black') return [0, 0, 0];
  if ((m = URL.exec(s))) return { ref: m[1] };
  throw new RasterError(`${attr}="${v}" — the deck subset takes #rrggbb, #rgb, none or url(#id) (opacity goes in *-opacity)`);
}

/** Opacity: number or percentage, clamped to 0–1. */
export function parseOpacity(v, attr = 'opacity') {
  const s = String(v).trim();
  const pct = s.endsWith('%');
  const x = pct ? parseFloat(s) / 100 : Number(s);
  if (!Number.isFinite(x)) throw new RasterError(`${attr}="${v}" is not a number`);
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export const LUT = 1024;

function stopsOf(el) {
  const stops = [];
  let last = 0;
  for (const c of el.children) {
    if (c.tag !== 'stop') continue;
    const a = c.attrs;
    let o = a.offset === undefined ? 0 : String(a.offset).trim().endsWith('%') ? parseFloat(a.offset) / 100 : Number(a.offset);
    if (!Number.isFinite(o)) throw new RasterError(`stop offset="${a.offset}" is not a number`);
    o = Math.max(last, Math.min(1, Math.max(0, o)));
    last = o;
    const col = a['stop-color'] === undefined ? [0, 0, 0] : parsePaint(a['stop-color'], 'stop-color');
    if (!Array.isArray(col)) throw new RasterError(`stop-color="${a['stop-color']}" must be a color`);
    const op = a['stop-opacity'] === undefined ? 1 : parseOpacity(a['stop-opacity'], 'stop-opacity');
    stops.push({ o, r: col[0], g: col[1], b: col[2], a: op });
  }
  return stops;
}

function buildLut(stops) {
  const lut = new Float32Array(LUT * 4);
  let j = 0;
  for (let i = 0; i < LUT; i++) {
    const t = i / (LUT - 1);
    while (j < stops.length - 1 && stops[j + 1].o < t) j++;
    let s0 = stops[j], s1 = stops[Math.min(j + 1, stops.length - 1)], r, g, b, a;
    if (t <= stops[0].o) { s0 = s1 = stops[0]; }
    else if (t >= stops[stops.length - 1].o) { s0 = s1 = stops[stops.length - 1]; }
    const span = s1.o - s0.o, k = span > 0 ? Math.min(1, Math.max(0, (t - s0.o) / span)) : 1;
    r = s0.r + (s1.r - s0.r) * k; g = s0.g + (s1.g - s0.g) * k; b = s0.b + (s1.b - s0.b) * k; a = s0.a + (s1.a - s0.a) * k;
    lut[i * 4] = r * a; lut[i * 4 + 1] = g * a; lut[i * 4 + 2] = b * a; lut[i * 4 + 3] = a;
  }
  return lut;
}

const lutCache = new WeakMap();

/** Gradient length attribute: numbers, % (of the bbox in objectBoundingBox units, of the viewport otherwise). */
function glen(v, def, obb, ref) {
  if (v === undefined) return def;
  const s = String(v).trim();
  if (s.endsWith('%')) return (parseFloat(s) / 100) * (obb ? 1 : ref);
  const x = parseFloat(s);
  if (!Number.isFinite(x)) throw new RasterError(`gradient length "${v}" is not a number`);
  return x;
}

/**
 * Resolve a gradient element for one use.
 * → { solid: [r, g, b, a] premultiplied } | { kind, inv, lut, spread, … } | null (paints nothing).
 * bbox: the user-space bounding box of the painted geometry; vp: { w, h } viewport.
 */
export function gradientPaint(el, ctm, bbox, vp) {
  const stops = stopsOf(el);
  if (!stops.length) return null;
  const last = stops[stops.length - 1];
  const solid = (s) => ({ solid: [s.r * s.a, s.g * s.a, s.b * s.a, s.a] });
  if (stops.length === 1) return solid(stops[0]);
  const a = el.attrs;
  const obb = a.gradientUnits !== 'userSpaceOnUse';
  if (a.gradientUnits && a.gradientUnits !== 'userSpaceOnUse' && a.gradientUnits !== 'objectBoundingBox') throw new RasterError(`gradientUnits="${a.gradientUnits}"`);
  if (obb && (!bbox || !(bbox.w > 0) || !(bbox.h > 0))) return null; // SVG: zero-size bbox → not painted
  const spread = a.spreadMethod === 'reflect' ? 2 : a.spreadMethod === 'repeat' ? 1 : 0;
  if (a.spreadMethod && !['pad', 'reflect', 'repeat'].includes(a.spreadMethod)) throw new RasterError(`spreadMethod="${a.spreadMethod}"`);
  let m = ctm;
  if (obb) m = mul(m, [bbox.w, 0, 0, bbox.h, bbox.x, bbox.y]);
  if (a.gradientTransform) m = mul(m, parseTransform(a.gradientTransform));
  const inv = invert(m);
  if (!inv) return null;
  let lut = lutCache.get(el);
  if (!lut) { lut = buildLut(stops); lutCache.set(el, lut); }
  const diag = Math.sqrt((vp.w * vp.w + vp.h * vp.h) / 2);
  if (el.tag === 'linearGradient') {
    const x1 = glen(a.x1, 0, obb, vp.w), y1 = glen(a.y1, 0, obb, vp.h);
    const x2 = glen(a.x2, obb ? 1 : vp.w, obb, vp.w), y2 = glen(a.y2, 0, obb, vp.h);
    const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy;
    if (!(L2 > 0)) return solid(last);
    return { kind: 0, inv, lut, spread, x1, y1, dx: dx / L2, dy: dy / L2 };
  }
  const cx = glen(a.cx, 0.5 * (obb ? 1 : vp.w), obb, vp.w), cy = glen(a.cy, 0.5 * (obb ? 1 : vp.h), obb, vp.h);
  const r = glen(a.r, 0.5 * (obb ? 1 : diag), obb, diag);
  const fx = a.fx === undefined ? cx : glen(a.fx, cx, obb, vp.w), fy = a.fy === undefined ? cy : glen(a.fy, cy, obb, vp.h);
  if (!(r > 0)) return solid(last);
  const cdx = cx - fx, cdy = cy - fy;
  return { kind: 1, inv, lut, spread, fx, fy, cdx, cdy, r, A: cdx * cdx + cdy * cdy - r * r, concentric: Math.abs(cdx) < 1e-12 && Math.abs(cdy) < 1e-12 };
}

/** t → LUT index after the spread method; -1 for "no paint" (cone outside). */
export function lutIndex(t, spread) {
  if (spread === 1) t -= Math.floor(t);
  else if (spread === 2) { t = Math.abs(t) % 2; if (t > 1) t = 2 - t; }
  if (t <= 0) return 0;
  if (t >= 1) return LUT - 1;
  return (t * (LUT - 1) + 0.5) | 0;
}

/** Fill `row` (premultiplied RGBA floats, 4 per pixel from index 0) with gradient colors for pixels x0..x1-1 of row y. */
export function shadeRow(gp, y, x0, x1, row) {
  const { inv, lut, spread } = gp;
  const cy = y + 0.5;
  let gx = inv[0] * (x0 + 0.5) + inv[2] * cy + inv[4], gy = inv[1] * (x0 + 0.5) + inv[3] * cy + inv[5];
  const sx = inv[0], sy = inv[1];
  if (gp.kind === 0) {
    const { x1: ax, y1: ay, dx, dy } = gp;
    const M = LUT - 1;
    for (let x = x0, o = 0; x < x1; x++, o += 4, gx += sx, gy += sy) {
      const t = (gx - ax) * dx + (gy - ay) * dy;
      const i = (spread ? lutIndex(t, spread) : t <= 0 ? 0 : t >= 1 ? M : (t * M + 0.5) | 0) * 4;
      row[o] = lut[i]; row[o + 1] = lut[i + 1]; row[o + 2] = lut[i + 2]; row[o + 3] = lut[i + 3];
    }
    return;
  }
  const { fx, fy, cdx, cdy, r, A, concentric } = gp;
  for (let x = x0, o = 0; x < x1; x++, o += 4, gx += sx, gy += sy) {
    const px = gx - fx, py = gy - fy;
    let t;
    if (concentric) t = Math.sqrt(px * px + py * py) / r;
    else {
      const B = px * cdx + py * cdy, C = px * px + py * py;
      if (Math.abs(A) < 1e-9 * r * r) t = B > 0 ? C / (2 * B) : -1;
      else {
        const disc = B * B - A * C;
        if (disc < 0) t = -1;
        else { const q = Math.sqrt(disc); t = Math.max((B + q) / A, (B - q) / A); }
      }
      if (t < 0) { row[o] = row[o + 1] = row[o + 2] = row[o + 3] = 0; continue; }
    }
    const i = (spread ? lutIndex(t, spread) : t >= 1 ? LUT - 1 : (t * (LUT - 1) + 0.5) | 0) * 4;
    row[o] = lut[i]; row[o + 1] = lut[i + 1]; row[o + 2] = lut[i + 2]; row[o + 3] = lut[i + 3];
  }
}

