// span-swell — the open sea across the whole device. A horizon crosses the upper keys;
// below it long swells roll toward you in perspective, row after row, each crest catching
// the light, with a glitter path running down from the low sun (by Day) or the moon (by
// Night, with stars). The water is drawn per key — every band clipped to the key it's in —
// and the swell is slow, which is what a whole-wall span can afford: 1–4 fps.

import { surface, radialGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, strokeP, backdrop, isFlat, polyD, clipPoly, dotD, ellipseD, f1, lit } from './_d6-wall.js';

const LOOP = 16, TAU = Math.PI * 2;

export default {
  id: 'span-swell',
  title: 'Ocean Swell',
  category: 'Whole Device',
  description: 'The open sea across the device: a horizon through the upper keys, long swells rolling toward you, a glitter path under the low sun by day or the moon by night.',
  tags: ['ocean', 'sea', 'waves', 'swell', 'horizon', 'water', 'calm', 'ambient', 'wall', 'nature'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 4,
  loop: LOOP,
  params: {
    sky: { type: 'select', default: 'theme', options: ['theme', 'night', 'day'], label: 'Sky (theme = Night/Day)' },
    budget: BUDGET,
  },
  order: 65,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const { t } = frameClock(ctx, { fps: 4, changing: cells.length, still: 6.4 });
    materials(k, { tone: 'off' });
    const flat = isFlat(T);
    const night = ctx.params.sky === 'theme' ? T.dark : ctx.params.sky === 'night';
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    const sp = (hh, o) => T.spectral(hh, o);
    const base = T.dark ? T.colors.bg : T.colors.surface;
    // horizon: through the upper keys (inside a key, never in a gap)
    let hy = h * (grid.rows <= 2 ? 0.36 : 0.3);
    const hc = cells.reduce((b, c) => (Math.abs(c.y + c.h / 2 - hy) < Math.abs(b.y + b.h / 2 - hy) ? c : b), cells[0]);
    hy = clamp(hy, hc.y + hc.h * 0.45, hc.y + hc.h * 0.75);
    // palette
    const skyTop = flat ? base : night ? mix(base, sp(260), 0.22) : mix('#ffffff', sp(225), 0.5);
    const skyLow = flat ? base : night ? mix(base, sp(235), 0.42) : mix('#ffffff', sp(55), 0.35);
    const seaFar = flat ? base : night ? mix(base, sp(230), 0.38) : mix(sp(220), '#ffffff', 0.25);
    const seaNear = flat ? base : night ? mix(base, sp(240), 0.16) : mix(sp(235), '#000000', 0.12);
    const glow = flat ? lit(T) : night ? mix('#ffffff', sp(220), 0.2) : mix('#fff6dc', sp(70), 0.2);
    const skyCells = cells.filter((c) => c.y < hy), seaCells = cells.filter((c) => c.y + c.h > hy);
    backdrop(k, [[0, skyTop, 0.94], [1, skyLow, 0.94]], { id: 'sky', y2: hy, cells: skyCells });
    const B = new Batch(grid);
    // the low sun / moon, and its glow
    // the sun / moon sits in a key of the horizon row (never behind a bezel), low over the water
    const sunCell = cells.filter((c) => c.row === hc.row).reduce((b, c) => (Math.abs(c.x + c.w / 2 - w * 0.66) < Math.abs(b.x + b.w / 2 - w * 0.66) ? c : b), hc);
    const sr = K * (night ? 0.16 : 0.18), sx = sunCell.x + sunCell.w * 0.55, sy = Math.max(sunCell.y + sr * 1.4, hy - K * 0.42);
    const gl = k.id('glow');
    k.def(radialGradient(gl, [[0, glow, night ? 0.35 : 0.85], [0.35, glow, night ? 0.12 : 0.4], [1, glow, 0]], { cx: f1(sx), cy: f1(sy), r: f1(K * 1.6), fx: f1(sx), fy: f1(sy), gradientUnits: 'userSpaceOnUse' }));
    for (const c of skyCells) if (Math.abs(c.x + c.w / 2 - sx) < K * 1.6 + c.w / 2) k.add(`<rect x="${f1(c.x)}" y="${f1(c.y)}" width="${f1(c.w)}" height="${f1(Math.min(c.h, hy - c.y))}" fill="${url(gl)}"/>`);
    if (night && !flat) {
      for (const c of skyCells) {
        let d = '';
        for (let j = 0; j < 6; j++) { const y = c.y + (Math.min(c.y + c.h, hy) - c.y) * hash(c.i, j, 2) * 0.9; d += dotD(c.x + c.w * hash(c.i, j, 1), y, Math.max(0.7, u * 0.5 * (0.6 + hash(c.i, j, 3)))); }
        B.add([c.x, c.y, c.x + c.w, hy], fillP('#ffffff', 0.55), d, 0);
      }
    }
    B.dot(sx, sy, sr, fillP(flat ? lit(T) : night ? mix('#ffffff', sp(80), 0.12) : '#fffaf0', 1), 1);
    if (night && !flat) B.dot(sx + sr * 0.35, sy - sr * 0.15, sr * 0.82, fillP(skyLow, 0.55), 1);   // the moon's terminator
    // the sea: bands from the horizon toward you, flowing down a band per lap
    const NB = Math.round(6 + grid.rows * 2.5);
    const flow = (t / LOOP) * 2 % 1;                               // two bands pass per loop: seamless
    const yOf = (s) => hy + (h + K * 0.2 - hy) * Math.pow(clamp(s / NB), 1.7);
    const crest = (s, x) => {
      const near = clamp(s / NB);
      const A = K * (0.012 + 0.11 * near * near);
      const L = K * (0.35 + 1.5 * near);
      return yOf(s) - A * (0.6 * Math.sin((x / L) * TAU + TAU * (t / LOOP) + s * 1.7) + 0.4 * Math.sin((x / L) * TAU * 0.47 - TAU * (t / LOOP) * 2 + s));
    };
    const cHi = flat ? lit(T) : night ? mix(seaFar, '#ffffff', 0.45) : '#ffffff';
    for (let b = -1; b < NB; b++) {
      const s0 = b + flow, s1 = b + 1 + flow;
      if (s1 < 0) continue;
      const near = clamp(s0 / NB);
      const col = mix(seaFar, seaNear, Math.pow(near, 0.8));
      const face = mix(col, night ? seaFar : '#ffffff', (night ? 0.12 : 0.14) * (1 - near * 0.5));
      for (const c of seaCells) {
        const top = [], bot = [];
        const step = Math.max(3, c.w / 24);
        for (let x = c.x; x <= c.x + c.w + 0.01; x += step) { top.push([x, Math.max(hy, crest(Math.max(0, s0), x))]); bot.push([x, Math.max(hy, crest(s1, x))]); }
        if (bot.every(([, y]) => y < c.y) || top.every(([, y]) => y > c.y + c.h)) continue;
        const band = clipPoly([...top, ...bot.reverse()], c);
        if (!flat && band.length > 2) B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(b % 2 ? col : face), polyD(band), 2);
        // the crest line, brighter near the glitter path under the sun
        if (s0 >= 0.3) {
          const line = top.filter(([, y]) => y >= c.y && y <= c.y + c.h);
          if (line.length > 1) B.add([c.x, c.y, c.x + c.w, c.y + c.h], strokeP(cHi, Math.max(0.8, u * (0.5 + 1.2 * near)), flat ? 0.4 + 0.5 * near : (night ? 0.22 : 0.4) * (0.4 + near)), polyD(line, false), 3);
        }
      }
    }
    // the glitter path: short bright dashes that flicker under the sun / moon
    const gC = flat ? lit(T) : night ? '#ffffff' : mix('#ffffff', sp(70), 0.25);
    const nG = Math.round((h - hy) / K * 26);
    for (let j = 0; j < nG; j++) {
      const s = NB * Math.pow(hash(j, 5), 1.3), y = yOf(s);
      const spread = K * (0.15 + 0.9 * clamp(s / NB));
      const x = sx + (hash(j, 6, Math.floor(t * 2)) - 0.5) * 2 * spread * (0.4 + 0.6 * hash(j, 7));
      if (hash(j, 8, Math.floor(t * 2)) < 0.4) continue;
      const len = K * (0.03 + 0.1 * clamp(s / NB));
      B.add([x - len, y - 2, x + len, y + 2], fillP(gC, night ? 0.75 : 0.9), ellipseD(x, y, len, Math.max(0.6, len * 0.16)), 4);
    }
    B.emit(k);
    return k.svg();
  },
};
