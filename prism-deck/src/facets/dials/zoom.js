// dial-zoom — zoom on one encoder. Turn: the zoom walks a log scale (10 % … 800 %, an even step per
// detent at any level) and a minimap shows the viewport frame growing and shrinking over the page;
// the scale under it marks 25 · 50 · 100 · 200 · 400 % with a pointer. Push: "Fit" — the segment
// confirms (your app's fit-to-screen shortcut is the action). On the + strip, hold to reset to 100 %.

import { surface, rect, path, n, P, linearGradient, url } from '../../scene/index.js';
import { clamp, lerp, outExpo } from '../../scene/easing.js';
import { mix } from '../../scene/color.js';
import { finish, arrival, pointer } from './_d4-dial.js';
import { text } from '../apps/_d7-kit.js';

const LO = 0.1, HI = 8;
const zoomOf = (v) => LO * (HI / LO) ** clamp(v);
const valueOf = (z) => Math.log(z / LO) / Math.log(HI / LO);
const pct = (z) => `${Math.round(z * 100)}%`;

export default {
  id: 'dial-zoom',
  title: 'Zoom Dial',
  category: 'Dial Segments',
  description: 'Zoom on a dial: each detent is an even step on a log scale from 10 % to 800 %, a minimap frames the viewport, push to fit. Hold the strip to return to 100 %.',
  tags: ['zoom', 'scale', 'magnify', 'design', 'canvas', 'editor', 'fit', 'dial', 'encoder'],
  surface: 'strip',
  segments: 1,
  fps: 10,
  loop: 4,
  press: 'momentary',
  params: {
    label: { type: 'text', default: 'Zoom', maxLength: 12, label: 'Label' },
    value: { type: 'number', default: Math.round(valueOf(1) * 10000) / 10000, min: 0, max: 1, step: 0.0001, label: 'Zoom (0–1 on the log scale; 100 % ≈ 0.525)' },
    step: { type: 'number', default: 0.02, min: 0.005, max: 0.1, step: 0.005, label: 'Step per detent' },
    hue: { type: 'hue', default: 217.5, min: 0, max: 360, label: 'Hue' },
  },
  order: 42,
  render(ctx) {
    const k = surface(ctx);
    const { w, h } = ctx;
    const C = k.colors;
    const v = clamp(ctx.value);
    const z = zoomOf(v);
    const e = arrival(ctx, 0.5);
    const fit = ctx.pressed || ctx.pressAge < 1.2;
    k.background({ tone: fit ? 'active' : 'idle' });
    const s = k.m.safe;
    const ink = k.dark ? '#ffffff' : C.ink;
    // the minimap: a page (with a few content blocks) and the viewport frame at this zoom
    const mx = s + 2, my = 24, mw = 66, mh = 46;
    k.add(rect({ x: mx, y: my, width: mw, height: mh, rx: 4, fill: k.dark ? mix(C.surface2, '#000000', 0.4) : mix(C.surface2, C.line, 0.3), stroke: C.line, strokeWidth: 1 }));
    // page content (scaled with the zoom so the frame reads as moving over it): one path
    const bx = mx + 8, byy = my + 8;
    let content = `M${n(bx)} ${n(byy)}h${n(mw * 0.42)}v3.2h${n(-mw * 0.42)}Z`;
    for (let i = 0; i < 3; i++) content += `M${n(bx)} ${n(byy + 9 + i * 6)}h${n(mw * (0.72 - i * 0.12))}v2h${n(-mw * (0.72 - i * 0.12))}Z`;
    content += `M${n(mx + mw * 0.62)} ${n(my + mh * 0.58)}h${n(mw * 0.26)}v${n(mh * 0.28)}h${n(-mw * 0.26)}Z`;
    k.add(path(content, { fill: C.dim, fillOpacity: 0.7 }));
    // viewport: 1/z of the page (clamped to the map; < 100 % the frame is larger than the page)
    const vw = clamp(mw / z, 6, mw + 10), vh = clamp(mh / z, 4, mh + 8);
    const vx = mx + mw / 2 - vw / 2, vy = my + mh / 2 - vh / 2;
    const tint = ctx.tint;
    const turning = Number.isFinite(ctx.turnAge) && ctx.turnAge < 0.6;
    k.add(rect({ x: n(vx), y: n(vy), width: n(vw), height: n(vh), rx: 2.5, fill: tint, fillOpacity: turning ? 0.16 : 0.1, stroke: tint, strokeWidth: turning ? 2 : 1.6 }));
    // corner marks on the viewport
    const cm = Math.min(5, vw / 3, vh / 3);
    const cx0 = vx, cy0 = vy, cw = vw, chh = vh;
    const corners = P().M(cx0, cy0 + cm).V(cy0).H(cx0 + cm).M(cx0 + cw - cm, cy0).H(cx0 + cw).V(cy0 + cm).M(cx0 + cw, cy0 + chh - cm).V(cy0 + chh).H(cx0 + cw - cm).M(cx0 + cm, cy0 + chh).H(cx0).V(cy0 + chh - cm);
    k.add(path(corners.d, { fill: 'none', stroke: ink, strokeWidth: 1.6, strokeLinecap: 'round' }));
    // readout + the log scale
    const rx0 = mx + mw + 12, rx1 = w - s;
    k.eyebrow(fit ? `${ctx.params.label} · fit ✓` : ctx.params.label, { x: s, color: fit ? 'pos' : 'muted', maxWidth: w - s * 2 });
    text(k, fit && ctx.pressAge < 1.2 && !ctx.pressed ? 'Fit' : pct(z), { x: rx1, cy: 46, size: turning ? 29 : 27, weight: 700, tabular: true, anchor: 'end', color: 'ink', maxWidth: rx1 - rx0, opacity: e });
    const sy = 80, sx0 = rx0, sw = rx1 - rx0;
    let tk = '';
    for (const m of [0.25, 0.5, 1, 2, 4]) { const x = sx0 + sw * valueOf(m); tk += `M${n(x)} ${n(sy)}v${m === 1 ? 7 : 4.5}`; }
    for (let i = 0; i <= 20; i++) { const x = sx0 + (sw * i) / 20; tk += `M${n(x)} ${n(sy)}v1.8`; }
    k.add(rect({ x: n(sx0), y: sy - 0.5, width: n(sw), height: 1, fill: C.line }));
    k.add(path(tk, { stroke: C.dim, strokeWidth: 1, fill: 'none' }));
    text(k, '100', { x: sx0 + sw * valueOf(1), y: sy + 15, size: 8.5, weight: 600, color: 'dim' });
    const px = sx0 + sw * v * e + sw * (1 - e) * valueOf(1);
    k.add(path(pointer(px, sy - 6.5, 3.6), { fill: tint }));
    void lerp; void outExpo; void linearGradient; void url;
    return finish(k);
  },
};
