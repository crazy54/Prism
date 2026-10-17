// D8 games kit — shared pieces for the games gallery (not a facet: files starting with `_` aren't registered).
//
//   cellsOf(ctx)            the facet's keys as { rect, i, col, row, k } (span and deck surfaces alike)
//   ageOf(ctx)              seconds since the last game event (Infinity for stills / reduced motion)
//   spread(n)               n hues evenly across the Spectrum (rose → violet, long → short wavelength)
//   beam(q, x, o)           the Refraction beam: a slanted hairline of white light with a spectral fringe
//   sweepX(age, …)          where a sweeping beam crosses one key of a grid
//   burst(q, u, o)          a dispersion burst: spectral rays fanning out of a point (u: 0 → 1)
//   converge(q, draw, …)    a pictogram arriving by converging chromatic copies (Refraction's arrival)
//   readout(d, ctx, cards)  deck surfaces: a scoreboard on the Galleon screen (four 2:1 widgets), the
//                           + / + XL touch strip (one card per dial segment) or the Neo info bar → true;
//                           false when the device has none (games then show status on keys)
//   statusKey(q, o)         a key that shows a number (no-readout devices)
//   middleCell(cols, rows)  the cell nearest the middle (score keys, labels)
//
// Everything is pure and draws through the theme (backgrounds, roles, text roles), so neon games glow
// and paper games print. Ids are stable per key (keyInto prefixes), so unchanged keys stay byte-identical.

import { keyInto, rect, path, P, n, attrs, linearGradient, url } from '../../scene/index.js';
import { PanelSurface } from '../../scene/surface.js';
import { childContext } from '../../scene/compose.js';
import { gameGrid } from '../../scene/context.js';
import { Pen } from '../../glyphs/_glyph.js';
import { clamp, lerp, outExpo } from '../../scene/easing.js';

/** The design tokens' 12 Spectrum stops (OKLCH hue). */
export const HUE = { rose: 8, coral: 34.2, amber: 60.4, citrine: 86.5, lime: 112.7, jade: 138.9, mint: 165.1, cyan: 191.3, cerulean: 217.5, azure: 243.6, periwinkle: 269.8, violet: 296 };
export const SPECTRUM = Object.values(HUE);

/** n hues evenly across the Spectrum, long wavelength (rose) first. */
export function spread(count, from = HUE.rose, to = HUE.violet) {
  if (count <= 1) return [lerp(from, to, 0.5)];
  return Array.from({ length: count }, (_, i) => +(from + ((to - from) * i) / (count - 1)).toFixed(1));
}

/** Seconds since the last game event, Infinity when there is none (stills) or under reduced motion. */
export const ageOf = (ctx) => (ctx.reduced || !ctx.gameEvent ? Infinity : ctx.gameEvent.age);

/** The facet's keys: { rect (canvas px), i (device key), col, row (0-based in the facet), k (cell index) }. */
export function cellsOf(ctx) {
  const G = gameGrid(ctx);
  return ctx.grid.cells.map((rect, k) => ({ rect, i: rect.i, col: G.cells[k].col, row: G.cells[k].row, k }));
}

/** The cell nearest the middle of a cols × rows grid (the score key when the count is odd). */
export function middleCell(cols, rows) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < cols * rows; i++) { const d = Math.abs((i % cols) - (cols - 1) / 2) + Math.abs(Math.floor(i / cols) - (rows - 1) / 2); if (d < bd - 1e-9) { bd = d; best = i; } }
  return best;
}

/** The beam color: white light at Night, the theme's beam (or ink) by Day. */
export const beamColor = (q) => q.colors.beam || (q.dark ? '#ffffff' : q.colors.ink);

const FRINGE = [HUE.rose, HUE.amber, HUE.jade, HUE.azure, HUE.violet];

/**
 * A slanted beam of light at x (key px, center height) with a spectral fringe trailing it.
 * o: { alpha, slant (x per y), dir (+1: travelling right, the fringe trails left), width, fringe }
 */
export function beam(q, x, { alpha = 1, slant = 0.2, dir = 1, width, fringe = true, glow = true, axis = 'x' } = {}) {
  if (alpha <= 0.01) return;
  const u = q.m.u;
  // axis 'x': a near-vertical beam at x travelling sideways; 'y': a near-horizontal beam at y (x is then a y) travelling up / down
  const band = axis === 'y'
    ? (cy, wd) => { const s = slant * q.w / 2; return P().M(0, cy - wd / 2 + s).L(0, cy + wd / 2 + s).L(q.w, cy + wd / 2 - s).L(q.w, cy - wd / 2 - s).Z().d; }
    : (cx, wd) => { const s = slant * q.h / 2; return P().M(cx - wd / 2 + s, 0).L(cx + wd / 2 + s, 0).L(cx + wd / 2 - s, q.h).L(cx - wd / 2 - s, q.h).Z().d; };
  const c = beamColor(q);
  if (glow) {
    const id = q.id('beamglow');
    q.def(linearGradient(id, [[0, c, 0], [0.5, c, q.dark ? 0.34 : 0.22], [1, c, 0]], axis === 'y' ? { x1: 0, y1: 0, x2: 0, y2: 1 } : { x1: 0, y1: 0, x2: 1, y2: 0 }));
    q.add(path(band(x, 16 * u), { fill: url(id), fillOpacity: alpha < 1 ? n(alpha, 3) : null }));
  }
  if (fringe) FRINGE.forEach((hue, j) => {
    q.add(path(band(x - dir * (2.2 + j * 1.7) * u, 1.25 * u), { fill: q.theme.spectral(hue), fillOpacity: n(alpha * (0.75 - j * 0.11), 3) }));
  });
  q.add(path(band(x, width ?? Math.max(1.2, 1.4 * u)), { fill: c, fillOpacity: alpha < 1 ? n(alpha, 3) : null }));
}

/**
 * A beam sweeping a grid left → right (dir 1) or right → left: its x in one key's px at `age`.
 * pos: the key's column (or any 1-D position in key units); span: how many keys the sweep crosses.
 */
export function sweepX(age, { t0 = 0, dur = 0.7, pos = 0, span = 1, w, dir = 1 } = {}) {
  const u = clamp((age - t0) / dur, 0, 1);
  const g = lerp(-0.4, span + 0.4, outExpo(u) * 0.35 + u * 0.65);   // fast in, steady across
  const local = dir > 0 ? g - pos : span - g - pos;
  return { x: local * w, on: u > 0 && u < 1 && local > -0.45 && local < 1.45, u };
}

/** Spectral rays fanning out of (cx, cy) as u runs 0 → 1. o: { cx, cy, r0, r1, rays, width, alpha, rot, hues } */
export function burst(q, u, { cx = q.w / 2, cy = q.h / 2, r0, r1, rays = 12, width, alpha = 1, rot = 15, hues = SPECTRUM } = {}) {
  if (!(u > 0 && u < 1)) return;
  const R0 = r0 ?? Math.min(q.w, q.h) * 0.16, R1 = r1 ?? Math.min(q.w, q.h) * 0.5;
  const e = outExpo(u), op = alpha * Math.pow(1 - u, 1.4);
  const a = R0 + (R1 - R0) * e * 0.5, b = R0 + (R1 - R0) * e;
  for (let i = 0; i < rays; i++) {
    const ang = ((rot + (i * 360) / rays) * Math.PI) / 180, sx = Math.sin(ang), sy = -Math.cos(ang);
    q.add(path(P().M(cx + sx * a, cy + sy * a).L(cx + sx * b, cy + sy * b).d, { fill: 'none', stroke: q.theme.spectral(hues[i % hues.length]), strokeWidth: n(width ?? Math.max(1.5, 1.9 * q.m.u)), strokeOpacity: n(op, 3), strokeLinecap: 'round' }));
  }
}

/** An expanding ring of light (win / hit echo). */
export function ringWave(q, u, { cx = q.w / 2, cy = q.h / 2, r0, r1, color, width, alpha = 1 } = {}) {
  if (!(u > 0 && u < 1)) return;
  const R = lerp(r0 ?? Math.min(q.w, q.h) * 0.2, r1 ?? Math.min(q.w, q.h) * 0.62, outExpo(u));
  q.add(path(P().M(cx + R, cy).A(R, R, 0, 0, 1, cx - R, cy).A(R, R, 0, 0, 1, cx + R, cy).Z().d, { fill: 'none', stroke: color || beamColor(q), strokeWidth: n(width ?? Math.max(1.2, 1.5 * q.m.u)), strokeOpacity: n(alpha * (1 - u), 3) }));
}

/** Paint a pen's primitives flat in one color (chromatic ghosts) — markup in grid units. */
function ghostMarkup(pen, color, opacity, sw) {
  let out = '';
  for (const p of pen.flat()) {
    const op = n(opacity * (p.opacity ?? 1), 3);
    const a = p.fill ? { d: p.d, fill: color, fillOpacity: op } : { d: p.d, fill: 'none', stroke: color, strokeWidth: n(sw * (p.weight ?? 1)), strokeOpacity: op, strokeLinecap: 'round', strokeLinejoin: 'round' };
    const el = `<path${attrs(a)}/>`;
    out += p.transforms?.length ? `<g transform="${p.transforms.join(' ')}">${el}</g>` : el;
  }
  return out;
}

/**
 * A pictogram arriving by converging (u: 0 → 1): two chromatic copies (rose, violet) slide in from
 * either side and resolve into the real piece, painted by the theme. u ≥ 1 draws the piece only.
 * o: { box, tone, labeled, spread (grid units), hues, opacity }
 */
export function converge(q, draw, u, { box, tone = 'active', labeled = false, spread: d = 7, hues = [HUE.rose, HUE.violet], opacity = 1 } = {}) {
  const B = box || q.theme.glyphBox(q, { labeled });
  if (u < 1) {
    const pen = new Pen();
    draw(pen);
    const s = B.size / 48, e = outExpo(clamp(u)), off = d * (1 - e), op = (1 - e) * 0.85 * opacity;
    if (op > 0.01) hues.forEach((h, j) => {
      const dx = (j ? 1 : -1) * off;
      q.add(`<g transform="translate(${n(B.x)} ${n(B.y)}) scale(${n(s, 4)}) translate(${n(dx)} 0)">${ghostMarkup(pen, q.theme.spectral(h), op, 2.6)}</g>`);
    });
    const a = clamp(e * 1.15) * opacity;
    if (a > 0.01) q.paintPen(pen, { box: B, tone, opacity: a < 0.999 ? +a.toFixed(3) : undefined });
    return B;
  }
  q.pictogram(draw, { box: B, tone, opacity: opacity < 1 ? opacity : undefined });
  return B;
}

/** The same chromatic split for a text string (answers, numbers): copies converge into the theme's text. */
export function convergeText(q, role, str, u, o = {}) {
  if (u >= 1) { q.text(role, str, o); return; }
  if (u <= 0) return;   // not arrived yet
  const e = outExpo(clamp(u)), off = 3.5 * q.m.u * (1 - e);   // a small split: digits must not read twice
  if (1 - e > 0.02) [HUE.rose, HUE.violet].forEach((h, j) => q.text(role, str, { ...o, x: (o.x ?? q.w / 2) + (j ? 1 : -1) * off, color: q.theme.spectral(h), opacity: +((1 - e) * 0.6).toFixed(3) }));
  const a = clamp(e * 1.2);   // never draw at ~0 opacity: some themes add copies (chrome's cast shadow) that ignore it
  if (a > 0.01) q.text(role, str, { ...o, opacity: a < 0.999 ? +a.toFixed(3) : undefined });
}

// ---------- readouts (deck surfaces) ----------

/** compose() for a panel with the clip on the outer group in the parent's space (culling bounds it exactly). */
function panelInto(parent, r, draw, { kind = 'screen', tag = 'p', ...rest } = {}) {
  const k = new PanelSurface(childContext(parent.ctx, r, { kind, tag, ...rest }));
  draw(k);
  if (k.defs) parent.def(k.defs);
  const id = parent.id(`clip${tag}`);
  parent.def(`<clipPath id="${id}"><rect x="${n(r.x + 0.02)}" y="${n(r.y + 0.02)}" width="${n(r.w - 0.04)}" height="${n(r.h - 0.04)}"/></clipPath>`);
  parent.add(`<g clip-path="url(#${id})"><g transform="translate(${n(r.x)} ${n(r.y)})">${k.body}</g></g>`);
}

/** A progress beam: track hairline, lit portion in the hue, a white head. */
export function progressBeam(p, { x, y, w, value, color, h }) {
  const H = h ?? Math.max(2, p.m.u * 1.4), v = clamp(value);
  p.add(rect({ x, y, width: w, height: H, rx: H / 2, fill: p.colors.line || p.colors.dim, fillOpacity: 0.55 }));
  if (v > 0.002) {
    p.add(rect({ x, y, width: Math.max(H, w * v), height: H, rx: H / 2, fill: color || p.ctx.tint }));
    if (v < 0.998) p.add(rect({ x: x + w * v - H * 0.5, y: y - H * 0.6, width: H, height: H * 2.2, rx: H / 2, fill: beamColor(p) }));
  }
}

/**
 * One scoreboard card on a panel. card: { title, value, sub, hue, tone, bar (0–1), barColor, draw(p, F) }
 * — draw replaces the value (pictograms, dots); F = { x0, x1, w, top, cy, foot, pad }.
 */
function card(p, c) {
  p.background({ tone: c.tone || 'idle' });
  const pad = Math.round(Math.max(p.m.text, p.h * 0.12));
  const F = { x0: pad, x1: p.w - pad, w: p.w - pad * 2, top: pad, cy: p.h * 0.54, foot: p.h - pad * 0.9, pad };
  if (c.title) {
    const eb = p.typeStyle('eyebrow');
    const s = Math.round(eb.size * 0.62);
    p.add(rect({ x: F.x0, y: F.top + eb.size * 0.36 - s / 2, width: s, height: s, rx: Math.max(1, s * 0.22), fill: p.ctx.tint }));
    p.eyebrow(c.title, { x: F.x0 + s * 1.7, y: F.top + eb.size * 0.72, maxWidth: F.w - s * 1.7 });
  }
  if (c.meta) p.caption(c.meta, { align: 'right', x: F.x1, y: F.top + p.typeStyle('eyebrow').size * 0.72, color: 'dim', maxWidth: F.w * 0.45 });
  if (c.draw) c.draw(p, F);
  else if (c.value !== undefined && c.value !== null) p.text(c.role || 'hero', String(c.value), { align: 'left', x: F.x0, cy: c.sub || c.bar !== undefined ? p.h * 0.5 : p.h * 0.56, maxWidth: F.w, color: c.color });
  if (c.sub) p.caption(c.sub, { align: 'left', x: F.x0, y: c.bar !== undefined ? F.foot - p.m.u * 5 : F.foot, maxWidth: F.w, color: c.subColor || 'muted' });
  if (c.bar !== undefined && c.bar !== null) progressBeam(p, { x: F.x0, y: F.foot - p.m.u * 1.4, w: F.w, value: c.bar, color: c.barColor });
}

export { card as readoutCard };

/**
 * A screen facet's scoreboard (screen-galleon-game): four readout cards in the Galleon's 2:1 widget windows
 * (top-left, top-right, bottom-left, bottom-right). Cards are plain data here (they travel on the link bus).
 */
export function screenCards(scr, ctx, cards) {
  const W = ctx.screen?.widgets || { w: 360, h: 180, pitchX: 360, pitchY: 192, insetX: 0, insetY: 6 };
  scr.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
  for (let j = 0; j < 4; j++) {
    const c = cards[j] || { tone: 'idle' }, dial = j % 2, layer = j >> 1;
    panelInto(scr, { x: dial * W.pitchX + (W.insetX || 0), y: layer * W.pitchY + (W.insetY || 0), w: W.w, h: W.h }, (p) => card(p, c), { kind: 'screen', tag: 'w' + j, hue: c.hue ?? ctx.hue });
  }
  return scr.svg();
}

/** The deck's readout, if it has one: Galleon screen widgets, + strip segments, Neo info bar. → drawn? */
export function readout(d, ctx, cards) {
  const D = ctx.deck;
  if (!D || !cards?.length) return false;
  const S = D.screen;
  if (S?.kind === 'galleon') {
    const W = ctx.device.screen?.widgets || { w: 360, h: 180, pitchX: 360, pitchY: 192, insetX: 0, insetY: 6 };
    d.add(rect({ x: S.x, y: S.y, width: S.w, height: S.h, fill: '#000000' }));
    // widget order: top-left, top-right, bottom-left, bottom-right (dial 0 / 1 × layer 0 / 1)
    for (let j = 0; j < 4; j++) {
      const c = cards[j];
      if (!c) continue;
      const dial = j % 2, layer = j >> 1;
      panelInto(d, { x: S.x + dial * W.pitchX + (W.insetX || 0), y: S.y + layer * W.pitchY + (W.insetY || 0), w: W.w, h: W.h }, (p) => card(p, c), { kind: 'screen', tag: `w${j}`, hue: c.hue ?? ctx.hue });
    }
    return true;
  }
  if (S?.kind === 'infobar') {
    const line = cards.filter((c) => c.title && c.value !== undefined && c.value !== null).slice(0, 3);
    panelInto(d, S, (p) => {
      p.background({ tone: 'idle' });
      const parts = line.map((c) => `${c.short || c.title} ${c.value}`);
      p.label(parts.join(' · '), { cy: p.h / 2, y: p.h / 2 + p.typeStyle('label').size * 0.36, maxWidth: p.w - p.m.text * 2 });
    }, { kind: 'screen', tag: 'ib', hue: cards[0].hue ?? ctx.hue });
    return true;
  }
  if (D.strip) {
    const w = D.strip.w / D.strip.segments;
    for (let j = 0; j < D.strip.segments; j++) {
      const c = cards[j] || { tone: 'idle' };
      panelInto(d, { x: D.strip.x + j * w, y: D.strip.y, w, h: D.strip.h }, (p) => card(p, c), { kind: 'strip', tag: `s${j}`, hue: c.hue ?? ctx.hue });
    }
    return true;
  }
  return false;
}

/** Does this deck have a readout (screen / strip / info bar)? */
export const hasReadout = (ctx) => !!(ctx.deck && (ctx.deck.screen || ctx.deck.strip));

/** A key showing one number (no-readout devices): eyebrow title, value, optional caption. */
export function statusKey(q, { title, value, sub, tone = 'idle', color } = {}) {
  q.background({ tone });
  if (title) q.eyebrow(title, { align: 'center', x: q.w / 2 });
  if (value !== undefined && value !== null) q.value(String(value), { cy: q.h * 0.5, color });
  if (sub) q.label(sub, { color: 'muted' });
}

/** keyInto with a hue + tone (the key's own Spectrum position). */
export const cellKey = (d, c, draw, { hue, tone } = {}) => keyInto(d, c.rect, draw, { hue, tone, tag: `k${c.i}` });

/** The whole deck canvas behind the keys (deck surfaces: black panel; spans draw nothing). */
export function panelBase(d, ctx) {
  if (ctx.kind === 'deck') d.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
}
