// paper — ink on warm cotton paper, letterpress. Every key is a small printed card:
// a fibrous stock lit from the top-left, a printed frame rule, and glyphs pressed into
// the sheet — each stroke has an impression lip (the paper's lower edge catching light),
// a soft ink spread, and a crisp core. The second color (the facet's Spectrum hue as a
// spot ink) is printed in its own pass, a hair off register, the way two-color jobs are.
//
//   idle      black ink, the spot color on accents, the frame rule in a light tint, a short
//             color bar printed into the bottom rule (the spectral index)
//   on        a halftone screen of the spot color rising from the bottom, frame + bar in the spot color
//   alert     the corner of the card dog-ears over (its reverse is printed in the alert ink),
//             a double frame rule; the screen breathes for 10 s then holds — never color alone
//   busy      the frame rule becomes a perforation that marches round the card
//   disabled  a proof: no spot color, no frame ink, no color bar — the glyph in a warm gray (≥ 5.8 : 1)
//             with its impression, so an off key stays readable at 72 px
//   press     the platen bites: the card drops a hair and a soft shadow falls in from the top edge
//
// By night it is black cotton card: white ink, accents and frames stamped in metallic foil
// (a press flashes the foil frame).
//
// Bespoke art: clock (an engraved watch face, spade hour hand) and bulb (an Edison lamp
// with engraved shading and a printer's sunburst) — D5.

import { defineTheme, defaultText, bezelCorner } from './_theme.js';
import { rect, path, polygon, url, linearGradient, radialGradient, n, roundRectPath } from '../scene/svg.js';
import { mix } from '../scene/color.js';
import { clamp, lerp, outCubic, pulse, phase, arrive } from '../scene/easing.js';
import { layeredPaint, strokeA, fillA, halftone, fibers, strHash } from './_d5-print.js';
import { capHeight, wrapText } from '../scene/text.js';
import { getGlyph } from '../glyphs/_registry.js';

const DAY = {
  bg: '#e4d9c6', surface: '#f7f2e7', surface2: '#ede4d1', line: '#d6c8ad',
  ink: '#1d1a16', muted: '#5a5043', dim: '#6e6354',
  accent: '#c23b22', accent2: '#24508c', pos: '#3a6b2a', info: '#245b9a', warn: '#9b5f00', neg: '#b52a1c', crit: '#8e1b3d',
  edge: '#ffffff', edgeOpacity: 0.8, beam: '#c23b22', beamOpacity: 0.5, sheenOpacity: 0,
  spectrum: { l: 0.5, c: 0.13 },
  shadow: '#6f5d42', fiber: '#8d7a5c', under: '#b9ab92', proof: '#5f5547',
};
const NIGHT = {
  bg: '#0c0b0a', surface: '#1d1b18', surface2: '#141311', line: '#3a352d',
  ink: '#f3ecdc', muted: '#bcb19d', dim: '#9a8f7d',
  accent: '#d9935e', accent2: '#e3c27a', pos: '#9cc58a', info: '#8fb5e8', warn: '#e8b45a', neg: '#ef7a62', crit: '#f06b8d',
  edge: '#f3ecdc', edgeOpacity: 0.09, beam: '#d9935e', beamOpacity: 0.5, sheenOpacity: 0,
  spectrum: { l: 0.76, c: 0.11 },
  shadow: '#000000', fiber: '#d8ccb4', under: '#000000', proof: '#b0a593',
};

/** Tone → printed state. */
const STATE = { idle: 'idle', active: 'on', ok: 'on', info: 'on', warn: 'alert', neg: 'alert', alert: 'alert', crit: 'alert', busy: 'busy', off: 'blind' };
const stateOf = (tone) => STATE[tone] || 'idle';
/** The spot ink a tone prints in. */
const inkOf = (k, tone) => (tone === 'idle' || tone === 'active' ? k.ctx.tint : k.tone(tone));
/** Alerts breathe 1 Hz for 10 s, then hold. */
const breath = (k) => (k.ctx.since >= 10 || k.ctx.reduced ? 1 : lerp(0.55, 1, pulse(k.ctx.t, 1)));

// registration (grid units): the spot pass lands a hair right / up; the impression lip sits below
const MIS = [0.55, -0.4], LIP = 0.8;

/** Metallic foil (night): a diagonal sheen across the 48-unit glyph box, memoized per color. */
function foil(k, c) {
  const memo = k._d5foil || (k._d5foil = new Map());
  let id = memo.get(c);
  if (!id) {
    id = k.id('foil');
    k.def(linearGradient(id, [[0, mix(c, '#ffffff', 0.5)], [0.34, c], [0.6, mix(c, '#000000', 0.3)], [0.82, mix(c, '#ffffff', 0.28)], [1, c]], { x1: 8, y1: 6, x2: 40, y2: 42, gradientUnits: 'userSpaceOnUse' }));
    memo.set(c, id);
  }
  return url(id);
}
/** Foil on a panel rect (frames, bars). */
function foilRect(k, c, { x, y, w, h }) {
  const id = k.id('foilr');
  k.def(linearGradient(id, [[0, mix(c, '#ffffff', 0.45)], [0.4, c], [0.62, mix(c, '#000000', 0.28)], [1, mix(c, '#ffffff', 0.2)]], { x1: n(x), y1: n(y), x2: n(x + w), y2: n(y + h), gradientUnits: 'userSpaceOnUse' }));
  return url(id);
}

// ── the card ────────────────────────────────────────────────────────────────

/** The stock: paper lit from the top-left (one gradient), fibers + flecks, a lit top edge and a soft lower edge. */
function stock(k, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const C = k.colors, u = k.m.u, key = k.ctx.kind === 'key';
  const g = k.id('stock');
  k.def(radialGradient(g, [[0, k.dark ? C.surface : mix(C.surface, '#ffffff', 0.45)], [0.5, C.surface], [1, C.surface2]], { cx: 0.2, cy: 0, r: 1.25, gradientTransform: w > h * 1.6 ? `scale(${n(h / w, 3)} 1)` : null }));
  k.add(rect({ x, y, width: w, height: h, fill: url(g) }));
  const count = key ? Math.round(5 + Math.min(w, h) / 18) : Math.min(26, Math.round(6 + (w * h) / 4200));
  const tex = fibers(strHash(k.idPrefix) ^ Math.round(w * 31 + h), { x, y, w, h, count, len: 7 * u, fleck: Math.max(0.5, 0.45 * u) });
  k.add(path(tex.fibers, { fill: 'none', stroke: C.fiber, strokeWidth: n(Math.max(0.5, 0.32 * u)), strokeOpacity: k.dark ? 0.1 : 0.16, strokeLinecap: 'round' }));
  if (tex.flecks) k.add(path(tex.flecks, { fill: C.fiber, fillOpacity: k.dark ? 0.14 : 0.26 }));
  // card edge: lit top, soft shadow along the bottom
  k.add(rect({ x, y, width: w, height: k.m.hair, fill: C.edge, fillOpacity: C.edgeOpacity }));
  k.add(rect({ x, y: y + h - 1.6 * u, width: w, height: 1.6 * u, fill: C.shadow, fillOpacity: k.dark ? 0.3 : 0.07 }));
  k.add(rect({ x, y: y + h - 0.7 * u, width: w, height: 0.7 * u, fill: C.shadow, fillOpacity: k.dark ? 0.3 : 0.07 }));
}

/** The printed frame rule (+ its color bar) for a state. */
function frame(k, s, color, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const C = k.colors, u = k.m.u;
  const fi = 4.25 * u, r = Math.max(1.5 * u, k.m.radius - fi * 0.85);
  const d = roundRectPath(x + fi, y + fi, w - fi * 2, h - fi * 2, r);
  const hw = Math.max(1, 0.62 * u);
  if (s === 'blind') {
    k.add(path(d, { fill: 'none', stroke: '#ffffff', strokeWidth: n(hw * 1.3), strokeOpacity: k.dark ? 0.06 : 0.9, transform: `translate(0 ${n(0.55 * u)})` }));
    k.add(path(d, { fill: 'none', stroke: C.shadow, strokeWidth: n(hw), strokeOpacity: k.dark ? 0.5 : 0.16 }));
    return;
  }
  if (s === 'busy') {
    const per = 2 * (w + h - fi * 4) - (8 - 2 * Math.PI) * r;
    const dash = 2.4 * u, gap = 1.6 * u;
    const steps = Math.max(1, Math.round(per / (dash + gap)));
    const cell = per / steps;
    k.add(path(d, { fill: 'none', stroke: C.muted, strokeWidth: n(hw * 1.2), strokeOpacity: 0.8, strokeDasharray: `${n(cell * 0.6)} ${n(cell * 0.4)}`, strokeDashoffset: n(-phase(k.ctx.t, 0.8) * cell), strokeLinecap: 'butt' }));
    return;
  }
  const lit = s === 'on' || s === 'alert';
  const paint = k.dark && lit ? foilRect(k, color, { x: x + fi, y: y + fi, w: w - fi * 2, h: h - fi * 2 }) : lit ? color : C.muted;
  const op = s === 'alert' ? 0.65 + 0.35 * breath(k) : lit ? 0.95 : (k.dark ? 0.32 : 0.36);
  k.add(path(d, { fill: 'none', stroke: paint, strokeWidth: n(lit ? hw * 1.45 : hw), strokeOpacity: op < 1 ? n(op, 3) : null }));
  if (s === 'alert') {
    const i2 = fi + 1.9 * u;
    k.add(path(roundRectPath(x + i2, y + i2, w - i2 * 2, h - i2 * 2, Math.max(1, r - 1.9 * u)), { fill: 'none', stroke: paint, strokeWidth: n(hw * 0.7), strokeOpacity: n(op * 0.85, 3) }));
    return;
  }
  // the color bar: the spectral index printed into the bottom rule (keys only — panels carry their own marks)
  if (k.ctx.kind !== 'key') return;
  const bw = (s === 'on' ? 16 : 12) * u, bh = (s === 'on' ? 2.2 : 1.7) * u;
  const bx = x + w / 2 - bw / 2, by = y + h - fi - bh / 2;
  k.add(rect({ x: bx - 1.2 * u, y: by - 0.3 * u, width: bw + 2.4 * u, height: bh + 0.6 * u, fill: C.surface2 }));
  k.add(rect({ x: bx, y: by, width: bw, height: bh, fill: k.dark && s === 'on' ? foilRect(k, k.ctx.tint, { x: bx, y: by, w: bw, h: bh }) : k.ctx.tint, fillOpacity: s === 'on' ? null : 0.7 }));
}

/** A dog-eared corner: the tip folds down along the diagonal; its reverse is printed in the alert ink. */
function dogEar(k, color, { x = 0, y = 0, w = k.w } = {}) {
  // the fold hangs from the bezel-safe corner (key grammar: BEZEL_INSET): the bezel cuts the card's real corner off
  const C = k.colors, s = Math.min(14 * k.m.u, w * 0.2);
  const bz = bezelCorner(k, { x, y, w, h: k.h }), X = bz.X;
  y = bz.Y;
  k.add(polygon([[X - s, y], [X, y], [X, y + s]], { fill: k.dark ? '#000000' : mix(C.surface2, C.shadow, 0.28) }));
  k.add(polygon([[X - s + 0.6 * k.m.u, y + 0.9 * k.m.u], [X + 0.4 * k.m.u, y + s + 1.1 * k.m.u], [X - s + 0.6 * k.m.u, y + s + 1.1 * k.m.u]], { fill: C.shadow, fillOpacity: k.dark ? 0.6 : 0.22 }));
  const fl = k.id('flap');
  k.def(linearGradient(fl, [[0, mix(color, '#ffffff', k.dark ? 0.1 : 0.25)], [1, mix(color, '#000000', 0.12)]], { x1: 1, y1: 0, x2: 0, y2: 1 }));
  k.add(polygon([[X - s, y], [X, y + s], [X - s, y + s]], { fill: url(fl) }));
  k.add(path(`M${n(X - s)} ${n(y)}L${n(X)} ${n(y + s)}`, { stroke: '#ffffff', strokeWidth: n(Math.max(0.75, 0.4 * k.m.u)), strokeOpacity: k.dark ? 0.25 : 0.7 }));
}

function card(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const s = stateOf(tone), color = inkOf(k, tone), u = k.m.u;
  stock(k, { x, y, w, h });
  if (s === 'on' || s === 'alert') {
    // a halftone of the spot ink: keys screen the whole card, panels a band along the bottom
    const fi = 4.25 * u, key = k.ctx.kind === 'key';
    const scr = key ? { pitch: Math.max(4, 0.1 * Math.min(w, h)), from: 0.12, maxR: 0.32, gamma: 1 } : { pitch: Math.max(5, 0.075 * h), from: 0.5, maxR: 0.3, gamma: 1.2 };
    k.add(halftone({ x: x + fi, y: y + fi, w: w - fi * 2, h: h - fi * 2, ...scr, color, opacity: (k.dark ? 0.5 : 0.42) * (s === 'alert' ? breath(k) : 1) }));
  }
  frame(k, s, color, { x, y, w, h });
  if (s === 'alert') dogEar(k, color, { x, y, w });
}

// ── role painting: impression lip, ink spread, core; the spot pass off register ──

function paintPrint(k, pen, { tone, styleOf }) {
  const C = k.colors, s = stateOf(tone), night = k.dark;
  return layeredPaint(pen, (p) => {
    const st = styleOf(p);
    const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
    if (op < 0.01) return [];
    const w = (st.width ?? 2.6) * (p.weight ?? 1);
    const so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
    const fillish = p.fill;
    const A = (color, width, o) => (fillish ? fillA(color, o) : strokeA(color, width, o, so));
    if (s === 'blind') {
      // disabled: no spot ink, no ink spread — a pale proof impression (dim ink, ≥ 3:1) with its lit lip
      const out = [{ layer: 3, a: A(C.proof, w * 0.92, op) }];
      if (!night) out.unshift({ layer: 0, a: A('#ffffff', w, op) });
      return out;
    }
    const spot = p.role === 'accent' || p.role === 'spark';
    const color = spot && night ? foil(k, st.color) : st.color;
    if (p.role === 'spark') return [{ layer: 5, a: fillA(color, op) }];
    const out = [];
    if (!night) out.push({ layer: spot ? 1 : 0, a: A('#ffffff', w, (spot ? 0.7 : 0.9) * op) });
    if (!spot && p.role !== 'dim') out.push({ layer: 2, a: fillish ? { ...strokeA(st.color, night ? 1.4 : 0.9, (night ? 0.16 : 0.2) * op, so) } : strokeA(st.color, w + (night ? 1.5 : 0.9), (night ? 0.13 : 0.17) * op, so) });
    out.push({ layer: spot ? 4 : 3, a: A(color, w, (spot ? 0.95 : 1) * op) });
    return out;
  }, { layers: 6, offsets: { 0: [0, s === 'blind' ? 0.9 : LIP], 1: [MIS[0], MIS[1] + LIP], 4: MIS, 5: MIS } });
}

// ── type: letterpress small caps; on lit cards the screen is knocked out behind the label ──

function printText(k, role, str, o = {}) {
  const ink = defaultText(k, role, str, o);
  const s = stateOf(k.toneName);
  if (ink && role === 'label' && k.ctx.kind === 'key' && (s === 'on' || s === 'alert')) return knockout(k, str, o) + ink;
  return ink;
}

/** The screen is knocked out behind a label: a clean band of stock across the card. */
function knockout(k, str, o) {
  const st = k.typeStyle('label', o), u = k.m.u;
  const by = o.y ?? k.h - (st.baseline ?? 6.5) * u;
  const lines = (o.maxLines || 1) > 1 ? wrapText(str, { maxWidth: o.maxWidth ?? k.w - (k.m.text ?? k.m.safe) * 2, size: st.size, minSize: st.size * 0.8, maxLines: o.maxLines, weight: st.weight, tracking: st.tracking, caps: st.caps }) : null;
  const n0 = lines ? lines.lines.length : 1, lh = lines ? lines.lineHeight : 0;
  const top = by - capHeight(st.size, st.weight) - (n0 - 1) * lh - 2.4 * u, bot = by + 2.2 * u;
  const fi = 4.25 * u + Math.max(1, 0.62 * u) * 0.75;
  const g = k.id('ko');
  k.def(linearGradient(g, [[0, k.colors.surface2, 0], [0.12, k.colors.surface2], [0.88, k.colors.surface2], [1, k.colors.surface2, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
  return rect({ x: fi, y: top, width: k.w - fi * 2, height: bot - top, fill: url(g) });
}

// ── bespoke glyphs ───────────────────────────────────────────────────────────

const original = (id) => getGlyph(id)?.draw;

export default defineTheme({
  id: 'paper',
  title: 'Paper',
  description: 'Ink on warm cotton paper: letterpress cards with impressed glyphs, a spot color printed off register, halftone screens for on, dog-eared alerts. By night, white ink and foil on black card.',
  tags: ['light', 'print', 'letterpress', 'paper', 'halftone', 'foil', 'warm'],
  modes: { light: DAY, dark: NIGHT },
  defaultMode: 'light',
  tones: { idle: 'tint', active: 'tint', busy: 'muted', off: 'dim' },
  roles: {
    line: { color: (k, tone) => (stateOf(tone) === 'blind' ? k.colors.proof : k.colors.ink), width: 2.7 },
    fill: { color: (k, tone) => (stateOf(tone) === 'blind' ? k.colors.proof : k.colors.ink) },
    accent: { color: (k, tone) => inkOf(k, tone), width: 2.8 },
    dim: { color: (k) => mix(k.colors.ink, k.colors.surface, k.dark ? 0.38 : 0.45), width: 2.1, opacity: 0.95 },
    spark: { color: (k, tone) => inkOf(k, tone) },
  },
  type: {
    eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.18, color: 'muted' },
    label: { size: 10, weight: 600, caps: true, tracking: 0.08, color: 'ink', baseline: 10 },
    value: { size: 22, weight: 600, tabular: true, tracking: -0.01, color: 'ink' },
    hero: { size: 30, weight: 700, tabular: true, tracking: -0.03, color: 'ink' },
    caption: { size: 8.5, weight: 400, color: 'muted' },
  },
  background: card,
  surface: card,
  paintGlyph: paintPrint,
  text: printText,
  glyphBox(k, { labeled }) {
    const m = Math.min(k.w, k.h);
    const size = labeled ? m * 0.54 : m * 0.7;
    return { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.41 : k.h / 2) - size / 2, size };
  },
  /** The platen bites: the card drops a hair, a soft shadow falls in from the top edge (night: the foil frame flashes). */
  press(k, { pressed, age }) {
    const dur = 0.36;
    if (!pressed && !(age < dur)) return null;
    const e = pressed ? 1 : 1 - outCubic(clamp(age / dur));
    const C = k.colors, u = k.m.u;
    const bite = k.id('bite'), side = k.id('bites');
    k.def(linearGradient(bite, [[0, C.shadow, (k.dark ? 0.7 : 0.34) * e], [0.12, C.shadow, (k.dark ? 0.3 : 0.1) * e], [0.36, C.shadow, 0]]));
    k.def(linearGradient(side, [[0, C.shadow, (k.dark ? 0.4 : 0.16) * e], [0.07, C.shadow, 0], [0.93, C.shadow, 0], [1, C.shadow, (k.dark ? 0.3 : 0.08) * e]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    let overlay = rect({ width: k.w, height: k.h, fill: url(bite) }) + rect({ width: k.w, height: k.h, fill: url(side) });
    if (k.dark) {
      const fi = 4.25 * u;
      overlay += rect({ x: fi, y: fi, width: k.w - fi * 2, height: k.h - fi * 2, rx: Math.max(1.5 * u, k.m.radius - fi * 0.85), fill: 'none', stroke: foilRect(k, k.ctx.tint, { x: 0, y: 0, w: k.w, h: k.h }), strokeWidth: n(Math.max(1.2, 1.1 * u)), strokeOpacity: n(e, 3) });
    }
    return { transform: `translate(0 ${n(0.9 * u * e)})`, under: rect({ width: k.w, height: k.h, fill: C.under }), overlay };
  },
  glyphs: {
    /** An engraved watch face: a heavy case, a hairline chapter ring, twelve hour marks, a spade hour hand. */
    clock(g, s) {
      g.circle(24, 24, 17, { weight: 1.05 });
      g.circle(24, 24, 13.6, { role: 'dim', weight: 0.38 });
      for (let i = 0; i < 12; i++) {
        const a = i * 30, major = i % 3 === 0;
        const [x1, y1] = g.polar(24, 24, major ? 10.2 : 11.8, a), [x2, y2] = g.polar(24, 24, 13.6, a);
        g.line(x1, y1, x2, y2, { role: major ? 'line' : 'dim', weight: major ? 0.72 : 0.42, cap: 'butt' });
      }
      const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
      const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
      const ha = h * 30, ma = m * 6;
      const ax = (r) => g.polar(24, 24, r, ha);
      const side = (r, d) => { const [x, y] = ax(r); return g.polar(x, y, d, ha + 90); };
      g.polygon([g.polar(24, 24, 2.2, ha + 180), side(4.4, 1.9), ax(9.4), side(4.4, -1.9)], { role: 'fill', join: 'round' });
      const [mx, my] = g.polar(24, 24, 12.6, ma), [tx, ty] = g.polar(24, 24, 3, ma + 180);
      g.line(tx, ty, mx, my, { role: 'accent', weight: 0.6 });
      g.circle(24, 24, 1.7, { role: 'fill' });
      g.dot(24, 24, 0.7);
    },
    /** An Edison lamp: engraved shading on the glass, a looped filament, and — lit — a printer's sunburst. */
    bulb(g, s) {
      if (s.state !== 'on' && s.state !== 'off') return original('bulb')(g, s);
      const on = s.state === 'on';
      g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
      g.arc(24, 22.5, 8, 238, 300, { role: 'dim', weight: 0.42 });
      g.arc(24, 22.5, 6.3, 246, 290, { role: 'dim', weight: 0.36 });
      g.line(19, 32.5, 19, 35.5);
      g.line(29, 32.5, 29, 35.5);
      g.line(19, 35.5, 29, 35.5);
      g.line(19.8, 37.6, 28.2, 37.6, { role: 'dim', weight: 0.8 });
      g.line(21.5, 39.8, 26.5, 39.8, { role: 'dim' });
      g.path('M21.6 32.5V27.6c0-2.3 1.1-3.4 2.4-3.4s2.4 1.1 2.4 3.4V32.5', { role: on ? 'accent' : 'dim', weight: 0.72 });
      if (on) {
        const k = arrive(s.since, 0.45);
        [-72, -48, -24, 0, 24, 48, 72].forEach((a, i) => {
          const long = i % 2 === 0, r0 = 12.8, r1 = r0 + (long ? 3.2 : 1.9) * k;
          const [x1, y1] = g.polar(24, 22.5, r0, a), [x2, y2] = g.polar(24, 22.5, r1, a);
          if (k > 0.02) g.line(x1, y1, x2, y2, { role: 'accent', weight: long ? 0.62 : 0.5 });
        });
      }
    },
  },
});

export { stock as paperStock, card as paperCard };
