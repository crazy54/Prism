// phosphor — every key is a little green CRT, kin to the terminal catalog's retro
// scopes: lines are drawn by the beam (a white-hot core in a green bloom), the
// picture is a raster of whole-pixel scanlines (~24 lines per key at every size),
// the tube glass vignettes and catches a reflection, and anything that moves leaves
// persistence — fading copies of where it was a frame or two ago. Type is the
// terminal's 5 × 7 character cell, each row a beam line. A press makes the picture
// bloom: brightness surges and the raster shrinks a touch as the high voltage sags,
// then decays like phosphor.
//
// Night: green phosphor on black glass (amber / orange / red phosphor for warnings).
// Day:   reverse video (DECSCNM): the whole field lit, dark strokes, scanlines showing through.

import { defineTheme } from './_theme.js';
import { rect, path, url, linearGradient, radialGradient, n, attrs } from '../scene/svg.js';
import { mix } from '../scene/color.js';
import { clamp, phase, lerp } from '../scene/easing.js';
import { Pen } from '../glyphs/_glyph.js';
import { glyphRegistry } from '../glyphs/_registry.js';
import { bitmapText } from './_d2-type.js';

// ── the raster ───────────────────────────────────────────────────────────────

/** Scanline pitch + dark gap in device px (≈ 24 lines across a key at any size). */
function raster(k) {
  const m = k.ctx.kind === 'key' ? Math.min(k.w, k.h) : Math.max(72, 72 * k.m.u);
  const p = Math.max(3, Math.round(m / 24));
  return { p, g: Math.max(1, Math.round(p / 3.2)) };
}

/** Dark scanline gaps over a rect, aligned to the surface's pixel rows. */
function scanPath(k, x, y, w, h) {
  const { p, g } = raster(k);
  let d = '';
  for (let yy = Math.ceil(y / p) * p - g; yy < y + h; yy += p) if (yy + g > y) d += `M${n(x)} ${Math.max(yy, y)}H${n(x + w)}V${Math.min(yy + g, y + h)}H${n(x)}Z`;
  return d;
}

// ── the tube ─────────────────────────────────────────────────────────────────

const BLOOM = { idle: 0.04, active: 0.75, ok: 0.5, info: 0.5, warn: 0.52, neg: 0.5, alert: 0.55, crit: 0.62, busy: 0.16, off: 0 };
/** Beam intensity per tone: the state *is* how hard the tube is driven (0 cold … 1 hot). */
const HEAT = { off: 0, idle: 0.3, busy: 0.4 };
const heatOf = (tone) => HEAT[tone] ?? 1;
const HOT = new Set(['active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit']);

/** Phosphor excitation for alerts: a sharp attack, then exponential decay (not a sine). */
function excite(k, tone) {
  if (k.ctx.reduced || (tone !== 'alert' && tone !== 'crit')) return 1;
  const T = tone === 'crit' ? 0.6 : 1.2;   // periods that divide the common loops (1.2 · 2.4 · 4.8 · 6 · 12 s)
  return 0.35 + 0.65 * Math.exp(-phase(k.ctx.t, T) * T / 0.28);
}

function tube(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const C = k.colors, dark = k.dark, off = tone === 'off';
  const glass = k.id('glass');
  const heat = heatOf(tone);
  const lit = dark ? mix(C.surface, C.ink, 0.015 + 0.075 * heat) : mix(C.surface, '#ffffff', 0.12 + 0.62 * heat);
  const body = dark ? C.surface : off ? mix(C.surface2, '#6f8a78', 0.32) : C.surface;
  const rim = dark ? C.surface2 : off ? mix(C.surface2, '#5d7564', 0.4) : C.surface2;
  k.def(radialGradient(glass, [[0, lit], [0.62, body], [1, rim]], { cx: 0.5, cy: 0.46, r: 0.74 }));
  k.add(rect({ x, y, width: w, height: h, fill: url(glass) }));
  // the picture's light: a bloom of the tone around the middle of the tube
  const level = (BLOOM[tone] ?? 0.25) * excite(k, tone);
  if (level > 0) {
    const bl = k.id('bloom');
    const c = k.tone(tone);
    const a = (dark ? 1 : 0.55) * level;
    k.def(radialGradient(bl, [[0, c, a * 0.55], [0.5, c, a * 0.2], [1, c, 0]], { cx: 0.5, cy: 0.44, r: 0.62 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(bl) }));
  }
  // busy: the hum bar rolls slowly down the tube
  if (tone === 'busy' && !k.ctx.reduced) {
    const hb = k.id('hum');
    const p = phase(k.ctx.t, 2.4);
    const cy = y - h * 0.3 + p * h * 1.6;
    k.def(linearGradient(hb, [[0, C.ink, 0], [0.5, C.ink, dark ? 0.09 : 0.18], [1, C.ink, 0]], { x1: 0, y1: cy - h * 0.22, x2: 0, y2: cy + h * 0.22, gradientUnits: 'userSpaceOnUse' }));
    k.add(rect({ x, y, width: w, height: h, fill: url(hb) }));
  }
  // the raster
  k.add(path(scanPath(k, x, y, w, h), { fill: dark ? '#000000' : mix(C.surface2, C.ink, 0.35), fillOpacity: dark ? 0.55 : 0.2 }));
  // convex glass: a reflection up-left, the tube's dark rounded edge
  const rf = k.id('refl');
  k.def(radialGradient(rf, [[0, '#ffffff', dark ? 0.075 : 0.3], [1, '#ffffff', 0]], { cx: 0.28, cy: 0.1, r: 0.55 }));
  k.add(rect({ x, y, width: w, height: h * 0.6, fill: url(rf) }));
  const edge = Math.max(1, k.m.bold * 0.9);
  k.add(rect({ x: x + edge / 2, y: y + edge / 2, width: w - edge, height: h - edge, rx: k.m.radius * 1.3, fill: 'none', stroke: dark ? '#000000' : mix(C.surface2, C.ink, 0.25), strokeWidth: n(edge), strokeOpacity: dark ? 0.7 : 0.35 }));
}

// ── beam painting ────────────────────────────────────────────────────────────

/**
 * One primitive as the beam draws it. Layer 'halo' returns the bloom as
 * { key, d, attrs } (merged per style by paintGlyph, drawn outside the raster);
 * layer 'core' returns markup: the beam itself (+ a white-hot core on accents by night).
 */
function beam(k, prim, style, layer) {
  const dark = k.dark;
  const op = (style.opacity ?? 1) * (prim.opacity ?? 1);
  const w = (style.width ?? 2.6) * (prim.weight ?? 1);
  const glow = style.glow ?? 0.6;
  const cap = prim.cap || style.cap || 'round', join = prim.join || style.join || 'round';
  const dash = prim.dash ? prim.dash.map((v) => n(v)).join(' ') : null;
  const hot = dark && (prim.role === 'accent' || prim.role === 'spark' || style.color === k.colors.accent);
  const faint = prim.ghost || op < 0.3;          // faint parts and persistence ghosts: the core beam only
  if (layer === 'halo') {
    if (faint || (!dark && prim.fill)) return null;
    const a = dark
      ? (prim.fill ? { stroke: style.color, strokeWidth: n(2 + 4 * glow), strokeOpacity: n(0.2 * op, 3) } : { stroke: style.color, strokeWidth: n(w * (1.7 + 2 * glow)), strokeOpacity: n(0.15 * glow * op, 3) })
      : { stroke: style.color, strokeWidth: n(w * 2), strokeOpacity: n(0.08 * op, 3) };
    Object.assign(a, { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: dash });
    return { key: JSON.stringify(a), d: prim.d, attrs: a };
  }
  const s = (width, color, o) => `<path${attrs({ d: prim.d, fill: 'none', stroke: color, strokeWidth: n(width), strokeOpacity: o < 1 ? n(o, 3) : null, strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
  const f = (color, o) => `<path${attrs({ d: prim.d, fill: color, fillOpacity: o < 1 ? n(o, 3) : null })}/>`;
  if (prim.fill) return f(hot && !faint ? mix(style.color, '#ffffff', 0.3) : style.color, op);   // a hot mass: one lighter fill, not two layers
  return s(w, style.color, op) + (hot && !faint ? s(Math.max(0.6, w * 0.38), mix(style.color, '#ffffff', 0.65), 0.8 * op) : '');
}

function paintTree(k, node, tone) {
  let out = '';
  for (const c of node.children) {
    if (c.group) {
      const inner = paintTree(k, c, tone);
      if (!inner) continue;
      out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
    } else out += beam(k, c, k.roleStyle(c.role, tone), 'core');
  }
  return out;
}

/** The bloom of a whole glyph: one path per (style, transform), whatever the glyph's part count. */
function haloOf(k, pen, tone) {
  const groups = new Map();
  for (const p of pen.flat()) {
    const h = beam(k, p, k.roleStyle(p.role, tone), 'halo');
    if (!h) continue;
    const tf = p.transforms.join(' ');
    const key = `${tf}|${h.key}`;
    if (!groups.has(key)) groups.set(key, { tf, attrs: h.attrs, d: '' });
    groups.get(key).d += h.d;
  }
  let out = '';
  for (const { tf, attrs: a, d } of groups.values()) {
    const el = `<path${attrs({ d, ...a })}/>`;
    out += tf ? `<g transform="${tf}">${el}</g>` : el;
  }
  return out;
}

/** Whole glyph: the bloom, then the beam inside the scanline raster (when the box is known). */
function paintGlyph(k, pen, { tone, box }) {
  const bx = box || k._d2g?.box || null;
  k._d2g = null;
  const out = haloOf(k, pen, tone);
  const body = paintTree(k, pen.root, tone);
  if (!bx || !k.dark) return out + body;   // reverse video: dark strokes merge with the dark gaps
  // stripes in glyph units that keep exactly the lit pixel rows of the raster
  const s = bx.size / 48, { p, g } = raster(k);
  let d = '';
  const y0 = Math.floor(bx.y / p) * p - p, y1 = bx.y + bx.size + p;
  const u = (px) => n((px - bx.y) / s, 3);
  for (let yy = y0; yy < y1; yy += p) d += `M-24 ${u(yy)}H72V${u(yy + p - g)}H-24Z`;
  const id = k.id(`scan${(k._d2n = (k._d2n || 0) + 1)}`);
  k.def(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
  return `${out}<g clip-path="url(#${id})">${body}</g>`;
}

// ── persistence ──────────────────────────────────────────────────────────────
// Any glyph part that moved leaves fading copies of its last positions. Parts that
// didn't move (or only changed brightness) add nothing.

const TRAIL = [[0.06, 0.4], [0.12, 0.2], [0.18, 0.09]];
const keyOf = (p) => `${p.role}|${p.transforms.join(';')}|${p.d}`;
function persistent(draw, loop) {
  return (g, s) => {
    const cur = new Pen();
    draw(cur, s);
    const seen = new Set(cur.flat().map(keyOf));
    let budget = 9, chars = 1400;                     // ghost parts / path bytes per glyph (busy glyphs stay light)
    for (const [dt, op] of TRAIL) {
      if (budget <= 0) break;
      if (s.t < dt) continue;
      const t = s.t - dt;
      const gp = new Pen();
      draw(gp, { ...s, t, since: (s.since ?? s.t) - dt, phase: (period = loop || 1) => { const q = (t / period) % 1; return q < 0 ? q + 1 : q; } });
      for (const p of gp.flat()) {
        if (p.opacity < 0.3 || seen.has(keyOf(p)) || budget <= 0 || p.d.length > chars) continue;
        budget--; chars -= p.d.length;
        const { transforms, ...prim } = p;
        g.top.children.push({ group: true, transform: transforms.length ? transforms.join(' ') : null, opacity: 1, children: [{ ...prim, ghost: true, opacity: prim.opacity * op }] });
      }
    }
    for (const c of cur.root.children) g.top.children.push(c);
  };
}

// ── bespoke tube art ─────────────────────────────────────────────────────────

const BESPOKE = {
  /** A radar-scope clock: a faint face, the minute hand sweeping with an afterglow fan behind it. */
  clock(g, s) {
    g.circle(24, 24, 16.5, { role: 'dim', weight: 0.75, opacity: 0.8 });
    for (const a of [0, 90, 180, 270]) { const [x1, y1] = g.polar(24, 24, 12.5, a), [x2, y2] = g.polar(24, 24, 15, a); g.line(x1, y1, x2, y2, { role: 'line', weight: 0.9 }); }
    const m = typeof s.params.m === 'number' ? s.params.m + (s.params.s || 0) / 60 : s.phase(12) * 60;
    const h = typeof s.params.h === 'number' ? (s.params.h % 12) + m / 60 : 10 + m / 60;
    const a = m * 6;
    [0.05, 0.09, 0.14, 0.2].forEach((op, i) => {
      const a0 = a - (4 - i) * 9, a1 = a - (3 - i) * 9;
      const [x0, y0] = g.polar(24, 24, 13.5, a0), [x1, y1] = g.polar(24, 24, 13.5, a1);
      g.path(`M24 24L${x0.toFixed(2)} ${y0.toFixed(2)}A13.5 13.5 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`, { role: 'accent', fill: true, opacity: op });
    });
    const hand = (deg, len, o) => { const [x, y] = g.polar(24, 24, len, deg); g.line(24, 24, x, y, o); };
    hand(h * 30, 8, { role: 'line', weight: 1.15 });
    hand(a, 13, { role: 'accent' });
    g.dot(24, 24, 1.7);
  },
  /** Volume as a scope trace: the speaker, then a live sine whose height follows the level; muted flatlines. */
  volume(g, s) {
    g.polygon([[8, 19], [14, 19], [21, 12.5], [21, 35.5], [14, 29], [8, 29]], { role: 'line' });
    const muted = s.state === 'muted';
    const A = muted ? 0 : 1.5 + 6.5 * clamp(s.level);
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const x = 25 + (i / 16) * 16;
      const env = Math.sin((i / 16) * Math.PI);
      pts.push([+x.toFixed(2), +(24 - A * env * Math.sin((i / 16) * Math.PI * 4 - s.phase(2) * Math.PI * 2)).toFixed(2)]);
    }
    g.polyline(pts, { role: muted ? 'dim' : 'accent', weight: 0.85 });
    if (muted) { g.line(29.5, 19.5, 37.5, 27.5, { role: 'accent', weight: 0.9 }); g.line(37.5, 19.5, 29.5, 27.5, { role: 'accent', weight: 0.9 }); }
  },
  /** On air as a sonar ping: rings leave the core and fade out on the glass. */
  broadcast(g, s) {
    const live = s.state === 'live';
    g.circle(24, 24, 3.6, { role: live ? 'accent' : 'fill', fill: true });
    if (!live) { for (const r of [9, 15.5]) { g.arc(24, 24, r, 42, 138, { role: 'dim' }); g.arc(24, 24, r, 222, 318, { role: 'dim' }); } return; }
    for (let i = 0; i < 3; i++) {
      const p = (s.phase(1.8) + i / 3) % 1;
      const r = 6 + p * 12;
      g.circle(24, 24, r, { role: i ? 'accent' : 'line', opacity: (1 - p) ** 1.4, weight: 0.8 });
    }
  },
};

const GLYPHS = new Proxy({}, {
  get(_, id) {
    if (typeof id !== 'string') return undefined;
    const base = glyphRegistry().glyphs.get(id);
    if (!base) return undefined;
    return persistent(BESPOKE[id] || base.draw, base.loop);
  },
  has(_, id) { return typeof id === 'string' && glyphRegistry().glyphs.has(id); },
});

// ── type: the terminal cell, one beam line per row ──────────────────────────

function beamText(k, role, str, o) {
  return bitmapText(k, role, str, o, {
    paint(runs, d, color0, oo) {
      const dark = k.dark;
      const color = dark && color0 === k.colors.ink && HOT.has(k.toneName) ? mix(k.colors.ink, k.colors.accent, 0.45) : color0;
      const op = oo.opacity ?? 1;
      const gap = dark && d >= 3 ? 1 : 0;   // reverse video: dark rows merge with the dark gaps
      const line = (wid, pad = 0) => runs.map(([x, y, len]) => `M${n(x + d / 2 - pad)} ${n(y + (d - gap) / 2)}h${n(Math.max(0, len - d + pad * 2))}`).join('');
      let out = '';
      if (dark && d >= 2) out += `<path${attrs({ d: line(0), fill: 'none', stroke: color, strokeWidth: n(d * 1.7 + 1.6), strokeOpacity: n(0.11 * op, 3), strokeLinecap: 'round' })}/>`;
      out += `<path${attrs({ d: line(0), fill: 'none', stroke: color, strokeWidth: n(Math.max(1, d - gap)), strokeOpacity: op < 1 ? n(op, 3) : null, strokeLinecap: d >= 2 ? 'round' : 'square' })}/>`;
      return out;
    },
  });
}

// ── the theme ────────────────────────────────────────────────────────────────

export default defineTheme({
  id: 'phosphor',
  title: 'Phosphor',
  description: 'Green CRT keys: beam-drawn lines in a phosphor bloom, whole-pixel scanlines, persistence trails on anything that moves, a raster that blooms on press.',
  tags: ['crt', 'terminal', 'phosphor', 'retro', 'scanlines', 'green', 'dark', 'light'],
  modes: {
    dark: {
      bg: '#010402', surface: '#061109', surface2: '#020704', line: '#16391f', ink: '#78ffa4', muted: '#45b871', dim: '#2c7c4a',
      accent: '#d2ffe0', accent2: '#8af3ff', pos: '#b2ff75', info: '#74d9ff', warn: '#ffc24d', neg: '#ff9248', crit: '#ff5d70',
      spectrum: { l: 0.88, c: 0.09 },
    },
    light: {
      bg: '#86d6a0', surface: '#b8f2c9', surface2: '#a2e5b6', line: '#6cbf88', ink: '#03200e', muted: '#174a2a', dim: '#3a7550',
      accent: '#005a2b', accent2: '#00506c', pos: '#215b00', info: '#004784', warn: '#6a4100', neg: '#8a2500', crit: '#93002d',
      spectrum: { l: 0.4, c: 0.12 },
    },
  },
  defaultMode: 'dark',
  tones: { idle: 'ink', active: 'accent', busy: 'muted' },
  roles: {
    line: { color: (k, tone) => (tone === 'off' ? k.colors.muted : k.dark && HOT.has(tone) ? mix(k.colors.ink, k.colors.accent, 0.5) : k.colors.ink), width: 2.5, glow: 0.55 },
    fill: { color: (k, tone) => (tone === 'off' ? k.colors.muted : k.dark && HOT.has(tone) ? mix(k.colors.ink, k.colors.accent, 0.5) : k.colors.ink), glow: 0.5 },
    accent: { color: 'tone', width: 2.7, glow: 0.9 },
    dim: { color: 'muted', width: 2.1, opacity: 0.9, glow: 0.3 },
    spark: { color: 'tone', glow: 1 },
  },
  type: {
    eyebrow: { size: 7, weight: 600, caps: true, tracking: 0.16, color: 'muted' },
    label: { size: 10, weight: 600, caps: true, color: 'ink', baseline: 7 },
    value: { size: 22, weight: 700, tabular: true, color: 'ink' },
    hero: { size: 30, weight: 700, tabular: true, color: 'ink' },
    caption: { size: 8.5, weight: 400, color: 'muted' },
  },
  background(k, o) { tube(k, o); },
  surface(k, o) { tube(k, o); },
  paint(k, prim, style) { const h = beam(k, prim, style, 'halo'); return (h ? `<path${attrs({ d: h.d, ...h.attrs })}/>` : '') + beam(k, prim, style, 'core'); },
  paintGlyph,
  glyphBox(k, { labeled }) {
    const m = Math.min(k.w, k.h);
    const size = labeled ? m * 0.56 : m * 0.72;
    const box = { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.42 : k.h / 2) - size / 2, size };
    k._d2g = { box };
    return box;
  },
  text(k, role, str, o) { return beamText(k, role, str, o); },
  /** Bloom: brightness surges and the raster shrinks as the high voltage sags, then it decays like phosphor. */
  press(k, { pressed, age }) {
    if (!pressed && !(age < 0.42)) return null;
    const e = pressed ? 1 : Math.exp(-age / 0.11);
    const s = 1 - 0.035 * e, cx = k.w / 2, cy = k.h / 2;
    const C = k.colors;
    return {
      transform: `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})`,
      under: rect({ width: k.w, height: k.h, fill: k.dark ? '#000000' : C.surface2 }),
      overlay: rect({ width: k.w, height: k.h, fill: k.dark ? C.ink : '#ffffff', fillOpacity: n((k.dark ? 0.2 : 0.38) * e, 3) })
        + path(scanPath(k, 0, 0, k.w, k.h), { fill: k.dark ? '#000000' : C.ink, fillOpacity: n((k.dark ? 0.3 : 0.12) * e, 3) }),
    };
  },
  glyphs: GLYPHS,
});

export { tube, raster, scanPath };
