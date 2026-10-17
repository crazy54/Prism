// D1's motion helpers — press feedback and state transitions that read on hardware
// (≈ 10 updates/s per key): every beat of a motion lasts at least one frame, and a
// transition is 5–6 frames long.
//
//   face(k, draw, opts)          a full-size key face in its own sub-surface (own ids,
//                                the theme's metrics), to place under a transform / opacity
//   keyFace(k, glyph, state, label)   the theme's material + glyph + label for one state
//   pickGlyph(ctx), statePair(g)      the glyph param (with a fallback) and its [lit, rest] states
//   pressClock(ctx, o)           autoplay() + "seconds since the press began"
//   stateClock(ctx, o)           { from, to, since, auto } — the real state change, or a demo one
//   ghost(k, glyph, o)           a glyph's geometry as one flat color (chromatic copies)
//   morphPen(a, b, p)            a Pen whose primitives interpolate glyph geometry a → b

import { KeySurface } from '../../scene/surface.js';
import { childContext } from '../../scene/compose.js';
import { attrs, n } from '../../scene/svg.js';
import { drawGlyph, Pen } from '../../glyphs/_glyph.js';
import { flattenPath, transformPath } from '../../scene/geom.js';
import { clamp, lerp } from '../../scene/easing.js';
import { autoplay } from './_autoplay.js';
import { mutedPlate, strike } from '../apps/_muted.js';

// ── faces ─────────────────────────────────────────────────────────────────────

/** Draw a full key face into its own surface. Returns { body, k, out } — place it with place(). */
export function face(parent, draw, { tag = 'f', press = true, ...over } = {}) {
  const sub = childContext(parent.ctx, { x: 0, y: 0, w: parent.w, h: parent.h }, { kind: 'key', tag });
  if (press) { sub.pressed = parent.ctx.pressed; sub.pressAge = parent.ctx.pressAge; }
  Object.assign(sub, over);
  const k = new KeySurface(sub);
  const out = draw(k);
  if (k.defs) parent.def(k.defs);
  return { body: k.body, k, out };
}

/** Add markup under a transform / opacity / clip. */
export function place(parent, body, { transform, opacity, clip } = {}) {
  parent.add(`<g${attrs({ transform, opacity: opacity !== undefined && opacity < 0.999 ? n(Math.max(0, opacity), 3) : null, clipPath: clip ? `url(#${clip})` : null })}>${body}</g>`);
}

/** scale (sx, sy) about (cx, cy), then translate (dx, dy) — as a transform string. */
export const about = (cx, cy, sx, sy = sx, dx = 0, dy = 0) => `translate(${n(cx + dx)} ${n(cy + dy)}) scale(${n(sx, 4)} ${n(sy, 4)}) translate(${n(-cx)} ${n(-cy)})`;

// ── glyphs and states ─────────────────────────────────────────────────────────

/** The glyph named by params.glyph, or the facet's default, or any glyph — never throws on a stale id. */
export function pickGlyph(ctx) {
  const reg = ctx.glyphs;
  return reg.get(ctx.params.glyph) || reg.get(ctx.facet.params?.glyph?.default) || reg.values().next().value;
}

const LIT = ['active', 'ok', 'alert', 'warn', 'info', 'crit', 'busy', 'neg'];
const REST = ['idle', 'off', 'neg'];
/** [lit, rest] state names of a glyph (a one-state glyph gives the same state twice). */
export function statePair(g) {
  const names = g.stateNames;
  const rank = (list, s) => { const i = list.indexOf(g.states[s]); return i < 0 ? 99 : i; };
  const lit = [...names].sort((a, b) => rank(LIT, a) - rank(LIT, b))[0];
  const rest = [...names].filter((s) => s !== lit).sort((a, b) => rank(REST, a) - rank(REST, b))[0] ?? lit;
  return [lit, rest];
}

const title = (s) => String(s || '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
/** Label for facet state i (0 = on / lit, 1 = off / rest): the user's text, else the glyph's state name. */
export const stateLabel = (ctx, i, glyphState) => (i === 0 ? ctx.params.labelOn : ctx.params.labelOff) || title(glyphState);

/** The theme's material, the glyph and its label for one state. Returns k.glyph()'s result. */
export function keyFace(k, g, state, label, { since, t, opacity, labelOpacity, box, labeled = true } = {}) {
  const st = g.states[state] ? state : g.defaultState;
  const tone = g.states[st];
  // a muted mic is unmissable (apps/_muted.js): red face, struck glyph, MUTED
  const muted = g.id === 'mic' && st === 'off';
  k.background({ tone });
  if (muted) mutedPlate(k, { since });
  const r = k.glyph(g.id, { state: st, labeled: labeled && !!label, since, t, opacity, box });
  if (muted) strike(k, box || k.theme.glyphBox(k, { labeled: labeled && !!label }), { since });
  if (label) k.label(muted ? String(label).toUpperCase() : label, { color: muted ? 'ink' : tone === 'off' ? 'dim' : undefined, opacity: labelOpacity });
  return r;
}

/** autoplay() plus `down`: seconds since the press began (Infinity = no press in view). */
export function pressClock(ctx, { at, hold = 0.18 } = {}) {
  const c = autoplay(ctx, { at: at ?? Math.max(0, ctx.facet.loop * 0.4 - hold - 0.12), hold });
  const down = c.pressed ? (c.pressedFor ?? 0) : c.pressAge + hold;
  return { ...c, down };
}

/**
 * The state change on screen. Real runtimes: `to` = ctx.state, `from` = the previous
 * state, `since` = ctx.since. Nobody pressing yet (catalog, thumbnail): a demo change
 * every half loop, timed so the still (40% into the loop) lands mid-transition.
 */
export function stateClock(ctx, { dur = 0.6 } = {}) {
  const n0 = Math.max(1, ctx.states.length);
  const auto = ctx.params.autoplay !== false && !ctx.pressed && ctx.pressAge === Infinity && !ctx.reduced && n0 > 1;
  if (!auto) {
    const to = ctx.state, from = (to - 1 + n0) % n0;
    return { from, to, since: ctx.reduced ? Infinity : ctx.since, auto: false };
  }
  const half = ctx.facet.loop / 2, u = ctx.t - (ctx.facet.loop * 0.4 - dur * 0.5);
  const idx = Math.floor(u / half);
  const to = ((idx % 2) + 2) % 2;
  return { from: 1 - to, to, since: u - idx * half, auto: true };
}

// ── geometry ──────────────────────────────────────────────────────────────────

/** Apply a Pen group transform chain (translate / rotate / scale) to path data. */
function applyTfs(d, tfs) {
  let out = d;
  for (let j = tfs.length - 1; j >= 0; j--) {
    let m = [1, 0, 0, 1, 0, 0];
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    for (const [, fn, args] of tfs[j].matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
      const v = args.trim().split(/[\s,]+/).map(Number);
      if (fn === 'translate') m = mul(m, [1, 0, 0, 1, v[0], v[1] || 0]);
      else if (fn === 'scale') m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
      else { const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0; m = mul(m, [1, 0, 0, 1, cx, cy]); m = mul(m, [c, s, -s, c, 0, 0]); m = mul(m, [1, 0, 0, 1, -cx, -cy]); }
    }
    out = transformPath(out, m);
  }
  return out;
}

/** A glyph's primitives for a state (theme override included), transforms baked in. */
export function glyphPrims(k, g, state, { t = k.ctx.t, since = 99 } = {}) {
  const ctx = k.ctx;
  const { pen } = drawGlyph(g, { state, t, since, pressed: ctx.pressed, pressAge: ctx.pressAge, value: ctx.value, params: ctx.params }, k.theme.glyphs[g.id]);
  return pen.flat().map((p) => ({ ...p, d: p.transforms.length ? applyTfs(p.d, p.transforms) : p.d }));
}

/** A glyph in one flat color — for chromatic copies. o: { state, box, color, opacity, width (× line width), t, since } */
export function ghost(k, g, { state, box, color, opacity = 1, width = 1, t, since } = {}) {
  let ds = '', df = '';
  for (const p of glyphPrims(k, g, state, { t, since })) { if ((p.opacity ?? 1) < 0.05) continue; if (p.fill) df += p.d; else ds += p.d; }
  const lw = (k.theme.roles.line?.width ?? 2.6) * width;
  const inner = (ds ? `<path${attrs({ d: ds, fill: 'none', stroke: color, strokeWidth: n(lw), strokeLinecap: 'round', strokeLinejoin: 'round' })}/>` : '')
    + (df ? `<path${attrs({ d: df, fill: color })}/>` : '');
  return `<g${attrs({ transform: `translate(${n(box.x)} ${n(box.y)}) scale(${n(box.size / 48, 4)})`, opacity: opacity < 0.999 ? n(Math.max(0, opacity), 3) : null })}>${inner}</g>`;
}

// ── morphing ──────────────────────────────────────────────────────────────────

const plen = (pts, closed) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (closed && pts.length > 1) L += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]); return L; };

/** Resample a polyline to N points evenly by arc length. */
function resample(pts, closed, N) {
  const P0 = closed ? [...pts, pts[0]] : pts;
  if (P0.length < 2) return Array.from({ length: N }, () => [...(P0[0] || [24, 24])]);
  const seg = [];
  let total = 0;
  for (let i = 1; i < P0.length; i++) { const l = Math.hypot(P0[i][0] - P0[i - 1][0], P0[i][1] - P0[i - 1][1]); seg.push(l); total += l; }
  const out = [];
  const steps = closed ? N : N - 1;
  let j = 0, acc = 0;
  for (let s = 0; s < N; s++) {
    const want = total > 0 ? (total * s) / steps : 0;
    while (j < seg.length - 1 && acc + seg[j] < want) { acc += seg[j]; j++; }
    const f = seg[j] > 0 ? clamp((want - acc) / seg[j]) : 0;
    out.push([lerp(P0[j][0], P0[j + 1][0], f), lerp(P0[j][1], P0[j + 1][1], f)]);
  }
  return out;
}

/** Glyph primitives → morphable items, one per sub-path. */
function itemsOf(prims) {
  const out = [];
  for (const p of prims) {
    if ((p.opacity ?? 1) < 0.05) continue;
    for (const pl of flattenPath(p.d, 0.35)) {
      if (!pl.pts.length) continue;
      const closed = pl.closed || (p.fill && pl.pts.length > 2);
      let cx = 0, cy = 0;
      for (const [x, y] of pl.pts) { cx += x; cy += y; }
      cx /= pl.pts.length; cy /= pl.pts.length;
      out.push({ role: p.role, fill: !!p.fill, weight: p.weight ?? 1, opacity: p.opacity ?? 1, cap: p.cap, join: p.join, closed, pts: pl.pts, c: [cx, cy], len: plen(pl.pts, closed) });
    }
  }
  return out;
}

/** Pair items of a and b: nearest centroid with a bonus for the same role; the rest grow from / collapse into a point. */
function pairUp(A, B) {
  const usedA = new Set(), pairs = [];
  const order = B.map((b, i) => i).sort((i, j) => B[j].len - B[i].len);
  for (const i of order) {
    const b = B[i];
    let best = -1, score = Infinity;
    A.forEach((a, ai) => {
      if (usedA.has(ai)) return;
      const s = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) + Math.abs(a.len - b.len) * 0.12 + (a.role === b.role ? 0 : 6) + (a.fill === b.fill ? 0 : 4);
      if (s < score) { score = s; best = ai; }
    });
    if (best >= 0 && score < 30) { usedA.add(best); pairs.push([A[best], b]); } else pairs.push([null, b]);
  }
  A.forEach((a, ai) => { if (!usedA.has(ai)) pairs.push([a, null]); });
  return pairs;
}

/** Rotate / reverse b's closed loop so its points line up with a's (least squared distance). */
function align(a, b, closed) {
  const N = a.length;
  const cost = (bb, sh) => { let s = 0; for (let i = 0; i < N; i += 2) { const q = bb[(i + sh) % N]; s += (a[i][0] - q[0]) ** 2 + (a[i][1] - q[1]) ** 2; } return s; };
  if (!closed) { const rev = [...b].reverse(); return cost(rev, 0) < cost(b, 0) ? rev : b; }
  let best = b, bc = Infinity;
  for (const cand of [b, [...b].reverse()]) for (let sh = 0; sh < N; sh++) { const c = cost(cand, sh); if (c < bc) { bc = c; best = cand.map((_, i) => cand[(i + sh) % N]); } }
  return best;
}

const pointPath = (pts, closed) => { let d = `M${n(pts[0][0])} ${n(pts[0][1])}`; for (let i = 1; i < pts.length; i++) d += `L${n(pts[i][0])} ${n(pts[i][1])}`; return closed ? `${d}Z` : d; };

/**
 * A Pen whose primitives are glyph geometry interpolated from prims a to prims b at
 * p (0–1). Matched sub-paths are resampled to the same point count and tweened;
 * unmatched ones grow out of / shrink into their own centre.
 */
export function morphPen(primsA, primsB, p) {
  const pairs = pairUp(itemsOf(primsA), itemsOf(primsB));
  const pen = new Pen();
  for (const [a, b] of pairs) {
    const src = a || b, dst = b || a;
    const N = Math.max(12, Math.min(72, Math.round(Math.max(src.len, dst.len) / 1.1)));
    const closed = p < 0.5 ? src.closed : dst.closed;
    const ra = resample(src.pts, src.closed, N);
    let rb = resample(dst.pts, dst.closed, N);
    rb = align(ra, rb, src.closed && dst.closed);
    const from = a ? ra : ra.map(() => [...dst.c]), to = b ? rb : rb.map(() => [...src.c]);
    const pts = from.map((q, i) => [lerp(q[0], to[i][0], p), lerp(q[1], to[i][1], p)]);
    const role = p < 0.5 ? src.role : dst.role;
    const fill = (p < 0.5 ? src.fill : dst.fill) && closed;
    const op = a && b ? lerp(a.opacity, b.opacity, p) : a ? a.opacity * (1 - p) : b.opacity * p;
    if (op < 0.03) continue;
    pen._prim(pointPath(pts, closed), { role, fill, weight: lerp(src.weight, dst.weight, p), opacity: op, cap: (p < 0.5 ? src : dst).cap, join: 'round' }, closed);
  }
  return pen;
}

/** Paint a Pen with the theme (paintGlyph when it has one) into a glyph box. */
export function paintPen(k, pen, tone, box, { opacity } = {}) {
  const body = k.theme.paintGlyph
    ? k.theme.paintGlyph(k, pen, { tone, styleOf: (p) => k.roleStyle(p.role, tone) })
    : pen.root.children.map((c) => k.theme.paint(k, c, k.roleStyle(c.role, tone))).join('');
  k.add(`<g${attrs({ transform: `translate(${n(box.x)} ${n(box.y)}) scale(${n(box.size / 48, 4)})`, opacity: opacity !== undefined && opacity < 0.999 ? n(opacity, 3) : null })}>${body}</g>`);
}
