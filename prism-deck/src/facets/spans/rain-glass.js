// span-rain-glass — the device is a window on a rainy evening. Out of focus behind the
// glass, the lights of the town glow as soft discs; on the glass, droplets bead, each lit
// from above with a dark lower rim. Now and then one grows too heavy and runs, in little
// stops and starts, down through the keys, sweeping the beads from its path and leaving a
// clear trail that slowly fills in again. By Day it's an overcast afternoon: a pale garden
// blurred behind the pane.
//
// Mostly still: the bokeh never moves, a bead appears or a runner moves in only a few keys a
// frame, so it runs at 6 fps inside the budget.

import { surface, radialGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp, smoothstep } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, dotD, ellipseD, f1 } from './_d6-wall.js';

const LOOP = 30;

export default {
  id: 'span-rain-glass',
  title: 'Rain on Glass',
  category: 'Ripples & Light',
  description: 'A rainy window across the device: town lights glow out of focus, droplets bead on the glass, and now and then one runs down through the keys, clearing a trail.',
  tags: ['rain', 'window', 'glass', 'droplets', 'bokeh', 'evening', 'cozy', 'ambient', 'wall', 'calm'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 6,
  loop: LOOP,
  params: {
    rain: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.1, label: 'Rain' },
    budget: BUDGET,
  },
  order: 46,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const runners = Math.max(2, Math.round(grid.cols * 0.8 * ctx.params.rain));
    const { t } = frameClock(ctx, { fps: 6, changing: Math.min(cells.length, runners * 1.5 + 2 + Math.ceil(cells.length * 0.12)), still: 12 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const sp = (hh, o) => T.spectral(hh, o);
    const p = t / LOOP;
    // behind the glass
    const top = dark ? mix(T.colors.bg, sp(255), flat ? 0 : 0.18) : flat ? T.colors.surface : mix(mix(T.colors.surface, T.colors.ink, 0.14), sp(210), 0.16);
    const low = dark ? mix(T.colors.bg, sp(30), flat ? 0 : 0.12) : flat ? T.colors.surface : mix(mix(T.colors.surface, T.colors.ink, 0.1), sp(140), 0.16);
    backdrop(k, [[0, top, 0.94], [1, low, 0.94]], { y2: h });
    // bokeh: soft discs of town light (Night) / garden greens (Day) — static
    const hues = dark ? [40, 60, 25, 200, 330] : [140, 120, 95, 200, 60];
    const grads = hues.map((hh, i) => {
      const id = k.id(`bk${i}`), c = flat ? (dark ? '#ffffff' : T.colors.ink) : sp(hh, { dl: dark ? 0.04 : 0.02 });
      k.def(radialGradient(id, [[0, c, dark ? 0.42 : 0.36], [0.62, c, dark ? 0.3 : 0.24], [0.85, c, dark ? 0.1 : 0.08], [1, c, 0]]));
      return id;
    });
    for (const c of cells) {
      const nb = 2 + Math.floor(hash(c.i, ctx.seed, 1) * 3);
      for (let j = 0; j < nb; j++) {
        const bx = c.x + c.w * hash(c.i, j, 2), by = c.y + c.h * (0.25 + 0.75 * hash(c.i, j, 3)) * (dark ? 1 : 0.9);
        const r = K * (0.12 + 0.2 * hash(c.i, j, 4));
        k.add(`<circle cx="${f1(bx)}" cy="${f1(by)}" r="${f1(r)}" fill="${url(grads[Math.floor(hash(c.i, j, 5) * grads.length)])}"/>`);
      }
    }
    const B = new Batch(grid);
    // the runners: each takes a lane, runs in stops and starts, and leaves a clear trail
    const lanes = [];
    for (let i = 0; i < runners; i++) {
      const m = 1 + (i % 2);                                   // runs per loop
      const lap = Math.floor(p * m + hash(i, 11)), f = ((p * m + hash(i, 11)) % 1 + 1) % 1;
      const x = w * (0.06 + 0.88 * hash(i, ctx.seed, 12, lap));
      const runT = 0.42;                                        // fraction of the lap spent running
      const s = f < runT ? f / runT : 1;
      // stick-slip: quick slides between pauses
      const steps = 5, q = s * steps, qi = Math.floor(q), qf = q - qi;
      const prog = s >= 1 ? 1 : (qi + smoothstep(0.35, 1, qf)) / steps;
      const y = -K * 0.1 + prog * (h + K * 0.3);
      const fill = clamp((f - runT) / (1 - runT));            // the trail beads up again after the run
      lanes.push({ x, y, s, fill, wob: hash(i, 13, lap) * 6 });
    }
    // beads on the glass (positions per key; each lives part of the loop, appears, then fades)
    const bead = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(top, '#ffffff', 0.16) : mix(low, '#ffffff', 0.4);
    const rim = flat ? bead : dark ? mix(T.colors.bg, '#000000', 0.4) : mix(T.colors.ink, sp(220), 0.3);
    const hi = dark ? '#ffffff' : '#ffffff';
    const xWob = (L, y) => L.x + Math.sin(y / K * 2.2 + L.wob) * K * 0.08;
    for (const c of cells) {
      let body = '', shade = '', glint = '';
      const nb = Math.round((14 + 12 * hash(c.i, 21)) * ctx.params.rain);
      for (let j = 0; j < nb; j++) {
        const bx = c.x + c.w * (0.04 + 0.92 * hash(c.i, j, 22)), by = c.y + c.h * (0.04 + 0.92 * hash(c.i, j, 23));
        // most beads just sit there; the rest pop in and later merge away (an event, not an animation)
        const born = hash(c.i, j, 24), life = hash(c.i, j, 28) < 0.75 ? 1 : 0.5 + 0.4 * hash(c.i, j, 25);
        const age = ((p - born) % 1 + 1) % 1;
        if (age > life) continue;
        // swept away by a runner that has passed (until its trail fills in)
        if (lanes.some((L) => Math.abs(bx - xWob(L, by)) < K * 0.08 && by < L.y && L.s > 0 && hash(c.i, j, 26) > L.fill)) continue;
        const r = Math.max(0.8, K * (0.014 + 0.042 * hash(c.i, j, 27) ** 2));
        body += dotD(bx, by, r);
        shade += ellipseD(bx, by + r * 0.45, r * 0.85, r * 0.5);
        if (r > 1.6) glint += dotD(bx - r * 0.3, by - r * 0.35, Math.max(0.5, r * 0.28));
      }
      const box = [c.x, c.y, c.x + c.w, c.y + c.h];
      B.add(box, fillP(rim, dark ? 0.45 : 0.3), shade, 1);
      B.add(box, fillP(bead, flat ? 0.7 : 0.75), body, 2);
      B.add(box, fillP(hi, dark ? 0.85 : 0.9), glint, 3);
    }
    // the runners themselves, and their trails (per key)
    for (const L of lanes) {
      if (L.s <= 0) continue;
      const r = K * 0.045;
      const trailTop = -K * 0.1;
      for (const c of cells) {
        if (L.x < c.x - K * 0.2 || L.x > c.x + c.w + K * 0.2) continue;
        const y0 = Math.max(c.y, trailTop), y1 = Math.min(c.y + c.h, L.y - r);
        if (y1 > y0 && L.fill < 0.9) {
          const pts = [];
          for (let y = y0; y <= y1 + 0.1; y += K * 0.06) pts.push([xWob(L, y), y]);
          const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('');
          B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(dark ? mix(top, '#000000', 0.25) : mix(low, '#ffffff', 0.3), r * 1.1, 0.5 * (1 - L.fill)), d, 4);
          B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(hi, Math.max(0.6, u * 0.4), 0.3 * (1 - L.fill)), d, 5);
        }
      }
      if (L.s < 1) {
        const hx = xWob(L, L.y);
        B.add([hx - r * 2, L.y - r * 2, hx + r * 2, L.y + r * 2], fillP(rim, dark ? 0.55 : 0.4), ellipseD(hx, L.y + r * 0.4, r * 1.05, r * 1.15), 6);
        B.add([hx - r * 2, L.y - r * 2, hx + r * 2, L.y + r * 2], fillP(bead, 0.9), ellipseD(hx, L.y, r, r * 1.15), 7);
        B.dot(hx - r * 0.35, L.y - r * 0.45, r * 0.3, fillP(hi, 0.95), 8);
      }
    }
    B.emit(k);
    return k.svg();
  },
};
