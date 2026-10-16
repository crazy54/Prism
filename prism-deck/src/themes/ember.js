// ember — warm dark: coals and amber light. Keys are a cast-iron firebox with a bed
// of coals glowing beneath; every stroke of a glyph is a live ember: a black char
// crust, a dull red body, the glowing interior and bright fissures cracking through
// it (white-hot on the hottest keys). Heat is the state language — off is cold ash,
// idle smolders, on burns hot; status tones burn in flame-test colors (copper green,
// gas blue, sodium yellow, strontium red). Alerts flare. A press works the bellows:
// the coals flare while the key is held and a shower of sparks flies on release.
//
// By day it is pyrography: glyphs burnt into pale birch, a scorched halo around every
// line, and on lit keys the burn is still glowing inside.
//
// Bespoke art: bulb (an Edison coil that glows like a filament) and broadcast (the
// core is a coal and the waves are rising heat ripples) — D1.

import { defineTheme, bezelCorner } from './_theme.js';
import { rect, path, url, linearGradient, radialGradient, n, P, roundRectPath } from '../scene/svg.js';
import { mix } from '../scene/color.js';
import { clamp, lerp, outCubic, pulse, phase } from '../scene/easing.js';
import { hash } from '../scene/noise.js';
import { getGlyph } from '../glyphs/_registry.js';
import { layered, onePen, strokeA, fillA } from './_d1-layers.js';

const NIGHT = {
  bg: '#0b0605', surface: '#1c110c', surface2: '#0d0705', line: '#33211a',
  ink: '#ffeedd', muted: '#d2ad8f', dim: '#8f6c56',
  accent: '#ff8f33', accent2: '#ffc44d', pos: '#b2d867', info: '#72b6ff', warn: '#ffc93f', neg: '#ff5a36', crit: '#ff3d7a',
  smolder: '#f2702a', hot: '#ffb340',
  edge: '#ffcf9e', edgeOpacity: 0.07, beam: '#ffb340', beamOpacity: 0.5, sheenOpacity: 0,
  spectrum: { l: 0.74, c: 0.14 },
};
const DAY = {
  bg: '#e9dcc7', surface: '#f3e8d6', surface2: '#e8d8bf', line: '#d3bf9f',
  ink: '#2a170c', muted: '#6b4a31', dim: '#8d6d52',
  accent: '#c2410c', accent2: '#9a5b00', pos: '#4f6f12', info: '#1f5fa8', warn: '#965400', neg: '#b3261e', crit: '#a3164f',
  smolder: '#b8470f', hot: '#d94e0b', burn: '#3b2416',
  edge: '#ffffff', edgeOpacity: 0.6, beam: '#c2410c', beamOpacity: 0.3, sheenOpacity: 0,
  spectrum: { l: 0.52, c: 0.14 },
};
const CRUST = '#100805', ASH = '#73685f', ASH_FLECK = '#9a8e85';
const TONE_HEAT = { off: 0, idle: 0.56, active: 1, ok: 0.86, info: 0.86, warn: 0.9, neg: 0.9, alert: 1, crit: 1, busy: 0.46 };
const CRACKS = ['2.6 1.1 0.9 1.6 3.4 0.8', '1.4 0.9 3.1 1.3 1.9 0.7', '3.2 1.4 1.2 0.8 2.2 1.1'];

/** Heat of a tone: alerts flare (a 1.2 s swell; crit 0.8 s). */
export function heatOf(k, tone) {
  const base = TONE_HEAT[tone] ?? 0.8;
  if ((tone !== 'alert' && tone !== 'crit') || k.ctx.reduced) return base;
  return lerp(0.62, 1.12, pulse(k.ctx.t, tone === 'crit' ? 0.8 : 1.2));
}

/** The bellows: held = the coals flare; released = the flare dies back over ~0.7 s. */
export function bellows(ctx) {
  if (ctx.pressed) return 1.38;
  const a = ctx.pressAge;
  if (!(a < 0.7)) return 1;
  return 1 + 0.38 * (1 - outCubic(clamp(a / 0.7)));
}

/** Heat × bellows; blowing on cold ash rekindles a little while the key is worked. */
const heatAt = (k, tone) => { const b = bellows(k.ctx), h = heatOf(k, tone); return h > 0 ? h * b : (b - 1) * 0.8; };

const hotOf = (c) => mix(c, '#fff1c2', 0.58);
const deepOf = (c) => mix(c, '#4a0b00', 0.5);

function coalGradient(k, c) {
  const memo = k._d1coal || (k._d1coal = new Map());
  let id = memo.get(c);
  if (!id) {
    id = k.id('coal');
    k.def(radialGradient(id, [[0, hotOf(c)], [0.55, c], [1, deepOf(c)]], { cx: 0.5, cy: 0.42, r: 0.62 }));
    memo.set(c, id);
  }
  return id;
}

function nightEmber(k, p, st, H, i) {
  const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
  if (op < 0.01) return [];
  const vis = clamp(op * 2.5);
  const h = H * (st.heat ?? 1) * (0.35 + 0.65 * op);   // opacity animates heat, never hides the coal
  const cold = H <= 0.001;
  const c = st.color, w = (st.width ?? 2.6) * (p.weight ?? 1);
  const so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
  const crack = (pat, off) => ({ ...so, dash: so.dash || pat, dashOffset: so.dash ? null : n(off) });
  const out = [];
  if (p.fill) {
    if (!cold) out.push({ layer: 0, a: strokeA(c, 3.8, 0.1 * h * vis, so), soft: true });
    out.push({ layer: 1, a: { ...fillA(CRUST, vis), stroke: CRUST, strokeWidth: 1.3, strokeLinejoin: 'round' } });
    if (cold) { out.push({ layer: 2, a: fillA(ASH, vis) }); return out; }
    out.push({ layer: 2, a: fillA(deepOf(c), vis) });
    out.push({ layer: 3, a: { fill: url(coalGradient(k, c)), fillOpacity: h < 0.999 ? n(clamp(h), 3) : null } });
    if (p.role === 'spark' && h > 0.6) out.push({ layer: 5, a: fillA('#fffaf0', clamp((h - 0.6) * 2)) });
    return out;
  }
  if (!cold) out.push({ layer: 0, a: strokeA(deepOf(c), w * 3.4, 0.16 * h * vis, so), soft: true });
  if (!cold) out.push({ layer: 0, a: strokeA(c, w * 2, 0.12 * h * vis, so), soft: true });
  out.push({ layer: 1, a: strokeA(CRUST, w * 1.5, vis, so) });
  if (cold) {
    out.push({ layer: 2, a: strokeA(ASH, w, vis, so) });
    out.push({ layer: 4, a: strokeA(ASH_FLECK, w * 0.3, 0.8 * vis, { ...so, dash: so.dash || '0.6 2.2', cap: 'round' }) });
    return out;
  }
  out.push({ layer: 2, a: strokeA(deepOf(c), w, vis, so) });
  out.push({ layer: 3, a: strokeA(c, w * 0.6, clamp(h * 0.8), so) });
  out.push({ layer: 4, a: strokeA(hotOf(c), w * 0.44, clamp(h * 1.3 - 0.15), crack(CRACKS[i % 3], (i * 1.7) % 4)) });
  if (h > 0.82) out.push({ layer: 5, a: strokeA('#fffaf0', w * 0.15, clamp((h - 0.82) * 3), crack(CRACKS[(i + 1) % 3], (i * 2.3) % 5)) });
  return out;
}

function dayBurn(k, p, st, H, i) {
  const op = clamp((st.opacity ?? 1) * (p.opacity ?? 1));
  if (op < 0.01) return [];
  const vis = clamp(op * 2.5);
  const h = H * (st.heat ?? 1) * op;
  const C = k.colors, cold = H <= 0.001;
  const burn = p.role === 'accent' || p.role === 'spark' ? mix(st.color, C.burn, 0.35) : p.role === 'dim' ? mix(C.burn, C.surface, 0.32) : C.burn;
  const ink = cold ? mix(burn, C.surface, 0.3) : burn;
  const w = (st.width ?? 2.6) * (p.weight ?? 1);
  const so = { cap: p.cap || st.cap || 'round', join: p.join || st.join || 'round', dash: p.dash ? p.dash.map((v) => n(v)).join(' ') : null };
  const out = [];
  if (p.fill) {
    out.push({ layer: 0, a: strokeA('#9a5424', 3.2, 0.14 * vis, so), soft: true });
    out.push({ layer: 2, a: { ...fillA(ink, vis), stroke: '#6b3416', strokeWidth: 0.9, strokeOpacity: n(0.5 * vis, 3), strokeLinejoin: 'round' } });
    if (h > 0.05) out.push({ layer: 3, a: fillA(st.color, clamp(h) * 0.55) });
    return out;
  }
  out.push({ layer: 0, a: strokeA('#9a5424', w * 2.6, (cold ? 0.08 : 0.15) * vis, so), soft: true });
  out.push({ layer: 1, a: strokeA('#6b3416', w * 1.45, (cold ? 0.18 : 0.32) * vis, so), soft: true });
  out.push({ layer: 2, a: strokeA(ink, w, vis, so) });
  if (h > 0.05) out.push({ layer: 3, a: strokeA(st.color, w * 0.4, clamp(h), { ...so, dash: so.dash || CRACKS[i % 3], dashOffset: so.dash ? null : n((i * 1.7) % 4) }) });
  return out;
}

function paintEmber(k, pen, { tone, styleOf }) {
  const H = heatAt(k, tone);
  const fn = k.dark ? nightEmber : dayBurn;
  return layered(pen, (p, i) => fn(k, p, styleOf(p), H, i), { layers: 6 });
}

/** A small corner notch on alert keys — the alarm never rests on color alone. */
function notch(k, x, y, w, tone, H) {
  const s = Math.min(w, k.h) * 0.17, { X, Y } = bezelCorner(k, { x, y, w, h: k.h });   // inside the bezel cut
  k.add(path(P().M(X - s, Y).H(X).V(Y + s).Z().d, { fill: k.tone(tone), fillOpacity: n(clamp(0.4 + 0.55 * H), 3) }));
}

/** Night: a cast-iron firebox over a bed of coals. Day: pale birch with a soft grain. */
function firebox(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const C = k.colors, ctx = k.ctx, key = ctx.kind === 'key';
  const H = heatAt(k, tone);
  const b = k.id('box');
  if (k.dark) {
    k.def(radialGradient(b, [[0, C.surface], [1, C.surface2]], { cx: 0.5, cy: 0.38, r: 0.85 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(b) }));
    if (H > 0.001) {
      const bed = k.id('bed'), c = k.tone(tone);
      const a = 0.34 * Math.min(1.3, H);
      k.def(radialGradient(bed, [[0, c, a], [0.45, deepOf(c), a * 0.45], [1, deepOf(c), 0]], { cx: 0.5, cy: key ? 1.08 : 1.15, r: key ? 0.72 : 0.9 }));
      k.add(rect({ x, y, width: w, height: h, fill: url(bed) }));
    }
    // the iron lip catches a little of the light
    k.add(rect({ x: x + k.m.radius, y, width: w - k.m.radius * 2, height: k.m.hair, fill: C.edge, fillOpacity: n(C.edgeOpacity * (H > 0 ? 1.4 : 0.7), 3) }));
  } else {
    k.def(linearGradient(b, [[0, C.surface], [1, C.surface2]], { x1: 0, y1: 0, x2: 0.3, y2: 1 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(b) }));
    // birch grain: long, gently wavering lines (fixed per surface size, so frames stay identical)
    const p = P(), lines = Math.max(4, Math.round(h / (11 * k.m.u)));
    for (let i = 0; i < lines; i++) {
      const yy = y + ((i + 0.5) / lines) * h, amp = (1.2 + 2 * hash(i, 3)) * k.m.u, ph = hash(i, 9) * 6;
      p.M(x, yy);
      for (let s = 1; s <= 4; s++) p.Q(x + ((s - 0.5) / 4) * w, yy + amp * Math.sin(ph + s * 1.9), x + (s / 4) * w, yy + amp * 0.4 * Math.sin(ph + s * 2.7));
    }
    k.add(path(p.d, { fill: 'none', stroke: '#a27a50', strokeWidth: n(Math.max(1, k.m.hair)), strokeOpacity: 0.13 }));
    if (H > 0.001) {
      const warm = k.id('warm'), c = k.tone(tone);
      k.def(radialGradient(warm, [[0, c, 0.12 * Math.min(1.3, H)], [1, c, 0]], { cx: 0.5, cy: key ? 0.44 : 0.5, r: 0.6 }));
      k.add(rect({ x, y, width: w, height: h, fill: url(warm) }));
    }
  }
  if (tone === 'alert' || tone === 'crit') notch(k, x, y, w, tone, H);
  if (tone === 'busy') fuse(k, x, y, w, h);
}

/** Busy: a lit fuse — a spark with a glowing trail burns around the rim, 1.2 s per lap. */
function fuse(k, x, y, w, h) {
  // inside the bezel's bleed (it may crop the outer 4 px @72), so the lap is always visible
  const i = (k.m.bleed ?? 4 * k.m.u) + k.m.hair * 0.5, r = Math.max(k.m.radius - i * 0.5, k.m.radius * 0.5), ww = w - i * 2, hh = h - i * 2;
  const d = roundRectPath(x + i, y + i, ww, hh, r);
  const per = 2 * (ww + hh - 4 * r) + 2 * Math.PI * r, seg = per * 0.16;
  const off = -phase(k.ctx.reduced ? 0 : k.ctx.t, 1.2) * per;
  const hot = k.dark ? '#ffd27a' : '#d94e0b';
  k.add(path(d, { fill: 'none', stroke: k.dark ? '#ff6a1a' : '#9a5424', strokeWidth: n(k.m.line * 2.6), strokeOpacity: k.dark ? 0.22 : 0.18, strokeDasharray: `${n(seg)} ${n(per - seg)}`, strokeDashoffset: n(off), strokeLinecap: 'round' }));
  k.add(path(d, { fill: 'none', stroke: hot, strokeWidth: n(k.m.line * 0.9), strokeDasharray: `${n(seg * 0.5)} ${n(per - seg * 0.5)}`, strokeDashoffset: n(off - seg * 0.5), strokeLinecap: 'round' }));
}

/** Sparks flying up from the glyph after a press (key px). */
function sparks(k, age) {
  const s = Math.min(k.w, k.h), cx = k.w / 2, cy = k.h * 0.44;
  const hot = k.dark ? '#ffd27a' : '#e0560f';
  let trails = '', dots = '', cores = '';
  for (let i = 0; i < 7; i++) {
    const life = 0.45 + 0.35 * hash(i, 3);
    const p = age / life;
    if (p >= 1) continue;
    const x0 = cx + (hash(i, 1) - 0.5) * s * 0.42, y0 = cy + s * (0.02 + 0.1 * hash(i, 4));
    const vy = s * (0.55 + 0.5 * hash(i, 2)), drift = (hash(i, 5) - 0.5) * s * 0.3;
    const at = (a) => [x0 + drift * a + Math.sin(a * 9 + i) * s * 0.012, y0 - vy * a * (1 - a * 0.45)];
    const [x, y] = at(age), [px, py] = at(Math.max(0, age - 0.06));
    const r = k.m.u * (0.7 + 0.7 * hash(i, 6)) * (1 - p * 0.5), o = n((1 - p) * (1 - p * 0.3), 3);
    trails += `<path d="M${n(px)} ${n(py)}L${n(x)} ${n(y)}" stroke="${hot}" stroke-width="${n(r * 1.1)}" stroke-opacity="${n(0.45 * (1 - p), 3)}" stroke-linecap="round" fill="none"/>`;
    dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${hot}" fill-opacity="${o}"/>`;
    if (k.dark) cores += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.45)}" fill="#fffaf0" fill-opacity="${o}"/>`;
  }
  return trails + dots + cores;
}

const draw = (id) => getGlyph(id)?.draw;

export default defineTheme({
  id: 'ember',
  title: 'Ember',
  description: 'Warm dark: coals and amber light. Glyphs are live embers with a char crust and glowing cracks; heat is the state, a press works the bellows and throws sparks.',
  tags: ['ember', 'fire', 'warm', 'coal', 'dark', 'light', 'pyrography'],
  modes: { dark: NIGHT, light: DAY },
  defaultMode: 'dark',
  tones: { idle: 'smolder', active: 'hot', busy: 'smolder' },
  roles: {
    line: { color: 'tone', width: 2.7, heat: 1 },
    fill: { color: 'tone', width: 2.4, heat: 1 },
    accent: { color: 'tone', width: 2.9, heat: 1.22, glow: 1 },
    dim: { color: 'tone', width: 2.2, heat: 0.5, opacity: 1 },
    spark: { color: 'tone', heat: 1.3, glow: 1 },
  },
  type: {
    eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.14, color: 'muted' },
    label: { size: 11, weight: 600, tracking: 0.005, color: 'ink' },
    value: { size: 22, weight: 700, tabular: true, tracking: -0.02, color: 'ink' },
    hero: { size: 30, weight: 700, tabular: true, tracking: -0.03, color: 'ink' },
    caption: { size: 8.5, weight: 400, color: 'muted' },
  },
  background: firebox,
  surface: firebox,
  paintGlyph: paintEmber,
  paint(k, prim, style) {
    return paintEmber(k, onePen(prim), { tone: k.toneName, styleOf: () => style });
  },
  /** Stoke: held, the key sinks into the grate and the coals flare (paint reads the bellows); released, sparks fly. */
  press(k, { pressed, age }) {
    if (!pressed && !(age < 0.8)) return null;
    const sink = pressed ? 1 : 1 - outCubic(clamp(age / 0.24));
    const s = 1 - 0.035 * sink, cx = k.w / 2, cy = k.h / 2;
    let overlay = '';
    if (pressed) {
      const id = k.id('flare'), c = k.dark ? '#ff9a3c' : '#e0560f';
      k.def(radialGradient(id, [[0, c, k.dark ? 0.3 : 0.14], [1, c, 0]], { cx: 0.5, cy: 1.05, r: 0.7 }));
      overlay = rect({ width: k.w, height: k.h, fill: url(id) });
    } else if (!k.ctx.reduced) overlay = sparks(k, age);
    return {
      transform: sink > 0.001 ? `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})` : null,
      under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : '#6b4a31' }),
      overlay,
    };
  },
  glyphs: {
    /** An Edison bulb: the filament is a coil that glows like a hot wire; on, the rays shimmer as heat. */
    bulb(g, s) {
      if (s.state !== 'on' && s.state !== 'off') return draw('bulb')(g, s);
      const on = s.state === 'on';
      g.path('M19 32.5C16 30.3 13.5 26.6 13.5 22.5a10.5 10.5 0 0 1 21 0c0 4.1-2.5 7.8-5.5 10');
      g.line(19, 32.5, 19, 35.5);
      g.line(29, 32.5, 29, 35.5);
      g.line(19, 35.5, 29, 35.5);
      g.line(20.5, 39.5, 27.5, 39.5, { role: 'dim' });
      g.polyline([[21, 32.5], [20.5, 25.5]], { role: 'dim', weight: 0.6 });
      g.polyline([[27, 32.5], [27.5, 25.5]], { role: 'dim', weight: 0.6 });
      const coil = [];
      for (let j = 0; j <= 28; j++) { const u = j / 28; coil.push([20.5 + 7 * u, 25.5 - 2.4 * Math.abs(Math.sin(u * Math.PI * 4))]); }
      g.polyline(coil, { role: on ? 'accent' : 'dim', weight: 0.62 });
      if (!on) return;
      const k = Math.min(1, s.since / 0.5);
      for (const a of [-60, -30, 0, 30, 60]) {
        const [x1, y1] = g.polar(24, 22.5, 13, a), [x2, y2] = g.polar(24, 22.5, 13 + 3 * k, a);
        g.line(x1, y1, x2, y2, { role: 'accent', weight: 0.8, opacity: 0.55 + 0.45 * pulse(s.t + a / 120, 2.4) });
      }
    },
    /** On air: the core is a coal; the waves are heat ripples rising off it. */
    broadcast(g, s) {
      if (s.state !== 'live' && s.state !== 'offline') return draw('broadcast')(g, s);
      const live = s.state === 'live';
      g.circle(24, 24, live ? 4.4 : 3.8, { role: live ? 'accent' : 'fill', fill: true });
      [9, 15.5].forEach((r, i) => {
        const ph = live ? (s.phase(1.8) + i * 0.5) % 1 : 0;
        const op = live ? 0.4 + 0.6 * (1 - Math.abs(ph - 0.5) * 2) : 0.8;
        for (const [a0, a1] of [[44, 136], [224, 316]]) {
          const pts = [];
          for (let j = 0; j <= 16; j++) {
            const a = a0 + ((a1 - a0) * j) / 16;
            const rr = r + (live ? 0.75 : 0.35) * Math.sin(j * 1.6 + (live ? s.phase(1.8) * Math.PI * 2 : 0) + i);
            pts.push(g.polar(24, 24, rr, a));
          }
          g.polyline(pts, { role: i ? 'dim' : 'line', opacity: op });
        }
      });
    },
  },
});
