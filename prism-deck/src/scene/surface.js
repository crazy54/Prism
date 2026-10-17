// Surface canvases — what a facet draws on. They bind the render context, the
// active theme (material) and the glyph registry together:
//
//   const k = surface(ctx);              // KeySurface for 'key', PanelSurface for strip/screen/span/deck
//   k.background({ tone: 'active' });    // the theme's material (key face, strip glass, screen…)
//   k.glyph('mic', { state: 'on' });     // geometry from the glyph, paint from the theme
//   k.label('Mic');                      // the theme's typography (text drawn as paths)
//   return k.svg();                      // keys: the theme's press feedback is applied here
//
// Metrics (k.m) scale the Refraction grammar to the surface: safe inset, radius,
// hairline / line / bold / ring strokes, and type sizes per text role. Keys scale by
// min(w, h) / 72; strips and dial segments by h / 100 × 1.45; screens by size class.

import { SvgCanvas, svgDoc, n, attrs } from './svg.js';
import { drawGlyph, Pen } from '../glyphs/_glyph.js';

// @72 px (design/tokens.json deck: bleed 4, content safe 6, text safe 8)
const KEY_METRICS = { bleed: 4, safe: 6, text: 8, radius: 9, hair: 1, line: 1.5, bold: 3, ring: 5 };

export function metricsFor(ctx) {
  const k = ctx.kind;
  let u;
  if (k === 'key') u = Math.min(ctx.w, ctx.h) / 72;
  else if (k === 'span' || k === 'deck') u = Math.min(ctx.grid?.key?.w || 72, ctx.grid?.key?.h || 72) / 72;
  else if (k === 'strip') u = (ctx.h / 100) * 1.45;
  else u = (ctx.h / 100) * (ctx.h > 200 ? 0.72 : 1.45);
  // hairlines stay ≥ 1 device px; at large sizes they thin relative to the key (crisper @2x art)
  const fine = Math.min(1, 1.6 / Math.max(1, u));
  return {
    u,
    bleed: KEY_METRICS.bleed * u,
    safe: KEY_METRICS.safe * u,
    text: KEY_METRICS.text * u,
    radius: KEY_METRICS.radius * u,
    hair: Math.max(1, KEY_METRICS.hair * u * (0.6 + 0.4 * fine)),
    line: Math.max(1.25, KEY_METRICS.line * u * (0.7 + 0.3 * fine)),
    bold: KEY_METRICS.bold * u,
    ring: KEY_METRICS.ring * u,
  };
}

class Surface extends SvgCanvas {
  constructor(ctx) {
    super({ w: ctx.w, h: ctx.h, idPrefix: ctx.idPrefix });
    this.ctx = ctx;
    this.theme = ctx.theme;
    this.colors = ctx.theme.colors;
    this.dark = ctx.theme.dark;
    this.m = metricsFor(ctx);
    this.toneName = ctx.tone || 'idle';
  }

  /** Resolve a color spec ('ink', 'accent', 'tone', 'tint', '#hex', fn) for a tone. */
  color(spec, tone = this.toneName) {
    if (typeof spec === 'function') return spec(this, tone);
    if (!spec || spec === 'tone') return this.tone(tone);
    if (spec === 'tint') return this.ctx.tint;
    if (spec[0] === '#') return spec;
    return this.colors[spec] || this.colors.ink;
  }

  /** The color of a tone (idle · active · ok · info · warn · neg · alert · crit · off) in this theme. */
  tone(tone = this.toneName) {
    const key = this.theme.tones[tone] || 'accent';
    return key === 'tint' ? this.ctx.tint : this.colors[key] || this.colors.accent;
  }

  /** A text role's style at this surface's scale: { size, weight, caps, tracking, tabular, color }. */
  typeStyle(role, o = {}) {
    const st = { ...this.theme.type[role] };
    st.size = (o.size ?? st.size * this.m.u);
    if (o.weight) st.weight = o.weight;
    return st;
  }

  /** The theme's material for this surface. o: { tone, x, y, w, h, radius, … } */
  background(o = {}) {
    const tone = o.tone ?? this.toneName;
    if (o.tone) this.toneName = o.tone;
    (this.ctx.kind === 'key' ? this.theme.background : this.theme.surface)(this, { ...o, tone });
    return this;
  }

  /** Resolved role style for a tone. */
  roleStyle(role, tone = this.toneName) {
    const r = this.theme.roles[role];
    return { ...r, color: this.color(r.color, tone) };
  }

  /**
   * Draw a glyph. o: { state, tone, x, y, size (box px) | box: { x, y, size }, labeled, value, params, t, opacity }
   * Unknown ids throw (the registry is static; a typo should fail the conformance test).
   */
  glyph(id, o = {}) {
    const g = this.ctx.glyphs.get(id);
    if (!g) throw new Error(`unknown glyph "${id}"`);
    const ctx = this.ctx;
    const override = this.theme.glyphs[id];
    const { pen, scope } = drawGlyph(g, { state: o.state, t: o.t ?? ctx.t, since: o.since ?? ctx.since, pressed: ctx.pressed, pressAge: ctx.pressAge, value: o.value ?? ctx.value, level: o.level, params: o.params || ctx.params }, override);
    const { tone, box } = this.paintPen(pen, { ...o, tone: o.tone || scope.tone });
    return { tone, box, state: scope.state };
  }

  /**
   * Paint a Pen (48-unit grid, glyph roles line / fill / accent / dim / spark) in the theme's glyph style —
   * custom pictograms (dice faces, game pieces) look like the theme's icons. o: { tone, box: { x, y, size } |
   * x, y (center), size, labeled, opacity }. → { tone, box }
   */
  paintPen(pen, o = {}) {
    const tone = o.tone || this.toneName;
    const box = o.box || (o.size ? { x: (o.x ?? this.w / 2) - o.size / 2, y: (o.y ?? this.h / 2) - o.size / 2, size: o.size } : this.theme.glyphBox(this, { labeled: !!o.labeled }));
    const s = box.size / 48;
    const body = this.theme.paintGlyph ? this.theme.paintGlyph(this, pen, { tone, box, styleOf: (p) => this.roleStyle(p.role, tone) }) : this._paintTree(pen.root, tone);
    this.add(`<g${attrs({ transform: `translate(${n(box.x)} ${n(box.y)}) scale(${n(s, 4)})`, opacity: o.opacity })}>${body}</g>`);
    return { tone, box };
  }

  /** draw(pen) on the 48-unit glyph grid, painted like a glyph (see paintPen). → { tone, box } */
  pictogram(draw, o = {}) {
    const pen = new Pen();
    draw(pen);
    return this.paintPen(pen, o);
  }

  _paintTree(node, tone) {
    let out = '';
    for (const c of node.children) {
      if (c.group) {
        const inner = this._paintTree(c, tone);
        out += c.transform || c.opacity !== 1 ? `<g${attrs({ transform: c.transform, opacity: c.opacity !== 1 ? n(c.opacity, 3) : null })}>${inner}</g>` : inner;
      } else out += this.theme.paint(this, c, this.roleStyle(c.role, tone));
    }
    return out;
  }

  /** Text in one of the theme's roles: eyebrow · label · value · hero · caption. o: { x, y, cy, align, maxWidth, maxLines, color, size, opacity } */
  /**
   * Text in a role. o.opacity fades the theme's whole lettering as one (API 1.5.1): themes may draw shadow /
   * halo / plate copies under the glyphs, and a fill-opacity on the top copy alone left those at full strength
   * (D8: chrome's shadow ignored the fade). A single path gets opacity=, anything more a <g opacity>.
   */
  text(role, str, o = {}) {
    if (str === undefined || str === null || String(str) === '') return this;
    const op = typeof o.opacity === 'number' && Number.isFinite(o.opacity) ? Math.max(0, Math.min(1, o.opacity)) : 1;
    if (op <= 0.001) return this;
    const inner = this.theme.text(this, role, String(str), { ...o, opacity: undefined });
    if (!inner || op >= 0.999) { if (inner) this.add(inner); return this; }
    const single = /^<path\b[^<]*\/>$/.test(inner) && !/\s(?:opacity|fill-opacity)=/.test(inner);
    this.add(single ? inner.replace(/^<path\b/, `<path opacity="${n(op, 3)}"`) : `<g opacity="${n(op, 3)}">${inner}</g>`);
    return this;
  }
  eyebrow(str, o) { return this.text('eyebrow', str, o); }
  label(str, o) { return this.text('label', str, o); }
  value(str, o) { return this.text('value', str, o); }
  hero(str, o) { return this.text('hero', str, o); }
  caption(str, o) { return this.text('caption', str, o); }

  /** The λ wavelength tag for the facet's hue (an instrument detail; only where it can be read). */
  lambda(o = {}) {
    if (this.ctx.kind === 'key' && Math.min(this.w, this.h) < 110 && !o.force) return this;
    return this.eyebrow(`λ${this.theme.lambda(o.hue ?? this.ctx.hue)}`, { align: 'right', color: 'dim', ...o });
  }

  /** Composite pre-rendered markup at (x, y) with an optional scale. */
  place(markup, { x = 0, y = 0, scale = 1, opacity } = {}) {
    this.add(`<g${attrs({ transform: `translate(${n(x)} ${n(y)})${scale !== 1 ? ` scale(${n(scale, 4)})` : ''}`, opacity })}>${markup}</g>`);
    return this;
  }
}

/** A key. svg() applies the theme's press feedback. */
export class KeySurface extends Surface {
  svg() {
    const ctx = this.ctx;
    const fx = this.theme.press(this, { pressed: ctx.pressed, age: ctx.pressAge ?? Infinity });
    if (!fx) return super.svg();
    const body = fx.transform ? `<g transform="${fx.transform}">${this.body}</g>` : this.body;
    return svgDoc({ w: this.w, h: this.h, defs: this.defs, body: (fx.under || '') + body + (fx.overlay || '') });
  }
}

/** Strips, dial segments, screens, spans and whole-deck canvases. */
export class PanelSurface extends Surface {}

/** The right surface for a context. */
export const surface = (ctx) => (ctx.kind === 'key' ? new KeySurface(ctx) : new PanelSurface(ctx));
