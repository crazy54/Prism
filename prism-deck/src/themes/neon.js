// neon — glass tubes on black. Every stroke of a glyph is a bent glass tube full of
// gas: a wide halo spills onto the black acrylic backing, the tube carries the color
// and a white-hot core runs down its middle. Tubes don't dim, they switch — so a
// glyph's animated opacity becomes current through the glass (lit, or unlit glass with
// a cold glint). Alerts buzz like a failing transformer. A press cuts the gas; on
// release the tube re-strikes: a flash, a stutter, it catches, it settles.
//
// By day the same sign hangs on a whitewashed brick wall in daylight (design review P2: the lights stay
// on in a lit room). Real colored glass: each tube is the gas color at full strength with a dark rim, a
// hot inner core and a white specular glint; it stands off the wall on a crisp cast shadow and throws
// its own colored light onto the limewash around it, so a lit sign still reads as neon across a sunny
// room. Unlit glass is clear and gray. The bricks are real courses (alternate faces, recessed mortar
// with a lit lower lip) under daylight from above.
//
// Fills (play triangles, record dots) are outlined as tubes with a haze of light
// inside; small fills and lettering become glowing beads. Bespoke art: play-pause
// (tubes switch instead of morphing), broadcast (the waves chase), bulb (the rays
// light in sequence around the glass) — D1.

import { defineTheme, defaultText, defaultGlyphBox, bezelCorner } from './_theme.js';
import { rect, path, url, linearGradient, radialGradient, n, P, roundRectPath } from '../scene/svg.js';
import { mix } from '../scene/color.js';
import { clamp, lerp, outExpo, pulse, phase } from '../scene/easing.js';
import { hash } from '../scene/noise.js';
import { getGlyph } from '../glyphs/_registry.js';
import { layered, onePen, isLettering, minSide, strokeA, fillA, coarse } from './_d1-layers.js';

const NIGHT = {
  bg: '#030304', surface: '#0c0b10', surface2: '#050508', line: '#1d1b25',
  ink: '#fbf2ff', muted: '#aea7c2', dim: '#76718a',
  accent: '#ff4fd2', accent2: '#3ef0ff', pos: '#5cff9d', info: '#4db5ff', warn: '#ffb02e', neg: '#ff3b55', crit: '#ff2f8f',
  edge: '#ffffff', edgeOpacity: 0.05, beam: '#ffffff', beamOpacity: 0.5, sheenOpacity: 0,
  spectrum: { l: 0.76, c: 0.19 },
};
const DAY = {
  bg: '#ebe7e1', surface: '#f7f5f1', surface2: '#e9e4dd', line: '#cbc3b8',
  ink: '#1b1524', muted: '#575064', dim: '#8b8594',
  accent: '#cf1588', accent2: '#00839f', pos: '#00845a', info: '#1d6ccc', warn: '#a35a00', neg: '#c81e3a', crit: '#a8137a',
  edge: '#ffffff', edgeOpacity: 0.7, beam: '#cf1588', beamOpacity: 0.3, sheenOpacity: 0,
  spectrum: { l: 0.56, c: 0.22 },
};

const GLASS_NIGHT = '#635e71';      // unlit glass: legible gray tube (≥ 3:1 on the backing)
const GLASS_DAY = '#dcd7cf', RIM_DAY = '#7b7369', SHADOW_DAY = '#2b1d12';
const DAY_WIDTH = 1.18;   // daylight tubes read as glass bodies: a touch thicker than at night
const TONE_CURRENT = { idle: 0.74, active: 1, ok: 0.92, info: 0.92, warn: 0.92, neg: 0.92, alert: 1, crit: 1, busy: 0.6, off: 0 };

/** Current through the tubes for a tone. Alerts buzz: a 1.2 s swell with the odd dropout (repeats every 2.4 s). */
export function current(k, tone) {
  const base = TONE_CURRENT[tone] ?? 0.85;
  if ((tone !== 'alert' && tone !== 'crit') || k.ctx.reduced) return base;
  const t = k.ctx.t, crit = tone === 'crit';
  const slot = Math.floor(phase(t, 2.4) * 24);
  if (hash(slot, crit ? 11 : 5) < (crit ? 0.16 : 0.08)) return 0.2;
  return lerp(0.55, 1, pulse(t, crit ? 0.8 : 1.2));
}

/** The gas: cut while the key is held, re-struck on release — flash, stutter, catch, settle (each beat ≥ 1 frame at 10 fps). */
export function gas(ctx) {
  if (ctx.reduced) return ctx.pressed ? 0.55 : 1;
  if (ctx.pressed) return 0.08;
  const a = ctx.pressAge;
  if (!(a < 0.62)) return 1;
  if (a < 0.08) return 1.3;
  if (a < 0.18) return 0.12;
  if (a < 0.26) return 0.95;
  if (a < 0.34) return 0.36;
  return lerp(0.72, 1, outExpo(clamp((a - 0.34) / 0.28)));
}

/** Tubes switch, they don't dim: a primitive's opacity is either current (lit) or a cold tube with a little residual glow. */
const switched = (op) => (op >= 0.5 ? 1 : 0.1);
const coreOf = (c) => mix(c, '#ffffff', 0.68);

function nightTube(p, st, L) {
  const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
  if (op < 0.01) return [];
  const vis = clamp(op * 3);
  const lit = L * (st.lit ?? 1) * switched(op);
  const c = st.color, so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
  const out = [];
  const tube = (w) => {
    if (lit > 0.02) {
      out.push({ layer: 0, a: strokeA(c, w * 5.4, 0.06 * lit, so), soft: true });
      out.push({ layer: 0, a: strokeA(c, w * 3.3, 0.1 * lit, so), soft: true });
      out.push({ layer: 1, a: strokeA(c, w * 2, 0.24 * Math.min(1.25, lit), so), soft: true });
    }
    if (lit < 0.99) out.push({ layer: 2, a: strokeA(GLASS_NIGHT, w, vis, so) });
    if (lit > 0.02) out.push({ layer: 3, a: strokeA(c, w, Math.min(1, lit), so) });
    if (lit > 0.25) out.push({ layer: 4, a: strokeA(coreOf(c), w * 0.42, clamp(lit * 1.2 - 0.25), so) });
    if (lit < 0.6) out.push({ layer: 5, a: strokeA('#ffffff', w * 0.22, 0.24 * vis * (1 - lit / 0.6), so) });
  };
  if (!p.fill) { tube((st.width ?? 2.4) * (p.weight ?? 1)); return out; }
  if (isLettering(p) || p.role === 'spark' || minSide(p) < 8.5) {
    // a bead of light: glow around the shape, glass under, color, a white-hot wash
    if (lit > 0.02) {
      out.push({ layer: 0, a: strokeA(c, 4.2, 0.08 * lit, so), soft: true });
      out.push({ layer: 1, a: strokeA(c, 1.8, 0.24 * Math.min(1.25, lit), so), soft: true });
    }
    if (lit < 0.99) out.push({ layer: 2, a: fillA(GLASS_NIGHT, vis) });
    if (lit > 0.02) out.push({ layer: 3, a: fillA(c, Math.min(1, lit)) });
    if (lit > 0.25) out.push({ layer: 4, a: fillA(coreOf(c), clamp(lit * 0.75 - 0.2)) });
    return out;
  }
  // a big fill: the outline is the tube, the inside a haze of light on the backing
  if (lit > 0.02) out.push({ layer: 1, a: fillA(c, 0.1 * Math.min(1, lit)), soft: true });
  tube((st.width ?? 2.2) * (p.weight ?? 1));
  return out;
}

function dayTube(p, st, L) {
  const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
  if (op < 0.01) return [];
  const vis = clamp(op * 3);
  const lit = L * (st.lit ?? 1) * switched(op);
  const c = st.color, so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
  // colored glass: the gas color at full strength (a shade deeper so it holds on limewash); unlit, clear gray glass
  const on = clamp(lit);
  const glassOf = lit > 0.02 ? mix(mix(GLASS_DAY, c, 0.55 + 0.45 * on), '#000000', 0.06) : GLASS_DAY;
  const rim = lit > 0.02 ? mix(c, '#000000', 0.5) : RIM_DAY;
  const hot = mix(c, '#ffffff', 0.5);
  const cast = 0.85 + 0.15 * Math.min(1.25, lit);
  const out = [];
  const tube = (w) => {
    out.push({ layer: 0, a: strokeA(SHADOW_DAY, w * 1.25, 0.24 * vis, so), soft: true });                 // cast shadow (standoff)
    if (lit > 0.02) {
      out.push({ layer: 1, a: strokeA(c, w * 7.5, 0.11 * on * cast, so), soft: true });                  // light thrown on the wall
      out.push({ layer: 1, a: strokeA(c, w * 3.8, 0.24 * on * cast, so), soft: true });
    }
    out.push({ layer: 2, a: strokeA(rim, w * 1.24, vis, so) });
    out.push({ layer: 3, a: strokeA(glassOf, w * 0.96, vis, so) });
    if (lit > 0.25) out.push({ layer: 4, a: strokeA(hot, w * 0.4, on * 0.95, so) });                     // the lit gas
    out.push({ layer: 5, a: strokeA('#ffffff', w * 0.17, 0.8 * vis, so) });                              // specular glint
  };
  const W0 = (st.width ?? 2.4) * DAY_WIDTH * (p.weight ?? 1);
  if (!p.fill) { tube(W0); return out; }
  if (isLettering(p) || p.role === 'spark' || minSide(p) < 8.5) {
    out.push({ layer: 0, a: fillA(SHADOW_DAY, 0.22 * vis), soft: true });
    if (lit > 0.02) out.push({ layer: 1, a: strokeA(c, 3.4, 0.2 * on, so), soft: true });
    out.push({ layer: 2, a: { ...fillA(glassOf, vis), stroke: rim, strokeWidth: 0.9, strokeLinejoin: 'round' } });
    if (lit > 0.25) out.push({ layer: 4, a: fillA(hot, on * 0.45) });
    return out;
  }
  if (lit > 0.02) out.push({ layer: 1, a: fillA(c, 0.12 * on), soft: true });
  tube((st.width ?? 2.2) * DAY_WIDTH * (p.weight ?? 1));
  return out;
}

function paintNeon(k, pen, { tone, styleOf }) {
  const L = current(k, tone) * gas(k.ctx);
  const tubeOf = k.dark ? nightTube : dayTube;
  return layered(pen, (p) => tubeOf(p, styleOf(p), L), { layers: 6, offsets: k.dark ? { 5: [-0.4, -0.45] } : { 0: [1.5, 2.3], 5: [-0.4, -0.5] } });
}

/** A small corner notch on alert keys — the alarm never rests on color alone. */
function notch(k, x, y, w, tone, L) {
  const s = Math.min(w, k.h) * 0.17, { X, Y } = bezelCorner(k, { x, y, w, h: k.h });   // inside the bezel cut
  const d = P().M(X - s, Y).H(X).V(Y + s).Z().d;
  k.add(path(d, { fill: k.tone(tone), fillOpacity: n(clamp(k.dark ? 0.35 + 0.6 * L : 0.9), 3) }));
}

/** The backing: black acrylic (night) or whitewashed brick (day), lit by the sign's own spill. */
function backing(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const C = k.colors, ctx = k.ctx, key = ctx.kind === 'key';
  const L = current(k, tone) * gas(ctx);
  const b = k.id('back');
  if (k.dark) {
    k.def(radialGradient(b, [[0, C.surface], [1, C.surface2]], { cx: 0.5, cy: key ? 0.4 : 0.5, r: 0.8 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(b) }));
  } else {
    // limewash over brick, daylight from above
    k.def(linearGradient(b, [[0, C.surface], [1, C.surface2]], { x1: 0, y1: 0, x2: 0.25, y2: 1 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(b) }));
    // brick courses: every other brick face a touch darker (limewash never covers evenly), recessed mortar
    // with a lit lower lip, every other course offset by half a brick
    const hb = Math.max(9, 12.5 * k.m.u), wb = hb * 2.2, lw = Math.max(1, k.m.hair * 1.2);
    const faces = P(), mortar = P(), lip = P();
    for (let r = 0, yy = y; yy < y + h; r++, yy += hb) {
      const x0 = x + (r % 2 ? wb / 2 : wb * 0.15) - wb;
      for (let i = 0, xx = x0; xx < x + w; i++, xx += wb) {
        if ((i + r * 2 + Math.floor(hash(r, i) * 3)) % 3 === 0) { const a = Math.max(x, xx + lw), e = Math.min(x + w, xx + wb - lw); if (e > a) faces.M(a, yy + lw).H(e).V(Math.min(y + h, yy + hb - lw)).H(a).Z(); }
        if (xx > x && xx < x + w) mortar.M(xx, yy).V(Math.min(y + h, yy + hb));
      }
      if (r > 0) { mortar.M(x, yy).H(x + w); lip.M(x, yy + lw).H(x + w); }
    }
    if (faces.d) k.add(path(faces.d, { fill: '#cbbfb0', fillOpacity: 0.16 }));
    k.add(path(mortar.d, { fill: 'none', stroke: '#6b5d4f', strokeWidth: n(lw), strokeOpacity: 0.2 }));
    k.add(path(lip.d, { fill: 'none', stroke: '#ffffff', strokeWidth: n(lw), strokeOpacity: 0.7 }));
    const sun = k.id('sun');
    k.def(linearGradient(sun, [[0, '#ffffff', 0.55], [0.5, '#ffffff', 0]], { x1: 0, y1: 0, x2: 0.6, y2: 1 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(sun) }));
  }
  if (L > 0.02) {
    const c = k.tone(tone), sp = k.id('spill');
    const a = (k.dark ? 0.22 : 0.28) * Math.min(1.25, L) * (tone === 'idle' ? 0.6 : 1);
    k.def(radialGradient(sp, [[0, c, a], [0.55, c, a * 0.3], [1, c, 0]], { cx: 0.5, cy: key ? 0.42 : 0.5, r: key ? 0.62 : 0.75 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(sp) }));
  }
  const e = k.m.hair;
  if (k.dark) k.add(rect({ x: x + e / 2, y: y + e / 2, width: w - e, height: h - e, rx: k.m.radius, fill: 'none', stroke: '#ffffff', strokeWidth: n(e), strokeOpacity: 0.05 }));
  else k.add(rect({ x: x + e / 2, y: y + e / 2, width: w - e, height: h - e, rx: k.m.radius, fill: 'none', stroke: '#4a3f35', strokeWidth: n(e), strokeOpacity: 0.12 }));
  if (tone === 'alert' || tone === 'crit') notch(k, x, y, w, tone, L);
  if (tone === 'busy') chaser(k, x, y, w, h);
}

/** Busy: a short white tube segment chases around the rim, 1.2 s per lap. */
function chaser(k, x, y, w, h) {
  // inside the bezel's bleed (it may crop the outer 4 px @72), so the lap is always visible
  const i = (k.m.bleed ?? 4 * k.m.u) + k.m.hair * 0.5, r = Math.max(k.m.radius - i * 0.5, k.m.radius * 0.5), ww = w - i * 2, hh = h - i * 2;
  const d = roundRectPath(x + i, y + i, ww, hh, r);
  const per = 2 * (ww + hh - 4 * r) + 2 * Math.PI * r, seg = per * 0.14;
  const off = n(-phase(k.ctx.reduced ? 0 : k.ctx.t, 1.2) * per);
  const c = k.dark ? '#ffffff' : k.colors.ink;
  const dash = `${n(seg)} ${n(per - seg)}`;
  if (k.dark) k.add(path(d, { fill: 'none', stroke: k.colors.accent2, strokeWidth: n(k.m.line * 3.2), strokeOpacity: 0.16, strokeDasharray: dash, strokeDashoffset: off, strokeLinecap: 'round' }));
  k.add(path(d, { fill: 'none', stroke: c, strokeWidth: n(k.m.line), strokeOpacity: k.dark ? 0.9 : 0.7, strokeDasharray: dash, strokeDashoffset: off, strokeLinecap: 'round' }));
}

/** Lettering: the theme's type, plus a halo of the key's light when the sign is lit. */
function neonText(k, role, str, o = {}) {
  const markup = defaultText(k, role, str, o);
  const tone = k.toneName;
  const L = current(k, tone) * gas(k.ctx);
  const spec = o.color ?? k.theme.type[role]?.color;
  if (L < 0.05 || spec === 'dim' || spec === 'muted' || role === 'caption') return markup;
  const st = k.typeStyle(role, o);
  const hc = k.tone(tone);
  // halos are blurred light: whole-pixel outlines are plenty (and a third of the bytes)
  const bare = markup.replace(/ (stroke|stroke-width|stroke-linejoin|fill-opacity|opacity)="[^"]*"/g, '').replace(/ d="([^"]*)"/g, (m, d) => ` d="${coarse(d, 0)}"`);
  const halo = (w, op) => bare.replace(/ fill="(#[0-9a-fA-F]{6})"/g, ` fill="${hc}" stroke="${hc}" stroke-width="${n(w)}" stroke-linejoin="round" opacity="${n(op * Math.min(1, L), 3)}"`);
  // big numerals glow like small ones: the halo is capped in key units, not scaled with the type.
  // One halo stroke (text outlines are the heaviest paths on a key) plus a cheap pool of light on the backing.
  const u = k.m.u;
  let pool = '';
  if (k.dark && role === 'label' && !o.x && !o.align) {
    const id = k.id('pool'), cy = (o.y ?? k.h - (st.baseline ?? 6.5) * u) - st.size * 0.36;
    k.def(radialGradient(id, [[0, hc, n(0.2 * Math.min(1, L), 3)], [1, hc, 0]]));
    pool = `<ellipse cx="${n(k.w / 2)}" cy="${n(cy)}" rx="${n(k.w * 0.4)}" ry="${n(st.size * 1.05)}" fill="url(#${id})"/>`;
  }
  return pool + (k.dark ? halo(Math.min(st.size * 0.42, 3.6 * u), 0.15) : halo(Math.min(st.size * 0.36, 3 * u), 0.08)) + markup;
}

/** Neon flicker for a tube being switched on (since → 0–1): catch, drop, catch, settle. */
const strike = (s) => (s >= 0.4 ? 1 : s < 0.08 ? 0.9 : s < 0.16 ? 0.2 : s < 0.24 ? 0.9 : s < 0.32 ? 0.3 : 1);
const draw = (id) => getGlyph(id)?.draw;

export default defineTheme({
  id: 'neon',
  title: 'Neon',
  description: 'Glass tubes on black: glyphs glow as gas-filled neon with white-hot cores; tubes switch rather than fade, alerts buzz, and a press re-strikes the gas.',
  tags: ['neon', 'glow', 'night', 'sign', 'dark', 'light'],
  modes: { dark: NIGHT, light: DAY },
  defaultMode: 'dark',
  tones: { idle: 'accent', active: 'tint', busy: 'muted' },
  roles: {
    line: { color: 'tone', width: 2.4, lit: 1 },
    fill: { color: 'tone', width: 2.2, lit: 1 },
    accent: { color: 'tone', width: 2.6, lit: 1.1, glow: 1 },
    dim: { color: 'tone', width: 2, lit: 0.62, opacity: 1 },
    spark: { color: 'tone', lit: 1.25, glow: 1 },
  },
  type: {
    eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.2, color: 'muted' },
    label: { size: 10, weight: 600, caps: true, tracking: 0.09, color: 'ink' },
    value: { size: 22, weight: 600, tabular: true, tracking: 0.01, color: 'ink' },
    hero: { size: 30, weight: 600, tabular: true, tracking: -0.01, color: 'ink' },
    caption: { size: 8.5, weight: 400, tracking: 0.02, color: 'muted' },
  },
  background: backing,
  surface: backing,
  paintGlyph: paintNeon,
  paint(k, prim, style) {
    return paintNeon(k, onePen(prim), { tone: k.toneName, styleOf: () => style });
  },
  text: neonText,
  /** Tubes need room for their halo: a touch smaller than the default box. */
  glyphBox(k, o) {
    const b = defaultGlyphBox(k, o), s = 0.96;
    return { x: b.x + (b.size * (1 - s)) / 2, y: b.y + (b.size * (1 - s)) / 2, size: b.size * s };
  },
  /** The press cuts the gas (paint reads it) and the key gives a little; on release the strike flashes. */
  press(k, { pressed, age }) {
    if (!pressed && !(age < 0.62)) return null;
    const hold = pressed ? 1 : 1 - outExpo(clamp(age / 0.18));
    const s = 1 - 0.024 * hold, cx = k.w / 2, cy = k.h / 2;
    let overlay = '';
    if (!pressed && age < 0.08 && !k.ctx.reduced) {
      const id = k.id('strike'), c = mix(k.tone(k.toneName === 'off' || k.toneName === 'idle' ? 'active' : k.toneName), '#ffffff', 0.45);
      k.def(radialGradient(id, [[0, c, k.dark ? 0.4 : 0.25], [0.6, c, 0.07], [1, c, 0]], { cx: 0.5, cy: 0.42, r: 0.64 }));
      overlay = rect({ width: k.w, height: k.h, fill: url(id) });
    }
    return {
      transform: hold > 0.001 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
      under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : '#bdb6ab' }),
      overlay,
    };
  },
  glyphs: {
    /** Neon can't morph: the old tube's gas dies as the new one strikes. One continuous triangle; two bar tubes. */
    'play-pause'(g, s) {
      if (s.state !== 'paused' && s.state !== 'playing') return draw('play-pause')(g, s);
      const playing = s.state === 'playing';
      const on = s.since >= 0.4 ? 1 : strike(s.since), off = 1 - clamp(s.since / 0.1);
      const tri = (op) => g.polygon([[16.5, 11.5], [36.5, 24], [16.5, 36.5]], { role: 'fill', join: 'round', opacity: op });
      const bars = (op) => { g.line(18, 12.5, 18, 35.5, { role: 'fill', weight: 2, opacity: op }); g.line(30, 12.5, 30, 35.5, { role: 'fill', weight: 2, opacity: op }); };
      if (off > 0) (playing ? tri : bars)(off);
      (playing ? bars : tri)(on);
    },
    /** On air: the core is a bead and the waves chase outward — inner, both, outer, dark. */
    broadcast(g, s) {
      if (s.state !== 'live' && s.state !== 'offline') return draw('broadcast')(g, s);
      const live = s.state === 'live';
      g.circle(24, 24, 3.8, { role: live ? 'accent' : 'fill', fill: true });
      const step = Math.floor(s.phase(1.8) * 4);
      const lit = live ? [[1, 0], [1, 1], [0, 1], [0, 0]][step] : [1, 1];
      [9, 15.5].forEach((r, i) => {
        const op = lit[i] ? 1 : 0.2;
        g.arc(24, 24, r, 42, 138, { role: i ? 'dim' : 'line', opacity: op });
        g.arc(24, 24, r, 222, 318, { role: i ? 'dim' : 'line', opacity: op });
      });
    },
    /** A neon bulb: the filament is the hot tube; switched on, the rays light one by one around the glass, hold, and reset. */
    bulb(g, s) {
      if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
      const on = s.state === 'on';
      g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
      g.line(19, 32.5, 19, 35.5);
      g.line(29, 32.5, 29, 35.5);
      g.line(19, 35.5, 29, 35.5);
      g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
      g.polyline([[20.5, 28], [22.5, 23.5], [24, 27], [25.5, 23.5], [27.5, 28]], { role: on ? 'accent' : 'dim', weight: 0.8, opacity: on ? 1 : 0.3 });
      if (!on) return;
      const n0 = Math.floor(s.phase(2.4) * 8); // 0–4: rays light in turn · 5–6: all lit · 7: dark
      [-60, -30, 0, 30, 60].forEach((a, i) => {
        const [x1, y1] = g.polar(24, 22.5, 13, a), [x2, y2] = g.polar(24, 22.5, 16, a);
        g.line(x1, y1, x2, y2, { role: 'accent', weight: 0.8, opacity: n0 < 7 && i <= n0 ? 1 : 0.2 });
      });
    },
  },
});
