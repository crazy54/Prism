// span-caustics — the device is the floor of a swimming pool on a bright day. Sunlight,
// focused by the moving surface, draws a net of wavering bright lines over the tiles (and a
// lane stripe) and the net slowly breathes and drifts. By Night the pool's own lamps light
// it from below: deep teal water, pale cyan light.
//
// The light is a real field — the edges of a slowly wandering Voronoi web, domain-warped —
// traced per key with marching squares, so lines run on across the bezels. The whole wall
// moves, slowly, at the device budget's 1–4 fps.

import { surface, radialGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, isoPaths, rectD, f1 } from './_d6-wall.js';

const LOOP = 20, TAU = Math.PI * 2;

export default {
  id: 'span-caustics',
  title: 'Caustics',
  category: 'Ripples & Light',
  description: 'The floor of a sunlit pool across the device: a net of wavering light lines drifts over the tiles and lane stripe, running on across the bezels; lamp-lit by night.',
  tags: ['caustics', 'pool', 'water', 'light', 'summer', 'underwater', 'calm', 'ambient', 'wall'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 4,
  loop: LOOP,
  params: {
    scale: { type: 'number', default: 1, min: 0.6, max: 1.6, step: 0.05, label: 'Pattern size' },
    tiles: { type: 'bool', default: true, label: 'Tiles and lane' },
    budget: BUDGET,
  },
  order: 47,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const { t } = frameClock(ctx, { fps: 4, changing: cells.length, still: 8 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const sp = (hh, o) => T.spectral(hh, o);
    const water0 = flat ? (dark ? '#000000' : '#ffffff') : dark ? mix(T.colors.bg, sp(195), 0.3) : mix(sp(195), '#ffffff', 0.35);
    const water1 = flat ? water0 : dark ? mix(T.colors.bg, sp(215), 0.22) : mix(sp(205), '#ffffff', 0.12);
    backdrop(k, [[0, water0, 0.95], [1, water1, 0.95]], { x2: w * 0.4, y2: h });
    if (dark && !flat) {
      // the pool lamp's glow
      const gl = k.id('lamp'), lc = sp(185, { dl: 0.08 });
      k.def(radialGradient(gl, [[0, lc, 0.3], [0.5, lc, 0.1], [1, lc, 0]], { cx: f1(w * 0.5), cy: f1(h + K * 0.2), r: f1(Math.max(w, h) * 0.8), fx: f1(w * 0.5), fy: f1(h + K * 0.2), gradientUnits: 'userSpaceOnUse' }));
      for (const c of cells) k.add(`<path d="${rectD(c.x, c.y, c.w, c.h)}" fill="${url(gl)}"/>`);
    }
    const B = new Batch(grid);
    // tiles and the lane stripe (static)
    if (ctx.params.tiles) {
      const ts = K / 3.2;
      const grout = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(200), 0.45) : mix(sp(205), '#ffffff', 0.55);
      const wide = w > h;
      const lane = flat ? grout : dark ? mix(T.colors.bg, sp(240), 0.3) : mix(sp(250), T.colors.ink, 0.35);
      // the lane runs through the middle of a row / column of keys (never along a bezel)
      const mid = cells.reduce((b, c) => (Math.hypot(c.x + c.w / 2 - w / 2, c.y + c.h / 2 - h / 2) < Math.hypot(b.x + b.w / 2 - w / 2, b.y + b.h / 2 - h / 2) ? c : b), cells[0]);
      const lx = wide ? null : mid.x + mid.w / 2, ly = wide ? mid.y + mid.h / 2 : null, lw = K * 0.34;
      for (const c of cells) {
        let d = '';
        for (let x = Math.ceil(c.x / ts) * ts; x < c.x + c.w; x += ts) d += `M${f1(x)} ${f1(c.y)}v${f1(c.h)}`;
        for (let y = Math.ceil(c.y / ts) * ts; y < c.y + c.h; y += ts) d += `M${f1(c.x)} ${f1(y)}h${f1(c.w)}`;
        B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(grout, Math.max(0.8, u * 0.7), flat ? 0.18 : dark ? 0.4 : 0.5, 'butt'), d, 0);
        // the lane stripe, drawn as the part of it inside this key
        const x0 = wide ? c.x : Math.max(c.x, lx - lw / 2), x1 = wide ? c.x + c.w : Math.min(c.x + c.w, lx + lw / 2);
        const y0 = wide ? Math.max(c.y, ly - lw / 2) : c.y, y1 = wide ? Math.min(c.y + c.h, ly + lw / 2) : c.y + c.h;
        if (x1 > x0 && y1 > y0) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(lane, flat ? 0.3 : dark ? 0.7 : 0.55), rectD(x0, y0, x1 - x0, y1 - y0), 1);
      }
    }
    // the light: |f| near zero for a domain-warped wave sum (the net), two bands
    // The net is a Voronoi web: light gathers along the edges between slowly wandering cells
    // (F2 − F1 small), on a gently warped domain so the edges waver like real caustics.
    const S = K * 0.42 * ctx.params.scale, a = (t / LOOP) * TAU;
    const site = (i, j) => {
      const ph = hash(i, j, ctx.seed) * TAU, rr = 0.22 + 0.12 * hash(i, j, 5), m = 1 + Math.floor(hash(i, j, 6) * 2);
      return [(i + 0.5 + 0.3 * (hash(i, j, 7) - 0.5) + rr * Math.cos(a * m + ph)) * S, (j + 0.5 + 0.3 * (hash(i, j, 8) - 0.5) + rr * Math.sin(a * m + ph)) * S];
    };
    const sites = new Map();
    const siteAt = (i, j) => { const key = i * 4096 + j; let p = sites.get(key); if (!p) { p = site(i, j); sites.set(key, p); } return p; };
    const field = (x, y) => {
      const wx = x + Math.sin(y / S * 2.1 + a) * S * 0.08, wy = y + Math.cos(x / S * 1.9 - a) * S * 0.08;
      const ci = Math.floor(wx / S), cj = Math.floor(wy / S);
      let d1 = Infinity, d2 = Infinity;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const [px, py] = siteAt(ci + di, cj + dj);
        const ex = wx - px, ey = wy - py, dd = ex * ex + ey * ey;
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
      return -(Math.sqrt(d2) - Math.sqrt(d1));             // ≥ −width near an edge
    };
    const light = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(sp(185, { dl: 0.1 }), '#ffffff', 0.45) : '#ffffff';
    const step = Math.max(2.5, K / 34);
    for (const c of cells) {
      const r = { x: c.x - step, y: c.y - step, w: c.w + step * 2, h: c.h + step * 2 };
      const [soft, core] = isoPaths(field, r, step, [-K * 0.055, -K * 0.02]);
      const box = [c.x, c.y, c.x + c.w, c.y + c.h];
      B.add(box, fillP(light, dark ? 0.16 : 0.26, 'evenodd'), soft, 2);
      B.add(box, fillP(light, dark ? 0.55 : 0.85, 'evenodd'), core, 3);
    }
    B.emit(k);
    return k.svg();
  },
};
