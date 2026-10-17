// prism — the signature deck theme, "Refraction", implementing the Stream Deck key
// grammar published in design/tokens.json (deck.*, synced into scene/tokens.js):
//
//   material  Night: ink-navy glass lit from the top (radial #161a27 → #0b0d14 → #06070b),
//             a 1 px lit top edge; Day: pearl (#ffffff → #f4f3f8 → #e9e7f1). LCD keys default to Night.
//   index     every key carries its hue as a spectral index: a 16 × 2 bar (@72), 6 above the bottom edge.
//   off       index at 45 %, lit edge only, glyph muted, no glow
//   on        index at 100 % + glow, a 1.5 px inner ring in the hue, glyph in the hue's ink, a 22 % hue wash from the bottom
//   alert     index + 2 px ring in warn / neg, glyph ink, glow breathes 1 Hz (.55 ↔ 1) for 10 s then holds,
//             plus a corner notch (never color alone)
//   busy      no index; a white beam segment travels the perimeter, 1.2 s per lap
//   disabled  no index, no edge, glyph faint
//   press     the key sinks and its edge splits into spectral copies that converge (refraction)
//
// The Lead Designer owns this theme's art direction; this implementation follows the
// published grammar to the letter.

import { defineTheme, defaultPaint, cornerFlag } from './_theme.js';
import { TOKENS } from '../scene/tokens.js';
import { rect, path, polygon, url, linearGradient, radialGradient, n, roundRectPath } from '../scene/svg.js';
import { lerp, clamp, outExpo, pulse, phase } from '../scene/easing.js';

const G = TOKENS.deck;
const pal = (t) => ({
  bg: t.bg, surface: t.glassTop, surface2: t.glassBottom, glassMid: t.glassMid, line: t.line, ink: t.ink, muted: t.muted, dim: t.dim, faint: t.faint,
  accent: t.accent, accent2: t.accent2, pos: t.pos, info: t.info, warn: t.warn, neg: t.neg, crit: t.crit,
  edge: t.edge, edgeOpacity: t.edgeOpacity, beam: t.beam, beamOpacity: t.beamOpacity, spectrum: t.spectrum, stops: t.stops,
});

/** Tone → grammar state. */
export const STATE = { idle: 'off', active: 'on', ok: 'on', info: 'on', warn: 'alert', neg: 'alert', alert: 'alert', crit: 'alert', busy: 'busy', off: 'disabled' };
const stateOf = (tone) => STATE[tone] || 'off';
/** The hue color a tone lights with (vivid tier for the facet hue; semantic colors otherwise). */
const vividOf = (k, tone) => ({ ok: k.colors.pos, info: k.colors.info, warn: k.colors.warn, neg: k.colors.neg, alert: k.colors.neg, crit: k.colors.crit, off: k.colors.faint })[tone] || k.ctx.tint;
/** The glyph ink for a tone (ink tier of the hue when on). */
const inkOf = (k, tone) => {
  const s = stateOf(tone);
  if (s === 'on') return tone === 'active' ? k.theme.ink(k.ctx.hue) : vividOf(k, tone);
  if (s === 'alert') return k.colors.ink;
  if (s === 'disabled') return k.colors.faint;
  return k.colors.muted;
};
/** Seconds-limited breathing for alerts: 1 Hz between .55 and 1 for 10 s, then hold at 1. */
// crit breathes faster: 0.6 s, which divides the common 1.2 / 2.4 / 4.8 / 12 s loops
const breath = (k, tone) => (k.ctx.since >= G.alertBreath.holdAfter || k.ctx.reduced ? 1 : lerp(G.alertBreath.min, G.alertBreath.max, pulse(k.ctx.t, tone === 'crit' ? 0.6 : 1 / G.alertBreath.hz)));

/** The material: glass lit from the top + the lit edge. Works on any rect of a surface. */
function material(k, { x = 0, y = 0, w = k.w, h = k.h, edge = true } = {}) {
  const C = k.colors;
  const id = k.id('glass');
  k.def(radialGradient(id, [[0, C.surface], [0.62, C.glassMid || C.surface2], [1, C.surface2]], { cx: 0.5, cy: 0, r: 1.15, fx: 0.5, fy: 0 }));
  k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
  if (edge) k.add(rect({ x, y, width: w, height: k.m.u, fill: C.edge || '#ffffff', fillOpacity: C.edgeOpacity < 1 ? C.edgeOpacity : null }));
}

/** A radial wash of a color from the bottom (on: 22 %). */
function wash(k, color, peak, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const id = k.id('wash');
  k.def(radialGradient(id, [[0, color, peak], [0.6, color, peak * 0.35], [1, color, 0]], { cx: 0.5, cy: 1.05, r: 0.9 }));
  k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
}

function keyBackground(k, { tone = 'idle' } = {}) {
  const s = stateOf(tone);
  const u = k.m.u, C = k.colors;
  material(k, { edge: s !== 'disabled' });
  if (s === 'disabled') return;
  const color = vividOf(k, tone);
  if (s === 'on') wash(k, color, G.wash);
  if (s === 'alert') wash(k, color, G.wash * breath(k, tone));
  // inner ring
  if (s === 'on' || s === 'alert') {
    const rw = (s === 'on' ? G.ring.on : G.ring.alert) * u;
    k.add(rect({ x: rw / 2, y: rw / 2, width: k.w - rw, height: k.h - rw, rx: k.m.radius, fill: 'none', stroke: color, strokeWidth: rw, strokeOpacity: s === 'alert' ? n(breath(k, tone), 3) : null }));
  }
  // busy: a white beam segment travelling the perimeter, 1.2 s per lap
  if (s === 'busy') {
    const inset = k.m.hair, r = k.m.radius;
    const d = roundRectPath(inset, inset, k.w - inset * 2, k.h - inset * 2, r);
    const per = 2 * (k.w + k.h - inset * 4) - (8 - 2 * Math.PI) * r;
    const seg = per * 0.16;
    const off = -phase(k.ctx.t, G.busyLap) * per;
    k.add(path(d, { fill: 'none', stroke: C.beam || '#ffffff', strokeWidth: k.m.line * 1.6, strokeOpacity: 0.14, strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: n(off), strokeLinecap: 'round' }));
    k.add(path(d, { fill: 'none', stroke: C.beam || '#ffffff', strokeWidth: k.m.line, strokeDasharray: `${n(seg * 0.7)} ${n(per - seg * 0.7)}`, strokeDashoffset: n(off - seg * 0.15), strokeLinecap: 'round' }));
    return;
  }
  // corner notch for alerts — never color alone; hung inside the bezel cut (key grammar: BEZEL_INSET)
  if (s === 'alert') k.add(polygon(cornerFlag(k, G.notch * u), { fill: color }));
  // the spectral index
  const iw = G.index.w * u, ih = G.index.h * u, iy = k.h - G.index.bottom * u - ih / 2;
  const op = s === 'off' ? G.index.offOpacity : 1;
  if (s !== 'off') k.add(rect({ x: k.w / 2 - iw / 2 - G.index.glow * u, y: iy - G.index.glow * u * 0.6, width: iw + G.index.glow * 2 * u, height: ih + G.index.glow * 1.2 * u, rx: (ih + G.index.glow * 1.2 * u) / 2, fill: color, fillOpacity: 0.22 }));
  k.add(rect({ x: k.w / 2 - iw / 2, y: iy, width: iw, height: ih, rx: ih / 2, fill: color, fillOpacity: op < 1 ? op : null }));
}

function panelSurface(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const s = stateOf(tone);
  material(k, { x, y, w, h, edge: s !== 'disabled' });
  if (s === 'on') wash(k, vividOf(k, tone), G.wash * 0.8, { x, y, w, h });
  if (s === 'alert') wash(k, vividOf(k, tone), G.wash * breath(k, tone), { x, y, w, h });
  if (s === 'on' || s === 'alert') {
    const id = k.id('beam'), c = vividOf(k, tone);
    k.def(linearGradient(id, [[0, c, 0], [0.5, c, 1], [1, c, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    k.add(rect({ x: x + k.m.safe, y, width: w - k.m.safe * 2, height: k.m.line, fill: url(id) }));
  }
}

const lit = (tone) => { const s = stateOf(tone); return s === 'on' || s === 'alert'; };

export default defineTheme({
  id: 'prism',
  title: 'Prism',
  description: 'Refraction: ink-navy glass lit from the top (pearl by day), a spectral index on every key, rings and washes of light for on and alert, presses that refract.',
  tags: ['signature', 'glass', 'spectrum', 'dark', 'light'],
  modes: { dark: pal(TOKENS.modes.night), light: pal(TOKENS.modes.day) },
  defaultMode: 'dark',
  tones: { idle: 'tint', active: 'tint', busy: 'muted' },
  roles: {
    line: { color: inkOf, width: 2.6 },
    fill: { color: inkOf },
    accent: { color: (k, tone) => (lit(tone) ? vividOf(k, tone) : stateOf(tone) === 'disabled' ? k.colors.faint : k.colors.dim), width: 2.8, glow: 0.45 },
    dim: { color: (k, tone) => (stateOf(tone) === 'on' && tone === 'active' ? k.theme.ink(k.ctx.hue) : stateOf(tone) === 'disabled' ? k.colors.faint : k.colors.dim), width: 2.2, opacity: 0.85 },
    spark: { color: (k, tone) => (lit(tone) ? vividOf(k, tone) : k.colors.muted), glow: 0.7 },
  },
  type: {
    eyebrow: { size: G.type.micro.size, weight: G.type.micro.weight, caps: G.type.micro.caps, tracking: G.type.micro.tracking, color: 'muted' },
    label: { size: G.type.label.size, weight: G.type.label.weight, tracking: G.type.label.tracking, color: 'ink', baseline: 11 },
    value: { size: G.type.value.size, weight: G.type.value.weight, tracking: G.type.value.tracking, tabular: true, color: 'ink' },
    hero: { size: 30, weight: 700, tracking: -0.03, tabular: true, color: 'ink' },
    caption: { size: G.type.minimum, weight: 400, color: 'muted' },
  },
  background: keyBackground,
  surface: panelSurface,
  /** Glow only while lit: an off key stays matte. */
  paint(k, prim, style) { return defaultPaint(k, prim, lit(k.toneName) ? style : { ...style, glow: 0 }); },
  /** Refraction press: the key sinks; its edge splits into spectral copies that converge into focus. */
  press(k, { pressed, age }) {
    const dur = G.motion.arrive;
    if (!pressed && !(age < dur)) return null;
    const e = pressed ? 1 : 1 - outExpo(clamp(age / dur));
    const s = 1 - 0.045 * e, cx = k.w / 2, cy = k.h / 2;
    const split = k.m.line * 1.6 * e;
    const ring = (dx, hue, op) => rect({ x: k.m.hair + dx, y: k.m.hair, width: k.w - k.m.hair * 2, height: k.h - k.m.hair * 2, rx: k.m.radius, fill: 'none', stroke: k.theme.spectral(hue), strokeWidth: k.m.line, strokeOpacity: n(op * e, 3) });
    const h = k.ctx.hue;
    return {
      transform: `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})`,
      under: rect({ width: k.w, height: k.h, fill: '#000000' }),
      overlay: ring(-split, h - 60, 0.7) + ring(split, h + 60, 0.7) + ring(0, h, 0.9),
    };
  },
});

export { material, wash, vividOf, inkOf, stateOf };
