// Glyph contract — an icon as pure geometry on a 48 × 48 grid.
//
// A glyph never picks colors, stroke weights or effects. It draws shapes and
// tags each with a semantic ROLE; the theme decides how roles look (material).
// So every glyph renders in every theme.
//
//   import { defineGlyph } from '../_glyph.js';
//   export default defineGlyph({
//     id: 'mic', title: 'Microphone', category: 'audio', tags: ['mute', 'voice'],
//     states: { on: 'active', off: 'neg' },      // state → tone (themes light keys by tone)
//     loop: 2,                                    // idle animation period in s (0 = static)
//     draw(g, s) {                                // s: { state, tone, t, since, pressed, pressAge, value, level, params, phase(p) }
//       g.rect(19, 7, 10, 20, { r: 5 });                         // role 'line' (stroked) by default
//       g.path('M13 22a11 11 0 0 0 22 0', { role: 'dim' });
//       if (s.state === 'off') g.line(10, 10, 38, 38, { role: 'accent', weight: 1.2 });
//       else g.dot(24, 40, 1.6 + s.level * 1.4);                  // role 'spark', filled
//     },
//   });
//
// Grid: 0–48 both axes, y down; keep artwork inside the SAFE area 6–42 (themes
// may add glow / extrusion around it). Optical size: a ~30-unit square glyph reads
// as large as a ~34-unit circle; align strokes to whole units at weight 3.
//
// Roles: line (primary stroke) · fill (solid mass) · accent (the highlight: stroke,
// or fill with { fill: true }) · dim (secondary detail) · spark (tiny emissive dot).
// Optional: hue (OKLCH degrees) — the glyph's natural color (a lamp is amber); icons facets default to it.
// Options on every primitive: role, fill (force fill / stroke), weight (stroke
// multiplier, 1 = the theme's role width), opacity, cap ('round' | 'butt' | 'square'),
// join, dash ([on, off] in grid units).

import { P, n } from '../scene/svg.js';
import { arcPath, polar } from '../scene/shapes.js';
import { textOutline } from '../scene/text.js';

export const GRID = 48;
export const SAFE = [6, 42];
export const ROLES = ['line', 'fill', 'accent', 'dim', 'spark'];
const FILLED_BY_DEFAULT = new Set(['fill', 'spark']);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Map a state name to a tone when a glyph lists states as an array. */
export function defaultTone(state) {
  if (/^(on|active|live|playing|open|unlocked|connected|recording|running|focus)$/.test(state)) return 'active';
  if (/^(off|muted|disabled|paused|closed|locked|disconnected|stopped|idle|ready|default)$/.test(state)) return state === 'muted' ? 'neg' : 'idle';
  if (/^(ok|healthy|done|success)$/.test(state)) return 'ok';
  if (/^(warn|warning|degraded)$/.test(state)) return 'warn';
  if (/^(busy|syncing|loading|working)$/.test(state)) return 'busy';
  if (/^(alert|error|down|failed|critical)$/.test(state)) return 'alert';
  return 'idle';
}

/**
 * The pen a glyph draws with. Records primitives (in grid units) into a tree of
 * groups; themes paint them. All methods return the pen (chainable) except group().
 */
export class Pen {
  constructor() { this.root = { group: true, children: [] }; this.stack = [this.root]; }
  get top() { return this.stack[this.stack.length - 1]; }

  _prim(d, opts = {}, closed = true) {
    const role = opts.role || 'line';
    if (!ROLES.includes(role)) throw new Error(`glyph: unknown role "${role}" (use ${ROLES.join(', ')})`);
    const fill = opts.fill ?? (FILLED_BY_DEFAULT.has(role) && closed);
    this.top.children.push({ d: String(d), role, fill, closed, weight: opts.weight ?? 1, opacity: opts.opacity ?? 1, cap: opts.cap, join: opts.join, dash: opts.dash, ...(opts.text ? { text: true } : {}) });
    return this;
  }

  /** Raw path data in grid units. Closed paths (ending in Z) may be filled; open ones are stroked. */
  path(d, opts) { return this._prim(d, opts, /[zZ]\s*$/.test(String(d))); }
  line(x1, y1, x2, y2, opts) { return this._prim(P().M(x1, y1).L(x2, y2).d, opts, false); }
  polyline(pts, opts) { const p = P().M(...pts[0]); for (const q of pts.slice(1)) p.L(...q); return this._prim(p.d, opts, false); }
  polygon(pts, opts) { const p = P().M(...pts[0]); for (const q of pts.slice(1)) p.L(...q); return this._prim(p.Z().d, opts, true); }
  circle(cx, cy, r, opts) { return this._prim(P().M(cx + r, cy).A(r, r, 0, 0, 1, cx - r, cy).A(r, r, 0, 0, 1, cx + r, cy).Z().d, opts, true); }
  ellipse(cx, cy, rx, ry, opts) { return this._prim(P().M(cx + rx, cy).A(rx, ry, 0, 0, 1, cx - rx, cy).A(rx, ry, 0, 0, 1, cx + rx, cy).Z().d, opts, true); }
  rect(x, y, w, h, opts = {}) {
    const r = Math.min(opts.r || 0, w / 2, h / 2);
    if (!r) return this._prim(P().M(x, y).H(x + w).V(y + h).H(x).Z().d, opts, true);
    return this._prim(P().M(x + r, y).H(x + w - r).A(r, r, 0, 0, 1, x + w, y + r).V(y + h - r).A(r, r, 0, 0, 1, x + w - r, y + h).H(x + r).A(r, r, 0, 0, 1, x, y + h - r).V(y + r).A(r, r, 0, 0, 1, x + r, y).Z().d, opts, true);
  }
  /** Arc from a0 to a1 degrees (0 = 12 o'clock, clockwise). */
  arc(cx, cy, r, a0, a1, opts) { const d = arcPath(cx, cy, r, a0, a1); return d ? this._prim(d, opts, false) : this; }
  /** A small emissive dot (role 'spark', filled). */
  dot(x, y, r = 1.6, opts = {}) { return this.circle(x, y, r, { role: 'spark', ...opts }); }
  /** Text as outlines (grid units); anchor start|middle|end, y = baseline. Filled with the role's color. */
  text(str, { x = 24, y = 30, size = 12, weight = 700, anchor = 'middle', role = 'fill', tracking = 0, caps = false, tabular = false, opacity } = {}) {
    const o = textOutline(str, { size, weight, tracking, caps, tabular, decimals: 2 });
    if (!o.d) return this;
    const x0 = anchor === 'middle' ? x - o.width / 2 : anchor === 'end' ? x - o.width : x;
    return this.group({ x: x0, y }, () => this._prim(o.d, { role, fill: true, opacity, text: true }, true));
  }
  /** Point on a circle (degrees, 0 = up) — convenience for radial glyphs. */
  polar(cx, cy, r, deg) { return polar(cx, cy, r, deg); }

  /** Transformed / faded group: { x, y, rotate, scale, origin: [ox, oy] (default 24,24), opacity }. */
  group(opts, fn) {
    const { x = 0, y = 0, rotate = 0, scale = 1, origin = [24, 24], opacity = 1 } = opts || {};
    let tf = '';
    if (x || y) tf += `translate(${n(x)} ${n(y)})`;
    if (rotate) tf += `rotate(${n(rotate)} ${n(origin[0])} ${n(origin[1])})`;
    if (scale !== 1) tf += `translate(${n(origin[0])} ${n(origin[1])}) scale(${n(scale, 4)}) translate(${n(-origin[0])} ${n(-origin[1])})`;
    const g = { group: true, transform: tf || null, opacity, children: [] };
    this.top.children.push(g);
    this.stack.push(g);
    try { fn(this); } finally { this.stack.pop(); }
    return this;
  }

  /** Flat list of primitives (for themes that rework geometry, e.g. pixelation): [{ ...prim, transforms: [..], opacity }]. */
  flat() {
    const out = [];
    const walk = (node, tfs, op) => {
      for (const c of node.children) {
        if (c.group) walk(c, c.transform ? [...tfs, c.transform] : tfs, op * (c.opacity ?? 1));
        else out.push({ ...c, transforms: tfs, opacity: op * c.opacity });
      }
    };
    walk(this.root, [], 1);
    return out;
  }
}

/**
 * Validate + normalize a glyph definition. Returns a frozen glyph:
 * { id, title, category, tags, states: { name: tone }, stateNames, defaultState, loop, draw, file? }
 */
export function defineGlyph(def) {
  const g = { tags: [], loop: 0, ...def };
  const errs = [];
  if (typeof g.id !== 'string' || !KEBAB.test(g.id)) errs.push('id must be kebab-case');
  if (typeof g.title !== 'string' || !g.title) errs.push('title is required');
  if (typeof g.category !== 'string' || !KEBAB.test(g.category)) errs.push('category must be kebab-case');
  if (typeof g.draw !== 'function') errs.push('draw(g, s) is required');
  let states = g.states || { default: 'idle' };
  if (Array.isArray(states)) states = Object.fromEntries(states.map((s) => [s, defaultTone(s)]));
  for (const [k, v] of Object.entries(states)) {
    if (!KEBAB.test(k)) errs.push(`state "${k}" must be kebab-case`);
    if (!['idle', 'active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit', 'busy', 'off'].includes(v)) errs.push(`state "${k}" has unknown tone "${v}"`);
  }
  if (errs.length) throw new Error(`glyph ${g.id || '?'}: ${errs.join('; ')}`);
  const stateNames = Object.keys(states);
  return Object.freeze({ ...g, states: Object.freeze(states), stateNames, defaultState: g.defaultState && states[g.defaultState] ? g.defaultState : stateNames[0], tags: [...new Set(g.tags.map((t) => String(t).toLowerCase()))] });
}

/** Run a glyph's draw for one instant → the Pen with its recorded primitives. */
export function drawGlyph(glyph, s = {}, override) {
  const pen = new Pen();
  const state = s.state && glyph.states[s.state] ? s.state : glyph.defaultState;
  const t = s.t || 0;
  const scope = {
    state, tone: glyph.states[state], t, since: s.since ?? t, pressed: !!s.pressed, pressAge: s.pressAge ?? Infinity,
    value: s.value ?? 0.5, level: s.level ?? s.value ?? 0.5, params: s.params || {},
    phase: (period = glyph.loop || 1) => { const p = (t / period) % 1; return p < 0 ? p + 1 : p; },
  };
  (override || glyph.draw)(pen, scope);
  return { pen, scope };
}
