// blueprint — white linework on a blue grid, with dimension marks (D3).
//
//   material  Night ("Cyanotype"): every key is a sheet of Prussian-blue print — a fine
//             drafting grid (minor lines, a major line every four), center lines through
//             the glyph, a hairline sheet border, a soft print vignette. Day ("Whiteprint"):
//             the diazo inverse — deep-blue linework on cool white paper.
//   roles     line = object lines in white technical-pen ink with a faint cyanotype bleed ·
//             dim = hidden lines, dashed · fill = section fills, 45° hatched inside an
//             outline · accent = the tone in pencil-bright ink · spark = a center mark (+).
//             Every glyph is measured: extension lines, a dimension line with oblique
//             ticks above it and another down its right side.
//   states    off — a faded print (lines and grid wash out) · idle — the drawing ·
//             on — the sheet border and the registration marks light in the hue, the
//             glyph's accent inks in · alert — a revision delta in the corner (the
//             drafting mark for "changed", never color alone), breathing 1 Hz for 10 s ·
//             busy — a T-square slides down the sheet, 1.2 s a pass.
//   press     held, the key sinks and crop marks close in at the corners; released, the
//             marks spring out and the pen plotter redraws the glyph stroke by stroke.
//   type      technical lettering: Inter caps, wide tracking, the label in a title block.
//   bespoke   clock (a drafted dial with an angular dimension between the hands),
//             bulb (a lamp drawn in section: hatched base, dashed filament) and cpu
//             (a package footprint with its pin pitch dimensioned).

import { defineTheme, defaultText, bezelCorner } from './_theme.js';
import { rect, path, polygon, url, linearGradient, radialGradient, n, P, attrs } from '../scene/svg.js';
import { textPath, fitText, capHeight } from '../scene/text.js';
import { clamp, lerp, outCubic, outExpo, pulse, phase, arrive } from '../scene/easing.js';
import { pathBounds, flattenPath } from '../scene/geom.js';
import { getGlyph } from '../glyphs/_registry.js';

const CYANOTYPE = {
  bg: '#061733', surface: '#14407a', surface2: '#0b2a57', line: '#2d5d9c',
  ink: '#f4f8ff', muted: '#c4d6f3', dim: '#93b2de', faint: '#6286bb',
  accent: '#a6e4ff', accent2: '#ffd892', pos: '#a8f3c9', info: '#c4e6ff', warn: '#ffd77f', neg: '#ffaa9c', crit: '#ffa6d4',
  grid: '#dcebff', gridMinor: 0.075, gridMajor: 0.15,
  edge: '#ffffff', edgeOpacity: 0.3, beam: '#ffffff', beamOpacity: 0.9, sheenOpacity: 0,
  spectrum: { l: 0.87, c: 0.11 },
};
const WHITEPRINT = {
  bg: '#e4e9f1', surface: '#f6f8fb', surface2: '#e7edf5', line: '#c4d0e2',
  ink: '#0d2f66', muted: '#33548a', dim: '#5b78a6', faint: '#93a7c6',
  accent: '#1663c7', accent2: '#c2410c', pos: '#14703f', info: '#1257a6', warn: '#8a5900', neg: '#b42318', crit: '#a3195b',
  grid: '#1d4e89', gridMinor: 0.07, gridMajor: 0.13,
  edge: '#ffffff', edgeOpacity: 0.9, beam: '#1663c7', beamOpacity: 0.6, sheenOpacity: 0,
  spectrum: { l: 0.5, c: 0.15 },
};

const LIT = new Set(['active', 'ok', 'info']);
/** The title block's top rule sits this far above a key's bottom edge (@72 units). */
const TITLE = 19;
const ALERT = new Set(['warn', 'neg', 'alert', 'crit']);
const breath = (k) => (k.ctx.since >= 10 || k.ctx.reduced ? 1 : lerp(0.5, 1, pulse(k.ctx.t, 1)));
/** Faded print: off keys wash out. */
const fade = (tone) => (tone === 'off' ? 0.8 : 1);
/** The grid and furniture fade further on off keys. */
const gridFade = (tone) => (tone === 'off' ? 0.5 : 1);

/** The color a state marks the sheet with (border, registration, delta). */
const markOf = (k, tone) => (tone === 'active' ? k.ctx.tint : LIT.has(tone) || ALERT.has(tone) ? k.tone(tone) : k.colors.dim);

/** A crisp 1-device-px line position. */
const crisp = (v, w) => (Math.round(w) % 2 ? Math.floor(v) + 0.5 : Math.round(v));

/** The drafting grid over a rect, aligned to device pixels; centered on (ox, oy). */
export function draftGrid(k, { x = 0, y = 0, w = k.w, h = k.h, ox = x + w / 2, oy = y + h / 2, opacity = 1 } = {}) {
  const C = k.colors, u = k.m.u;
  const pitch = Math.max(4, Math.round(6 * u));
  const lw = Math.max(1, Math.round(k.m.hair));
  let minor = '', major = '';
  const i0x = Math.ceil((x - ox) / pitch), i1x = Math.floor((x + w - ox) / pitch);
  for (let i = i0x; i <= i1x; i++) { const px = crisp(ox + i * pitch, lw); const s = `M${n(px)} ${n(y)}V${n(y + h)}`; if (i % 4 === 0) major += s; else minor += s; }
  const i0y = Math.ceil((y - oy) / pitch), i1y = Math.floor((y + h - oy) / pitch);
  for (let i = i0y; i <= i1y; i++) { const py = crisp(oy + i * pitch, lw); const s = `M${n(x)} ${n(py)}H${n(x + w)}`; if (i % 4 === 0) major += s; else minor += s; }
  if (minor) k.add(path(minor, { fill: 'none', stroke: C.grid, strokeWidth: lw, strokeOpacity: n(C.gridMinor * opacity, 3) }));
  if (major) k.add(path(major, { fill: 'none', stroke: C.grid, strokeWidth: lw, strokeOpacity: n(C.gridMajor * opacity, 3) }));
  return pitch;
}

/** The print: paper / cyanotype with a soft vignette. */
function printBase(k, { x = 0, y = 0, w = k.w, h = k.h, tone = 'idle' }) {
  const C = k.colors;
  const id = k.id('print');
  k.def(radialGradient(id, [[0, C.surface], [0.7, k.dark ? C.surface : C.surface], [1, C.surface2]], { cx: 0.42, cy: 0.36, r: 0.95 }));
  k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
  if (k.dark && tone !== 'off') {
    // the cyanotype's uneven exposure: a faint cooler drift across the sheet
    const ex = k.id('expose');
    k.def(linearGradient(ex, [[0, '#2a6bb8', 0.18], [0.5, '#2a6bb8', 0], [1, '#03122e', 0.3]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(ex) }));
  }
}

/** L-shaped registration / crop marks at the four corners of a rect (inset i, arm a). */
function cornerMarks(x, y, w, h, i, a) {
  const p = P();
  p.M(x + i, y + i + a).V(y + i).H(x + i + a);
  p.M(x + w - i - a, y + i).H(x + w - i).V(y + i + a);
  p.M(x + w - i, y + h - i - a).V(y + h - i).H(x + w - i - a);
  p.M(x + i + a, y + h - i).H(x + i).V(y + h - i - a);
  return p.d;
}

/** The sheet: print, grid, center lines, border, state marks. */
function sheet(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const C = k.colors, u = k.m.u, key = k.ctx.kind === 'key';
  const f = fade(tone);
  printBase(k, { x, y, w, h, tone });
  // the glyph center (labeled keys sit their glyph at 42%)
  const gy = key ? y + h * 0.42 : y + h / 2;
  draftGrid(k, { x, y, w, h, ox: x + w / 2, oy: gy, opacity: gridFade(tone) });
  const lw = Math.max(1, Math.round(k.m.hair));
  if (key) {
    // center lines (long dash, short dash) through the glyph center
    const cx = crisp(x + w / 2, lw), cy = crisp(gy, lw), inset = k.m.bleed * 1.6;
    const dash = `${n(7 * u)} ${n(1.6 * u)} ${n(1.4 * u)} ${n(1.6 * u)}`;
    k.add(path(`M${n(cx)} ${n(y + inset)}V${n(y + h * 0.74)}M${n(x + inset)} ${n(cy)}H${n(x + w - inset)}`, { fill: 'none', stroke: C.grid, strokeWidth: lw, strokeOpacity: n(0.2 * gridFade(tone), 3), strokeDasharray: dash }));
  }
  // sheet border
  const b = Math.round(k.m.bleed);
  const lit = LIT.has(tone) || ALERT.has(tone);
  const mark = markOf(k, tone);
  const bw = lit ? Math.max(1, Math.round(k.m.line)) : lw;
  const bo = ALERT.has(tone) ? breath(k) : 1;
  k.add(rect({ x: crisp(x + b, bw), y: crisp(y + b, bw), width: Math.round(w - b * 2), height: Math.round(h - b * 2), fill: 'none', stroke: lit ? mark : C.ink, strokeWidth: bw, strokeOpacity: n(lit ? 0.9 * bo : 0.32 * f, 3) }));
  if (lit) {
    // registration marks just inside the border + a soft wash of the hue
    const ri = key ? b + k.m.line * 2.2 : b;                 // panels: on the border corners, clear of their eyebrows
    k.add(path(cornerMarks(x, y, w, key ? h - TITLE * u - ri + b * 0.5 : h, ri, Math.max(3, 4.5 * u)), { fill: 'none', stroke: mark, strokeWidth: n(Math.max(1, k.m.line)), strokeOpacity: n(bo, 3), strokeLinecap: 'square' }));
    const wid = k.id('wash');
    k.def(radialGradient(wid, [[0, mark, (k.dark ? 0.22 : 0.12) * bo], [1, mark, 0]], { cx: 0.5, cy: key ? 0.42 : 0.5, r: 0.62 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(wid) }));
  }
  if (ALERT.has(tone)) {
    // revision delta: a triangle with a bar, top-right
    // kept inside the bezel cut (key grammar: BEZEL_INSET)
    const s = Math.min(w, h) * 0.2, bz = bezelCorner(k, { x, y, w, h });
    const tx = Math.min(x + w - b - s * 0.62, bz.X - s * 0.58), ty = Math.max(y + b + s * 0.16, bz.Y);
    const tri = [[tx, ty + s * 0.5], [tx + s * 0.29, ty], [tx + s * 0.58, ty + s * 0.5]];
    k.add(polygon(tri, { fill: mark, fillOpacity: n(0.9 * bo, 3), stroke: mark, strokeWidth: n(k.m.hair), strokeLinejoin: 'round' }));
    k.add(path(P().M(tx + s * 0.29, ty + s * 0.16).V(ty + s * 0.33).d, { stroke: k.dark ? C.surface2 : '#ffffff', strokeWidth: n(Math.max(1, s * 0.07)), strokeLinecap: 'round' }));
  }
  if (tone === 'busy') {
    // a T-square slides down the sheet
    const f2 = k.ctx.reduced ? 0.5 : phase(k.ctx.t, 1.2);
    const ty = crisp(y + b + 2 + (h - b * 2 - 4) * f2, lw);
    const gid = k.id('tsq');
    k.def(linearGradient(gid, [[0, C.ink, 0], [0.12, C.ink, 0.85], [0.88, C.ink, 0.85], [1, C.ink, 0]], { x1: 0, y1: 0, x2: 1, y2: 0 }));
    k.add(rect({ x: x + b, y: ty - lw / 2, width: w - b * 2, height: Math.max(1, k.m.line), fill: url(gid) }));
    k.add(rect({ x: x + b, y: ty - 3 * u, width: Math.max(2, 2.2 * u), height: 6 * u, fill: C.ink, fillOpacity: 0.8 }));
  }
}

// ── role painting ────────────────────────────────────────────────────────────

const lengths = new Map();
function lengthOf(d) {
  let L = lengths.get(d);
  if (L === undefined) {
    L = 0;
    for (const pl of flattenPath(d, 0.5)) {
      for (let i = 1; i < pl.pts.length; i++) L += Math.hypot(pl.pts[i][0] - pl.pts[i - 1][0], pl.pts[i][1] - pl.pts[i - 1][1]);
      if (pl.closed && pl.pts.length > 1) L += Math.hypot(pl.pts[0][0] - pl.pts.at(-1)[0], pl.pts[0][1] - pl.pts.at(-1)[1]);
    }
    if (lengths.size > 4000) lengths.clear();
    lengths.set(d, L);
  }
  return L;
}

/** The plotter redraw after a release: 0 → 1 over 0.5 s (1 when not replotting). */
const plot = (k) => { const a = k.ctx.pressAge; return k.ctx.kind === 'key' && !k.ctx.pressed && a < 0.65 && !k.ctx.reduced ? clamp(a / 0.65) : 1; };

/** Grid-unit size of one device pixel inside a glyph box (approximate: the labeled box). */
const pxUnit = (k) => 48 / (Math.min(k.w, k.h) * 0.56);

function paintBlueprint(k, prim, style, i = 0) {
  const tone = k.toneName, dark = k.dark;
  const op = clamp((style.opacity ?? 1) * (prim.opacity ?? 1)) * fade(tone);
  if (op < 0.005) return '';
  const w = (style.width ?? 2.2) * (prim.weight ?? 1);
  const cap = prim.cap || style.cap || 'round', join = prim.join || style.join || 'round';
  const c = style.color;
  const oo = op < 0.999 ? n(op, 3) : null;
  const px = pxUnit(k);
  const pl = plot(k);
  // plotter redraw: strokes reveal in sequence, fills appear as their outline closes
  const L = pl < 1 ? lengthOf(prim.d) : 0;
  const local = pl < 1 ? outCubic(clamp(pl * 1.5 - (i % 7) * 0.07)) : 1;
  const reveal = (attrsIn) => (local < 1 && L > 0 && !attrsIn.strokeDasharray ? { ...attrsIn, strokeDasharray: `${n(L * local)} ${n(L + 1)}` } : attrsIn);
  let out = '';
  if (prim.role === 'spark') {
    const b = pathBounds(prim.d);
    const r = Math.max(b.w, b.h) / 2;
    if (/A/.test(prim.d) && r < 3.5 && Math.abs(b.w - b.h) < 0.6) {
      // a center mark: crosshair + a small circle
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = r * 2.3 + 1.2;
      out += `<path${attrs({ d: P().M(cx - R, cy).H(cx + R).M(cx, cy - R).V(cy + R).d, fill: 'none', stroke: c, strokeWidth: n(Math.max(px, 0.9)), strokeOpacity: n(op * 0.9, 3) })}/>`;
      out += `<path${attrs({ d: prim.d, fill: c, fillOpacity: n(op * local, 3) })}/>`;
      return out;
    }
  }
  if (prim.fill) {
    const b = pathBounds(prim.d);
    const subpaths = (prim.d.match(/M/g) || []).length;
    const big = !prim.text && b.w > 6 && b.h > 6 && subpaths <= 3 && Math.min(k.w, k.h) >= 96;
    if (!big) {
      // small keys / lettering: a solid section (lighter body + crisp outline reads as a fill on the print)
      const solid = prim.text || b.w <= 6 || b.h <= 6 || subpaths > 3;
      out += `<path${attrs({ d: prim.d, fill: c, fillOpacity: n(op * local * (solid ? 1 : 0.42), 3), fillRule: style.fillRule || null })}/>`;
      if (!solid) out += `<path${attrs(reveal({ d: prim.d, fill: 'none', stroke: c, strokeWidth: n(Math.max(px * 1.5, w * 0.55)), strokeOpacity: oo, strokeLinejoin: 'round' }))}/>`;
      return out;
    }
    // a section: outline + 45° hatching clipped to the shape
    const clip = k.id('hx');
    k.def(`<clipPath id="${clip}"><path d="${prim.d}"/></clipPath>`);
    const gap = Math.max(2.4, px * 3.2), hp = P();
    const x0 = b.x - b.h, x1 = b.x + b.w;
    for (let xx = x0; xx <= x1; xx += gap) hp.M(xx, b.y + b.h).L(xx + b.h, b.y);
    out += `<path${attrs({ d: prim.d, fill: c, fillOpacity: n(op * (dark ? 0.12 : 0.08), 3) })}/>`;
    out += `<g clip-path="url(#${clip})"><path${attrs({ d: hp.d, fill: 'none', stroke: c, strokeWidth: n(Math.max(px * 1.1, 0.8)), strokeOpacity: n(op * 0.8 * local, 3) })}/></g>`;
    out += `<path${attrs(reveal({ d: prim.d, fill: 'none', stroke: c, strokeWidth: n(Math.max(px * 1.5, w * 0.55)), strokeOpacity: oo, strokeLinejoin: 'round' }))}/>`;
    return out;
  }
  const dash = prim.dash ? prim.dash.map((v) => n(v)).join(' ') : prim.role === 'dim' ? `${n(2.6 * (prim.weight ?? 1))} ${n(1.9 * (prim.weight ?? 1))}` : null;
  if (style.bleed && dark) out += `<path${attrs(reveal({ d: prim.d, fill: 'none', stroke: c, strokeWidth: n(w * 2.3), strokeOpacity: n(0.1 * op, 3), strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash }))}/>`;
  out += `<path${attrs(reveal({ d: prim.d, fill: 'none', stroke: c, strokeWidth: n(w), strokeOpacity: oo, strokeLinecap: dash ? 'butt' : cap, strokeLinejoin: join, strokeDasharray: dash }))}/>`;
  return out;
}

/** Bounds of a glyph's untransformed primitives (grid units) — what the dimensions measure. */
function glyphBounds(pen) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pen.flat()) {
    if (p.transforms.length || (p.opacity ?? 1) < 0.2) continue;
    const b = pathBounds(p.d);
    if (!b.w && !b.h) continue;
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}

/** Dimension marks around a glyph (grid units): a width dimension above, a height dimension at the right. */
function dimensions(k, B, { opacity = 0.6, color }) {
  const px = pxUnit(k), lw = Math.max(px, 0.8), tk = 1.6;
  const top = Math.max(1.6, B.y0 - 3.6), right = Math.min(46.4, B.x1 + 3.6);
  const p = P();
  // extension lines (a small gap off the object, a little past the dimension line)
  p.M(B.x0, B.y0 - 1.1).V(top - 1.1).M(B.x1, B.y0 - 1.1).V(top - 1.1);
  p.M(B.x1 + 1.1, B.y0).H(right + 1.1).M(B.x1 + 1.1, B.y1).H(right + 1.1);
  // dimension lines
  p.M(B.x0, top).H(B.x1).M(right, B.y0).V(B.y1);
  // oblique ticks (architectural)
  for (const [x, y] of [[B.x0, top], [B.x1, top], [right, B.y0], [right, B.y1]]) p.M(x - tk, y + tk).L(x + tk, y - tk);
  return `<path${attrs({ d: p.d, fill: 'none', stroke: color, strokeWidth: n(lw), strokeOpacity: n(opacity, 3), strokeLinecap: 'butt' })}/>`;
}

function paintGlyph(k, pen, { tone, styleOf }) {
  let i = 0;
  const walk = (node) => {
    let out = '';
    for (const c of node.children) {
      if (c.group) {
        const inner = walk(c);
        out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
      } else out += paintBlueprint(k, c, styleOf(c), i++);
    }
    return out;
  };
  let out = walk(pen.root);
  const B = glyphBounds(pen);
  if (B && B.x1 - B.x0 > 4 && B.y1 - B.y0 > 4 && k.ctx.kind === 'key') {
    const pl = plot(k);
    const o = (tone === 'off' ? 0.25 : 0.55) * (pl < 1 ? clamp((pl - 0.55) / 0.45) : 1);
    if (o > 0.01) out += dimensions(k, B, { opacity: o, color: LIT.has(tone) || ALERT.has(tone) ? markOf(k, tone) : k.colors.muted });
  }
  return out;
}

const roleColor = {
  line: (k, tone) => (tone === 'off' ? k.colors.dim : k.colors.ink),
  accent: (k, tone) => (tone === 'off' ? k.colors.dim : tone === 'idle' || tone === 'busy' ? k.colors.accent : markOf(k, tone)),
  dim: (k, tone) => (tone === 'off' ? k.colors.dim : k.colors.muted),
  spark: (k, tone) => (tone === 'off' ? k.colors.dim : tone === 'idle' || tone === 'busy' ? k.colors.accent : markOf(k, tone)),
};

// ── press: crop marks close in; the plotter redraws ──────────────────────────

function cropPress(k, { pressed, age }) {
  const dur = 0.5;
  if (!pressed && !(age < dur)) return null;
  const cx = k.w / 2, cy = k.h / 2, u = k.m.u;
  const sink = pressed ? 1 : 1 - outExpo(clamp(age / 0.2));
  const e = pressed ? 1 : 1 - outCubic(clamp(age / dur));
  const inset = lerp(-2 * u, k.m.bleed + 2.5 * u, e);
  const arm = 7 * u;
  const c = k.toneName === 'off' || k.toneName === 'idle' ? k.colors.accent : markOf(k, k.toneName);
  const overlay = path(cornerMarks(0, 0, k.w, k.h, inset, arm), { fill: 'none', stroke: c, strokeWidth: n(Math.max(1.5, 2 * u * 0.75)), strokeOpacity: n(clamp(e * 1.2), 3), strokeLinecap: 'square' });
  const s = 1 - 0.03 * sink;
  return {
    transform: sink > 0.001 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
    under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : '#8796ad' }),
    overlay,
  };
}

// ── typography: technical lettering in a title block ─────────────────────────

function lettering(k, role, str, o = {}) {
  if (role === 'label' && (o.maxLines || 1) > 1) return defaultText(k, role, str, o);
  const st = k.typeStyle(role, o);
  const color = k.color(o.color ?? st.color);
  const safe = k.m.text ?? k.m.safe;
  const room = o.maxWidth ?? k.w - safe * 2;
  const base = { weight: st.weight, tracking: st.tracking || 0, caps: !!st.caps, tabular: !!st.tabular, fill: color, fillOpacity: o.opacity };
  const anchor = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : 'middle';
  if (role === 'label' && k.ctx.kind === 'key' && (o.maxLines || 1) === 1) {
    const room = o.maxWidth ?? k.w - 2 * (Math.round(k.m.bleed) + 3 * k.m.u);
    const fit = fitText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.78, ...base });
    const by = o.y ?? k.h - (st.baseline ?? 7.5) * k.m.u;
    const ch = capHeight(fit.size, st.weight);
    const lw = Math.max(1, Math.round(k.m.hair));
    const ry = crisp(Math.min(by - ch - 3.4 * k.m.u, k.h - TITLE * k.m.u), lw);
    const b = Math.round(k.m.bleed);
    const rule = `<path${attrs({ d: `M${n(b)} ${n(ry)}H${n(k.w - b)}`, fill: 'none', stroke: k.colors.ink, strokeWidth: lw, strokeOpacity: n(0.32 * fade(k.toneName), 3) })}/>`;
    const x = o.x ?? (anchor === 'start' ? safe : anchor === 'end' ? k.w - safe : k.w / 2);
    return rule + textPath(fit.text, { ...base, size: fit.size, x, y: by, anchor });
  }
  if (role === 'eyebrow') {
    const a = o.align === 'right' ? 'end' : o.align === 'center' ? 'middle' : 'start';
    const x = o.x ?? (a === 'start' ? safe : a === 'end' ? k.w - safe : k.w / 2);
    return textPath(str, { ...base, size: st.size, x, y: o.y ?? safe + capHeight(st.size, st.weight), anchor: a, maxWidth: room, minSize: st.size * 0.85 });
  }
  if (role === 'value' || role === 'hero') {
    const cy = o.cy ?? k.h * 0.52;
    const f = fitText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.55, ...base });
    return textPath(f.text, { ...base, size: f.size, x: o.x ?? k.w / 2, y: cy + capHeight(f.size, st.weight) / 2, anchor: o.align ? anchor : 'middle' });
  }
  const by = o.y ?? (role === 'label' ? k.h - (st.baseline ?? 7.5) * k.m.u : k.h - safe);
  return textPath(str, { ...base, size: st.size, x: o.x ?? k.w / 2, y: by, anchor, maxWidth: room, minSize: st.size * 0.8 });
}

// ── bespoke glyphs ───────────────────────────────────────────────────────────

const draw = (id) => getGlyph(id)?.draw;

const glyphs = {
  /** A drafted dial: protractor ticks, the hands, an angular dimension between them. */
  clock(g, s) {
    const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
    const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
    g.circle(24, 24, 16.5);
    for (let i = 0; i < 12; i++) {
      const a = i * 30, major = i % 3 === 0;
      const [x1, y1] = g.polar(24, 24, major ? 12.4 : 14, a), [x2, y2] = g.polar(24, 24, 16.5, a);
      g.line(x1, y1, x2, y2, { role: 'line', weight: major ? 0.8 : 0.5 });
    }
    const ha = h * 30, ma = m * 6;
    const hand = (deg, len, opts) => { const [x, y] = g.polar(24, 24, len, deg); g.line(24, 24, x, y, opts); };
    // angular dimension from the hour hand to the minute hand (the short way round)
    let a0 = ha, a1 = ma;
    let span = ((a1 - a0) % 360 + 360) % 360;
    if (span > 180) { [a0, a1] = [a1, a0]; span = 360 - span; }
    if (span > 8) {
      g.arc(24, 24, 7, a0 + 2, a0 + span - 2, { role: 'accent', weight: 0.42 });
      for (const a of [a0 + 2, a0 + span - 2]) {
        const [x, y] = g.polar(24, 24, 7, a), [x2, y2] = g.polar(24, 24, 8.6, a + (a === a0 + 2 ? 4 : -4)), [x3, y3] = g.polar(24, 24, 5.4, a + (a === a0 + 2 ? 4 : -4));
        g.polyline([[x2, y2], [x, y], [x3, y3]], { role: 'accent', weight: 0.42 });
      }
    }
    hand(ha, 9, { role: 'line', weight: 1.15 });
    hand(ma, 13, { role: 'accent' });
    g.dot(24, 24, 1.4);
  },
  /** A lamp drawn in section: hatched base, dashed filament (hidden line), rays when on. */
  bulb(g, s) {
    if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
    const on = s.state === 'on';
    g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
    g.path('M19 32.5H29V37.5H19Z', { role: 'fill', fill: true });
    g.line(21, 40.5, 27, 40.5, { role: 'line', weight: 0.9 });
    g.polyline([[21, 32.5], [21, 27], [22.5, 23.5], [24, 27], [25.5, 23.5], [27, 27], [27, 32.5]], { role: on ? 'accent' : 'dim', weight: 0.75 });
    if (on) {
      const k = arrive(s.since, 0.4);
      for (const a of [-60, -30, 0, 30, 60]) {
        const [x1, y1] = g.polar(24, 22.5, 13.2, a), [x2, y2] = g.polar(24, 22.5, 13.2 + 3.4 * k, a);
        g.line(x1, y1, x2, y2, { role: 'accent', weight: 0.7, opacity: 0.55 + 0.45 * pulse(s.t + a / 120, 2.4) });
      }
    }
  },
  /** A package footprint: body, pins, pin-one mark and the cores; busy lights them in turn. */
  cpu(g, s) {
    if (s.state !== 'busy' && s.state !== 'idle') return draw('cpu')(g, s);
    g.rect(13, 13, 22, 22, { r: 1.5 });
    g.circle(16.6, 16.6, 1.1, { role: 'dim', fill: false, weight: 0.6 });
    for (const p of [18.5, 24, 29.5]) {
      g.rect(p - 1.2, 7.5, 2.4, 5.5, { role: 'dim', weight: 0.7 });
      g.rect(p - 1.2, 35, 2.4, 5.5, { role: 'dim', weight: 0.7 });
      g.rect(7.5, p - 1.2, 5.5, 2.4, { role: 'dim', weight: 0.7 });
      g.rect(35, p - 1.2, 5.5, 2.4, { role: 'dim', weight: 0.7 });
    }
    const busy = s.state === 'busy';
    const lead = Math.floor(s.phase(1.2) * 4);
    const count = Math.max(1, Math.ceil(clamp(s.level) * 4 - 1e-9));
    [[18.5, 18.5], [25, 18.5], [25, 25], [18.5, 25]].forEach(([x, y], i) => {
      const rel = (lead - i + 4) % 4;              // 0 = the lead core, then the ones it just left
      const on = busy && rel < count;
      if (on) g.rect(x, y, 4.5, 4.5, { r: 0.6, role: 'accent', fill: true, opacity: rel === 0 ? 1 : 0.72 });
      else g.rect(x, y, 4.5, 4.5, { r: 0.6, role: 'dim', weight: 0.7, opacity: busy ? 0.8 : 1 });
    });
  },
};

export default defineTheme({
  id: 'blueprint',
  title: 'Blueprint',
  description: 'White linework on a Prussian-blue drafting grid (deep blue on whiteprint by day): hatched sections, dashed hidden lines, every glyph dimensioned, a plotter that redraws on press.',
  tags: ['blueprint', 'drafting', 'technical', 'grid', 'linework', 'cyanotype', 'dark', 'light'],
  modes: { dark: CYANOTYPE, light: WHITEPRINT },
  defaultMode: 'dark',
  tones: { idle: 'accent', active: 'tint', busy: 'ink' },
  roles: {
    line: { color: roleColor.line, width: 2.1, bleed: true, cap: 'round', join: 'round' },
    fill: { color: roleColor.line },
    accent: { color: roleColor.accent, width: 2.5, bleed: true },
    dim: { color: roleColor.dim, width: 1.7, opacity: 0.95 },
    spark: { color: roleColor.spark },
  },
  type: {
    eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.16, color: 'muted' },
    label: { size: 9, weight: 600, caps: true, tracking: 0.1, color: 'ink', baseline: 7.5 },
    value: { size: 22, weight: 400, tabular: true, tracking: 0.02, color: 'ink' },
    hero: { size: 30, weight: 400, tabular: true, tracking: 0, color: 'ink' },
    caption: { size: 8, weight: 600, caps: true, tracking: 0.12, color: 'muted' },
  },
  background: sheet,
  surface: sheet,
  paint: (k, prim, style) => paintBlueprint(k, prim, style),
  paintGlyph,
  press: cropPress,
  glyphBox(k, { labeled }) {
    const m = Math.min(k.w, k.h);
    const size = labeled ? m * 0.56 : m * 0.7;
    return { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.42 : k.h / 2) - size / 2, size };
  },
  text: lettering,
  glyphs,
});

export { sheet, paintBlueprint };
