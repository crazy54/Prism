// Theme contract — a deck theme is a MATERIAL: how keys, roles, type and press
// feedback look. Glyphs supply geometry; themes paint it. Everything here has a
// default, so a theme can be a palette and three role styles, or a full art
// direction with custom painters and per-glyph overrides.
//
//   import { defineTheme, helpers } from './_theme.js';
//   export default defineTheme({
//     id: 'paper', title: 'Paper', description: '…', tags: ['light', 'print'],
//     modes: { light: { bg: '#f4f1ea', surface: '#fbf9f4', ink: '#22201c', … } },   // or { dark, light }
//     roles: { line: { color: 'ink', width: 3.2 }, accent: { color: 'tone', width: 3.2, glow: 0 } },
//     type: { label: { weight: 700, caps: true, tracking: 0.08 } },
//     background(k, o) { … },                       // key material (o.tone, o.state)
//     paint(k, prim, style) { … },                  // one primitive, grid units → markup
//     press(k, o) { return { transform, overlay } },
//     glyphs: { mic(g, s) { … } },                  // bespoke art for specific glyphs
//   });
//
// Palette keys (every mode): bg surface surface2 line ink muted dim accent accent2
// pos info warn neg crit — optional: edge edgeOpacity beam beamOpacity sheenOpacity
// spectrum { l, c } (OKLCH lightness/chroma of the theme's Spectrum).
// Role style: { color, width (grid units at 48), opacity, glow (0–1), cap, join }.
// Color specs: a palette key ('ink', 'accent', …), 'tone' (the state's tone color),
// 'tint' (the facet's Spectrum hue), '#rrggbb', or (k, tone) => '#rrggbb'.

import { oklch, hexToOklch, mix, lambdaOf } from '../scene/color.js';
import { rect, url, linearGradient, radialGradient, n, attrs } from '../scene/svg.js';
import { textPath, fitText, wrapText, capHeight } from '../scene/text.js';
import { pulse, lerp, clamp, outExpo } from '../scene/easing.js';
import { flattenPath, insidePolys, distToPolys, transformPath } from '../scene/geom.js';

export const PALETTE_KEYS = ['bg', 'surface', 'surface2', 'line', 'ink', 'muted', 'dim', 'accent', 'accent2', 'pos', 'info', 'warn', 'neg', 'crit'];
export const TONES = ['idle', 'active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit', 'busy', 'off'];
export const TEXT_ROLES = ['eyebrow', 'label', 'value', 'hero', 'caption'];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Reference type sizes for a 72 px key; panels (strips / dial segments / screens) scale them by h/100 × 1.45.
export const BASE_TYPE = {
  eyebrow: { size: 8, weight: 600, caps: true, tracking: 0.1, color: 'muted' },
  label: { size: 11, weight: 600, color: 'ink', baseline: 6.5 },
  value: { size: 22, weight: 600, tabular: true, color: 'ink' },
  hero: { size: 30, weight: 700, tabular: true, color: 'ink' },
  caption: { size: 8.5, weight: 400, color: 'muted' },
};
export const BASE_ROLES = {
  line: { color: 'ink', width: 3 },
  fill: { color: 'ink' },
  accent: { color: 'tone', width: 3 },
  dim: { color: 'muted', width: 2.5, opacity: 0.85 },
  spark: { color: 'tone' },
};

/** Tone → palette key. Themes may override via `tones`. */
export const BASE_TONES = { idle: 'accent', active: 'accent', ok: 'pos', info: 'info', warn: 'warn', neg: 'neg', alert: 'neg', crit: 'crit', busy: 'muted', off: 'dim' };

// ── default material ─────────────────────────────────────────────────────────

function defaultBackground(k, { tone = 'idle', x = 0, y = 0, w = k.w, h = k.h, radius = 0 } = {}) {
  const C = k.colors;
  const bg = k.id('bg');
  k.def(linearGradient(bg, [[0, C.surface], [1, C.surface2]]));
  k.add(rect({ x, y, width: w, height: h, rx: radius || null, fill: url(bg) }));
  if (tone !== 'idle' && tone !== 'off') {
    const gl = k.id('tone');
    const c = k.tone(tone);
    k.def(radialGradient(gl, [[0, c, k.dark ? 0.28 : 0.16], [1, c, 0]], { cx: 0.5, cy: 1.05, r: 0.85 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(gl) }));
  }
  k.add(rect({ x: x + k.m.safe, y, width: w - k.m.safe * 2, height: k.m.hair, fill: C.edge || '#ffffff', fillOpacity: C.edgeOpacity ?? (k.dark ? 0.1 : 0.7) }));
}

/** Paint one primitive (grid units). style = resolved role style { color, width, opacity, glow, cap, join }. */
export function defaultPaint(k, prim, style) {
  const op = (style.opacity ?? 1) * (prim.opacity ?? 1);
  const w = (style.width ?? 3) * (prim.weight ?? 1);
  const dash = prim.dash ? prim.dash.map((v) => n(v)).join(' ') : null;
  let out = '';
  if (prim.fill) {
    if (style.glow) out += `<path${attrs({ d: prim.d, fill: 'none', stroke: style.color, strokeWidth: n(2 + 4 * style.glow), strokeOpacity: n(0.16 * style.glow * op, 3), strokeLinejoin: 'round' })}/>`;
    out += `<path${attrs({ d: prim.d, fill: style.color, fillOpacity: op < 1 ? n(op, 3) : null, fillRule: style.fillRule || null })}/>`;
  } else {
    const cap = prim.cap || style.cap || 'round', join = prim.join || style.join || 'round';
    if (style.glow) out += `<path${attrs({ d: prim.d, fill: 'none', stroke: style.color, strokeWidth: n(w * (1 + 2.6 * style.glow)), strokeOpacity: n(0.18 * style.glow * op, 3), strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
    out += `<path${attrs({ d: prim.d, fill: 'none', stroke: style.color, strokeWidth: n(w), strokeOpacity: op < 1 ? n(op, 3) : null, strokeLinecap: cap, strokeLinejoin: join, strokeDasharray: dash })}/>`;
  }
  return out;
}

/** Default press feedback: the key sinks 4% and its edge flashes in the tone color, decaying over motion.press. */
function defaultPress(k, { pressed, age }) {
  const dur = 0.22;
  if (!pressed && !(age < dur)) return null;
  const e = pressed ? 1 : 1 - outExpo(clamp(age / dur));
  const s = 1 - 0.04 * e, cx = k.w / 2, cy = k.h / 2;
  return {
    transform: `translate(${n(cx)} ${n(cy)}) scale(${n(s, 4)}) translate(${n(-cx)} ${n(-cy)})`,
    under: rect({ width: k.w, height: k.h, fill: '#000000' }),
    overlay: rect({ x: k.m.hair, y: k.m.hair, width: k.w - k.m.hair * 2, height: k.h - k.m.hair * 2, rx: k.m.radius, fill: 'none', stroke: k.tone(k.toneName === 'idle' ? 'active' : k.toneName), strokeWidth: k.m.line, strokeOpacity: n(0.8 * e, 3) }),
  };
}

/** Where the glyph sits: { x, y, size } in surface px. */
function defaultGlyphBox(k, { labeled }) {
  const m = Math.min(k.w, k.h);
  const size = labeled ? m * 0.56 : m * 0.72;
  return { x: k.w / 2 - size / 2, y: (labeled ? k.h * 0.42 : k.h / 2) - size / 2, size };
}

/** Default text roles: eyebrow top-left, label bottom-center (fitted), value/hero centered, caption small. */
function defaultText(k, role, str, o = {}) {
  const st = k.typeStyle(role, o);
  const color = k.color(o.color ?? st.color);
  const base = { size: st.size, weight: st.weight, tracking: st.tracking || 0, caps: !!st.caps, tabular: !!st.tabular, fill: color, fillOpacity: o.opacity };
  const safe = k.m.text ?? k.m.safe;
  const room = o.maxWidth ?? k.w - safe * 2;
  const anchor = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : o.align === 'center' ? 'middle' : null;
  switch (role) {
    case 'eyebrow': {
      const a = anchor || 'start';
      const x = o.x ?? (a === 'start' ? safe : a === 'end' ? k.w - safe : k.w / 2);
      return textPath(str, { ...base, x, y: o.y ?? safe + capHeight(st.size, st.weight), anchor: a, maxWidth: room, minSize: st.size * 0.85 });
    }
    case 'label': {
      const by = o.y ?? k.h - (st.baseline ?? 6.5) * k.m.u; // baseline distance from the bottom, @72 units
      if ((o.maxLines || 1) > 1) {
        const wr = wrapText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.8, maxLines: o.maxLines, weight: st.weight, tracking: st.tracking, caps: st.caps });
        return wr.lines.map((ln, i) => textPath(ln, { ...base, size: wr.size, x: o.x ?? k.w / 2, y: by - (wr.lines.length - 1 - i) * wr.lineHeight, anchor: anchor || 'middle' })).join('');
      }
      return textPath(str, { ...base, x: o.x ?? k.w / 2, y: by, anchor: anchor || 'middle', maxWidth: room, minSize: st.size * 0.8 });
    }
    case 'value': case 'hero': {
      const cy = o.cy ?? k.h * 0.52;
      const f = fitText(str, { maxWidth: room, size: st.size, minSize: st.size * 0.55, weight: st.weight, tracking: st.tracking, tabular: st.tabular, caps: st.caps });
      return textPath(f.text, { ...base, size: f.size, x: o.x ?? k.w / 2, y: cy + capHeight(f.size, st.weight) / 2, anchor: anchor || 'middle' });
    }
    default:
      return textPath(str, { ...base, x: o.x ?? k.w / 2, y: o.y ?? k.h - safe, anchor: anchor || 'middle', maxWidth: room, minSize: st.size * 0.85 });
  }
}

// ── key grammar: the bezel cut ───────────────────────────────────────────────
// The deck's bezel covers the corners of each key's LCD (the photo of the owner's Galleon 100 SD shows
// them cut off), so a state flag, a notch or a corner tag never sits IN a corner: it hangs from a point
// BEZEL_INSET of the surface's short side in from it (≈ 6 px on a 72 px key, 13 px on a 160 px key).

export const BEZEL_INSET = 0.08;

/** The bezel-safe top-right corner of a rect (default: the whole surface) → { X, Y, i }. */
export function bezelCorner(k, { x = 0, y = 0, w = k.w, h = k.h } = {}) {
  const i = Math.max(1, BEZEL_INSET * Math.min(w, h));
  return { X: x + w - i, Y: y + i, i };
}

/** A right-triangle corner flag with legs s, hanging from the bezel-safe top-right corner → polygon points. */
export function cornerFlag(k, s, rect) {
  const { X, Y } = bezelCorner(k, rect);
  return [[X - s, Y], [X, Y], [X, Y + s]];
}

// ── helpers for theme authors ────────────────────────────────────────────────

export const helpers = {
  bezelCorner,
  cornerFlag,
  /** A soft radial glow of `color` (fades to transparent), anywhere on the surface. */
  glow(k, { cx = 0.5, cy = 1.05, r = 0.85, color, opacity = 0.3, x = 0, y = 0, w = k.w, h = k.h } = {}) {
    const id = k.id('glow');
    k.def(radialGradient(id, [[0, color, opacity], [0.55, color, opacity * 0.35], [1, color, 0]], { cx, cy, r }));
    k.add(rect({ x, y, width: w, height: h, fill: url(id) }));
  },
  /** A horizontal hairline that fades at both ends — the Beam / a lit edge. stops: colors across. */
  beam(k, { x = k.m.safe, y = 0, w = k.w - k.m.safe * 2, h = k.m.line, colors, opacity = 1, halo = 0.16 } = {}) {
    const id = k.id('beam');
    const cs = colors || [k.colors.beam || '#ffffff'];
    const stops = cs.length === 1 ? [[0, cs[0], 0], [0.5, cs[0], 1], [1, cs[0], 0]] : cs.map((c, i) => [i / (cs.length - 1), c, i === 0 || i === cs.length - 1 ? 0 : 1]);
    k.def(linearGradient(id, stops, { x1: 0, y1: 0, x2: 1, y2: 0 }));
    k.add(rect({ x, y, width: w, height: h, fill: url(id), fillOpacity: opacity < 1 ? n(opacity, 3) : null }));
    if (halo) k.add(rect({ x, y, width: w, height: h * 4, fill: url(id), fillOpacity: n(halo * opacity, 3) }));
  },
  /** Vertical gradient fill of a rect. */
  gradient(k, { x = 0, y = 0, w = k.w, h = k.h, stops, rx, vertical = true } = {}) {
    const id = k.id('grad');
    k.def(linearGradient(id, stops, vertical ? {} : { x1: 0, y1: 0, x2: 1, y2: 0 }));
    k.add(rect({ x, y, width: w, height: h, rx: rx || null, fill: url(id) }));
  },
  /** Pulse 0–1 at period seconds (alerts). */
  pulse: (k, period = 1.2) => pulse(k.ctx.t, period),
  /**
   * Pixelate a glyph: sample its primitives on a cells × cells grid over the 48-unit
   * box and draw a square per covered cell in the role's color. Returns markup in grid units.
   */
  pixelate(k, prims, styleOf, { cells = 12, gap = 0.12, round = 0 } = {}) {
    const cell = 48 / cells;
    const shapes = prims.map((p) => {
      const d = p.transforms.length ? p.transforms.reduceRight((acc, tf) => applyTf(acc, tf), p.d) : p.d;
      const polys = flattenPath(d, 0.3);
      const st = styleOf(p);
      return { p, polys, st, half: ((st.width ?? 3) * (p.weight ?? 1)) / 2 };
    });
    let out = '';
    const byColor = new Map();
    for (let gy = 0; gy < cells; gy++) for (let gx = 0; gx < cells; gx++) {
      const px = (gx + 0.5) * cell, py = (gy + 0.5) * cell;
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        const hit = s.p.fill ? insidePolys(px, py, s.polys) || distToPolys(px, py, s.polys) < cell * 0.35 : distToPolys(px, py, s.polys) <= Math.max(s.half, cell * 0.42);
        if (!hit) continue;
        const key = `${s.st.color}|${n((s.st.opacity ?? 1) * (s.p.opacity ?? 1), 2)}`;
        if (!byColor.has(key)) byColor.set(key, '');
        const g = cell * gap / 2;
        byColor.set(key, byColor.get(key) + `M${n(gx * cell + g)} ${n(gy * cell + g)}h${n(cell - g * 2)}v${n(cell - g * 2)}h${n(-(cell - g * 2))}Z`);
        break;
      }
    }
    void round;
    for (const [key, d] of byColor) { const [c, o] = key.split('|'); out += `<path${attrs({ d, fill: c, fillOpacity: +o < 1 ? o : null })}/>`; }
    return out;
  },
  mix, oklch, lerp, clamp,
};

/** Apply a transform string (translate/rotate/scale chains as emitted by Pen.group) to path data. */
function applyTf(d, tf) {
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  for (const [, fn, args] of tf.matchAll(/(translate|rotate|scale)\(([^)]*)\)/g)) {
    const v = args.trim().split(/[\s,]+/).map(Number);
    if (fn === 'translate') m = mul(m, [1, 0, 0, 1, v[0], v[1] || 0]);
    else if (fn === 'scale') m = mul(m, [v[0], 0, 0, v[1] ?? v[0], 0, 0]);
    else { const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0; m = mul(m, [1, 0, 0, 1, cx, cy]); m = mul(m, [c, s, -s, c, 0, 0]); m = mul(m, [1, 0, 0, 1, -cx, -cy]); }
  }
  return transformPath(d, m);
}

/**
 * Spectrum tiers from a palette's `stops` (the design tokens' 12 stops: ink = text-safe,
 * vivid = beams / glows / marks, wash = tints): OKLCH L and C interpolated by hue around the circle.
 */
function spectrumTiers(stops) {
  const S = stops.map((s) => ({ h: s.h, ink: hexToOklch(s.ink), vivid: hexToOklch(s.vivid), wash: s.wash ? hexToOklch(s.wash) : null })).sort((a, b) => a.h - b.h);
  return (hue, tier) => {
    const h = ((hue % 360) + 360) % 360;
    const i = S.findIndex((s) => s.h > h);
    const hi = i < 0 ? S[0] : S[i], lo = i <= 0 ? S[S.length - 1] : S[i - 1];
    const span = ((hi.h - lo.h) + 360) % 360 || 360, f = (((h - lo.h) + 360) % 360) / span;
    const a = lo[tier] || lo.vivid, b = hi[tier] || hi.vivid;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
}

// ── defineTheme ──────────────────────────────────────────────────────────────

/** Validate + normalize a theme definition. Returns a frozen theme with resolve(mode). */
export function defineTheme(def) {
  const errs = [];
  if (typeof def.id !== 'string' || !KEBAB.test(def.id)) errs.push('id must be kebab-case');
  if (!def.title) errs.push('title is required');
  if (typeof def.description !== 'string' || def.description.length < 20 || def.description.length > 200) errs.push('description must be 20–200 characters');
  const modes = def.modes || {};
  const modeNames = Object.keys(modes).filter((m) => m === 'dark' || m === 'light');
  if (!modeNames.length) errs.push('modes needs a dark and/or light palette');
  for (const m of modeNames) for (const key of PALETTE_KEYS) if (!/^#[0-9a-f]{6}$/i.test(modes[m][key] || '')) errs.push(`modes.${m}.${key} must be #rrggbb`);
  for (const [r] of Object.entries(def.roles || {})) if (!BASE_ROLES[r]) errs.push(`unknown role "${r}"`);
  if (errs.length) throw new Error(`theme ${def.id || '?'}: ${errs.join('; ')}`);
  const roles = Object.fromEntries(Object.keys(BASE_ROLES).map((r) => [r, { ...BASE_ROLES[r], ...(def.roles?.[r] || {}) }]));
  const type = Object.fromEntries(TEXT_ROLES.map((r) => [r, { ...BASE_TYPE[r], ...(def.type?.[r] || {}) }]));
  const tones = { ...BASE_TONES, ...(def.tones || {}) };
  const theme = {
    id: def.id, title: def.title, description: def.description, tags: def.tags || [], credits: def.credits || null,
    modes: modeNames, defaultMode: modeNames.includes(def.defaultMode) ? def.defaultMode : modeNames[0],
    roles, type, tones,
    background: def.background || defaultBackground,
    surface: def.surface || def.background || defaultBackground,
    paint: def.paint || defaultPaint,
    paintGlyph: def.paintGlyph || null,
    press: def.press || defaultPress,
    glyphBox: def.glyphBox || defaultGlyphBox,
    text: def.text || defaultText,
    glyphs: def.glyphs || {},
    file: def.file,
    /** Colors for a mode, with derived extras (spectral(h), lambda). */
    resolve(mode) {
      const m = modeNames.includes(mode) ? mode : this.defaultMode;
      const C = { ...modes[m] };
      const { l, c } = C.spectrum || (() => { const [L, Cc] = hexToOklch(C.accent); return { l: L, c: Math.max(0.09, Cc) }; })();
      const tiers = C.stops ? spectrumTiers(C.stops) : null;
      /** A Spectrum color at hue h: tier 'vivid' (beams, glows, marks — default) | 'ink' (text-safe) | 'wash' (tints); or explicit { l, c }. */
      const spectral = (h, o = {}) => {
        if (tiers && o.l === undefined && o.c === undefined) { const [L, Cc] = tiers(h, o.tier || 'vivid'); return oklch(L + (o.dl || 0), Cc, h); }
        return oklch(o.l ?? (l + (o.dl || 0)), o.c ?? c, h);
      };
      return { mode: m, dark: m === 'dark', colors: Object.freeze(C), spectral, ink: (h) => spectral(h, { tier: 'ink' }), lambda: lambdaOf };
    },
  };
  return Object.freeze(theme);
}

export { defaultBackground, defaultPress, defaultGlyphBox, defaultText };
