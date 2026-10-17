// Per-slice culling for multi-key surfaces (span, deck, strip, Galleon widgets).
//
// A span or deck facet draws one big canvas; render() slices it into one SVG per
// key (and per strip segment / screen). Without culling every slice carries the whole
// canvas and differs whenever anything anywhere changes. Culling keeps, per slice,
// only the top-level elements whose conservative bounding box touches that slice's
// window, and only the <defs> they reference — so slices are small, and a slice whose
// own pixels didn't change comes out byte-identical frame to frame (runtimes dedupe it).
//
// Bounds are conservative: control-point hulls for curves, exact extents for arcs, stroke margins (2 × stroke-width covers miter joins), every transform applied
// to the box corners, groups = union of children — except a group clipped by a
// <clipPath> holding one user-space <rect> (what compose / keyInto emit), whose bounds
// ARE that rect, so a composed key costs one lookup instead of a parse. Bounds are
// memoized by string (static keys repeat every frame). Anything not understood is kept.

import { parsePath, arcBounds } from './geom.js';

const NUM = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };

/**
 * Index of the '>' closing the tag that starts at i. Fast path: jump with indexOf and
 * only look further if a quoted value contains a raw '>' (the engine escapes them).
 */
function tagEnd(s, i) {
  let gt = s.indexOf('>', i + 1);
  while (gt >= 0) {
    let q = 0;
    for (let j = s.indexOf('"', i); j >= 0 && j < gt; j = s.indexOf('"', j + 1)) q++;
    if (q % 2 === 0) return gt;
    gt = s.indexOf('>', gt + 1);
  }
  return -1;
}

const MEMO_MAX = 6000;
const pathMemo = new Map(), elMemo = new Map();
function memo(map, key, fn) {
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const v = fn();
  if (map.size >= MEMO_MAX) map.delete(map.keys().next().value);
  map.set(key, v);
  return v;
}

/** Split markup into its top-level elements (strings). Throws on malformed input. */
export function splitElements(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    let j = lt, depth = 0;
    for (;;) {
      const gt = tagEnd(s, j);
      if (gt < 0) throw new Error('cull: unterminated tag');
      const closing = s[j + 1] === '/', selfClosing = s[gt - 1] === '/', decl = s[j + 1] === '!' || s[j + 1] === '?';
      if (closing) depth--;
      else if (!selfClosing && !decl) depth++;
      j = gt + 1;
      if (depth <= 0) break;
      j = s.indexOf('<', j);
      if (j < 0) throw new Error('cull: unclosed element');
    }
    out.push(s.slice(lt, j));
    i = j;
  }
  return out;
}

/** { tag, attrs, inner } of one element string. */
function parseElement(str) {
  const gt = tagEnd(str, 0);
  const open = str.slice(1, gt).replace(/\/$/, '');
  const tag = open.match(/^[A-Za-z][\w:.-]*/)[0];
  const attrs = {};
  for (const m of open.slice(tag.length).matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
  const selfClosing = str[gt - 1] === '/';
  const inner = selfClosing ? '' : str.slice(gt + 1, str.lastIndexOf('</'));
  return { tag, attrs, inner };
}

// ── affine boxes ─────────────────────────────────────────────────────────────
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

/** SVG transform list → matrix [a b c d e f] (null if not understood). */
export function parseTransform(str) {
  let m = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let seen = 0, mt;
  while ((mt = re.exec(str))) {
    seen += mt[0].length;
    const v = mt[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (v.some((x) => !Number.isFinite(x))) return null;
    switch (mt[1]) {
      case 'matrix': if (v.length !== 6) return null; m = mul(m, v); break;
      case 'translate': m = mul(m, [1, 0, 0, 1, v[0] || 0, v[1] || 0]); break;
      case 'scale': m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]); break;
      case 'rotate': { const a = ((v[0] || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0; m = mul(m, [1, 0, 0, 1, cx, cy]); m = mul(m, [c, s, -s, c, 0, 0]); m = mul(m, [1, 0, 0, 1, -cx, -cy]); break; }
      case 'skewX': m = mul(m, [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0]); break;
      case 'skewY': m = mul(m, [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0]); break;
      default: return null;
    }
  }
  if (str.replace(/[\s,]/g, '').length && !seen) return null;
  return m;
}

const boxOf = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return x0 === Infinity ? null : [x0, y0, x1, y1]; };
const grow = (b, d) => (b ? [b[0] - d, b[1] - d, b[2] + d, b[3] + d] : b);
const union = (a, b) => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
const applyBox = (b, m) => (b ? boxOf([[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])) : b);

/** Conservative bounds of path data (memoized): every control point of lines and curves; exact arc extents. */
export const pathHullBounds = (d) => memo(pathMemo, d, () => {
  const pts = [];
  for (const { c, v } of parsePath(d)) {
    if (c === 'A') { const b = arcBounds(...v); pts.push([b[0], b[1]], [b[2], b[3]]); }
    else for (let i = 0; i < v.length; i += 2) pts.push([v[i], v[i + 1]]);
  }
  return boxOf(pts);
});

const EMPTY = 'empty';

/**
 * Bounds of one element string in its parent's user space, stroke included.
 * → [x0, y0, x1, y1] | 'empty' (draws nothing) | null (unknown — keep it).
 * `clips` maps clipPath ids to user-space rect boxes (see prepareCull).
 */
export function elementBounds(str, inherited = {}, clips = null) {
  if (clips && str.includes('clip-path=')) return bounds(str, inherited, clips); // clip boxes are per document: no memo
  const key = `${inherited.stroke || ''}|${inherited.strokeWidth || ''}|${str}`;
  return memo(elMemo, key, () => bounds(str, inherited, clips));
}

function bounds(str, inherited, clips) {
  let el;
  try { el = parseElement(str); } catch { return null; }
  const { tag, attrs: a } = el;
  const strokeOn = (a.stroke ?? inherited.stroke) && (a.stroke ?? inherited.stroke) !== 'none';
  const sw = NUM(a['stroke-width'] ?? inherited.strokeWidth, 1);
  const margin = (strokeOn ? sw * 2 : 0) + 1;
  let box;
  switch (tag) {
    case 'rect': { const x = NUM(a.x), y = NUM(a.y), w = NUM(a.width, NaN), h = NUM(a.height, NaN); if (!Number.isFinite(w) || !Number.isFinite(h)) return null; box = [x, y, x + w, y + h]; break; }
    case 'circle': { const cx = NUM(a.cx), cy = NUM(a.cy), r = NUM(a.r); box = [cx - r, cy - r, cx + r, cy + r]; break; }
    case 'ellipse': { const cx = NUM(a.cx), cy = NUM(a.cy), rx = NUM(a.rx), ry = NUM(a.ry); box = [cx - rx, cy - ry, cx + rx, cy + ry]; break; }
    case 'line': box = boxOf([[NUM(a.x1), NUM(a.y1)], [NUM(a.x2), NUM(a.y2)]]); break;
    case 'polyline': case 'polygon': { const v = (a.points || '').trim().split(/[\s,]+/).map(Number); const pts = []; for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]); box = boxOf(pts); if (!box) return EMPTY; break; }
    case 'path': { if (!a.d) return EMPTY; try { box = pathHullBounds(a.d); } catch { return null; } if (!box) return EMPTY; break; }
    case 'g': {
      const clipId = (a['clip-path'] || '').match(/^url\(#([^)]+)\)$/)?.[1];
      if (clipId && clips?.has(clipId)) box = clips.get(clipId); // a clipped group paints nothing outside its clip rect
      else {
        const inh = { stroke: a.stroke ?? inherited.stroke, strokeWidth: a['stroke-width'] ?? inherited.strokeWidth };
        let kids;
        try { kids = splitElements(el.inner); } catch { return null; }
        for (const k of kids) {
          const b = elementBounds(k, inh, clips);
          if (b === null) return null;
          if (b !== EMPTY) box = union(box, b);
        }
        if (!box) return EMPTY;
      }
      if (a.transform) { const m = parseTransform(a.transform); if (!m) return null; box = applyBox(box, m); }
      return box;
    }
    default: return null;
  }
  box = grow(box, margin);
  if (a.transform) { const m = parseTransform(a.transform); if (!m) return null; box = applyBox(box, m); }
  return box;
}

const refsIn = (s) => { const out = new Set(); for (const m of s.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)) out.add(m[1] || m[2]); return out; };
const CLIP_RECT = /^<clipPath[^>]*><rect([^>]*?)\/><\/clipPath>$/;

/**
 * Parse a facet's SVG document once for slicing:
 * { title, defs: [{ id, str, refs }], body: [{ str, box }] }, or null if it isn't the
 * <svg>[<title>][<defs>…</defs>]body</svg> shape the engine emits.
 */
export function prepareCull(svg) {
  try {
    const a = svg.indexOf('>', svg.indexOf('<svg'));
    const b = svg.lastIndexOf('</svg>');
    if (a < 0 || b < 0) return null;
    const parts = splitElements(svg.slice(a + 1, b));
    let title = '';
    const defs = [], body = [], clips = new Map();
    for (const p of parts) {
      if (p.startsWith('<title')) { title = p; continue; }
      if (p.startsWith('<defs')) {
        for (const d of splitElements(parseElement(p).inner)) {
          const id = (d.match(/^<[^>]*?\sid="([^"]+)"/) || [])[1] || null;
          defs.push({ id, str: d, refs: refsIn(d) });
          const cm = id && d.startsWith('<clipPath') && !/clipPathUnits="objectBoundingBox"|transform=/.test(d) && d.match(CLIP_RECT);
          if (cm) {
            const r = parseElement(`<rect${cm[1]}/>`).attrs;
            const x = NUM(r.x), y = NUM(r.y), w = NUM(r.width, NaN), h = NUM(r.height, NaN);
            if (Number.isFinite(w) && Number.isFinite(h) && !r.transform) clips.set(id, [x, y, x + w, y + h]);
          }
        }
        continue;
      }
      const box = clips.size && p.includes('clip-path=') ? bounds(p, {}, clips) : elementBounds(p);
      body.push({ str: p, box });
    }
    return { title, defs, body };
  } catch { return null; }
}

/** The inner markup for one window { x, y, w, h }: intersecting body elements + the defs they reference. */
export function cullInner(prep, { x, y, w, h }) {
  const X0 = x, Y0 = y, X1 = x + w, Y1 = y + h;
  // strict: a box that only touches the window's edge (compose's exact clip of a neighbor) is not inside it
  const kept = prep.body.filter((e) => e.box !== EMPTY && (e.box === null || !(e.box[2] <= X0 || e.box[0] >= X1 || e.box[3] <= Y0 || e.box[1] >= Y1)));
  const want = new Set();
  for (const e of kept) for (const r of refsIn(e.str)) want.add(r);
  // defs may reference defs (gradient href, clip contents): close over references
  const byId = new Map(prep.defs.filter((d) => d.id).map((d) => [d.id, d]));
  const queue = [...want];
  while (queue.length) { const d = byId.get(queue.pop()); if (!d) continue; for (const r of d.refs) if (!want.has(r)) { want.add(r); queue.push(r); } }
  const defs = prep.defs.filter((d) => !d.id || want.has(d.id)).map((d) => d.str).join('');
  return `${prep.title}${defs ? `<defs>${defs}</defs>` : ''}${kept.map((e) => e.str).join('')}`;
}
