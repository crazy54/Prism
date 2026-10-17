// SVG string builder — small, strict and Qt-SVG-safe.
//
// Facets return SVG text. These helpers make that text compact (numbers are
// rounded to 2 decimals), escaped, and impossible to poison with NaN: a
// non-finite number throws at the point it is written, so a broken facet fails
// loudly in tests instead of shipping a key image with "NaN" in it.
//
//   import { el, rect, path, P, SvgCanvas } from '../../scene/index.js';
//   const c = new SvgCanvas({ w: 144, h: 144, idPrefix: ctx.idPrefix });
//   const glow = c.id('glow');
//   c.def(radialGradient(glow, [[0, '#b8a2f2', 0.6], [1, '#b8a2f2', 0]]));
//   c.add(circle({ cx: 72, cy: 72, r: 60, fill: url(glow) }));
//   return c.svg();

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Format a number for SVG: ≤ `d` decimals, no "-0", throws on NaN/Infinity. */
export function n(v, d = 2) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`svg: non-finite number ${v}`);
  const p = 10 ** d;
  const r = Math.round(v * p) / p;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

/** Escape text content / attribute values. */
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Attributes SVG spells in camelCase. Everything else camelCase → kebab-case
// (strokeWidth → stroke-width, fillOpacity → fill-opacity).
const CAMEL = new Set(['viewBox', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
  'patternUnits', 'patternTransform', 'preserveAspectRatio', 'stdDeviation', 'filterUnits', 'primitiveUnits', 'textLength', 'lengthAdjust',
  'baseFrequency', 'numOctaves', 'tableValues', 'kernelMatrix', 'markerWidth', 'markerHeight', 'refX', 'refY']);
const attrName = (k) => (CAMEL.has(k) || !/[A-Z]/.test(k) ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));

/** { x: 1, strokeWidth: 2, fill: '#fff' } → ' x="1" stroke-width="2" fill="#fff"' (null/undefined/false skipped). */
export function attrs(obj) {
  if (!obj) return '';
  let out = '';
  for (const k in obj) {
    const v = obj[k];
    if (v === null || v === undefined || v === false) continue;
    out += ` ${attrName(k)}="${typeof v === 'number' ? n(v) : esc(v)}"`;
  }
  return out;
}

const flat = (children) => {
  let out = '';
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === '') continue;
    out += Array.isArray(c) ? flat(c) : String(c);
  }
  return out;
};

/** Generic element: el('g', { opacity: 0.5 }, child1, [child2, child3]). Children are trusted SVG strings. */
export function el(tag, a, ...children) {
  const body = flat(children);
  return body ? `<${tag}${attrs(a)}>${body}</${tag}>` : `<${tag}${attrs(a)}/>`;
}

export const g = (a, ...children) => el('g', a, ...children);
export const defs = (...children) => el('defs', null, ...children);
export const rect = (a) => el('rect', a);
export const circle = (a) => el('circle', a);
export const ellipse = (a) => el('ellipse', a);
export const line = (a) => el('line', a);
export const path = (d, a) => el('path', { d: String(d), ...a });
export const polyline = (pts, a) => el('polyline', { points: points(pts), ...a });
export const polygon = (pts, a) => el('polygon', { points: points(pts), ...a });
export const points = (pts) => pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');

// No <text> helper on purpose: deck text is drawn as paths (scene/text.js) so it renders
// identically in the Stream Deck app, browsers and the raster backend.

/** url(#id) for fill/stroke/clip-path/mask/filter references. */
export const url = (id) => `url(#${id})`;

/** Gradient stops: [[offset 0–1, '#hex', opacity?], …]. */
const stops = (list) => list.map(([o, c, op]) => el('stop', { offset: n(o, 4), stopColor: c, stopOpacity: op === undefined || op === 1 ? null : op })).join('');

export const linearGradient = (id, list, a = {}) => el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1, ...a }, stops(list));
export const radialGradient = (id, list, a = {}) => el('radialGradient', { id, cx: 0.5, cy: 0.5, r: 0.5, ...a }, stops(list));

/** Paint helpers — color plus separate opacity (never 8-digit hex / rgba). */
export const fill = (color, opacity) => ({ fill: color, fillOpacity: opacity === undefined || opacity >= 1 ? null : Math.max(0, opacity) });
export const stroke = (color, width = 1, opacity) => ({ stroke: color, strokeWidth: width, strokeOpacity: opacity === undefined || opacity >= 1 ? null : Math.max(0, opacity) });

export const translate = (x, y) => `translate(${n(x)} ${n(y)})`;
export const rotate = (a, cx = 0, cy = 0) => `rotate(${n(a)} ${n(cx)} ${n(cy)})`;
export const scale = (sx, sy = sx) => `scale(${n(sx, 4)} ${n(sy, 4)})`;

/** Chainable path builder: P().M(0, 0).L(10, 0).A(5, 5, 0, 0, 1, 10, 10).Z().d */
export function P() {
  const parts = [];
  const api = {
    M: (x, y) => (parts.push(`M${n(x)} ${n(y)}`), api),
    L: (x, y) => (parts.push(`L${n(x)} ${n(y)}`), api),
    H: (x) => (parts.push(`H${n(x)}`), api),
    V: (y) => (parts.push(`V${n(y)}`), api),
    C: (x1, y1, x2, y2, x, y) => (parts.push(`C${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x)} ${n(y)}`), api),
    Q: (x1, y1, x, y) => (parts.push(`Q${n(x1)} ${n(y1)} ${n(x)} ${n(y)}`), api),
    A: (rx, ry, rot, large, sweep, x, y) => (parts.push(`A${n(rx)} ${n(ry)} ${n(rot)} ${large ? 1 : 0} ${sweep ? 1 : 0} ${n(x)} ${n(y)}`), api),
    Z: () => (parts.push('Z'), api),
    get d() { return parts.join(''); },
    toString() { return parts.join(''); },
  };
  return api;
}

/** Rounded-rectangle path (per-corner radii allowed: r or [tl, tr, br, bl]). */
export function roundRectPath(x, y, w, h, r) {
  const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map((v) => Math.max(0, Math.min(v, w / 2, h / 2)));
  const p = P().M(x + tl, y).H(x + w - tr);
  if (tr) p.A(tr, tr, 0, 0, 1, x + w, y + tr);
  p.V(y + h - br);
  if (br) p.A(br, br, 0, 0, 1, x + w - br, y + h);
  p.H(x + bl);
  if (bl) p.A(bl, bl, 0, 0, 1, x, y + h - bl);
  p.V(y + tl);
  if (tl) p.A(tl, tl, 0, 0, 1, x + tl, y);
  return p.Z().d;
}

/** Wrap a body in a standalone SVG document. */
export function svgDoc({ w, h, viewBox, body = '', defs: d = '', title }) {
  const vb = viewBox || `0 0 ${n(w)} ${n(h)}`;
  return `<svg xmlns="${SVG_NS}" width="${n(w)}" height="${n(h)}" viewBox="${vb}">${title ? `<title>${esc(title)}</title>` : ''}${d ? `<defs>${d}</defs>` : ''}${body}</svg>`;
}

/**
 * A drawing surface: collects <defs> and body markup, hands out collision-free
 * ids. Every id in a facet's output must come from `id()` — when many keys sit
 * inline in one web page, a bare id="glow" in one key would paint another.
 */
export class SvgCanvas {
  constructor({ w, h, idPrefix = 'pd', title } = {}) {
    this.w = w;
    this.h = h;
    this.idPrefix = idPrefix;
    this.title = title;
    this._defs = [];
    this._body = [];
    this._ids = new Set();
  }

  /** Unique, prefixed id for a gradient / clip / filter: c.id('glow') → 'pd7k3-glow'. */
  id(name) {
    let base = `${this.idPrefix}-${String(name).replace(/[^a-zA-Z0-9_-]/g, '')}`, out = base, i = 2;
    while (this._ids.has(out)) out = `${base}${i++}`;
    this._ids.add(out);
    return out;
  }

  def(...markup) { this._defs.push(flat(markup)); return this; }
  add(...markup) { this._body.push(flat(markup)); return this; }

  /** Body markup only (for composing into walls / strips). */
  get body() { return this._body.join(''); }
  get defs() { return this._defs.join(''); }

  svg() { return svgDoc({ w: this.w, h: this.h, body: this.body, defs: this.defs, title: this.title }); }
}

/** Split a document produced by svgDoc into { open, inner } (inner = everything between <svg …> and </svg>). */
export function svgInner(svg) {
  const a = svg.indexOf('>', svg.indexOf('<svg'));
  const b = svg.lastIndexOf('</svg>');
  if (a < 0 || b < 0) throw new Error('svgInner: not an <svg> document');
  return svg.slice(a + 1, b);
}

/** Re-frame an SVG document onto a window of it: used to slice walls into keys and strips into dial segments. */
export function svgWindow(svg, { x, y, w, h, outW = w, outH = h, idSuffix = '' }) {
  let inner = svgInner(svg);
  if (idSuffix) inner = suffixIds(inner, idSuffix);
  return `<svg xmlns="${SVG_NS}" width="${n(outW)}" height="${n(outH)}" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}">${inner}</svg>`;
}

/** Make every id (and its url(#…)/href="#…" references) unique by appending a suffix. */
export function suffixIds(markup, suffix) {
  const ids = new Set();
  for (const m of markup.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]);
  if (!ids.size) return markup;
  return markup
    .replace(/\sid="([^"]+)"/g, (m, id) => ` id="${id}${suffix}"`)
    .replace(/url\(#([^)]+)\)/g, (m, id) => (ids.has(id) ? `url(#${id}${suffix})` : m))
    .replace(/href="#([^"]+)"/g, (m, id) => (ids.has(id) ? `href="#${id}${suffix}"` : m));
}

/** UTF-8 → base64 without Buffer/btoa differences (works in Node, browsers and workers). */
export function base64(str) {
  const bytes = new TextEncoder().encode(str);
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '', i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += T[v >> 18] + T[(v >> 12) & 63] + T[(v >> 6) & 63] + T[v & 63];
  }
  if (i < bytes.length) {
    const v = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8);
    out += T[v >> 18] + T[(v >> 12) & 63] + (i + 1 < bytes.length ? T[(v >> 6) & 63] : '=') + '=';
  }
  return out;
}

/** SVG text → data URL. base64 (default) is what the Stream Deck setImage/setFeedback path decodes most reliably. */
export function svgDataUrl(svg, { base64: b64 = true } = {}) {
  return b64 ? `data:image/svg+xml;base64,${base64(svg)}` : `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
