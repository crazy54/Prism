// Galleon 100 SD per-widget routing — which facet (and which of its widgets) each dial layer shows,
// which ctx.data keys that needs, and the frames. Browser-safe.
//
// In the Stream Deck app every dial layer is its own Encoder action, so routing is per action:
// a galleon-widget facet (app-widget-*) renders straight into that slot; a whole-screen facet
// (screen-galleon-*, app-galleon-mix) renders the screen and the slot takes its own widget. Over
// hidraw the runtime owns the whole 720 × 384 screen, so any widget of any facet can go anywhere:
//
//   const plan = galleonPlan({ '0,0': 'app-widget-clock', '1,0': { facet: 'screen-galleon-system', from: '1,0' },
//                              '0,1': 'app-widget-audio', '1,1': { facet: 'app-galleon-mix', params: { dial1Bottom: 'spectrum' } } });
//   const release = hub.need(planData(plan));
//   const { widgets, screen } = renderGalleon(plan, { data: hub.pick(planData(plan)), theme: 'prism', t, now });
//   // widgets: [{ dial, layer, svg (360 × 180, 2:1) }] for encoder canvases · screen: one 720 × 384 SVG for hidraw

import { findFacet } from '../facets/index.js';
import { render } from '../render.js';
import { svgInner, suffixIds, svgDoc, n } from '../scene/svg.js';

/** The four slots, as the Stream Deck app reports Galleon coordinates ("dial,layer"). */
export const GALLEON_SLOTS = [{ dial: 0, layer: 0 }, { dial: 1, layer: 0 }, { dial: 0, layer: 1 }, { dial: 1, layer: 1 }].map((s) => ({ ...s, key: `${s.dial},${s.layer}` }));
const WIDGET = { w: 360, h: 180 };   // one Galleon widget window (2:1, API 1.4)
const QUAD_H = 192;                  // its quadrant on the 720 × 384 screen

/** The default routing: the overview dashboard's own widgets. */
export const DEFAULT_ROUTES = Object.freeze({ '0,0': 'app-widget-clock', '1,0': 'app-widget-volume', '0,1': 'app-widget-audio', '1,1': 'app-widget-spectrum' });

/**
 * Normalize routes → plan: [{ dial, layer, key, facet, params, state, from }]. A route is a facet id or
 * { facet, params?, state?, from? ("dial,layer" of the source widget, for whole-screen facets; default: same slot) }.
 * Unknown facets fall back to the default route for that slot.
 */
export function galleonPlan(routes = DEFAULT_ROUTES, { find = findFacet } = {}) {
  return GALLEON_SLOTS.map((s) => {
    let r = routes[s.key] ?? DEFAULT_ROUTES[s.key];
    if (typeof r === 'string') r = { facet: r };
    let f = find(r.facet);
    if (!f || f.surface !== 'screen' || !f.screens.some((x) => x === 'galleon' || x === 'galleon-widget')) { f = find(DEFAULT_ROUTES[s.key]); r = { facet: f?.id }; }
    const whole = !f.screens.includes('galleon-widget');
    return { ...s, facet: f, params: r.params || {}, state: r.state || 0, from: whole ? (r.from || s.key) : null };
  });
}

/** Every ctx.data key a plan needs (hand it to hub.need). */
export const planData = (plan) => [...new Set(plan.flatMap((p) => p.facet?.data || []))];

/**
 * Render a plan for one instant. opts: render() options shared by every slot (theme, mode, t, now, data,
 * seed, tzOffset, reduced, idPrefix). Whole-screen facets that feed several slots render once.
 * → { widgets: [{ dial, layer, svg }], screen (720 × 384 SVG of the four widgets) }
 */
export function renderGalleon(plan, opts = {}) {
  const cache = new Map();
  const base = opts.idPrefix || 'gr';
  const widgets = plan.map((p, i) => {
    const o = { ...opts, params: p.params, state: p.state, idPrefix: `${base}${i}` };
    if (!p.from) return { dial: p.dial, layer: p.layer, svg: render(p.facet, { ...o, screen: 'galleon-widget' }).svg };
    const ck = JSON.stringify([p.facet.id, p.params, p.state]);
    if (!cache.has(ck)) cache.set(ck, render(p.facet, { ...o, screen: 'galleon', idPrefix: `${base}s${cache.size}` }));
    const [d, l] = p.from.split(',').map(Number);
    const w = cache.get(ck).widgets.find((x) => x.dial === d && x.layer === l);
    return { dial: p.dial, layer: p.layer, svg: w.svg };
  });
  return { widgets, screen: composeScreen(widgets) };
}

/** Place four widget SVGs on one 720 × 384 canvas (deck SVG subset: groups + translate; ids suffixed per slot). */
export function composeScreen(widgets) {
  let body = '', defs = '';
  for (const w of widgets) {
    const svg = suffixIds(w.svg, `-${w.dial}${w.layer}`);
    const vb = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    const [vx, vy, vw, vh] = vb ? vb.slice(1).map(Number) : [0, 0, WIDGET.w, WIDGET.h];
    let inner = svgInner(svg);
    const d = /^<defs>([\s\S]*?)<\/defs>/.exec(inner);
    if (d) { defs += d[1]; inner = inner.slice(d[0].length); }
    const sx = WIDGET.w / vw, sy = WIDGET.h / vh;
    const clip = `gc${w.dial}${w.layer}`;
    // API 1.4: each 2:1 widget window sits centered in its 360 × 192 quadrant (6 px gutters above and below).
    const x0 = w.dial * WIDGET.w, y0 = w.layer * QUAD_H + (QUAD_H - WIDGET.h) / 2;
    defs += `<clipPath id="${clip}"><rect x="${n(x0)}" y="${n(y0)}" width="${WIDGET.w}" height="${WIDGET.h}"/></clipPath>`;
    body += `<g clip-path="url(#${clip})"><g transform="translate(${n(x0 - vx * sx)} ${n(y0 - vy * sy)})${sx !== 1 || sy !== 1 ? ` scale(${n(sx, 4)} ${n(sy, 4)})` : ''}">${inner}</g></g>`;
  }
  return svgDoc({ w: WIDGET.w * 2, h: QUAD_H * 2, defs, body });
}
