// Game Link drawing kit (not a facet): instruments on keys and panels, the prism scene, and the effect overlays.
// Everything draws through the theme (materials, tones, text roles, glyph roles), so every Prism theme works,
// Night and Day. Effect overlays are pure functions of the quantized effect state (_gl-kit.js fxOf) and of where a
// surface sits in the deck's field, so each surface gets a handful of distinct frames per effect and returns to its
// plain HUD frame, byte-identical, once the effect is over.
//
//   fieldOf(rects, origins)              the deck's field: center, radius, effect origins (field px)
//   keyInstrument(q, model, fx)          one instrument on a key surface
//   panelInstrument(p, model, fx, W)     one instrument on a Galleon widget / strip segment / Neo bar
//   sceneOf(cells, view, fx)             the prism scene laid out on a block of keys (field px)
//   sceneKey(q, cell, scene)             one scene key: the prism, a beam key or a pane of the fan
//   overlays(q, fx, place, F, o)         every running effect on one surface (place: the surface's rect in field px)

import { rect, path, circle, polygon, linearGradient, radialGradient, url, n, P } from '../../scene/index.js';
import { capHeight, measureText } from '../../scene/text.js';
import { clamp, lerp, outExpo } from '../../scene/easing.js';
import { burst, beam, beamColor, HUE } from '../games/_d8-kit.js';
import { header, stat, segmented, meter } from '../screens/_d5-kit.js';
import { PICT, NADE_KINDS } from './_gl-pieces.js';
import { FLASH_PEAK, HURT_MAX_ALPHA, TEAM_HUE, SLOT_HUE } from './_gl-kit.js';

const SPECTRUM = [8, 34.2, 60.4, 86.5, 112.7, 138.9, 165.1, 191.3, 217.5, 243.6, 269.8, 296];
const FAN = [14, 40, 70, 125, 190, 245, 292];   // the scene's seven bands, red (least bent) → violet

// ── the field ─────────────────────────────────────────────────────────────────

/**
 * The deck's field from its surfaces' rects ({ x, y, w, h }, field px): the center of the keys (or of everything),
 * the radius that reaches every surface's far corner, and named effect origins (field px points).
 */
export function fieldOf(rects, { keys = rects, origins = {}, K } = {}) {
  const bb = (list) => list.reduce((b, r) => ({ x0: Math.min(b.x0, r.x), y0: Math.min(b.y0, r.y), x1: Math.max(b.x1, r.x + r.w), y1: Math.max(b.y1, r.y + r.h) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  const all = bb(rects), k = bb(keys.length ? keys : rects);
  const cx = (k.x0 + k.x1) / 2, cy = (k.y0 + k.y1) / 2;
  let R = 1;
  for (const r of rects) for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) R = Math.max(R, Math.hypot(x - cx, y - cy));
  const c = [cx, cy];
  return { ...all, n: rects.length, cx, cy, R, K: K ?? Math.min(keys[0]?.w || 72, keys[0]?.h || 72), o: { center: c, kills: origins.kills || c, round: origins.round || c, health: origins.health || c } };
}

/** The center of a rect. */
export const mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];

/** Markup drawn in field px on a surface placed at (place.x, place.y). */
function inField(q, place, markup) {
  if (!markup) return;
  q.add(place.x || place.y ? `<g transform="translate(${n(-place.x)} ${n(-place.y)})">${markup}</g>` : markup);
}
const hits = (place, x0, y0, x1, y1, m = 0) => x1 >= place.x - m && x0 <= place.x + place.w + m && y1 >= place.y - m && y0 <= place.y + place.h + m;

// ── instruments ───────────────────────────────────────────────────────────────

const toneColor = (q, t) => (t === 'muted' ? q.colors.muted : t === 'off' ? q.colors.dim : t === 'neg' ? q.colors.neg : t === 'ok' ? q.colors.pos : t === 'warn' ? q.colors.warn : t === 'info' ? q.colors.info : q.ctx.tint);
const pictTone = (M) => (M.tone === 'off' ? 'off' : M.tone === 'busy' ? 'idle' : M.dimmed ? 'idle' : 'active');

/** A word or number in the value position, fitted to the key. */
function keyValue(q, M, cy) {
  const str = String(M.value ?? '—');
  const room = q.w - q.m.text * 2;
  const color = str === '—' ? 'dim' : undefined;
  if (M.word && str !== '—') {
    // a word (Live, Planted, Spectating): as large as the value role allows, shrunk to fit the key
    const st = q.typeStyle('value');
    const per = measureText(str, { size: 100, weight: st.weight, tracking: st.tracking || 0, caps: !!st.caps }) / 100;
    const size = Math.max(st.size * 0.4, Math.min(st.size * (str.length <= 4 ? 0.98 : 0.9), (room * 0.98) / Math.max(0.01, per)));
    q.text('value', str, { cy, size, maxWidth: room, color });
    return;
  }
  const role = str.length <= 3 ? 'hero' : 'value';
  if (!M.unit) { q.text(role, str, { cy, maxWidth: room, color }); return; }
  const st = q.typeStyle(role), cs = q.typeStyle('caption');
  const us = Math.max(cs.size, st.size * 0.34);
  const vw = measureText(str, { size: st.size, weight: st.weight, tabular: !!st.tabular, tracking: st.tracking || 0 });
  const uw = measureText(M.unit, { size: us, weight: cs.weight });
  const total = Math.min(room, vw + uw + st.size * 0.06);
  const x0 = q.w / 2 - total / 2;
  const base = cy + capHeight(st.size, st.weight) / 2;
  q.text(role, str, { align: 'left', x: x0, cy, maxWidth: room - uw, color });
  q.caption(M.unit, { align: 'left', x: x0 + Math.min(vw, room - uw) + st.size * 0.06, y: base, size: us, color: 'muted' });
}

/** The Utility key: the four kinds of grenade, lit when carried (a count when more than one). */
function nadeRow(q, M, cy) {
  const g = M.nades || {};
  const room = q.w - q.m.text * 2;
  // a 2 × 2 grid of the four kinds (a row of four on a short key), each lit when carried, "×2" when doubled
  const grid = q.h >= 90 && q.w >= 90;
  const sz = grid ? Math.min(room * 0.36, q.h * 0.27) : Math.min((room / 4) * 1.1, q.h * 0.3);
  const cs = q.typeStyle('caption');
  NADE_KINDS.forEach(([pict, ...keys], i) => {
    const count = keys.reduce((a, k) => a + (+g[k] || 0), 0);
    const x = grid ? q.m.text + (i % 2) * (room / 2) + (room / 2 - sz) / 2 - (count > 1 ? sz * 0.12 : 0) : q.m.text + i * (sz + (room - sz * 4) / 3);
    const y = grid ? cy - sz * 1.02 + Math.floor(i / 2) * sz * 1.06 : cy - sz / 2;
    q.pictogram(PICT[pict], { box: { x, y, size: sz }, tone: count ? 'active' : 'off', opacity: count ? undefined : 0.5 });
    if (count > 1) q.caption(`×${count}`, { align: 'left', x: x + sz * 0.86, y: y + sz * 0.88, size: Math.max(cs.size, sz * 0.32), color: 'ink' });
  });
}

/** One instrument on a key: material, a pictogram and eyebrow, the value, a meter, a caption. */
export function keyInstrument(q, M, fx) {
  q.background({ tone: M.tone });
  if (M.slot === 'scene' || M.slot === 'blank') return;
  const u = q.m.u, T = q.m.text, H = q.h;
  const eb = q.typeStyle('eyebrow');
  const cap = capHeight(eb.size, eb.weight);
  const by = T + cap;
  const ps = Math.round(cap * 2.3);
  const px = T - u * 1.2;
  if (PICT[M.pict]) q.pictogram((pen) => PICT[M.pict](pen, { helmet: M.helmet }), { box: { x: px, y: by - cap / 2 - ps / 2, size: ps }, tone: pictTone(M) });
  const tx = px + ps + u * 1.2;
  q.eyebrow(M.title, { x: tx, y: by, maxWidth: q.w - tx - T, color: M.side ? q.theme.ink(TEAM_HUE[M.side] ?? SLOT_HUE.score) : undefined });
  const hasBar = M.bar !== null && M.bar !== undefined, hasSub = !!M.sub;
  const cy = hasBar && hasSub ? H * 0.445 : hasSub ? H * 0.47 : hasBar ? H * 0.48 : H * 0.53;
  if (M.slot === 'nades' && M.nades) nadeRow(q, M, H * 0.57);
  else keyValue(q, M, cy);
  if (hasBar) {
    const bh = Math.max(2, u * 2.4), bw = q.w - T * 2, y = hasSub ? H * 0.655 : H - u * 18;
    q.add(rect({ x: T, y, width: bw, height: bh, rx: bh / 2, fill: q.colors.line || q.colors.dim, fillOpacity: 0.6 }));
    if (M.bar > 0.004) q.add(rect({ x: T, y, width: Math.max(bh, bw * M.bar), height: bh, rx: bh / 2, fill: M.barTone === 'active' || !M.barTone ? q.ctx.tint : toneColor(q, M.barTone) }));
    if (M.bar2 !== undefined && M.bar2 > 0.004 && M.tone !== 'off') { const h2 = Math.max(1.5, bh * 0.55); q.add(rect({ x: T, y: y + bh + Math.max(1.5, u * 1.3), width: Math.max(h2, bw * M.bar2), height: h2, rx: h2 / 2, fill: q.colors.info, fillOpacity: 0.85 })); }
  }
  if (hasSub) q.label(M.sub, { maxWidth: q.w - T * 2, color: M.subTone ? toneColor(q, M.subTone) : M.tone === 'off' ? 'dim' : 'muted' });
  void fx;
}

/** Frame metrics for a panel (a Galleon widget, a strip segment). */
export function panelFrame(p) {
  const strip = p.ctx.kind === 'strip' || p.h <= 110;
  const pad = Math.round(strip ? Math.max(p.m.text ?? p.m.safe, 12) : Math.max(p.m.text ?? p.m.safe, p.h * 0.112));
  const ebSize = strip ? 13.5 * ((p.theme.type.eyebrow?.size ?? 8) / 8) : undefined;
  const eb = p.typeStyle('eyebrow', ebSize ? { size: ebSize } : {});
  return { x0: pad, x1: p.w - pad, w: p.w - pad * 2, top: pad, eyebrowY: pad + capHeight(eb.size, eb.weight) + (strip ? 1 : 0), eyebrowSize: ebSize, footY: p.h - Math.max(pad, p.h * (strip ? 0.12 : 0.13)), u: p.m.u, cx: p.w / 2, pad, strip };
}

/** One instrument on a panel: header (+ meta), one big number (or word), a meter, a pictogram at the right. */
export function panelInstrument(p, M, fx, { meta } = {}) {
  p.background({ tone: M.tone === 'busy' ? 'idle' : M.tone });
  const W = panelFrame(p);
  const metaText = meta !== undefined ? meta : M.sub;
  header(p, W, M.title, metaText || undefined, { size: W.eyebrowSize, metaSize: W.strip ? 13.5 * ((p.theme.type.caption?.size ?? 8.5) / 8.5) : undefined, metaColor: M.subTone ? toneColor(p, M.subTone) : 'dim' });
  const hasBar = M.bar !== null && M.bar !== undefined;
  const ps = Math.round(p.h * (W.strip ? 0.36 : 0.4));
  const pictX = W.x1 - ps, pictY = (W.eyebrowY + (hasBar ? W.footY - p.m.u * 3 : W.footY)) / 2 - ps / 2 + p.h * 0.03;
  const room = (PICT[M.pict] ? pictX - W.x0 - p.m.u * 2 : W.w);
  const base = Math.round(p.h * (hasBar ? 0.62 : 0.68));
  const str = String(M.value ?? '—');
  const hero = p.typeStyle('hero');
  const size = W.strip ? hero.size * 0.92 : hero.size * 1.05;
  if (M.slot === 'nades' && M.nades) {
    const sz = Math.min(room / 4, p.h * 0.34), gap = sz * 0.14;
    NADE_KINDS.forEach(([pict, ...keys], i) => { const c = keys.reduce((a, k) => a + (+M.nades[k] || 0), 0); p.pictogram(PICT[pict], { box: { x: W.x0 + i * (sz + gap), y: base - sz * 0.85, size: sz }, tone: c ? 'active' : 'off' }); });
  } else if (M.word && str !== '—') {
    const vs = p.typeStyle('value');
    const s = Math.min(vs.size * (W.strip ? 1.15 : 1.25), size);
    p.text('value', str, { align: 'left', x: W.x0, cy: base - capHeight(s, vs.weight) / 2, y: base, size: s, maxWidth: room });
  } else stat(p, { value: str, unit: M.unit || undefined, xl: W.x0, base, size, maxWidth: room, color: str === '—' ? 'dim' : undefined });
  if (PICT[M.pict]) p.pictogram((pen) => PICT[M.pict](pen, { helmet: M.helmet }), { box: { x: pictX, y: pictY, size: ps }, tone: pictTone(M) });
  if (M.foot && !hasBar) p.caption(M.foot, { align: 'left', x: W.x0, y: W.footY, maxWidth: room, color: M.footTone ? toneColor(p, M.footTone) : 'muted', size: W.strip ? undefined : p.typeStyle('caption').size * 1.15 });
  if (hasBar) {
    const bh = Math.max(4, Math.round(p.m.u * (W.strip ? 2.2 : 2.4)));
    const color = M.barTone === 'active' || !M.barTone ? p.ctx.tint : toneColor(p, M.barTone);
    const clips = M.weapon && Number.isFinite(M.weapon.clipMax) && M.weapon.clipMax > 1 && M.weapon.clipMax <= 35 ? M.weapon.clipMax : 20;
    segmented(p, { x: W.x0, y: W.footY - bh, w: W.w, h: bh, value: M.bar, count: W.strip ? Math.min(clips, 16) : clips, color, off: p.colors.line, offOpacity: 0.7 });
    if (M.bar2 !== undefined && M.bar2 > 0.004 && M.tone !== 'off') { const h2 = Math.max(2, bh * 0.4); p.add(rect({ x: W.x0, y: W.footY - bh - h2 - Math.max(2, p.m.u * 1.2), width: Math.max(h2, W.w * M.bar2), height: h2, rx: h2 / 2, fill: p.colors.info, fillOpacity: 0.8 })); }
  }
  void fx; void meter;
}

// ── the prism scene ───────────────────────────────────────────────────────────
//
// A block of scene keys is one composition laid out ON the keys (the bezel gaps are wide on big decks, so nothing
// that matters may sit in a gap): a prism key (a whole glass prism that the white beam strikes), beam keys to its
// left (the beam crossing them), and fan keys: each a pane of light in the Spectrum band that leaves the prism
// towards it, red (least bent) to violet. The fan is your health: every band lit at full health, the violet end
// going dark first, only the red end left when you're low. Grey while you spectate, a warm core while the bomb is
// planted, breathing in freeze time, dark while waiting.

/**
 * The scene for a block of cells (field px). → { prism (cell), exit [x, y], beamY, beams: Set(i), fan: Map(i → { hue, L, a }),
 *   grey, idle, lit (0–1 of the fan), planted, breathe }
 */
export function sceneOf(cells, view, fx) {
  if (!cells.length) return null;
  const face = fx.face, p = view.s?.player;
  const rows = [...new Set(cells.map((c) => c.row))].sort((a, b) => a - b), r0 = rows[0];
  const top = cells.filter((c) => c.row === r0).sort((a, b) => a.col - b.col);
  const prism = top.length >= (rows.length > 1 ? 4 : 5) ? top[1] : top[0];
  const beams = new Set(top.filter((c) => c.col < prism.col).map((c) => c.i));
  const exit = [prism.x + prism.w * 0.66, prism.y + prism.h * 0.5];
  const beamY = prism.y + prism.h * 0.5;
  const rest = cells.filter((c) => c !== prism && !beams.has(c.i));
  const angle = (c) => Math.atan2(c.y + c.h / 2 - exit[1], c.x + c.w / 2 - exit[0]);
  const angs = rest.map(angle), amin = Math.min(...angs), amax = Math.max(...angs);
  const byRank = amax - amin < 0.18 || rows.length === 1;
  const order = rest.slice().sort((a, b) => (byRank ? a.row - b.row || a.col - b.col : angle(a) - angle(b) || a.col - b.col));
  const live = face === 'live' || face === 'dead';
  const grey = face === 'spectating' || face === 'watching' || face === 'paused';
  const idle = face === 'waiting' || face === 'menu' || face === 'loading';
  const hp = live && Number.isFinite(p?.health) ? p.health : null;
  const lit = face === 'dead' || idle ? 0 : hp === null ? 1 : clamp(hp / 100);
  const fan = new Map();
  const N = order.length;
  order.forEach((c, k) => {
    const f = N > 1 ? k / (N - 1) : 0;   // even steps of the Spectrum, in the order the bands leave the prism
    const on = clamp(lit * N - k);
    fan.set(c.i, { hue: lerp(14, 296, f), L: Math.round(on * 3), a: angle(c) });
  });
  return { prism, exit, beamY, beams, fan, grey, idle, lit, planted: fx.planted, breathe: fx.breathe, face };
}

const FAN_A = [0.07, 0.22, 0.36, 0.5];

/** One scene key (q: the key surface, cell: its rect in field px). */
export function sceneKey(q, cell, S) {
  if (!S) return;
  const T = q.theme, C = q.colors, dark = q.dark, u = q.m.u, W = q.w, H = q.h;
  const beamC = beamColor(q);
  const breathe = [0.8, 0.93, 1.06][S.breathe] ?? 1;
  const bw = Math.max(1.3, u * 1.5);
  if (cell.i === S.prism.i) {
    // the prism: a whole glass prism on one key, struck by the beam, the Spectrum leaving its far face
    const A = [W * 0.47, H * 0.15], L = [W * 0.12, H * 0.79], R = [W * 0.82, H * 0.79];
    const on = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
    const E = on(A, L, 0.55), X = on(A, R, 0.6);
    if (!S.idle && !S.grey) {
      FAN.forEach((hue, i) => {   // the inner fan: seven thin bands from the exit face to the key's edge
        const t0 = -0.16 + i * 0.1, t1 = t0 + 0.1, far = W * 1.2;
        const lit = i < Math.max(1, Math.round(S.lit * FAN.length));
        const pts = [X, [X[0] + Math.cos(t0) * far, X[1] + Math.sin(t0) * far], [X[0] + Math.cos(t1) * far, X[1] + Math.sin(t1) * far]];
        const gid = q.id(`glpf${i}`);
        const c = T.spectral(hue);
        const a = (lit ? (dark ? 0.85 : 0.7) : 0.12) * breathe;
        q.def(linearGradient(gid, [[0, c, n(Math.min(1, a), 3)], [1, c, n(a * 0.15, 3)]], { x1: n(X[0]), y1: n(X[1]), x2: n(W), y2: n(X[1]), gradientUnits: 'userSpaceOnUse' }));
        q.add(polygon(pts, { fill: url(gid) }));
      });
      const bid = q.id('glpb');
      q.def(linearGradient(bid, [[0, beamC, dark ? 0.55 : 0.45], [1, beamC, 1]], { x1: 0, y1: 0, x2: n(E[0]), y2: 0, gradientUnits: 'userSpaceOnUse' }));
      const d0 = P().M(-2, S.beamY - cell.y).L(E[0], E[1]).d;
      q.add(path(d0, { fill: 'none', stroke: url(bid), strokeWidth: n(bw * 3.8), strokeOpacity: 0.16, strokeLinecap: 'round' }));
      q.add(path(d0, { fill: 'none', stroke: url(bid), strokeWidth: n(bw), strokeLinecap: 'round' }));
      q.add(path(P().M(...E).L(...X).d, { fill: 'none', stroke: beamC, strokeWidth: n(bw * 1.2), strokeOpacity: dark ? 0.5 : 0.4 }));
    }
    const gl = q.id('glpg'), glassC = dark ? '#ffffff' : C.accent;
    q.def(linearGradient(gl, [[0, glassC, dark ? 0.2 : 0.14], [0.55, glassC, 0.05], [1, glassC, dark ? 0.12 : 0.08]], { x1: 0, y1: 0, x2: 0.45, y2: 1 }));
    if (S.planted && !S.grey) {
      const wc = q.id('glpw');
      q.def(radialGradient(wc, [[0, C.warn, dark ? 0.7 : 0.5], [0.6, C.warn, 0.18], [1, C.warn, 0]], { cx: 0.5, cy: 0.66, r: 0.6 }));
      q.add(polygon([A, L, R], { fill: url(wc) }));
    }
    const edge = S.idle || S.grey ? (dark ? 0.42 : 0.38) : dark ? 0.92 : 0.75;
    q.add(polygon([A, L, R], { fill: url(gl), stroke: dark ? '#ffffff' : C.ink, strokeWidth: n(Math.max(1.4, u * 1.45)), strokeOpacity: n(edge, 3), strokeLinejoin: 'round' }));
    const [h0, h1] = [on(A, L, 0.12), on(A, L, 0.42)];
    q.add(path(P().M(h0[0] + u * 1.6, h0[1]).L(h1[0] + u * 1.6, h1[1]).d, { fill: 'none', stroke: glassC, strokeWidth: n(u * 1.4), strokeOpacity: n(edge * 0.55, 3), strokeLinecap: 'round' }));
    if (!S.idle && !S.grey) {
      const fl = q.id('glps'), r = Math.min(W, H) * 0.2;
      q.def(radialGradient(fl, [[0, beamC, 0.85], [0.3, beamC, 0.28], [1, beamC, 0]]));
      q.add(rect({ x: n(E[0] - r), y: n(E[1] - r), width: n(r * 2), height: n(r * 2), fill: url(fl) }));
    }
    return;
  }
  if (S.beams.has(cell.i)) {
    if (S.idle || S.grey) return;
    // the white beam crossing on its way to the prism
    const y = S.beamY - cell.y;
    const gid = q.id('glbw');
    q.def(linearGradient(gid, [[0, beamC, 0], [0.5, beamC, dark ? 0.18 : 0.12], [1, beamC, 0]], { x1: 0, y1: n(y - H * 0.3), x2: 0, y2: n(y + H * 0.3), gradientUnits: 'userSpaceOnUse' }));
    q.add(rect({ x: 0, y: n(y - H * 0.3), width: W, height: n(H * 0.6), fill: url(gid) }));
    q.add(rect({ x: 0, y: n(y - bw * 1.9), width: W, height: n(bw * 3.8), fill: beamC, fillOpacity: 0.16 }));
    q.add(rect({ x: 0, y: n(y - bw / 2), width: W, height: n(bw), fill: beamC, fillOpacity: dark ? 0.85 : 0.7 }));
    return;
  }
  const F0 = S.fan.get(cell.i);
  if (!F0) return;
  // a pane of light: the band that leaves the prism towards this key
  const c = S.grey ? C.dim : T.spectral(F0.hue);
  const L = S.idle ? 0 : S.grey ? Math.min(1, F0.L) : F0.L;
  const a = FAN_A[L] * (dark ? 1 : 0.75) * breathe;
  const ex = S.exit[0] - cell.x, ey = S.exit[1] - cell.y;
  const gx = clamp(ex, -W * 0.25, W * 1.25), gy = clamp(ey, -H * 0.25, H * 1.25);
  const gid = q.id('glfp');
  q.def(radialGradient(gid, [[0, c, n(Math.min(1, a * 1.25), 3)], [0.55, c, n(a * 0.5, 3)], [1, c, n(a * 0.12, 3)]], { cx: n(gx), cy: n(gy), r: n(Math.hypot(W, H) * 1.05), fx: n(gx), fy: n(gy), gradientUnits: 'userSpaceOnUse' }));
  q.add(rect({ width: W, height: H, fill: url(gid) }));
  // three rays crossing the pane, straight from the prism's exit
  const far = Math.hypot(W, H) * 3 + Math.hypot(ex, ey);
  const ra = (S.idle ? 0.08 : S.grey ? 0.18 : 0.2 + 0.2 * L) * breathe;
  for (const [da, dh, wf] of [[-0.055, -18, 0.8], [0, 0, 1.5], [0.05, 18, 0.9]]) {
    const ang = F0.a + da;
    q.add(path(P().M(ex, ey).L(ex + Math.cos(ang) * far, ey + Math.sin(ang) * far).d, { fill: 'none', stroke: S.grey ? C.dim : T.spectral(F0.hue + dh), strokeWidth: n(Math.max(1, u * wf)), strokeOpacity: n(Math.min(1, ra), 3) }));
  }
  // the lit edge catches the color
  q.add(rect({ x: q.m.safe, y: 0, width: W - q.m.safe * 2, height: Math.max(1, u * 0.9), fill: c, fillOpacity: n(clamp(0.18 + 0.24 * L), 3) }));
}

// ── crack geometry (death) ────────────────────────────────────────────────────

const CRACKS = new Map();
/** The glass crack radiating from an impact point (field px): polylines (with where along the reach they start). Deterministic. */
function crackOf(F, [ix, iy]) {
  const key = `${n(F.R)}|${n(ix)}|${n(iy)}`;
  if (CRACKS.has(key)) return CRACKS.get(key);
  let s = 0x9e3779b9 ^ Math.round(ix * 31 + iy * 17 + F.R);
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const lines = [];
  const reach = F.R * 1.2;
  const ARMS = 11;
  for (let i = 0; i < ARMS; i++) {
    const a0 = (i / ARMS) * Math.PI * 2 + (rnd() - 0.5) * 0.35;
    const pts = [[ix, iy]];
    let a = a0, x = ix, y = iy, len = 0;
    const segs = 8;
    for (let j = 0; j < segs; j++) {
      const step = (reach / segs) * (0.7 + rnd() * 0.6);
      a += (rnd() - 0.5) * 0.42;
      x += Math.cos(a) * step; y += Math.sin(a) * step; len += step;
      pts.push([x, y]);
      if (j >= 1 && j <= 6 && rnd() < 0.42) {   // a branch splitting off
        const ba = a + (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.55);
        const bl = reach * (0.12 + rnd() * 0.16);
        const m = [x + Math.cos(ba) * bl * 0.5 + (rnd() - 0.5) * 5, y + Math.sin(ba) * bl * 0.5 + (rnd() - 0.5) * 5];
        lines.push({ pts: [[x, y], m, [x + Math.cos(ba + 0.18) * bl, y + Math.sin(ba + 0.18) * bl]], start: len / reach, branch: true });
      }
    }
    lines.push({ pts, start: 0 });
  }
  // the spider: broken rings of fracture around the impact
  for (const [rf, gaps] of [[0.07, 0.15], [0.19, 0.3], [0.4, 0.55]]) {
    const r0 = F.R * rf;
    for (let i = 0; i < ARMS; i++) {
      if (rnd() < gaps) continue;
      const a0 = (i / ARMS) * Math.PI * 2 + rnd() * 0.15, a1 = ((i + 1) / ARMS) * Math.PI * 2 - rnd() * 0.2;
      const pts = [];
      for (let t = 0; t <= 3; t++) { const a = lerp(a0, a1, t / 3), rr = r0 * (0.9 + rnd() * 0.2); pts.push([ix + Math.cos(a) * rr, iy + Math.sin(a) * rr]); }
      lines.push({ pts, start: rf * 0.9, ring: true });
    }
  }
  if (CRACKS.size > 64) CRACKS.delete(CRACKS.keys().next().value);
  CRACKS.set(key, lines);
  return lines;
}

/** The crack's segments that touch a surface, grown to `grow` (0–1) of its reach → path data (field px). */
function crackPath(F, impact, place, grow) {
  let d = '';
  for (const ln of crackOf(F, impact)) {
    if (ln.start > grow + 1e-6) continue;
    const pts = ln.pts;
    const segN = pts.length - 1;
    const upto = ln.ring || ln.branch ? segN : Math.max(1, Math.round(segN * clamp(grow)));
    let open = false;
    for (let j = 0; j < upto; j++) {
      const [x0, y0] = pts[j], [x1, y1] = pts[j + 1];
      if (!hits(place, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), 3)) { open = false; continue; }
      d += open ? `L${n(x1)} ${n(y1)}` : `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y1)}`;
      open = true;
    }
  }
  return d;
}

// ── shards (damage) ───────────────────────────────────────────────────────────

/** Two (three) refracted shards on a surface, flying straight out from the field center (field px). push: how far out they've flown (0–1). */
function shards(place, F, S, push, count = 2) {
  const cx = place.x + place.w / 2, cy = place.y + place.h / 2;
  const centered = Math.hypot(cx - F.cx, cy - F.cy) < S * 0.3;
  const out = [];
  const list = centered ? [0, 1, 2].map((i) => [-Math.PI / 2 + (i * Math.PI * 2) / 3, 0]) : (count === 3 ? [-0.24, 0, 0.24] : [-0.2, 0.2]).map((o) => [Math.atan2(cy - F.cy, cx - F.cx), o]);
  for (const [a, o] of list) {
    const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
    const along = -S * 0.3 + S * 0.22 * push + (centered ? S * 0.12 : 0);
    const ox = cx + px * o * S + ux * along, oy = cy + py * o * S + uy * along;
    const len = S * (o === 0 ? 0.62 : 0.5), wid = S * 0.045;
    out.push({ pts: [[ox + px * wid, oy + py * wid], [ox + ux * len, oy + uy * len], [ox - px * wid, oy - py * wid]], nx: px, ny: py });
  }
  return out;
}

// ── overlays ──────────────────────────────────────────────────────────────────

// the flash fade by level (0–6): how much white is left, how strongly the Spectrum shows through
const FLASH_WHITE = [0, 0.02, 0.1, 0.24, 0.42, 0.68, 1];
const FLASH_SPECTRUM = [0, 0.36, 0.58, 0.66, 0.58, 0.38, 0];

const ring = (cx, cy, r) => P().M(cx + r, cy).A(r, r, 0, 0, 1, cx - r, cy).A(r, r, 0, 0, 1, cx + r, cy).Z().d;
/** Does a ring of radius r (width w) around (cx, cy) cross the rect? */
function ringHits(place, cx, cy, r, w) {
  const nx = clamp(cx, place.x, place.x + place.w), ny = clamp(cy, place.y, place.y + place.h);
  const dmin = Math.hypot(cx - nx, cy - ny);
  const dmax = Math.max(...[[place.x, place.y], [place.x + place.w, place.y], [place.x, place.y + place.h], [place.x + place.w, place.y + place.h]].map(([x, y]) => Math.hypot(cx - x, cy - y)));
  return r + w >= dmin && r - w <= dmax;
}

/**
 * A ring of refracted light around O (field px) at radius r: a soft glow band and three fine lines of the Spectrum
 * (or of `hues`) side by side — drawn only where it crosses this surface.
 */
function band(q, place, O, r, { hues, width, alpha = 1, glow = 0.24, color } = {}) {
  const u = q.m.u;
  const w = width ?? Math.max(10, u * 7);
  if (r < 1 || alpha <= 0.01 || !ringHits(place, O[0], O[1], r, w)) return;
  const hs = hues || [HUE.rose, HUE.amber, HUE.azure];
  const lw = Math.max(1.4, u * 1.5), gap = Math.max(1.5, u * 1.8);
  let m = path(ring(O[0], O[1], r), { fill: 'none', stroke: color || q.theme.spectral(hs[1]), strokeWidth: n(w), strokeOpacity: n(glow * alpha, 3) });
  hs.forEach((h, i) => { const rr = r + (i - (hs.length - 1) / 2) * gap; if (rr > 0.5) m += path(ring(O[0], O[1], rr), { fill: 'none', stroke: i === 1 && color ? color : q.theme.spectral(h), strokeWidth: n(lw), strokeOpacity: n(Math.min(1, alpha * (i === 1 ? 1 : 0.8)), 3) }); });
  inField(q, place, m);
}

/** A soft radial flash of light (white by night) at a local point. */
function bloom(q, [ox, oy], r, alpha, name, color) {
  if (alpha <= 0.01) return;
  const gid = q.id(name), c = color || beamColor(q);
  q.def(radialGradient(gid, [[0, c, n(alpha, 3)], [0.35, c, n(alpha * 0.32, 3)], [1, c, 0]]));
  q.add(rect({ x: n(ox - r), y: n(oy - r), width: n(r * 2), height: n(r * 2), fill: url(gid) }));
}

/**
 * The dispersed light: one continuous Spectrum laid across the whole field (red at its top-left, violet at its
 * bottom-right), so each surface shows its own slice and the deck reads as one rainbow. v (0–1) spreads it a little.
 */
function rainbow(q, place, F, v, alpha, name) {
  const gid = q.id(name);
  const s = lerp(0.62, 1.05, 1 - v);
  const x0 = F.cx + (F.x0 - F.cx) * s, y0 = F.cy + (F.y0 - F.cy) * s, x1 = F.cx + (F.x1 - F.cx) * s, y1 = F.cy + (F.y1 - F.cy) * s;
  const hs = [8, 38, 70, 125, 185, 240, 296];
  const stops = hs.map((h, i) => [i / (hs.length - 1), q.theme.spectral(h, { tier: 'vivid' }), n(alpha, 3)]);
  q.def(linearGradient(gid, stops, { x1: n(x0 - place.x), y1: n(y0 - place.y), x2: n(x1 - place.x), y2: n(y1 - place.y), gradientUnits: 'userSpaceOnUse' }));
  q.add(rect({ width: q.w, height: q.h, fill: url(gid) }));
}

/**
 * Every running effect on one surface (q: a key or panel surface; place: its rect in field px; F: the field).
 * o: { slot (the instrument here: the round key carries the bomb pulse, the kills key the kill burst) }
 */
export function overlays(q, fx, place, F, { slot } = {}) {
  const C = q.colors, dark = q.dark, u = q.m.u, S = Math.min(q.w, q.h);
  const W = q.w, H = q.h;
  const pcx = place.x + W / 2, pcy = place.y + H / 2;
  const dn = clamp(Math.hypot(pcx - F.cx, pcy - F.cy) / F.R);
  const calm = fx.tier === 'calm';
  const isAt = ([x, y]) => x >= place.x - 0.5 && x <= place.x + W + 0.5 && y >= place.y - 0.5 && y <= place.y + H + 0.5;
  const localOf = ([x, y]) => [x - place.x, y - place.y];
  const K = F.K || S;   // a key's size: effect strokes keep one scale across keys and panels

  // spectating / dead / watching: dimmed, desaturated (the instruments are drawn in the 'off' tone)
  if (fx.dim) q.add(rect({ width: W, height: H, fill: C.bg, fillOpacity: fx.dim === 2 ? (dark ? 0.46 : 0.5) : dark ? 0.26 : 0.3 }));

  // the round's end: a sweep of light in the winner's color along the deck, a wash after (a loss: a cool fade)
  if (fx.round) {
    const R0 = fx.round;
    // the reason's flavor: a defuse washes cool, a detonation warm, the clock periwinkle; an elimination in the winner's color
    const team = R0.won ? ({ bomb_defused: HUE.cyan, bomb_exploded: HUE.amber, time: HUE.periwinkle })[R0.reason] ?? TEAM_HUE[R0.team] ?? q.ctx.hue : 250;
    const c = R0.won ? q.theme.spectral(team) : dark ? q.theme.spectral(250, { tier: 'wash' }) : C.dim;
    if (R0.wash) {
      const gid = q.id('glrw');
      const a = (R0.wash / 3) * (R0.won ? (dark ? 0.5 : 0.34) : dark ? 0.38 : 0.28);
      q.def(radialGradient(gid, [[0, c, n(a, 3)], [0.65, c, n(a * 0.4, 3)], [1, c, 0]], { cx: 0.5, cy: R0.won ? 1 : 0, r: 0.95 }));
      q.add(rect({ width: W, height: H, fill: url(gid) }));
    }
    if (R0.sweep >= 0) {
      const tall = F.y1 - F.y0 > (F.x1 - F.x0) * 1.2;
      const f = (R0.sweep + 0.5) / R0.sweeps, e = outExpo(f) * 0.4 + f * 0.6;
      const a0 = tall ? F.y0 : F.x0, a1 = tall ? F.y1 : F.x1;
      const X = lerp(a0 - (a1 - a0) * 0.06, a1 + (a1 - a0) * 0.06, e);
      const lx = X - (tall ? place.y : place.x), ext = tall ? H : W;
      if (lx > -ext * 0.5 && lx < ext * 1.5) {
        const bandId = q.id('glsw'), wd = K * 0.75;
        q.def(linearGradient(bandId, [[0, c, 0], [0.72, c, dark ? 0.62 : 0.42], [1, c, 0]], tall ? { x1: 0, y1: 0, x2: 0, y2: 1 } : { x1: 0, y1: 0, x2: 1, y2: 0 }));
        q.add(tall ? rect({ x: 0, y: n(lx - wd * 0.85), width: W, height: n(wd), fill: url(bandId) }) : rect({ x: n(lx - wd * 0.85), y: 0, width: n(wd), height: H, fill: url(bandId) }));
        beam(q, lx, { alpha: 1, slant: 0.14, axis: tall ? 'y' : 'x', dir: 1 });
      }
    }
  }

  // the bomb: the steady pulse on the round key (no plant onset: its time is never visible), the defuse (cool) /
  // explosion (warm) bursts
  if (fx.planted && fx.pulse && slot === 'round') {
    const amp = calm ? 0.55 : fx.tier === 'full' ? 1 : 0.85;
    const lv = fx.pulse / 3;
    const gid = q.id('glpulse');
    q.def(radialGradient(gid, [[0, C.warn, n(0.1 * lv * amp, 3)], [0.6, C.warn, n(0.16 * lv * amp, 3)], [1, C.warn, n(0.5 * lv * amp, 3)]], { cx: 0.5, cy: 0.5, r: 0.72 }));
    q.add(rect({ width: W, height: H, fill: url(gid) }));
    const rw = Math.max(2, u * 3);
    q.add(rect({ x: rw / 2 + u, y: rw / 2 + u, width: W - rw - 2 * u, height: H - rw - 2 * u, rx: q.m.radius, fill: 'none', stroke: C.warn, strokeWidth: n(rw), strokeOpacity: n((0.25 + 0.75 * lv) * amp, 3) }));
  }
  if (fx.defuse) {
    const { k, n: N } = fx.defuse, t = (k + 0.5) / N;
    band(q, place, F.o.round, F.R * 1.25 * outExpo(t), { hues: [HUE.mint, HUE.cyan, HUE.azure], alpha: (calm ? 0.5 : 0.95) * (1 - t * 0.85), width: K * 0.14, glow: 0.3 });
    if (!calm && isAt(F.o.round)) { const o = localOf(F.o.round); bloom(q, o, S * 0.7, 0.55 * (1 - t), 'gldf', q.theme.spectral(HUE.cyan)); burst(q, t, { cx: o[0], cy: o[1], rays: 16, width: Math.max(1.5, u * 2.2), hues: [HUE.cyan, HUE.cerulean, HUE.azure, HUE.mint, HUE.periwinkle], r0: S * 0.12, r1: S * 0.72 }); }
  }
  if (fx.explode) {
    const { k, n: N } = fx.explode, t = (k + 0.5) / N;
    const gid = q.id('glex');
    const a = (calm ? 0.16 : 0.3) * (1 - t);
    q.def(radialGradient(gid, [[0, C.warn, n(a, 3)], [0.7, C.warn, n(a * 0.45, 3)], [1, C.warn, 0]], { cx: 0.5, cy: 0.5, r: 0.8 }));
    q.add(rect({ width: W, height: H, fill: url(gid) }));
    band(q, place, F.o.round, F.R * 1.4 * outExpo(t), { hues: [HUE.coral, HUE.amber, HUE.citrine], alpha: (calm ? 0.5 : 0.95) * (1 - t * 0.85), width: K * 0.18, glow: 0.34 });
    if (!calm && isAt(F.o.round)) { const o = localOf(F.o.round); bloom(q, o, S * 0.75, 0.6 * (1 - t), 'glxb', q.theme.spectral(HUE.amber)); burst(q, t, { cx: o[0], cy: o[1], rays: 16, width: Math.max(1.5, u * 2.4), hues: [HUE.amber, HUE.coral, HUE.citrine, HUE.amber], r0: S * 0.12, r1: S * 0.72 }); }
  }

  // a kill: a spectral shard burst on the kill counter and rings of light across the deck (headshot sharper and
  // whiter; a double sends two rings, a triple three, further each time; an ace floods the deck with the Spectrum)
  if (fx.kill) {
    const { k, n: N, headshot, count } = fx.kill;
    const t = (k + 0.5) / N;
    const O = F.o.kills;
    const reach = F.R * [0.7, 0.95, 1.15, 1.35, 1.6][count - 1];
    const rings = calm ? 1 : Math.min(3, count);
    // big decks (XL, + XL) step the rings coarser, so each of their many keys changes fewer times
    const tr = (F.n || 0) > 20 && !calm ? (Math.floor((k / N) * 6) + 0.5) / 6 : t;
    for (let i = 0; i < rings; i++) {
      const ti = clamp(tr * 1.12 - i * 0.13);
      if (ti <= 0 || ti >= 1) continue;
      const hues = headshot ? [HUE.azure, -1, HUE.violet] : [[HUE.rose, HUE.amber, HUE.lime], [HUE.lime, HUE.cyan, HUE.azure], [HUE.azure, HUE.periwinkle, HUE.violet]][(i + count - 1) % 3];
      band(q, place, O, reach * outExpo(ti) * (1 - i * 0.1), { hues: hues.map((h) => (h < 0 ? HUE.cyan : h)), color: headshot ? beamColor(q) : undefined, alpha: (calm ? 0.5 : 1) * (1 - ti * 0.9), width: K * (headshot ? 0.08 : 0.11) * (1 + 0.15 * (count - 1)), glow: headshot ? 0.32 : 0.26 });
    }
    if (count >= 5 && !calm) rainbow(q, place, F, clamp(1 - t), (dark ? 0.4 : 0.3) * (1 - t), 'glace');
    if (!calm && isAt(O)) {
      const o = localOf(O);
      if (k <= 1) bloom(q, o, S * 0.8, (headshot ? 0.85 : 0.6) * (1 - k * 0.45), 'glkb');
      burst(q, t, { cx: o[0], cy: o[1], rays: headshot ? 20 : 14, width: Math.max(1.4, u * (headshot ? 1.6 : 2.6)), r0: S * 0.1, r1: S * (0.72 + 0.06 * (count - 1)), alpha: 1, rot: headshot ? 0 : 13 });
      if (headshot && t < 0.75) {   // the crosshair snaps shut: four white ticks converge on the center
        const e = outExpo(clamp(t / 0.45)), g = S * (0.4 - 0.27 * e), L = S * 0.14, c = beamColor(q), sw = Math.max(2, u * 2.4);
        q.add(path(P().M(o[0], o[1] - g - L).L(o[0], o[1] - g).M(o[0], o[1] + g).L(o[0], o[1] + g + L).M(o[0] - g - L, o[1]).L(o[0] - g, o[1]).M(o[0] + g, o[1]).L(o[0] + g + L, o[1]).d, { fill: 'none', stroke: c, strokeWidth: n(sw), strokeOpacity: n(1 - t * 0.9, 3), strokeLinecap: 'round' }));
      }
    }
  }

  // damage: a shockwave and refracted shards fly out from the center, as far as the damage reaches (edges and
  // slivers only: never a red field)
  if (fx.hurt) {
    const { k, n: N, reach } = fx.hurt;
    const t = (k + 0.5) / N;
    if (dn <= reach + 1e-6) {
      // a surface is hit when the front reaches it, then fades in two steps (big decks: one), so each changes ≤ 4 times
      const top = calm || (F.n || 0) > 20 ? 2 : 3;
      const arrive = Math.floor((dn / reach) * N * 0.45);
      const lvl = k < arrive ? 0 : Math.max(0, top - (k - arrive));
      if (lvl === top && !calm) band(q, place, [F.cx, F.cy], Math.max(F.R * reach * outExpo(t), dn * F.R), { hues: [HUE.rose, -1, HUE.amber], color: C.neg, alpha: HURT_MAX_ALPHA * (1 - t * 0.6), width: K * 0.1, glow: 0.22 });
      if (lvl > 0) {
        const s = (lvl / 3) * (1 - 0.4 * (dn / reach));
        const a = HURT_MAX_ALPHA * s * (calm ? 0.7 : 1);
        const gid = q.id('glhv');
        q.def(radialGradient(gid, [[0, C.neg, 0], [0.6, C.neg, 0], [0.86, C.neg, n(a * 0.5, 3)], [1, C.neg, n(a, 3)]], { cx: 0.5, cy: 0.5, r: 0.72 }));
        q.add(rect({ width: W, height: H, fill: url(gid) }));
        if (!calm) {
          let core = '', rose = '', amber = '';
          const off = Math.max(1.2, u * 1.6);
          for (const sh of shards(place, F, S, (k - arrive) / 3, fx.hurt.dmg >= 40 ? 3 : 2)) {
            const p = sh.pts;
            const mv = (dx, dy) => P().M(p[0][0] + dx, p[0][1] + dy).L(p[1][0] + dx, p[1][1] + dy).L(p[2][0] + dx, p[2][1] + dy).Z().d;
            core += mv(0, 0); rose += mv(sh.nx * off, sh.ny * off); amber += mv(-sh.nx * off, -sh.ny * off);
          }
          inField(q, place, path(rose, { fill: q.theme.spectral(HUE.rose), fillOpacity: n(a * 0.6, 3) }) + path(amber, { fill: q.theme.spectral(HUE.amber), fillOpacity: n(a * 0.5, 3) }) + path(core, { fill: C.neg, fillOpacity: n(Math.min(HURT_MAX_ALPHA, a * 1.1), 3) }));
        }
      }
    }
  }

  // death: the glass cracks from the middle of the deck, holds, then fades into the dimmed face
  if (fx.death) {
    const { grow, alpha, k } = fx.death;
    const impact = [F.cx, F.cy];
    const d = crackPath(F, impact, place, calm ? 1 : grow);
    if (d) {
      const lw = Math.max(1.2, u * 1.35);
      const shadow = dark ? '#000000' : C.ink;
      let m = path(d, { fill: 'none', stroke: shadow, strokeWidth: n(lw * 3), strokeOpacity: n((dark ? 0.55 : 0.2) * alpha, 3), strokeLinecap: 'round', strokeLinejoin: 'round' });
      if (!calm) m += `<g transform="translate(${n(-lw)} ${n(-lw * 0.5)})">${path(d, { fill: 'none', stroke: q.theme.spectral(HUE.rose), strokeWidth: n(lw), strokeOpacity: n(0.6 * alpha, 3), strokeLinecap: 'round', strokeLinejoin: 'round' })}</g><g transform="translate(${n(lw)} ${n(lw * 0.5)})">${path(d, { fill: 'none', stroke: q.theme.spectral(HUE.azure), strokeWidth: n(lw), strokeOpacity: n(0.55 * alpha, 3), strokeLinecap: 'round', strokeLinejoin: 'round' })}</g>`;
      m += path(d, { fill: 'none', stroke: dark ? '#ffffff' : C.ink, strokeWidth: n(lw), strokeOpacity: n(0.95 * alpha, 3), strokeLinecap: 'round', strokeLinejoin: 'round' });
      inField(q, place, m);
    }
    if (k <= 1 && isAt(impact)) bloom(q, localOf(impact), S * 0.6, 0.75 * (1 - k * 0.4), 'glimp');
  }

  // the flashbang: white light floods every surface, then disperses into the Spectrum as it fades
  if (fx.flash) {
    const v = fx.flash / fx.flashQ, i = Math.round(v * 6);
    const peak = FLASH_PEAK[fx.tier] ?? 0.84;
    let white, spec;
    if (fx.flashRise) { white = peak * Math.min(1, v * 1.1); spec = 0; }   // the strike's first frames: white, part way (the rise slew)
    else {
      white = peak * FLASH_WHITE[i] * (1 - 0.3 * (1 - v) * dn);   // the fade: the white thins from the edges in
      spec = FLASH_SPECTRUM[i] * (dark ? 1 : 0.8) * (calm ? 0.6 : 1);
    }
    if (spec > 0.01) rainbow(q, place, F, v, spec, 'glfls');
    if (white > 0.004) q.add(rect({ id: q.id('glflash'), width: W, height: H, fill: '#ffffff', fillOpacity: n(Math.min(peak, white), 3) }));   // the id marks the whiteout (tests measure it)
  } else if (fx.flashStill) q.add(rect({ width: W, height: H, fill: '#ffffff', fillOpacity: dark ? 0.16 : 0.42 }));
}
