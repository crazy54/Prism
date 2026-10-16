// aurora — soft flowing gradients behind frosted keys (D3).
//
//   material  Night ("Polar Night"): every key is a pane of frosted glass with the
//             northern lights behind it — two curtains with a bright, rippling lower hem
//             and faint vertical rays, diffused by a milky veil, ice-crystal speckle and a
//             frosted rim that catches the light. Day ("Opal"): pearl frost over pastel
//             curtains, like opalescent glass.
//   states    off — cold dark glass, no aurora · idle — a low, quiet aurora in the theme's
//             own mint and violet · on — the curtain rises in the facet's hue and flows
//             into place (6 s, then holds still: static between interactions) · alert — a
//             warm curtain that breathes 1 Hz for 10 s, plus a frosted corner notch
//             (never color alone) · busy — a surge of light sweeps across, 1.2 s a pass.
//   roles     lines are light seen through etched frost (a soft halo bleeds into the
//             glass; lit keys grade from frost-white into the hue), accents carry the
//             aurora gradient (hue → hue + 64°), sparks are four-point ice twinkles.
//   press     a breath on cold glass: held, the pane fogs over; released, the fog clears
//             from the center outward and the light flares through.
//   bespoke   bulb (a frosted globe that fills with light) and waveform (three aurora
//             ribbons flowing instead of bars).

import { defineTheme, bezelCorner } from './_theme.js';
import { rect, path, circle, polygon, url, linearGradient, radialGradient, n, P, attrs } from '../scene/svg.js';
import { mix } from '../scene/color.js';
import { clamp, lerp, outCubic, outExpo, pulse, phase, arrive } from '../scene/easing.js';
import { hash } from '../scene/noise.js';
import { pathBounds } from '../scene/geom.js';
import { getGlyph } from '../glyphs/_registry.js';

const NIGHT = {
  bg: '#04060d', surface: '#0e1426', surface2: '#060912', line: '#1c2440',
  ink: '#f1f5ff', muted: '#aab5d1', dim: '#7d88a8', faint: '#4b5472',
  accent: '#79eac4', accent2: '#b9a3ff', pos: '#7fe3a9', info: '#86c5ff', warn: '#f5cd72', neg: '#ff8f8f', crit: '#ff86c3',
  edge: '#e8f1ff', edgeOpacity: 0.2, beam: '#e6fbff', beamOpacity: 0.85, sheenOpacity: 0.08,
  frost: '#dce8ff', sky: '#03050b',
  spectrum: { l: 0.81, c: 0.125 },
};
const DAY = {
  bg: '#e6eaf4', surface: '#f8f9fd', surface2: '#e9edf6', line: '#cdd4e5',
  ink: '#151b2d', muted: '#465069', dim: '#68718e', faint: '#a3aac0',
  accent: '#0a7f62', accent2: '#6a4bcf', pos: '#1d7744', info: '#1f60b5', warn: '#875800', neg: '#b03036', crit: '#a31c61',
  edge: '#ffffff', edgeOpacity: 0.95, beam: '#6a4bcf', beamOpacity: 0.5, sheenOpacity: 0.2,
  frost: '#ffffff', sky: '#dfe4f1',
  spectrum: { l: 0.6, c: 0.13 },
};

/** How much aurora a tone carries (0 = none). */
const ENERGY = { off: 0, idle: 0.42, active: 1, ok: 0.85, info: 0.85, warn: 0.95, neg: 0.95, alert: 1, crit: 1, busy: 0.6 };
const LIT = new Set(['active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit']);
const ALERT = new Set(['warn', 'neg', 'alert', 'crit']);
const TAU = Math.PI * 2;

/** A stable per-key number from the surface's id prefix (keys in one deck differ, frames don't). */
const keySeed = (k) => { let h = k.ctx.seed | 0; for (const ch of String(k.idPrefix)) h = (h * 31 + ch.charCodeAt(0)) | 0; return hash(h, 17); };

/** Alerts breathe 1 Hz (0.55 ↔ 1.1) for 10 s, then hold. */
const breath = (k) => (k.ctx.since >= 10 || k.ctx.reduced ? 1 : lerp(0.55, 1.1, pulse(k.ctx.t, 1)));

/** The two curtain colors for a tone: [hem, upper]. */
export function curtainColors(k, tone) {
  const C = k.colors;
  if (tone === 'active') return [k.ctx.tint, k.theme.spectral(k.ctx.hue + 64)];
  if (tone === 'idle' || tone === 'busy' || tone === 'off') return [C.accent, C.accent2];
  const c = k.tone(tone);
  return [c, mix(c, C.accent2, 0.5)];
}

/**
 * One soft band of aurora: a ring of a radial gradient whose center sits off the pane,
 * so it crosses the glass as a curved ribbon — bright along its inner (lower) edge,
 * fading outward, with no hard edge anywhere (frost diffuses everything).
 */
function arcBand(k, { x, y, w, h, cx, cy, r, color, peak, at = 0.7, spread = 0.2, sx = 1 }) {
  if (peak <= 0.002) return;
  const id = k.id('arc');
  const stops = [[0, color, 0], [Math.max(0, at - 0.05), color, 0], [at, color, peak], [Math.min(1, at + spread * 0.35), color, peak * 0.45], [Math.min(1, at + spread), color, 0], [1, color, 0]];
  const ex = { cx, cy, r };
  if (sx !== 1) ex.gradientTransform = `translate(${n(cx, 3)} ${n(cy, 3)}) scale(${n(sx, 3)} 1) translate(${n(-cx, 3)} ${n(-cy, 3)})`;
  k.def(radialGradient(id, stops, ex));
  k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
}

/**
 * The aurora behind the frost on any rect of a surface: two soft arcs of light (the
 * main one in the hue, a second one 64° on), a glow along the horizon and a faint
 * high bloom. o: { tone, x, y, w, h, energy, flow (0–1: the arcs drift into place) }
 */
export function auroraLayer(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h, energy = ENERGY[tone] ?? 0.5, flow = 1 } = {}) {
  if (energy <= 0.001) return;
  const dark = k.dark;
  const [c1, c2] = curtainColors(k, tone);
  const s0 = keySeed(k), s1 = hash(Math.floor(s0 * 7919), 3);
  const aspect = w / h;
  const a = dark ? 1 : 1.25;
  const drift = 1 - flow;                       // 1 → 0: the light flows up into place, then holds
  const sx = aspect > 1.2 ? 1 / Math.min(4, aspect) : 1; // panels: wider, flatter arcs
  // horizon glow
  const gid = k.id('hz');
  k.def(radialGradient(gid, [[0, c1, (dark ? 0.18 : 0.16) * energy], [0.6, c1, (dark ? 0.05 : 0.05) * energy], [1, c1, 0]], { cx: 0.3 + 0.4 * s1, cy: 1.12, r: 0.7 }));
  k.add(rect({ x, y, width: w, height: h, fill: url(gid) }));
  // the second arc (c2), higher and fainter
  arcBand(k, { x, y, w, h, cx: 1.1 - 0.5 * s0, cy: 1.45 + 0.25 * drift, r: 1.45, color: c2, peak: 0.34 * energy * a, at: 0.74, spread: 0.24, sx });
  // the main arc (c1): a bright lower edge sweeping across the pane
  arcBand(k, { x, y, w, h, cx: -0.1 + 0.4 * s0, cy: 1.7 + 0.35 * drift, r: 1.65, color: c1, peak: 0.6 * energy * a, at: 0.72, spread: 0.2, sx });
  // a thin bright filament inside the main arc
  arcBand(k, { x, y, w, h, cx: -0.1 + 0.4 * s0, cy: 1.7 + 0.35 * drift, r: 1.65, color: dark ? mix(c1, '#ffffff', 0.5) : c1, peak: (dark ? 0.32 : 0.2) * energy, at: 0.725, spread: 0.035, sx });
  // a faint bloom of the second color high in the pane
  const bid = k.id('bloom');
  k.def(radialGradient(bid, [[0, c2, (dark ? 0.16 : 0.14) * energy], [1, c2, 0]], { cx: 0.15 + 0.7 * s1, cy: -0.05, r: 0.6 }));
  k.add(rect({ x, y, width: w, height: h, fill: url(bid) }));
}

/** The frost: a milky veil, ice speckle and a rim that catches the light. */
export function frostLayer(k, { x = 0, y = 0, w = k.w, h = k.h, tone = 'idle', rim = true } = {}) {
  const C = k.colors, dark = k.dark, u = k.m.u, key = k.ctx.kind === 'key';
  const vid = k.id('veil');
  const off = tone === 'off';
  k.def(linearGradient(vid, dark
    ? [[0, C.frost, off ? 0.05 : 0.1], [0.5, C.frost, 0.03], [1, C.frost, off ? 0.03 : 0.065]]
    : [[0, C.frost, 0.5], [0.55, C.frost, 0.26], [1, C.frost, 0.42]]));
  k.add(rect({ x, y, width: w, height: h, fill: url(vid) }));
  // a soft diagonal sheen across the pane
  const sid = k.id('sheen');
  k.def(linearGradient(sid, [[0, C.frost, 0], [0.42, C.frost, dark ? 0.06 : 0.3], [0.5, C.frost, 0], [1, C.frost, 0]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
  k.add(rect({ x, y, width: w, height: h, fill: url(sid) }));
  // ice-crystal speckle (fixed per key)
  const s0 = Math.floor(keySeed(k) * 9973);
  const count = key ? 9 : Math.min(40, Math.round((w * h) / (900 * u * u)));
  let dots = '';
  for (let i = 0; i < count; i++) {
    const px = x + w * (0.06 + 0.88 * hash(i, s0, 1)), py = y + h * (0.05 + 0.9 * hash(i, s0, 2)), r = u * (0.35 + 0.55 * hash(i, s0, 3));
    dots += `M${n(px - r)} ${n(py)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`;
  }
  k.add(path(dots, { fill: dark ? C.frost : '#ffffff', fillOpacity: dark ? (off ? 0.1 : 0.2) : 0.85 }));
  if (!rim) return;
  // the frosted rim: brightest along the top edge
  const ins = k.m.hair / 2;
  const rid = k.id('rim');
  k.def(linearGradient(rid, dark
    ? [[0, C.edge, off ? 0.25 : 0.55], [0.3, C.edge, 0.14], [1, C.edge, 0.06]]
    : [[0, '#ffffff', 1], [0.5, '#ffffff', 0.6], [1, '#ffffff', 0.3]]));
  const rr = key ? k.m.radius : Math.min(k.m.radius, h / 3);
  // rect + rx (not an arc path): tight bounds, so span slices don't pull in a neighbor's rim
  k.add(rect({ x: x + ins, y: y + ins, width: w - ins * 2, height: h - ins * 2, rx: rr, fill: 'none', stroke: url(rid), strokeWidth: n(k.m.hair) }));
  if (!dark) k.add(rect({ x: x + k.m.hair * 1.5, y: y + k.m.hair * 1.5, width: w - k.m.hair * 3, height: h - k.m.hair * 3, rx: Math.max(0, rr - k.m.hair), fill: 'none', stroke: '#3c4766', strokeWidth: n(k.m.hair), strokeOpacity: 0.1 }));
}

/** Busy: a surge of light sweeping across the pane, 1.2 s a pass. */
function surge(k, { x = 0, y = 0, w = k.w, h = k.h, color }) {
  const f = k.ctx.reduced ? 0.5 : phase(k.ctx.t, 1.2);
  const id = k.id('surge');
  const bw = w * 0.55, bx = x - bw + f * (w + bw);
  k.def(linearGradient(id, [[0, color, 0], [0.5, color, k.dark ? 0.34 : 0.26], [1, color, 0]], { x1: bx, y1: 0, x2: bx + bw, y2: 0, gradientUnits: 'userSpaceOnUse' }));
  k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
  k.add(rect({ x: bx + bw * 0.25, y: y + h - k.m.line * 1.4, width: bw * 0.5, height: k.m.line, rx: k.m.line / 2, fill: color, fillOpacity: 0.8 }));
}

/** The pane: sky, aurora, frost — for keys and (scaled) for strips, screens and spans. */
function pane(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const C = k.colors, ctx = k.ctx;
  const sky = k.id('sky');
  k.def(linearGradient(sky, k.dark ? [[0, C.sky], [0.55, C.surface2], [1, C.surface]] : [[0, C.surface], [1, C.surface2]]));
  k.add(rect({ x, y, width: w, height: h, fill: url(sky) }));
  let energy = ENERGY[tone] ?? 0.5;
  if (ALERT.has(tone)) energy *= breath(k);
  const flow = ctx.reduced ? 1 : clamp(ctx.since / 6);
  const settle = LIT.has(tone) ? outCubic(flow) : 1;
  auroraLayer(k, { tone, x, y, w, h, energy, flow: settle });
  if (tone === 'busy') surge(k, { x, y, w, h, color: k.dark ? C.beam : C.accent2 });
  if ((ctx.kind === 'key' || ctx.kind === 'screen') && tone !== 'off') {
    // the frost thickens toward the label: keeps text readable over a bright arc
    const sc = k.id('scrim');
    k.def(linearGradient(sc, k.dark ? [[0.5, C.sky, 0], [0.78, C.sky, 0.38], [1, C.sky, 0.55]] : [[0.55, '#ffffff', 0], [0.8, '#ffffff', 0.4], [1, '#ffffff', 0.55]]));
    k.add(rect({ x, y, width: w, height: h, fill: url(sc) }));
  }
  frostLayer(k, { x, y, w, h, tone });
  if (ALERT.has(tone)) {
    // frosted corner notch — the alert never rests on color alone
    // hung inside the bezel cut (key grammar: BEZEL_INSET), so the device's bezel never hides it
    const s = Math.min(w, h) * 0.17, c = k.tone(tone), { X, Y } = bezelCorner(k, { x, y, w, h });
    k.add(polygon([[X - s, Y], [X, Y], [X, Y + s]], { fill: c, fillOpacity: n(clamp(0.55 + 0.4 * breath(k) / 1.1), 3) }));
    k.add(path(P().M(X - s * 1.45, Y).L(X, Y + s * 1.45).d, { stroke: C.frost, strokeWidth: n(k.m.hair), strokeOpacity: k.dark ? 0.35 : 0.8 }));
  }
}

// ── role painting ────────────────────────────────────────────────────────────

const gradMemo = (k) => k._d3aurora || (k._d3aurora = new Map());

/** A vertical gradient in glyph grid units (userSpaceOnUse inside the glyph group). */
function gridGradient(k, key, stops) {
  const memo = gradMemo(k);
  let id = memo.get(key);
  if (!id) {
    id = k.id('ag');
    k.def(linearGradient(id, stops, { x1: 0, y1: 7, x2: 0, y2: 41, gradientUnits: 'userSpaceOnUse' }));
    memo.set(key, id);
  }
  return id;
}

/** A four-point ice twinkle (grid units). */
const twinkle = (cx, cy, R) => P().M(cx, cy - R).Q(cx, cy, cx + R, cy).Q(cx, cy, cx, cy + R).Q(cx, cy, cx - R, cy).Q(cx, cy, cx, cy - R).Z().d;

function paintAurora(k, prim, style) {
  const tone = k.toneName, dark = k.dark, lit = LIT.has(tone);
  const op = clamp((style.opacity ?? 1) * (prim.opacity ?? 1));
  if (op < 0.005) return '';
  const w = (style.width ?? 3) * (prim.weight ?? 1);
  const cap = prim.cap || style.cap || 'round', join = prim.join || style.join || 'round';
  const dash = prim.dash ? prim.dash.map((v) => n(v)).join(' ') : null;
  const glow = (style.glow || 0) * (tone === 'off' ? 0 : 1);
  const haloC = style.halo || style.color;
  let paint = style.color;
  if (prim.role === 'accent' && tone !== 'off') {
    const [c1, c2] = curtainColors(k, tone);
    const top = dark ? mix(c2, '#ffffff', 0.15) : c2, bot = dark ? mix(c1, '#ffffff', 0.12) : c1;
    paint = url(gridGradient(k, `acc|${tone}|${top}|${bot}`, [[0, top], [1, bot]]));
  } else if ((prim.role === 'line' || prim.role === 'fill') && lit && style.color === k.colors.ink) {
    const [c1] = curtainColors(k, tone);
    const bot = dark ? mix(c1, '#ffffff', 0.45) : mix(c1, k.colors.ink, 0.35);
    paint = url(gridGradient(k, `ink|${tone}|${bot}`, [[0, k.colors.ink], [0.45, k.colors.ink], [1, bot]]));
  }
  let out = '';
  const oo = op < 1 ? n(op, 3) : null;
  if (prim.role === 'spark') {
    const b = pathBounds(prim.d);
    const r = Math.max(b.w, b.h) / 2;
    if (prim.fill && /A/.test(prim.d) && r < 3.2 && Math.abs(b.w - b.h) < 0.6) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (glow) out += `<circle${attrs({ cx: n(cx), cy: n(cy), r: n(r * 2.6), fill: haloC, fillOpacity: n((dark ? 0.16 : 0.12) * op * glow, 3) })}/>`;
      out += `<path${attrs({ d: twinkle(cx, cy, r * 2.1), fill: paint, fillOpacity: oo })}/>`;
      out += `<path${attrs({ d: prim.d, fill: dark ? '#ffffff' : paint, fillOpacity: n(op * (dark ? 0.9 : 1), 3) })}/>`;
      return out;
    }
  }
  if (prim.fill) {
    if (glow) out += `<path${attrs({ d: prim.d, fill: 'none', stroke: haloC, strokeWidth: n(2.5 + 4 * glow), strokeOpacity: n((dark ? 0.14 : 0.1) * glow * op, 3), strokeLinejoin: 'round' })}/>`;
    out += `<path${attrs({ d: prim.d, fill: paint, fillOpacity: oo, fillRule: style.fillRule || null })}/>`;
    return out;
  }
  if (glow) {
    out += `<path${attrs({ d: prim.d, fill: 'none', stroke: haloC, strokeWidth: n(w * (1 + 3.2 * glow)), strokeOpacity: n((dark ? 0.1 : 0.07) * glow * op, 3), strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
    out += `<path${attrs({ d: prim.d, fill: 'none', stroke: haloC, strokeWidth: n(w * (1 + 1.3 * glow)), strokeOpacity: n((dark ? 0.16 : 0.1) * glow * op, 3), strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
  }
  out += `<path${attrs({ d: prim.d, fill: 'none', stroke: paint, strokeWidth: n(w), strokeOpacity: oo, strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
  return out;
}

const roleColor = {
  line: (k, tone) => (tone === 'off' ? k.colors.dim : k.colors.ink),
  accent: (k, tone) => (tone === 'off' ? k.colors.faint : tone === 'idle' || tone === 'busy' ? k.colors.accent : curtainColors(k, tone)[0]),
  dim: (k, tone) => (tone === 'off' ? k.colors.faint : k.colors.muted),
  spark: (k, tone) => (tone === 'off' ? k.colors.dim : tone === 'idle' || tone === 'busy' ? (k.dark ? k.colors.ink : k.colors.accent) : curtainColors(k, tone)[0]),
};
const haloOf = (k, tone) => (tone === 'off' ? k.colors.dim : curtainColors(k, tone)[0]);

// ── press: a breath on cold glass ────────────────────────────────────────────

function breathPress(k, { pressed, age }) {
  const dur = 0.85;
  if (!pressed && !(age < dur)) return null;
  const C = k.colors, cx = k.w / 2, cy = k.h / 2;
  const e = pressed ? 0 : clamp(age / dur);
  const sink = pressed ? 1 : 1 - outExpo(clamp(age / 0.22));
  const fog = pressed ? 1 : 1 - outCubic(e);
  const hole = pressed ? 0 : outCubic(e) * 1.05;
  const id = k.id('fog');
  const fa = (k.dark ? 0.34 : 0.55) * fog;
  const stops = hole <= 0.001
    ? [[0, C.frost, fa * 1.1], [0.7, C.frost, fa], [1, C.frost, fa * 0.75]]
    : [[0, C.frost, 0], [clamp(hole - 0.22), C.frost, 0], [clamp(hole), C.frost, fa], [1, C.frost, fa * 0.75]];
  k.def(radialGradient(id, stops, { cx: 0.5, cy: 0.5, r: 0.72 }));
  let overlay = rect({ width: k.w, height: k.h, fill: url(id) });
  if (!pressed && e < 1) {
    // the light flares through the cleared glass
    const fl = k.id('flare'), c = haloOf(k, k.toneName === 'off' ? 'idle' : k.toneName);
    k.def(radialGradient(fl, [[0, c, (k.dark ? 0.3 : 0.2) * (1 - e)], [1, c, 0]], { cx: 0.5, cy: 1, r: 0.8 }));
    overlay += rect({ width: k.w, height: k.h, fill: url(fl) });
  }
  const s = 1 - 0.035 * sink;
  return {
    transform: sink > 0.001 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
    under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : '#9aa3bb' }),
    overlay,
  };
}

// ── bespoke glyphs ───────────────────────────────────────────────────────────

const draw = (id) => getGlyph(id)?.draw;
const GLOBE = 'M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10';

const glyphs = {
  /** A frosted globe: the glass is a milky body that fills with light when on. */
  bulb(g, s) {
    if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
    const on = s.state === 'on';
    const k = on ? arrive(s.since, 0.6) : 0;
    g.path(`${GLOBE}Z`, { role: 'fill', opacity: 0.1 + 0.16 * k });
    if (on) g.circle(24, 22.5, 5.5 + 2.5 * k, { role: 'accent', fill: true, opacity: 0.22 * k + 0.12 * k * pulse(s.t, 2.4) });
    g.path(GLOBE);
    g.line(19, 32.5, 19, 35.5);
    g.line(29, 32.5, 29, 35.5);
    g.line(19, 35.5, 29, 35.5);
    g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
    g.path('M21 28.5c0-3 1.4-4.6 3-4.6s3 1.6 3 4.6', { role: on ? 'accent' : 'dim', weight: 0.8 });
    if (on) {
      g.dot(17.6, 17.4, 1.05, { opacity: k });
      g.dot(30.6, 15.6, 0.8, { opacity: k * (0.5 + 0.5 * pulse(s.t + 0.6, 2.4)) });
    }
  },
  /** Three aurora ribbons in place of bars; live, they flow and swell with the level. */
  waveform(g, s) {
    if (s.state !== 'live' && s.state !== 'idle') return draw('waveform')(g, s);
    const on = s.state === 'live';
    const k = on ? arrive(s.since, 0.5) : 0;
    const ph = on ? s.phase(2.4) : 0.15;
    const gain = lerp(0.35, 0.55 + 0.6 * clamp(s.level), k);
    const ribbon = (amp, freq, off, role, weight, opacity) => {
      const pts = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18, x = 8 + 32 * u, env = Math.sin(Math.PI * u);
        pts.push([x, 24 + amp * gain * env * Math.sin(TAU * (u * freq + ph * Math.round(freq) + off))]);
      }
      g.polyline(pts, { role, weight, opacity });
    };
    ribbon(9, 1.5, 0.62, 'dim', 0.7, 0.75);
    ribbon(7, 2, 0.31, 'line', 0.8, 1);
    ribbon(12, 1, 0, on ? 'accent' : 'line', 1.05, 1);
  },
};

export default defineTheme({
  id: 'aurora',
  title: 'Aurora',
  description: 'Frosted keys with the northern lights behind them: soft curtains that rise and flow in the hue when on, lines of light through etched frost, a press that fogs the glass.',
  tags: ['aurora', 'frost', 'glass', 'gradient', 'soft', 'dark', 'light', 'opal'],
  modes: { dark: NIGHT, light: DAY },
  defaultMode: 'dark',
  tones: { idle: 'accent', active: 'tint', busy: 'accent2' },
  roles: {
    line: { color: roleColor.line, width: 2.6, glow: 0.45 },
    fill: { color: roleColor.line, glow: 0.35 },
    accent: { color: roleColor.accent, width: 2.8, glow: 0.8 },
    dim: { color: roleColor.dim, width: 2.2, opacity: 0.85, glow: 0 },
    spark: { color: roleColor.spark, glow: 1 },
  },
  type: {
    eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.14, color: 'muted' },
    label: { size: 11, weight: 600, tracking: 0.015, color: 'ink', baseline: 9.5 },
    value: { size: 22, weight: 600, tabular: true, tracking: -0.02, color: 'ink' },
    hero: { size: 30, weight: 700, tabular: true, tracking: -0.03, color: 'ink' },
    caption: { size: 8.5, weight: 400, color: 'muted' },
  },
  background: pane,
  surface: pane,
  paint(k, prim, style) {
    // halos glow in the aurora's color, not the stroke's
    return paintAurora(k, prim, { ...style, halo: haloOf(k, k.toneName) });
  },
  press: breathPress,
  glyphs,
});

export { pane, paintAurora, ENERGY };
