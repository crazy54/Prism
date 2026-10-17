// span-snowfall — snow falls across the whole device in three depths (fine far flakes,
// softer mid ones, a few big crystals close to the glass, each drifting on its own sway)
// and settles on the bottom row: the drift there deepens through the minute, then a gust
// lifts its top off in a glittering spray and the snow begins to gather again.
//
// The whole wall moves, so it runs at the device budget's 1–4 fps — snow is slow, and
// flakes are spaced so a frame-to-frame step reads as drifting, not jumping.

import { surface, radialGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp, smoothstep } from '../../scene/easing.js';
import { hash, noise1 } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, flakeD, polyD, clipPoly, dotD, f1, lit } from './_d6-wall.js';

const LOOP = 60, TAU = Math.PI * 2;

export default {
  id: 'span-snowfall',
  title: 'Snowfall',
  category: 'Whole Device',
  description: 'Snow falls across the device in three depths and settles on the bottom row; the drift deepens through the minute until a gust lifts it off in a glittering spray.',
  tags: ['snow', 'winter', 'weather', 'flakes', 'calm', 'ambient', 'wall', 'seasonal', 'screensaver'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 4,
  loop: LOOP,
  params: {
    density: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.1, label: 'Snow' },
    settle: { type: 'bool', default: true, label: 'Settle on the bottom row' },
    budget: BUDGET,
  },
  order: 63,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const { t } = frameClock(ctx, { fps: 4, changing: cells.length, still: 40 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const sp = (hh, o) => T.spectral(hh, o);
    // Night: deep winter blue. Day: an overcast afternoon — mid-grey blue, so white flakes still read.
    const skyTop = dark ? mix(T.colors.bg, sp(250), flat ? 0 : 0.2) : flat ? T.colors.surface : mix(mix(T.colors.surface, T.colors.ink, 0.34), sp(235), 0.22);
    const skyLow = dark ? mix(T.colors.bg, sp(225), flat ? 0 : 0.3) : flat ? T.colors.surface : mix(mix(T.colors.surface, T.colors.ink, 0.16), sp(225), 0.18);
    backdrop(k, [[0, skyTop, 0.92], [1, skyLow, 0.92]], { y2: h });
    const snow = flat ? (dark ? '#ffffff' : T.colors.ink) : '#ffffff';
    const shadow = flat ? snow : dark ? mix(T.colors.bg, sp(230), 0.55) : mix(T.colors.surface, sp(230), 0.35);
    const B = new Batch(grid);
    // the drift: deepens over 90 % of the loop, then a gust lifts it back to a thin layer
    const p = t / LOOP;
    const bottom = grid.row + grid.rows - 1;
    const floorCells = cells.filter((c) => c.row === bottom);
    const floorY = floorCells[0].y + floorCells[0].h;
    const grow = smoothstep(0, 0.9, p), gust = smoothstep(0.9, 0.985, p);
    const depth = ctx.params.settle ? K * (0.16 + 0.4 * grow * (1 - gust)) : 0;
    const surfaceAt = (x) => floorY - depth * (0.7 + 0.3 * noise1(x / K * 1.3, ctx.seed) + 0.15 * Math.sin(x / K * 3.1)) - K * 0.02;
    // the scene on the bottom row (static, so free): snow-capped pines and a street lamp whose
    // warm pool of light catches the flakes falling through it
    const pine = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, sp(170), 0.3) : mix(T.colors.ink, sp(170), 0.4);
    const nP = Math.max(2, Math.round(floorCells.length * 1.2));
    for (let i = 0; i < nP; i++) {
      const c = floorCells[i % floorCells.length];
      const x = c.x + c.w * (0.18 + 0.64 * hash(i, 71)), ph = c.h * (0.62 + 0.3 * hash(i, 72)), pw = ph * 0.34;
      if (i % floorCells.length === Math.floor(floorCells.length / 2) && floorCells.length > 1 && i < floorCells.length) continue;   // the lamp's key
      const yb = floorY - K * 0.06;
      const tiers = [[1, 0.34], [0.68, 0.62], [0.4, 0.9]];
      for (const [wf, hf] of tiers) {
        const top = yb - ph * hf, half = pw * wf;
        B.poly([[x, top - ph * 0.12], [x + half, top + ph * 0.3], [x - half, top + ph * 0.3]], fillP(pine, flat ? (dark ? 0.35 : 0.8) : 1), 2);
        B.poly([[x, top - ph * 0.12], [x + half * 0.55, top + ph * 0.08], [x, top + ph * 0.03], [x - half * 0.55, top + ph * 0.08]], fillP(snow, dark ? 0.9 : 1), 2);
      }
    }
    const lampCell = floorCells[Math.floor(floorCells.length / 2)];
    const lx = lampCell.x + lampCell.w * 0.5, ly = lampCell.y + lampCell.h * 0.26;
    const warm = flat ? lit(T) : T.spectral(70, { dl: dark ? 0.1 : 0.02 });
    const post = flat ? (dark ? '#ffffff' : T.colors.ink) : dark ? mix(T.colors.bg, '#000000', 0.3) : T.colors.ink;
    const lg = k.id('lamp');
    k.def(radialGradient(lg, [[0, warm, dark ? 0.5 : 0.45], [0.3, warm, dark ? 0.2 : 0.18], [1, warm, 0]]));
    B.raw([lx - K * 0.55, ly - K * 0.45, lx + K * 0.55, ly + K * 0.65], `<circle cx="${f1(lx)}" cy="${f1(ly + K * 0.08)}" r="${f1(K * 0.55)}" fill="${url(lg)}"/>`, 1);
    B.add([lx - K * 0.03, ly, lx + K * 0.03, floorY], fillP(post, 1), `M${f1(lx - K * 0.018)} ${f1(ly + K * 0.06)}h${f1(K * 0.036)}V${f1(floorY)}h${f1(-K * 0.036)}Z`, 2);
    B.poly([[lx - K * 0.07, ly], [lx + K * 0.07, ly], [lx + K * 0.045, ly + K * 0.09], [lx - K * 0.045, ly + K * 0.09]], fillP(post, 1), 2);
    B.add([lx - K * 0.05, ly, lx + K * 0.05, ly + K * 0.08], fillP(warm, 1), `M${f1(lx - K * 0.04)} ${f1(ly + K * 0.015)}h${f1(K * 0.08)}l${f1(-K * 0.02)} ${f1(K * 0.06)}h${f1(-K * 0.04)}Z`, 2);
    B.add([lx - K * 0.08, ly - K * 0.05, lx + K * 0.08, ly], fillP(snow, 1), `M${f1(lx - K * 0.08)} ${f1(ly)}q${f1(K * 0.08)} ${f1(-K * 0.07)} ${f1(K * 0.16)} 0Z`, 2);
    const inLamp = (x, y) => Math.hypot(x - lx, (y - ly - K * 0.1) * 0.8) < K * 0.42;
    // flakes: far (small, slow), mid, near (crystals, fast); whole laps per loop so it's seamless
    const area = (w * h) / (K * K);
    const layers = [
      { n: Math.round(area * 4 * ctx.params.density), laps: 1, r: 0.012, o: 0.5, sway: 0.08 },
      { n: Math.round(area * 2.6 * ctx.params.density), laps: 2, r: 0.026, o: 0.8, sway: 0.14 },
      { n: Math.round(area * 0.7 * ctx.params.density), laps: 3, r: 0.055, o: 0.95, sway: 0.22, crystal: true },
    ];
    const H = h + K * 0.4;
    layers.forEach((L, li) => {
      for (let i = 0; i < L.n; i++) {
        const y = ((hash(li, i, 1) + (p * L.laps)) % 1) * H - K * 0.2;
        const x = w * hash(li, i, 2) + Math.sin(TAU * (p * (1 + (i % 3)) + hash(li, i, 3))) * K * L.sway;
        if (ctx.params.settle && y > surfaceAt(x) - K * L.r) continue;      // landed: it's part of the drift now
        const r = Math.max(0.7, K * L.r * (0.75 + 0.5 * hash(li, i, 4)));
        if (L.crystal && r > 2.4) {
          const rot = TAU * (p * (i % 2 ? 1 : -1) + hash(li, i, 5));
          B.add([x - r, y - r, x + r, y + r], strokeP(snow, Math.max(0.8, r * 0.22), L.o), flakeD(x, y, r, rot), 6);
          B.dot(x, y, r * 0.22, fillP(snow, L.o), 6);
        } else B.dot(x, y, r, fillP(inLamp(x, y) && !flat ? mix(snow, warm, 0.45) : snow, L.o), li + 3);
      }
    });
    // the drift itself, per bottom-row key
    if (ctx.params.settle) {
      const pts = [];
      for (let x = floorCells[0].x - 2; x <= w + 2; x += K / 14) pts.push([x, surfaceAt(x)]);
      const body = [...pts, [w + 2, floorY + 2], [floorCells[0].x - 2, floorY + 2]];
      const shade = pts.map(([x, y]) => [x, y + K * 0.07 + depth * 0.45]).concat([[w + 2, floorY + 2], [floorCells[0].x - 2, floorY + 2]]);
      for (const c of floorCells) {
        const a = clipPoly(body, c), b = clipPoly(shade, c);
        if (a.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(snow, flat ? (dark ? 0.85 : 0.18) : dark ? 0.92 : 0.96), polyD(a), 4);
        if (b.length > 2 && !flat) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(shadow, dark ? 0.3 : 0.3), polyD(b), 5);
        if (flat && a.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(snow, Math.max(1, u), 1), polyD(a.filter(([, y]) => y < floorY), false), 5);
      }
      // the gust: powder lifted off the top, blown up and to the right
      if (gust > 0 && gust < 1) {
        let d = '';
        for (let j = 0; j < 40; j++) {
          const x0 = w * hash(j, 91), y0 = surfaceAt(x0);
          const g = clamp(gust * 1.2 - hash(j, 92) * 0.2);
          const x = x0 + g * K * (0.8 + 1.4 * hash(j, 93)), y = y0 - Math.sin(g * Math.PI) * K * (0.5 + 0.9 * hash(j, 94)) - g * K * 0.2;
          d += dotD(x, y, Math.max(0.7, K * 0.016));
        }
        B.add([0, floorCells[0].y - K * 1.6, w, floorY], fillP(snow, 0.8 * (1 - gust)), d, 6);
      }
    }
    B.emit(k);
    return k.svg();
  },
};
