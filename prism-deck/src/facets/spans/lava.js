// span-lava — the whole device becomes one lava lamp. Warm wax gathers in a pool on the
// bottom row, swells, lets go of a blob that rises slowly through the keys (stretching as
// it climbs, merging with others, slipping behind the bezels) and sinks back into the pool.
// The wax is a real iso-surface (metaballs, marching squares per key), so blobs neck and
// pinch apart where they meet. Lava lamps are slow, which suits the hardware: the whole
// wall changes every frame, so it moves at the device budget's 1–4 frames a second.

import { surface, rect, radialGradient, linearGradient, url } from '../../scene/index.js';
import { mix, shade } from '../../scene/color.js';
import { clamp } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, backdrop, isoPaths, isFlat, f1 } from './_d6-wall.js';

const LOOP = 48, TAU = Math.PI * 2;

export default {
  id: 'span-lava',
  title: 'Lava Lamp',
  category: 'Whole Device',
  description: 'The whole device as one lava lamp: warm wax pools on the bottom row, swells, lets go of blobs that rise through the keys, merge, pinch apart and sink back.',
  tags: ['lava', 'lamp', 'blobs', 'metaballs', 'retro', 'ambient', 'wall', 'calm', 'screensaver'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 4,
  loop: LOOP,
  params: {
    hue: { type: 'hue', default: 36, min: 0, max: 360, step: 1, label: 'Wax hue' },
    drift: { type: 'bool', default: false, label: 'Drift through the Spectrum' },
    blobs: { type: 'number', default: 1, min: 0.5, max: 1.6, step: 0.1, label: 'Wax amount' },
    budget: BUDGET,
  },
  order: 60,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const { t } = frameClock(ctx, { fps: 4, changing: grid.cells.length, still: 19 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const K = Math.min(grid.key.w, grid.key.h);
    const p = t / LOOP;
    const hue = ctx.params.drift ? (ctx.params.hue + 360 * p) % 360 : ctx.params.hue;
    // colors: wax, its lit core, the liquid around it
    const wax = T.spectral(hue, { dl: dark ? 0.02 : -0.04 }), deep = flat ? wax : shade(T.spectral(hue - 14), dark ? -0.12 : -0.1);
    const core = flat ? wax : mix(wax, dark ? '#fff4e0' : '#ffffff', dark ? 0.42 : 0.38);
    const liquidTop = dark ? mix(T.colors.bg, T.spectral(hue + 220), flat ? 0 : 0.2) : mix(T.colors.surface, T.spectral(hue + 40), flat ? 0 : 0.14);
    const liquidLow = dark ? mix(T.colors.bg, T.spectral(hue + 250), flat ? 0 : 0.34) : mix(T.colors.surface, T.spectral(hue + 10), flat ? 0 : 0.26);
    backdrop(k, [[0, liquidTop, 0.9], [1, liquidLow, 0.86]], { y2: h });
    // the bulb's glow from below
    const gl = k.id('bulb');
    k.def(radialGradient(gl, [[0, dark ? shade(wax, 0.08) : wax, dark ? 0.42 : 0.2], [0.55, wax, dark ? 0.12 : 0.06], [1, wax, 0]], { cx: f1(w / 2), cy: f1(h + K * 0.4), r: f1(Math.max(w, h) * 0.75), fx: f1(w / 2), fy: f1(h + K * 0.4), gradientUnits: 'userSpaceOnUse' }));
    for (const c of grid.cells) k.add(rect({ x: c.x, y: c.y, width: c.w, height: c.h, fill: url(gl) }));

    // the wax: blobs on whole cycles of the loop, plus the pools at the bottom and the top
    const count = Math.round(clamp((w * h) / (K * K) * 0.42, 4, 12) * ctx.params.blobs);
    const blobs = [];
    for (let i = 0; i < count; i++) {
      const cyc = 1 + (i % 3 === 0 ? 1 : 0);                 // 1 or 2 rises per loop
      const ph = hash(i, ctx.seed, 1);
      const a = TAU * (p * cyc + ph);
      // rise slowly, sink a little faster: an eased vertical cycle
      const fr = ((p * cyc + ph) % 1 + 1) % 1, tri = 1 - Math.abs(2 * fr - 1);
      const reach = i % 4 === 1 ? 0.62 : i % 4 === 3 ? 0.8 : 1;           // some only bob up halfway
      const u = reach * (0.15 * tri * tri * (3 - 2 * tri) + 0.85 * tri);
      const y = h + K * 0.25 - u * (h + K * 0.45);
      const vy = Math.abs(Math.sin(a));
      const x = w * (0.12 + 0.76 * hash(i, ctx.seed, 2)) + Math.sin(a * 2 + i) * K * 0.18;
      const r = K * (0.24 + 0.17 * hash(i, ctx.seed, 3)) * (0.85 + 0.15 * Math.sin(a + 1.3));
      blobs.push({ x, y, r2: r * r, sy: 1 + 0.35 * vy * (1 - Math.abs(u - 0.5) * 2) });
    }
    const pool = K * 0.27, top = K * 0.1;
    const field = (x, y, ox = 0, oy = 0) => {
      x += ox; y += oy;
      let f = 0;
      for (const b of blobs) {
        const dx = x - b.x, dy = (y - b.y) / b.sy;
        f += b.r2 / (dx * dx + dy * dy + 1);
      }
      const db = Math.max(1, h + K * 0.05 - y), dt = Math.max(1, y + K * 0.1);
      f += (pool * pool) / (db * db) * (1 + 0.45 * Math.sin(x / K * 2.1 + p * TAU) + 0.25 * Math.sin(x / K * 4.7 - p * TAU * 2));
      f += (top * top) / (dt * dt);
      return f;
    };
    const B = new Batch(grid);
    const step = Math.max(3, K / 30);
    const halo = dark ? 0.16 : 0.12;
    const wg = k.id('wax');
    k.def(linearGradient(wg, [[0, deep], [0.55, wax], [1, flat ? wax : mix(wax, '#ffe2b0', dark ? 0.35 : 0.15)]], { x1: 0, y1: 0, x2: 0, y2: f1(h), gradientUnits: 'userSpaceOnUse' }));
    for (const c of grid.cells) {
      const r = { x: c.x - step, y: c.y - step, w: c.w + step * 2, h: c.h + step * 2 };
      const [dHalo, dBody] = isoPaths(field, r, step, [0.8, 1]);
      // the core: the same surface shifted toward the light (up-left), a little inside — reads as round wax
      const [dCore] = isoPaths((x, y) => field(x, y, K * 0.06, K * 0.08), r, step, [3.2]);
      const box = [c.x, c.y, c.x + c.w, c.y + c.h];
      B.add(box, fillP(wax, halo, 'evenodd'), dHalo, 0);
      B.add(box, flat ? fillP(wax, 1, 'evenodd') : `fill="${url(wg)}" fill-rule="evenodd"`, dBody, 1);
      B.add(box, flat ? fillP(dark ? '#000000' : '#ffffff', 0.35, 'evenodd') : fillP(core, dark ? 0.5 : 0.55, 'evenodd'), dCore, 2);
    }
    B.emit(k);
    return k.svg();
  },
};
