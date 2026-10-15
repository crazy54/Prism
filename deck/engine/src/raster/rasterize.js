// rasterize(svg, w, h) — a pure-JS renderer for exactly the deck SVG subset
// (src/scene/validate.js): svg g defs title path rect circle ellipse line
// polyline polygon linearGradient radialGradient stop clipPath, with fills,
// strokes (caps, joins, miter limit, dashes), opacity / fill-opacity /
// stroke-opacity (group opacity composites through a layer), transforms,
// nested viewports, gradients (units, transform, spread, focal point) and
// clip paths (units, transform, clip-rule, nested clips). Anything outside the
// subset throws a RasterError that names it.
//
// Pixels: premultiplied float RGBA, sRGB-space source-over (SVG's default
// color-interpolation, what Chrome and Qt do), 16 sub-scanlines with exact
// horizontal coverage. Output: { data: Uint8ClampedArray RGBA (straight alpha
// unless opts.premultiplied), w, h }.
//
// opts: { background: '#rrggbb' (composite onto an opaque color — device keys),
//         premultiplied: false, tolerance: 0.15 (curve flattening, device px) }

import { parseXml } from '../scene/validate.js';
import {
  RasterError, IDENTITY, mul, scaleOf, numbers, parseTransform,
  flattenPathData, ellipseSub, rectSub, subsBBox, strokeSubs,
} from './geometry.js';
import { Filler, SUB } from './scan.js';

/** Curve flattening tolerance in device px (arcs are error-split, so their deviation is about half). */
export const TOLERANCE = 0.1;
import { parsePaint, parseOpacity, gradientPaint, shadeRow } from './paint.js';

export { RasterError };

/** The deck SVG subset, mirrored from src/scene/validate.js (test/raster.test.js keeps them in sync). */
export const SUBSET_ELEMENTS = new Set(['svg', 'g', 'defs', 'title', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'linearGradient', 'radialGradient', 'stop', 'clipPath']);
export const SUBSET_ATTRIBUTES = new Set(['xmlns', 'width', 'height', 'viewBox', 'id', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'd', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
  'opacity', 'transform', 'clip-path', 'clip-rule', 'clipPathUnits', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'preserveAspectRatio']);

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const SKIP = new Set(['defs', 'title', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);
const ENUMS = {
  'fill-rule': ['nonzero', 'evenodd'], 'clip-rule': ['nonzero', 'evenodd'],
  'stroke-linecap': ['butt', 'round', 'square'], 'stroke-linejoin': ['miter', 'round', 'bevel', 'miter-clip', 'arcs'],
  clipPathUnits: ['userSpaceOnUse', 'objectBoundingBox'],
};
const URL = /^url\(#([^)]+)\)$/;

const UNITS = { px: 1, pt: 4 / 3, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
/** Length: number, px/pt/pc/in/cm/mm, or % of `ref`. */
function len(v, ref, attr) {
  const s = String(v).trim();
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)(%|px|pt|pc|in|cm|mm)?$/.exec(s);
  if (!m) throw new RasterError(`${attr}="${v}" is not a length`);
  const x = +m[1];
  return m[2] === '%' ? (x / 100) * ref : x * (m[2] ? UNITS[m[2]] : 1);
}
const diagOf = (vp) => Math.sqrt((vp.w * vp.w + vp.h * vp.h) / 2);

const ROOT_STYLE = Object.freeze({
  fill: [0, 0, 0], fillOpacity: 1, evenOdd: false,
  stroke: null, strokeOpacity: 1, strokeWidth: 1, cap: 'butt', join: 'miter', miterLimit: 4, dash: null, dashOffset: 0,
  clipEvenOdd: false,
});

function inherit(ps, a, vp) {
  let st = null;
  const set = (k, v) => { if (!st) st = { ...ps }; st[k] = v; };
  for (const k in a) {
    const v = a[k];
    switch (k) {
      case 'fill': set('fill', parsePaint(v, k)); break;
      case 'stroke': set('stroke', parsePaint(v, k)); break;
      case 'fill-opacity': set('fillOpacity', parseOpacity(v, k)); break;
      case 'stroke-opacity': set('strokeOpacity', parseOpacity(v, k)); break;
      case 'stroke-width': set('strokeWidth', len(v, diagOf(vp), k)); break;
      case 'stroke-miterlimit': { const x = Number(v); if (!(x >= 1)) throw new RasterError(`stroke-miterlimit="${v}" (≥ 1)`); set('miterLimit', x); break; }
      case 'stroke-dashoffset': set('dashOffset', len(v, diagOf(vp), k)); break;
      case 'stroke-dasharray': {
        const s = String(v).trim();
        if (s === 'none') { set('dash', null); break; }
        const parts = s.split(/[\s,]+/).filter(Boolean).map((p) => len(p, diagOf(vp), k));
        set('dash', parts.length % 2 ? [...parts, ...parts] : parts);
        break;
      }
      case 'fill-rule': case 'clip-rule': case 'stroke-linecap': case 'stroke-linejoin':
        if (!ENUMS[k].includes(v)) throw new RasterError(`${k}="${v}"`);
        if (k === 'fill-rule') set('evenOdd', v === 'evenodd');
        else if (k === 'clip-rule') set('clipEvenOdd', v === 'evenodd');
        else if (k === 'stroke-linecap') set('cap', v);
        else set('join', v);
        break;
      default:
    }
  }
  return st || ps;
}

/** viewBox + preserveAspectRatio → matrix mapping the viewBox onto the viewport (x, y, w, h). */
function viewBoxMatrix(vb, par, x, y, w, h) {
  const [vx, vy, vw, vh] = vb;
  let sx = w / vw, sy = h / vh;
  const p = String(par || 'xMidYMid meet').trim().replace(/^defer\s+/, '').split(/\s+/);
  const align = p[0], slice = p[1] === 'slice';
  if (!/^(none|x(Min|Mid|Max)Y(Min|Mid|Max))$/.test(align) || (p[1] && !/^(meet|slice)$/.test(p[1]))) throw new RasterError(`preserveAspectRatio="${par}"`);
  if (align === 'none') return [sx, 0, 0, sy, x - vx * sx, y - vy * sy];
  const s = slice ? Math.max(sx, sy) : Math.min(sx, sy);
  let tx = x - vx * s, ty = y - vy * s;
  const ax = align.slice(1, 4), ay = align.slice(5, 8);
  if (ax === 'Mid') tx += (w - vw * s) / 2; else if (ax === 'Max') tx += w - vw * s;
  if (ay === 'Mid') ty += (h - vh * s) / 2; else if (ay === 'Max') ty += h - vh * s;
  return [s, 0, 0, s, tx, ty];
}

function parseViewBox(v) {
  const n = numbers(v);
  if (n.length !== 4) throw new RasterError(`viewBox="${v}"`);
  return n;
}

// ── per-size resources (reused across frames: rasterizing at 10 fps allocates almost nothing) ──

class Resources {
  constructor(W, H, sub) {
    this.W = W; this.H = H;
    this.filler = new Filler(W, H, sub);
    this.row = new Float32Array(W * 4);
    this.pts = new Float64Array(1024);
    this.layers = [];
    this.masks = [];
  }
  layer() { return this.layers.pop() || { buf: new Float32Array(this.W * this.H * 4) }; }
  mask() { return this.masks.pop() || { data: new Float32Array(this.W * this.H) }; }
}
const POOL = new Map();
function resources(W, H, sub) {
  const k = `${W}x${H}x${sub}`;
  let r = POOL.get(k);
  if (!r) {
    r = new Resources(W, H, sub);
    POOL.set(k, r);
    if (POOL.size > 12) POOL.delete(POOL.keys().next().value);
  }
  return r;
}

const EMPTY = Symbol('empty clip');

class Renderer {
  constructor(res, tol) {
    this.res = res; this.W = res.W; this.H = res.H; this.tol = tol;
    this.ids = new Map();
    this.parents = new Map();
    this.clipCache = new Map();
    this.ownedMasks = [];
  }

  // ── checking + indexing ──
  index(el, parent) {
    if (!SUBSET_ELEMENTS.has(el.tag)) throw new RasterError(el.tag === 'text' ? '<text> is outside the deck SVG subset — draw text with scene/text.js (paths)' : `<${el.tag}> is outside the deck SVG subset`);
    for (const k in el.attrs) if (!SUBSET_ATTRIBUTES.has(k)) throw new RasterError(`attribute ${k} on <${el.tag}> is outside the deck SVG subset`);
    if (el.attrs.id !== undefined && !this.ids.has(el.attrs.id)) this.ids.set(el.attrs.id, el);
    if (parent) this.parents.set(el, parent);
    for (const c of el.children) this.index(c, el);
  }

  // ── geometry ──
  /** Element → user-space subpaths (null = not rendered). */
  geometry(el, vp, tol) {
    const a = el.attrs;
    const L = (k, ref, def = 0) => (a[k] === undefined ? def : len(a[k], ref, k));
    switch (el.tag) {
      case 'path': return a.d ? flattenPathData(a.d, tol) : null;
      case 'rect': {
        const w = L('width', vp.w), h = L('height', vp.h);
        if (!(w > 0) || !(h > 0)) return null;
        let rx = a.rx === undefined || a.rx === 'auto' ? undefined : L('rx', vp.w), ry = a.ry === undefined || a.ry === 'auto' ? undefined : L('ry', vp.h);
        if (rx === undefined) rx = ry ?? 0;
        if (ry === undefined) ry = rx;
        rx = Math.min(Math.max(0, rx), w / 2); ry = Math.min(Math.max(0, ry), h / 2);
        return [rectSub(L('x', vp.w), L('y', vp.h), w, h, rx, ry, tol)];
      }
      case 'circle': {
        const r = L('r', diagOf(vp));
        return r > 0 ? [ellipseSub(L('cx', vp.w), L('cy', vp.h), r, r, tol)] : null;
      }
      case 'ellipse': {
        let rx = a.rx === undefined || a.rx === 'auto' ? undefined : L('rx', vp.w), ry = a.ry === undefined || a.ry === 'auto' ? undefined : L('ry', vp.h);
        if (rx === undefined) rx = ry; if (ry === undefined) ry = rx;
        return rx > 0 && ry > 0 ? [ellipseSub(L('cx', vp.w), L('cy', vp.h), rx, ry, tol)] : null;
      }
      case 'line': return [{ pts: [L('x1', vp.w), L('y1', vp.h), L('x2', vp.w), L('y2', vp.h)], closed: false, segs: true }];
      case 'polyline': case 'polygon': {
        const n = numbers(a.points || '');
        if (n.length % 2) n.pop();
        if (n.length < 2) return null;
        return [{ pts: n, closed: el.tag === 'polygon', segs: n.length >= 4 }];
      }
      default: return null;
    }
  }

  /** User-space bounding box of an element's geometry (children for containers), for objectBoundingBox units. */
  bboxOf(el, vp) {
    if (SHAPES.has(el.tag)) return this.shapeBBox(el, vp);
    if (el.tag !== 'g' && el.tag !== 'svg') return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of el.children) {
      if (SKIP.has(c.tag)) continue;
      const b = this.bboxOf(c, vp);
      if (!b) continue;
      const m = c.attrs.transform ? parseTransform(c.attrs.transform) : IDENTITY;
      for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
        const tx = m[0] * x + m[2] * y + m[4], ty = m[1] * x + m[3] * y + m[5];
        if (tx < x0) x0 = tx; if (tx > x1) x1 = tx; if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
      }
    }
    return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Exact user-space bbox of a shape (flattened outlines are slightly inflated by error splitting). */
  shapeBBox(el, vp) {
    const a = el.attrs, L = (k, ref) => (a[k] === undefined ? 0 : len(a[k], ref, k));
    if (el.tag === 'rect') { const w = L('width', vp.w), h = L('height', vp.h); return w > 0 && h > 0 ? { x: L('x', vp.w), y: L('y', vp.h), w, h } : null; }
    if (el.tag === 'circle' || el.tag === 'ellipse') {
      const r = el.tag === 'circle' ? L('r', diagOf(vp)) : null;
      let rx = r ?? (a.rx === undefined || a.rx === 'auto' ? undefined : L('rx', vp.w)), ry = r ?? (a.ry === undefined || a.ry === 'auto' ? undefined : L('ry', vp.h));
      if (rx === undefined) rx = ry; if (ry === undefined) ry = rx;
      return rx > 0 && ry > 0 ? { x: L('cx', vp.w) - rx, y: L('cy', vp.h) - ry, w: 2 * rx, h: 2 * ry } : null;
    }
    const g = this.geometry(el, vp, 0.005);
    return g ? subsBBox(g) : null;
  }

  /** Transform user-space contours into the filler. */
  addContour(p, m) {
    const n = p.length;
    if (n < 6) return;
    let buf = this.res.pts;
    if (buf.length < n) buf = this.res.pts = new Float64Array(n * 2);
    const [a, b, c, d, e, f] = m;
    for (let i = 0; i < n; i += 2) {
      const x = p[i], y = p[i + 1];
      const tx = a * x + c * y + e, ty = b * x + d * y + f;
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
      buf[i] = tx; buf[i + 1] = ty;
    }
    this.res.filler.contour(buf, n);
  }

  // ── clip masks ──
  newMask() {
    const mk = this.res.mask();
    mk.x0 = this.W; mk.y0 = this.H; mk.x1 = 0; mk.y1 = 0;
    this.ownedMasks.push(mk);
    return mk;
  }

  intersect(a, b) {
    if (!a) return b;
    if (!b) return a;
    const mk = this.newMask();
    const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0), x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
    if (x0 >= x1 || y0 >= y1) return mk;
    const W = this.W, A = a.data, B = b.data, D = mk.data;
    for (let y = y0; y < y1; y++) for (let i = y * W + x0, e = y * W + x1; i < e; i++) D[i] = A[i] * B[i];
    mk.x0 = x0; mk.y0 = y0; mk.x1 = x1; mk.y1 = y1;
    return mk;
  }

  /** Mask for clip-path="url(#ref)" on `el` in user space `m` → mask | EMPTY | null (no clip). */
  clipMask(value, m, el, vp) {
    const r = URL.exec(String(value).trim());
    if (String(value).trim() === 'none') return null;
    if (!r) throw new RasterError(`clip-path="${value}" — only url(#id)`);
    const cp = this.ids.get(r[1]);
    if (!cp || cp.tag !== 'clipPath') return null; // CSS Masking: an invalid reference is ignored
    const a = cp.attrs;
    if (a.clipPathUnits && !ENUMS.clipPathUnits.includes(a.clipPathUnits)) throw new RasterError(`clipPathUnits="${a.clipPathUnits}"`);
    let cm = a.transform ? mul(m, parseTransform(a.transform)) : m;
    if (a.clipPathUnits === 'objectBoundingBox') {
      const b = this.bboxOf(el, vp);
      if (!b || !(b.w > 0) || !(b.h > 0)) return EMPTY;
      cm = mul(cm, [b.w, 0, 0, b.h, b.x, b.y]);
    }
    const key = `${r[1]}|${cm.join(',')}`;
    if (this.clipCache.has(key)) return this.clipCache.get(key);
    this.clipCache.set(key, EMPTY); // guards a self-referencing clip
    // clip-rule inherits along the clipPath's own ancestors
    let base = ROOT_STYLE;
    const chain = [];
    for (let p = cp; p; p = this.parents.get(p)) chain.unshift(p);
    for (const p of chain) if (p.attrs['clip-rule']) base = inherit(base, { 'clip-rule': p.attrs['clip-rule'] }, vp);
    let mk = this.newMask();
    const W = this.W, D = mk.data;
    const filler = this.res.filler;
    for (const c of cp.children) {
      if (!SHAPES.has(c.tag)) continue; // browsers ignore <g> and friends inside <clipPath>
      const ccm = c.attrs.transform ? mul(cm, parseTransform(c.attrs.transform)) : cm;
      const s = scaleOf(ccm);
      if (!(s > 0)) continue;
      let sub = null;
      if (c.attrs['clip-path']) { sub = this.clipMask(c.attrs['clip-path'], ccm, c, vp); if (sub === EMPTY) continue; }
      const geo = this.geometry(c, vp, this.tol / s);
      if (!geo) continue;
      const evenOdd = c.attrs['clip-rule'] ? c.attrs['clip-rule'] === 'evenodd' : base.clipEvenOdd;
      filler.begin();
      for (const g of geo) this.addContour(g.pts, ccm);
      const box = sub ? sub : { x0: 0, y0: 0, x1: W, y1: this.H };
      const S = sub ? sub.data : null;
      filler.fill(evenOdd, box, (y, x0, x1, cov) => {
        for (let x = x0, i = y * W + x0; x < x1; x++, i++) {
          let v = cov[x];
          if (v <= 0) continue;
          if (v > 1) v = 1;
          if (S) v *= S[i];
          D[i] = D[i] + v - D[i] * v;
        }
        if (x0 < mk.x0) mk.x0 = x0; if (x1 > mk.x1) mk.x1 = x1;
        if (y < mk.y0) mk.y0 = y; if (y + 1 > mk.y1) mk.y1 = y + 1;
      });
    }
    if (a['clip-path']) {
      const other = this.clipMask(a['clip-path'], m, el, vp);
      if (other === EMPTY) mk = EMPTY;
      else if (other) mk = this.intersect(mk, other);
    }
    if (mk !== EMPTY && (mk.x0 >= mk.x1 || mk.y0 >= mk.y1)) mk = EMPTY;
    this.clipCache.set(key, mk);
    return mk;
  }

  // ── paint ──
  paintOf(p, opacity, ctm, bbox, vp) {
    if (!p || !(opacity > 0)) return null;
    if (Array.isArray(p)) return { solid: [p[0] * opacity, p[1] * opacity, p[2] * opacity, opacity] };
    const g = this.ids.get(p.ref);
    if (!g || (g.tag !== 'linearGradient' && g.tag !== 'radialGradient')) return null;
    const gp = gradientPaint(g, ctm, bbox(), vp);
    if (!gp) return null;
    if (gp.solid) return gp.solid[3] > 0 ? { solid: gp.solid.map((v) => v * opacity) } : null;
    gp.opacity = opacity;
    return gp;
  }

  /** Composite the filler's coverage with `paint` into `target`. */
  fillWith(evenOdd, paint, target, clip) {
    const W = this.W, buf = target.buf, Cd = clip ? clip.data : null;
    const box = clip || { x0: 0, y0: 0, x1: W, y1: this.H };
    const mark = (y, x0, x1) => {
      if (x0 < target.x0) target.x0 = x0; if (x1 > target.x1) target.x1 = x1;
      if (y < target.y0) target.y0 = y; if (y + 1 > target.y1) target.y1 = y + 1;
    };
    if (paint.solid) {
      const [r, g, b, a] = paint.solid;
      this.res.filler.fill(evenOdd, box, (y, x0, x1, cov) => {
        let o = (y * W + x0) * 4, i = y * W + x0;
        for (let x = x0; x < x1; x++, o += 4, i++) {
          let c = cov[x];
          if (c <= 0) continue;
          if (c > 1) c = 1;
          if (Cd) { c *= Cd[i]; if (c <= 0) continue; }
          const k = 1 - a * c;
          buf[o] = r * c + buf[o] * k; buf[o + 1] = g * c + buf[o + 1] * k; buf[o + 2] = b * c + buf[o + 2] * k; buf[o + 3] = a * c + buf[o + 3] * k;
        }
        mark(y, x0, x1);
      });
      return;
    }
    const row = this.res.row, op = paint.opacity;
    this.res.filler.fill(evenOdd, box, (y, x0, x1, cov) => {
      shadeRow(paint, y, x0, x1, row);
      let o = (y * W + x0) * 4, i = y * W + x0;
      for (let x = x0, q = 0; x < x1; x++, o += 4, i++, q += 4) {
        let c = cov[x];
        if (c <= 0) continue;
        if (c > 1) c = 1;
        const ra = row[q + 3];
        if (ra <= 0) continue;
        if (Cd) { c *= Cd[i]; if (c <= 0) continue; }
        c *= op;
        const k = 1 - ra * c;
        buf[o] = row[q] * c + buf[o] * k; buf[o + 1] = row[q + 1] * c + buf[o + 1] * k; buf[o + 2] = row[q + 2] * c + buf[o + 2] * k; buf[o + 3] = row[q + 3] * c + buf[o + 3] * k;
      }
      mark(y, x0, x1);
    });
  }

  drawShape(el, st, m, vp, target, clip, alpha) {
    const s = scaleOf(m);
    if (!(s > 0)) return;
    const tol = this.tol / s;
    const geo = this.geometry(el, vp, tol);
    if (!geo) return;
    let bb;
    const bbox = () => (bb === undefined ? (bb = this.shapeBBox(el, vp)) : bb);
    const filler = this.res.filler;
    if (el.tag !== 'line') {
      const paint = this.paintOf(st.fill, st.fillOpacity * alpha, m, bbox, vp);
      if (paint) {
        filler.begin();
        for (const g of geo) this.addContour(g.pts, m);
        this.fillWith(st.evenOdd, paint, target, clip);
      }
    }
    if (st.stroke && st.strokeWidth > 0) {
      // Strokes thinner than one device pixel draw as a 1 px line with the width as coverage
      // (Skia's TreatAAStrokeAsHairline — what Chrome does; it keeps hairlines from vanishing).
      let width = st.strokeWidth, cover = 1;
      const l0 = st.strokeWidth * Math.hypot(m[0], m[1]), l1 = st.strokeWidth * Math.hypot(m[2], m[3]);
      if (l0 < 1 && l1 < 1) { cover = (l0 + l1) / 2; width = st.strokeWidth / cover; }
      const paint = this.paintOf(st.stroke, st.strokeOpacity * alpha * cover, m, bbox, vp);
      if (paint) {
        filler.begin();
        strokeSubs(geo, { width, cap: st.cap, join: st.join, miterLimit: st.miterLimit, dash: st.dash, dashOffset: st.dashOffset }, tol, (p) => this.addContour(p, m));
        this.fillWith(false, paint, target, clip);
      }
    }
  }

  /** How many paint operations an element makes (stops counting at 2) — opacity folds into alpha when ≤ 1. */
  paintOps(el, st, vp) {
    if (SKIP.has(el.tag)) return 0;
    if (SHAPES.has(el.tag)) return (st.fill && el.tag !== 'line' ? 1 : 0) + (st.stroke && st.strokeWidth > 0 ? 1 : 0);
    let n = 0;
    for (const c of el.children) {
      if (SKIP.has(c.tag)) continue;
      n += this.paintOps(c, inherit(st, c.attrs, vp), vp);
      if (n > 1) break;
    }
    return n;
  }

  node(el, ps, ctm, vp, target, clip, alpha) {
    if (SKIP.has(el.tag)) return;
    const a = el.attrs;
    const st = inherit(ps, a, vp);
    let m = a.transform ? mul(ctm, parseTransform(a.transform)) : ctm;
    let cvp = vp;
    if (el.tag === 'svg') { // nested viewport
      const x = a.x === undefined ? 0 : len(a.x, vp.w, 'x'), y = a.y === undefined ? 0 : len(a.y, vp.h, 'y');
      const w = a.width === undefined ? vp.w : len(a.width, vp.w, 'width'), h = a.height === undefined ? vp.h : len(a.height, vp.h, 'height');
      if (!(w > 0) || !(h > 0)) return;
      const vclip = this.rectMask(m, x, y, w, h);
      clip = vclip === EMPTY ? EMPTY : this.intersect(clip, vclip);
      if (clip === EMPTY || clip.x0 >= clip.x1) return;
      if (a.viewBox) {
        const vb = parseViewBox(a.viewBox);
        if (!(vb[2] > 0) || !(vb[3] > 0)) return;
        m = mul(m, viewBoxMatrix(vb, a.preserveAspectRatio, x, y, w, h));
        cvp = { w: vb[2], h: vb[3] };
      } else { m = mul(m, [1, 0, 0, 1, x, y]); cvp = { w, h }; }
    }
    if (a['clip-path']) {
      const c = this.clipMask(a['clip-path'], m, el, vp);
      if (c === EMPTY) return;
      if (c) { clip = this.intersect(clip, c); if (clip.x0 >= clip.x1 || clip.y0 >= clip.y1) return; }
    }
    const op = a.opacity === undefined ? 1 : parseOpacity(a.opacity);
    if (!(op > 0)) return;
    if (op < 1 && this.paintOps(el, st, cvp) > 1) {
      const layer = this.res.layer();
      layer.x0 = this.W; layer.y0 = this.H; layer.x1 = 0; layer.y1 = 0;
      this.content(el, st, m, cvp, layer, clip, 1);
      this.composite(layer, target, op);
      this.res.layers.push(layer);
      return;
    }
    this.content(el, st, m, cvp, target, clip, alpha * op);
  }

  content(el, st, m, vp, target, clip, alpha) {
    if (SHAPES.has(el.tag)) { this.drawShape(el, st, m, vp, target, clip, alpha); return; }
    for (const c of el.children) this.node(c, st, m, vp, target, clip, alpha);
  }

  rectMask(m, x, y, w, h) {
    const key = `rect|${m.join(',')}|${x},${y},${w},${h}`;
    if (this.clipCache.has(key)) return this.clipCache.get(key);
    const mk = this.newMask(), W = this.W, D = mk.data;
    const f = this.res.filler;
    f.begin();
    this.addContour([x, y, x + w, y, x + w, y + h, x, y + h], m);
    f.fill(false, { x0: 0, y0: 0, x1: W, y1: this.H }, (yy, x0, x1, cov) => {
      for (let xx = x0, i = yy * W + x0; xx < x1; xx++, i++) D[i] = Math.min(1, cov[xx]);
      if (x0 < mk.x0) mk.x0 = x0; if (x1 > mk.x1) mk.x1 = x1;
      if (yy < mk.y0) mk.y0 = yy; if (yy + 1 > mk.y1) mk.y1 = yy + 1;
    });
    const out = mk.x0 >= mk.x1 ? EMPTY : mk;
    this.clipCache.set(key, out);
    return out;
  }

  /** Layer → target with group opacity; clears the layer for reuse. */
  composite(layer, target, op) {
    if (layer.x0 >= layer.x1) return;
    const W = this.W, L = layer.buf, B = target.buf;
    for (let y = layer.y0; y < layer.y1; y++) {
      for (let x = layer.x0, o = (y * W + x) * 4; x < layer.x1; x++, o += 4) {
        const la = L[o + 3];
        if (la > 0) {
          const k = 1 - la * op;
          B[o] = L[o] * op + B[o] * k; B[o + 1] = L[o + 1] * op + B[o + 1] * k; B[o + 2] = L[o + 2] * op + B[o + 2] * k; B[o + 3] = la * op + B[o + 3] * k;
        }
        L[o] = L[o + 1] = L[o + 2] = L[o + 3] = 0;
      }
    }
    if (layer.x0 < target.x0) target.x0 = layer.x0; if (layer.x1 > target.x1) target.x1 = layer.x1;
    if (layer.y0 < target.y0) target.y0 = layer.y0; if (layer.y1 > target.y1) target.y1 = layer.y1;
  }

  release() {
    for (const mk of this.ownedMasks) {
      if (mk.x1 > mk.x0) for (let y = mk.y0; y < mk.y1; y++) mk.data.fill(0, y * this.W + mk.x0, y * this.W + mk.x1);
      this.res.masks.push(mk);
    }
    this.ownedMasks = [];
  }
}

/** Parse + check an SVG document → { root element, width, height }. */
export function parseSvg(svg) {
  if (typeof svg !== 'string') throw new RasterError(`expected an SVG string, got ${typeof svg}`);
  const { root, errors } = parseXml(svg.trim());
  if (errors.length) throw new RasterError(`malformed SVG: ${errors[0]}`);
  const top = root.children;
  if (top.length !== 1 || top[0].tag !== 'svg') throw new RasterError('the document must have a single <svg> root');
  const s = top[0];
  const vb = s.attrs.viewBox ? parseViewBox(s.attrs.viewBox) : null;
  const width = s.attrs.width !== undefined && !String(s.attrs.width).endsWith('%') ? len(s.attrs.width, 0, 'width') : vb ? vb[2] : 300;
  const height = s.attrs.height !== undefined && !String(s.attrs.height).endsWith('%') ? len(s.attrs.height, 0, 'height') : vb ? vb[3] : 150;
  return { el: s, width, height, viewBox: vb };
}

/**
 * Rasterize one deck SVG frame.
 * w, h: output size (default: the document's width/height; the viewBox is fitted per preserveAspectRatio).
 * → { data: Uint8ClampedArray RGBA, w, h }
 */
export function rasterize(svg, w, h, opts = {}) {
  const doc = parseSvg(svg);
  const W = Math.round(w ?? (h ? (h * doc.width) / doc.height : doc.width));
  const H = Math.round(h ?? (w ? (w * doc.height) / doc.width : doc.height));
  if (!(W > 0 && H > 0 && W <= 16384 && H <= 16384)) throw new RasterError(`bad output size ${W}×${H}`);
  const res = resources(W, H, opts.subsamples ?? SUB);
  const r = new Renderer(res, opts.tolerance ?? TOLERANCE);
  r.index(doc.el, null);
  const canvas = { buf: new Float32Array(W * H * 4), x0: 0, y0: 0, x1: W, y1: H };
  if (opts.background) {
    const bg = parsePaint(opts.background, 'background');
    if (!Array.isArray(bg)) throw new RasterError('background must be a #rrggbb color');
    for (let i = 0; i < W * H * 4; i += 4) { canvas.buf[i] = bg[0]; canvas.buf[i + 1] = bg[1]; canvas.buf[i + 2] = bg[2]; canvas.buf[i + 3] = 1; }
  }
  const a = doc.el.attrs;
  let m = viewBoxMatrix(doc.viewBox || [0, 0, doc.width, doc.height], a.preserveAspectRatio, 0, 0, W, H);
  const vp = doc.viewBox ? { w: doc.viewBox[2], h: doc.viewBox[3] } : { w: doc.width, h: doc.height };
  try {
    if (doc.viewBox && !(doc.viewBox[2] > 0 && doc.viewBox[3] > 0)) return toImage(canvas.buf, W, H, opts.premultiplied);
    // the root: its own presentation attributes, opacity, transform and clip-path, but no nested viewport
    const root = { ...doc.el, tag: 'g', attrs: { ...a } };
    delete root.attrs.x; delete root.attrs.y; delete root.attrs.width; delete root.attrs.height; delete root.attrs.viewBox;
    r.node(root, ROOT_STYLE, m, vp, canvas, null, 1);
  } finally { r.release(); }
  return toImage(canvas.buf, W, H, opts.premultiplied);
}

function toImage(buf, W, H, premultiplied) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < out.length; i += 4) {
    const a = buf[i + 3];
    if (!(a > 0)) continue;
    if (premultiplied || a >= 0.9999) { out[i] = buf[i] * 255; out[i + 1] = buf[i + 1] * 255; out[i + 2] = buf[i + 2] * 255; }
    else { const k = 255 / a; out[i] = buf[i] * k; out[i + 1] = buf[i + 1] * k; out[i + 2] = buf[i + 2] * k; }
    out[i + 3] = a * 255; // Uint8ClampedArray rounds to nearest
  }
  return { data: out, w: W, h: H };
}
