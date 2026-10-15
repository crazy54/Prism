// The screens kit (D5): one grammar for every display widget — the Galleon 100 SD's 2 × 2
// widget screen, the Neo info bar and the Stream Deck + strip. Every widget is a real theme
// panel (paper card, glass, black frame …) with its own Spectrum hue; type comes from the
// theme's text roles, so a widget is typeset by whichever deck theme is active.
//
//   galleon(ctx, [[topLeft, topRight], [bottomLeft, bottomRight]], { hues })   → svg (the 720 × 384 screen)
//   header(p, W, 'CPU', '8 cores')        eyebrow + hue chip, right-aligned meta
//   stat(p, { value, unit, xr, base, size })   a number right-anchored at xr, its unit after it (robust in any face)
//   meter / segmented / pictogram / coverArt / spark                       the instruments
//
// Layout rules (Galleon widget 360 × 180 — 2:1, ~1.25 × 0.63 in on the device): one primary
// number per widget (≥ 60 px), secondary text ≥ 22 px, a 22 px text-safe margin, and the
// bottom 14 px kept clear for the hardware's active-layer underline.

import { compose, rect, path, circle, n, P, url, linearGradient, roundRectPath, PanelSurface } from '../../scene/index.js';
import { childContext } from '../../scene/compose.js';
import { capHeight, measureText, pad2 } from '../../scene/text.js';
import { arcPath, polar, sparkPath, sparkPoints } from '../../scene/shapes.js';
import { clamp, lerp } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { hash } from '../../scene/noise.js';
import { Pen } from '../../glyphs/_glyph.js';
import { BASE_TYPE } from '../../themes/_theme.js';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The design tokens' 12 Spectrum stops (OKLCH hue), by name. */
export const HUE = { violet: 296, periwinkle: 269.8, azure: 243.6, cerulean: 217.5, cyan: 191.3, mint: 165.1, jade: 138.9, lime: 112.7, citrine: 86.5, amber: 60.4, coral: 34.2, rose: 8 };

/** Params every Galleon dashboard shares. */
export const GALLEON_PARAMS = {
  layer: { type: 'select', default: 'top', options: ['top', 'bottom', 'none'], label: 'Active layer (marked under the widgets)' },
};

/**
 * compose() for a widget or strip segment, with the clip on the OUTER group in the parent's space —
 * so per-slice culling (scene/cull.js) bounds each widget exactly by its window and a slice never
 * drags in its neighbour's markup (an arc's conservative bounds can reach 30 px past its widget).
 */
export function panelInto(parent, r, draw, { kind = 'screen', tag = 'p', ...rest } = {}) {
  const k = new PanelSurface(childContext(parent.ctx, r, { kind, tag, ...rest }));
  const out = draw(k);
  if (k.defs) parent.def(k.defs);
  const id = parent.id('clip');
  // inset 0.02 px: culling keeps boxes that merely touch a window edge, so an exact clip would pull the neighbour in
  parent.def(`<clipPath id="${id}"><rect x="${n(r.x + 0.02)}" y="${n(r.y + 0.02)}" width="${n(r.w - 0.04)}" height="${n(r.h - 0.04)}"/></clipPath>`);
  parent.add(`<g clip-path="url(#${id})"><g transform="translate(${n(r.x)} ${n(r.y)})">${k.body}</g></g>`);
  return out;
}

/** Widget frame metrics for a panel. */
export function frameOf(p, { pad } = {}) {
  const P0 = pad ?? Math.round(Math.max(p.m.text ?? p.m.safe, p.h * 0.112));
  const eb = p.typeStyle('eyebrow');
  return { x0: P0, x1: p.w - P0, w: p.w - P0 * 2, top: P0, eyebrowY: P0 + capHeight(eb.size, eb.weight), footY: p.h - Math.max(P0, p.h * 0.13), u: p.m.u, cx: p.w / 2, pad: P0 };
}

/**
 * The Galleon 100 SD screen: 2 dials × 2 layers = four 2:1 widgets (360 × 180, centered in 360 × 192 quadrants). cells[layer][dial] = (p, W) => void.
 * The hardware underlines the active layer itself; `params.layer` marks it here too (a short bar in the
 * widget's hue — 'none' hides it, e.g. when the app draws its own).
 */
export function galleon(ctx, scr, cells, { hues = [[HUE.violet, HUE.cyan], [HUE.amber, HUE.azure]], tones = [['idle', 'idle'], ['idle', 'idle']] } = {}) {
  // the app shows each widget as a 2:1 window (360 × 180) centered in its 360 × 192 quadrant (6 px gutters
  // above and below — devices.js); panels fill exactly those windows so nothing is cut at the slice edges
  const { w, h } = ctx, G = ctx.screen?.widgets || {}, ww = G.w ?? w / 2, wh = G.h ?? Math.min(h / 2, ww / 2);
  const px = G.pitchX ?? w / 2, py = G.pitchY ?? h / 2, ix = G.insetX ?? (px - ww) / 2, iy = G.insetY ?? (py - wh) / 2;
  const active = ctx.params.layer === 'bottom' ? 1 : ctx.params.layer === 'none' ? -1 : 0;
  scr.add(rect({ width: w, height: h, fill: '#000000' }));
  for (let layer = 0; layer < 2; layer++) for (let dial = 0; dial < 2; dial++) {
    panelInto(scr, { x: dial * px + ix, y: layer * py + iy, w: ww, h: wh }, (p) => {
      const tone = typeof tones[layer][dial] === 'function' ? tones[layer][dial](ctx) : tones[layer][dial];
      p.background({ tone });
      const W = frameOf(p);
      cells[layer][dial](p, W);
      if (layer === active) activeMark(p);
    }, { kind: 'screen', tag: `w${dial}${layer}`, hue: hues[layer][dial] });
  }
  return scr.svg();
}

/** The active-layer mark: a short bar in the widget's hue at the bottom center (the spectral index, widened). */
export function activeMark(p) {
  const bw = Math.round(p.w * 0.16), bh = Math.max(3, Math.round(p.m.u * 1.25));
  p.add(rect({ x: p.w / 2 - bw / 2, y: p.h - bh - Math.max(2, Math.round(p.h * 0.016)), width: bw, height: bh, rx: bh / 2, fill: p.ctx.tint }));
}

/** Eyebrow (caps) with the widget's hue chip, and an optional right-aligned meta in the caption face (dim);
 *  meta may be a list of alternatives, longest first. */
export function header(p, W, title, meta, { chip = true, metaColor = 'dim', y, metaRole = 'caption', size, metaSize } = {}) {
  const eb = p.typeStyle('eyebrow', size ? { size } : {}), ms = p.typeStyle(metaRole, metaSize ? { size: metaSize } : {});
  const cap = capHeight(eb.size, eb.weight);
  const by = y ?? W.eyebrowY;
  let x = W.x0;
  if (chip) {
    const s = Math.round(cap * 0.78);
    p.add(rect({ x, y: by - cap / 2 - s / 2, width: s, height: s, rx: Math.max(1, s * 0.22), fill: p.ctx.tint }));
    x += s + Math.round(cap * 0.55);
  }
  // the title keeps its width (up to 62 % of the row); the meta takes what is left (shrinks, then ellipsizes)
  const room = W.x1 - x;
  const metaFont = { size: ms.size, weight: ms.weight, caps: ms.caps, tracking: ms.tracking };
  const titleW = measureText(title, { size: eb.size, weight: eb.weight, caps: eb.caps, tracking: eb.tracking });
  if (Array.isArray(meta)) {   // alternatives, longest first: the first that fits beside the title wins
    const opts = meta.filter(Boolean);
    meta = opts.find((m) => measureText(m, metaFont) <= room - Math.min(titleW, room * 0.62) - cap * 1.2) ?? opts[opts.length - 1];
  }
  if (!meta) { p.eyebrow(title, { x, y: by, maxWidth: room, size: eb.size }); return; }
  const metaW = measureText(meta, metaFont);
  const gap = cap * 1.2, tW = Math.min(titleW, Math.max(room - gap - metaW, room * 0.62));
  p.eyebrow(title, { x, y: by, maxWidth: tW + 1, size: eb.size });
  const metaRoom = room - tW - gap;
  if (metaRoom > ms.size * 1.5) p.text(metaRole, meta, { align: 'right', x: W.x1, y: by, color: metaColor, maxWidth: metaRoom, size: ms.size });
}

/**
 * A stat: the number right-anchored at `xr` (so any face lines up) — or left-anchored at `xl` —, the unit
 * after it at a fraction of the size, sharing the baseline. role: 'hero' | 'value'. Returns { left, right, base }.
 */
export function stat(p, { value, unit, xr, xl, base, size, role = 'hero', unitScale = 0.36, color, unitColor = 'muted', maxWidth }) {
  const st = p.typeStyle(role, size ? { size } : {});
  const px = st.size, cap = capHeight(px, st.weight);
  const vw = Math.min(maxWidth ?? Infinity, measureText(String(value), { size: px, weight: st.weight, tabular: !!st.tabular, tracking: st.tracking || 0 }));
  if (xr === undefined) xr = (xl ?? 0) + vw;   // left-anchored: Inter metrics place the right edge
  p.text(role, String(value), { align: 'right', x: xr, cy: base - cap / 2, size: px, color, maxWidth });
  let right = xr;
  if (unit) {
    const us = Math.max(p.typeStyle('caption').size, px * unitScale);
    const gap = px * 0.06;
    p.caption(unit, { align: 'left', x: xr + gap, y: base, size: us, color: unitColor });
    right = xr + gap + measureText(unit, { size: us, weight: p.typeStyle('caption').weight });
  }
  return { left: xr - vw, right, base, cap };
}

/** A rounded bar meter: track + fill (+ optional marker). */
export function meter(p, { x, y, w, h, value, color, track, trackOpacity = 1, marker = false }) {
  const v = clamp(value ?? 0), r = h / 2;
  let out = rect({ x, y, width: w, height: h, rx: r, fill: track ?? p.colors.line, fillOpacity: trackOpacity < 1 ? trackOpacity : null });
  if (v > 0.002) out += rect({ x, y, width: Math.max(h, w * v), height: h, rx: r, fill: color ?? p.ctx.tint });
  if (marker) { const mx = x + w * v; out += circle({ cx: mx, cy: y + h / 2, r: h * 1.15, fill: p.colors.ink }) + circle({ cx: mx, cy: y + h / 2, r: h * 0.5, fill: color ?? p.ctx.tint }); }
  p.add(out);
}

/** A segmented meter (the notched-dial look): `count` blocks, the first round(value·count) lit. */
export function segmented(p, { x, y, w, h, value, count = 20, gap, color, off, offOpacity = 1, radius }) {
  const g = gap ?? Math.max(2, w / count * 0.28);
  const bw = (w - g * (count - 1)) / count, lit = Math.round(clamp(value ?? 0) * count);
  let on = '', dim = '';
  const rr = radius ?? Math.min(bw, h) * 0.3;
  for (let i = 0; i < count; i++) {
    const d = roundRectPath(x + i * (bw + g), y, bw, h, rr);
    if (i < lit) on += d; else dim += d;
  }
  if (dim) p.add(path(dim, { fill: off ?? p.colors.line, fillOpacity: offOpacity < 1 ? offOpacity : null }));
  if (on) p.add(path(on, { fill: typeof color === 'string' ? color : p.ctx.tint }));
}

/** A scrolling sparkline with a soft area and a head dot. */
export function spark(p, values, { x, y, w, h, shift = 0, color, width, area = 0.12, head = true, lo = 0, hi = 1 }) {
  const c = color ?? p.ctx.tint, lw = width ?? Math.max(2, p.m.u * 0.9);
  const o = { x, y, w, h, shift, lo, hi };
  const d = sparkPath(values, o);
  if (!d) return;
  const pts = sparkPoints(values, o);
  if (area) p.add(path(`${d}L${n(pts[pts.length - 1][0])} ${n(y + h)}L${n(pts[0][0])} ${n(y + h)}Z`, { fill: c, fillOpacity: area }));
  p.add(path(d, { fill: 'none', stroke: c, strokeWidth: n(lw), strokeLinecap: 'round', strokeLinejoin: 'round' }));
  if (head) { const [hx, hy] = pts[pts.length - 1]; p.add(circle({ cx: hx, cy: hy, r: lw * 1.9, fill: p.colors.surface }) + circle({ cx: hx, cy: hy, r: lw * 1.15, fill: c })); }
}

/** A gauge arc (track + value), angles in degrees (0 = 12 o'clock, clockwise). */
export function gauge(p, { cx, cy, r, width, value, from = -130, to = 130, color, track }) {
  const v = clamp(value ?? 0);
  p.add(path(arcPath(cx, cy, r, from, to), { fill: 'none', stroke: track ?? p.colors.line, strokeWidth: n(width), strokeLinecap: 'round' }));
  if (v > 0.004) p.add(path(arcPath(cx, cy, r, from, lerp(from, to, v)), { fill: 'none', stroke: color ?? p.ctx.tint, strokeWidth: n(width), strokeLinecap: 'round' }));
}

/** Paint ad-hoc pen geometry (48-unit grid) through the active theme, in its own hue and tone. */
export function pictogram(p, draw, { x, y, size, hue, tone = 'active', tag = 'pg', state } = {}) {
  compose(p, { x, y, w: size, h: size }, (q) => {
    const pen = new Pen();
    draw(pen, { t: q.ctx.t, since: q.ctx.since, state, phase: (per) => ((q.ctx.t / per) % 1 + 1) % 1 });
    const styleOf = (prim) => q.roleStyle(prim.role, tone);
    const body = q.theme.paintGlyph ? q.theme.paintGlyph(q, pen, { tone, styleOf }) : paintTree(q, pen.root, tone);
    q.add(`<g transform="scale(${n(size / 48, 4)})">${body}</g>`);
  }, { kind: 'screen', tag, hue, tone, clip: false });
}
function paintTree(q, node, tone) {
  let out = '';
  for (const c of node.children) {
    if (c.group) { const inner = paintTree(q, c, tone); out += c.transform || c.opacity !== 1 ? `<g${c.transform ? ` transform="${c.transform}"` : ''}${c.opacity !== 1 ? ` opacity="${n(c.opacity, 3)}"` : ''}>${inner}</g>` : inner; }
    else out += q.theme.paint(q, c, q.roleStyle(c.role, tone));
  }
  return out;
}

/** Generative cover art for a track (no images): one of three compositions from the title's hash, in the theme's Spectrum. */
export function coverArt(p, { x, y, size, title = '', artist = '', radius }) {
  let hsh = 0;
  for (const ch of `${title}|${artist}`) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  const stops = Object.values(HUE);
  const h0 = stops[hsh % 12], h1 = stops[(hsh >>> 4) % 12], kind = (hsh >>> 8) % 3;
  const T = p.theme, C = p.colors;
  const rr = radius ?? size * 0.08;
  const clip = p.id('art');
  p.def(`<clipPath id="${clip}"><path d="${roundRectPath(x, y, size, size, rr)}"/></clipPath>`);
  const base = p.id('artbg');
  const deep = mix(C.surface2, T.spectral(h0, { tier: 'ink' }), p.dark ? 0.28 : 0.18);
  p.def(linearGradient(base, [[0, mix(deep, C.surface, 0.25)], [1, deep]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
  let art = rect({ x, y, width: size, height: size, fill: url(base) });
  const c0 = T.spectral(h0), c1 = T.spectral(h1), c2 = T.spectral(h0 + 60);
  const s = size;
  if (kind === 0) {          // orbits
    const cx = x + s * (0.38 + 0.24 * hash(hsh, 1)), cy = y + s * (0.4 + 0.2 * hash(hsh, 2));
    [0.62, 0.48, 0.34, 0.2].forEach((f, i) => { art += circle({ cx, cy, r: s * f, fill: 'none', stroke: [c0, c1, c2, c0][i], strokeWidth: n(s * 0.035), strokeOpacity: n(0.35 + i * 0.15, 2) }); });
    art += circle({ cx, cy, r: s * 0.1, fill: c1 });
  } else if (kind === 1) {   // bands of light
    const k = s * 0.16;
    [c0, c1, c2, c1, c0].forEach((c, i) => { const o = -s * 0.2 + i * k * 1.25; art += path(P().M(x + o, y + s).L(x + o + k, y + s).L(x + o + k + s * 0.7, y).L(x + o + s * 0.7, y).Z().d, { fill: c, fillOpacity: n(0.85 - i * 0.12, 2) }); });
  } else {                   // horizon
    art += circle({ cx: x + s * 0.5, cy: y + s * 0.58, r: s * 0.3, fill: c0 });
    for (let i = 0; i < 5; i++) art += rect({ x, y: y + s * (0.6 + i * 0.085), width: s, height: s * (0.03 + i * 0.008), fill: C.surface2, fillOpacity: 0.9 });
    art += rect({ x, y: y + s * 0.6, width: s, height: s * 0.4, fill: c1, fillOpacity: 0.18 });
  }
  p.add(`<g clip-path="url(#${clip})">${art}</g>`);
  p.add(path(roundRectPath(x + 0.5, y + 0.5, size - 1, size - 1, rr), { fill: 'none', stroke: C.ink, strokeOpacity: p.dark ? 0.12 : 0.1, strokeWidth: 1 }));
}

/** A size for a role in px, scaled by how the theme sizes that role against the base grammar (mono's larger type stays larger). */
export const px = (p, role, base) => base * ((p.theme.type[role]?.size ?? BASE_TYPE[role].size) / BASE_TYPE[role].size);

/** The Neo info bar (232 × 50 SDK layout, display-only): its theme panel and a frame. */
export function infobar(ctx, scr, draw, { tone = 'idle' } = {}) {
  scr.background({ tone });
  const pad = Math.round(Math.max(8, scr.h * 0.18));
  draw(scr, { x0: pad, x1: scr.w - pad, w: scr.w - pad * 2, cy: scr.h / 2, pad });
  return scr.svg();
}

/**
 * A Stream Deck + / + XL strip dashboard: one theme panel per dial segment (200 × 100), so each dial
 * owns its widget and the slices line up seamlessly. cells[i] = (p, F) => void (cycled when the strip
 * has more segments than cells); hues[i] gives each segment its Spectrum hue.
 */
export function strip(ctx, scr, cells, { hues = [], tones = [] } = {}) {
  const S = ctx.strip.segments, sw = ctx.w / S;
  scr.add(rect({ width: ctx.w, height: ctx.h, fill: '#000000' }));
  for (let i = 0; i < S; i++) {
    panelInto(scr, { x: i * sw, y: 0, w: sw, h: ctx.h }, (p) => {
      p.background({ tone: tones[i] || 'idle' });
      const pad = Math.round(Math.max(p.m.text ?? p.m.safe, 12));
      const eb = p.typeStyle('eyebrow', { size: px(p, 'eyebrow', 13.5) });
      const F = { x0: pad, x1: p.w - pad, w: p.w - pad * 2, pad, top: pad, eyebrowY: pad + capHeight(eb.size, eb.weight) + 1, eyebrowSize: eb.size, footY: p.h - pad, u: p.m.u, i };
      cells[i % cells.length](p, F);
    }, { kind: 'strip', tag: `s${i}`, hue: hues[i % Math.max(1, hues.length)] });
  }
  return scr.svg();
}

/** A strip segment's eyebrow with its hue chip (and a right meta; alternatives allowed, as in header). */
export function stripHeader(p, F, title, meta) {
  header(p, F, title, meta, { size: F.eyebrowSize, metaSize: px(p, 'caption', 13.5) });
}

/** m:ss (or h:mm:ss) for seconds. */
export const mmss = (sec) => { const s = Math.max(0, Math.floor(sec)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}:${pad2(m)}:${pad2(r)}` : `${m}:${pad2(r)}`; };
/** "9:41" / "9:41 AM" from hours + minutes. */
export const hhmm = (h, m, h12 = false) => (h12 ? `${((h + 11) % 12) + 1}:${pad2(m)}` : `${h}:${pad2(m)}`);
/** Local clock parts for an epoch ms in the context's time zone (pure arithmetic — no Date in facets). */
export function localParts(ctx, ms) {
  const local = ms + (ctx.clock?.tzOffset ?? 0) * 60000;
  const days = Math.floor(local / 86400000), rem = local - days * 86400000;
  // civil-from-days (H. Hinnant): days since 1970-01-01 → y / m / d
  const z = days + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1, month = mp < 10 ? mp + 3 : mp - 9;
  return { h: Math.floor(rem / 3600000), m: Math.floor((rem % 3600000) / 60000), dow: ((days % 7) + 11) % 7, day, month };
}

export { polar, clamp, lerp, mix };
