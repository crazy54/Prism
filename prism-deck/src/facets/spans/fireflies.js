// span-fireflies — a summer night across the whole device. Grass stands along the bottom
// row; fireflies drift on slow looping paths through every key (and behind the bezels),
// each blinking on its own rhythm. Press a key and the swarm falls into step: a flash
// spreads out from your key and for a few beats every firefly blinks together, then they
// drift back to their own time (synchronous fireflies are real).
//
// Cheap on purpose: a dark firefly isn't drawn, so a key changes only while a lit one is
// inside it — most keys sit still most of the time, and the sparse wall runs at 6–8 fps.

import { surface, radialGradient, url } from '../../scene/index.js';
import { mix } from '../../scene/color.js';
import { clamp, smoothstep } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, Batch, fillP, backdrop, isFlat, f1, dotD } from './_d6-wall.js';

const LOOP = 24, TAU = Math.PI * 2;
const SYNC = 1.2;                      // the synchronized flash period (s)

/** One flash over q ∈ [0, 1) of a blink: quick rise, short hold, slow fade. */
const flash = (q) => (q < 0.12 ? smoothstep(0, 0.12, q) : q < 0.3 ? 1 : q < 0.75 ? 1 - smoothstep(0.3, 0.75, q) : 0);

export default {
  id: 'span-fireflies',
  title: 'Fireflies',
  category: 'Ripples & Light',
  description: 'A summer night across the device: fireflies drift and blink above the grass on the bottom row; press a key and the swarm falls into step, flashing together.',
  tags: ['fireflies', 'night', 'summer', 'glow', 'nature', 'press', 'ambient', 'wall', 'calm'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  press: 'momentary',
  fps: 8,
  loop: LOOP,
  params: {
    density: { type: 'number', default: 1, min: 0.4, max: 2, step: 0.1, label: 'Fireflies' },
    hue: { type: 'hue', default: 100, min: 0, max: 360, step: 1, label: 'Glow hue' },
    sync: { type: 'bool', default: true, label: 'Press to synchronize' },
    budget: BUDGET,
  },
  order: 44,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const cells = grid.cells;
    const count = Math.max(5, Math.round(cells.length * 1.7 * ctx.params.density));
    const age = ctx.pressed ? 0 : ctx.pressAge;
    const syncing = ctx.params.sync && age < 9;
    const { t } = frameClock(ctx, { fps: 8, changing: syncing ? cells.length : Math.max(3, Math.ceil(count * 0.5)), still: 9.6 });
    materials(k, { tone: 'off' });
    const dark = T.dark, flat = isFlat(T);
    const K = Math.min(grid.key.w, grid.key.h), u = k.m.u;
    // the night (Day: a warm dusk, still light enough to read as the theme's day material)
    const sky = dark ? mix(T.colors.bg, T.spectral(255), flat ? 0 : 0.2) : mix(T.colors.surface, T.spectral(280), flat ? 0 : 0.34);
    const ground = dark ? mix(T.colors.bg, T.spectral(165), flat ? 0 : 0.24) : mix(T.colors.surface, T.spectral(50), flat ? 0 : 0.45);
    backdrop(k, [[0, sky, dark ? 0.9 : 0.75], [1, ground, dark ? 0.92 : 0.8]], { y2: h });
    const B = new Batch(grid);
    // grass along the bottom row (static: drawn once per key, costs nothing per frame)
    const bottom = grid.row + grid.rows - 1;
    const blade = dark ? mix(T.colors.bg, T.spectral(150), flat ? 0 : 0.35) : (flat ? T.colors.ink : mix(T.colors.ink, T.spectral(150), 0.45));
    for (const c of cells.filter((cc) => cc.row === bottom)) {
      let d = '';
      const nb = 9 + Math.round(c.w / (K / 9));
      for (let j = 0; j < nb; j++) {
        const x = c.x + c.w * ((j + 0.5 * hash(c.i, j, 1)) / nb);
        const ht = c.h * (0.18 + 0.44 * hash(c.i, j, 2) ** 1.5);
        const lean = (hash(c.i, j, 3) - 0.5) * K * 0.16;
        const bw = K * (0.022 + 0.018 * hash(c.i, j, 4));
        d += `M${(x - bw).toFixed(1)} ${(c.y + c.h).toFixed(1)}Q${(x + lean * 0.3).toFixed(1)} ${(c.y + c.h - ht * 0.6).toFixed(1)} ${(x + lean).toFixed(1)} ${(c.y + c.h - ht).toFixed(1)}Q${(x + lean * 0.2 + bw).toFixed(1)} ${(c.y + c.h - ht * 0.5).toFixed(1)} ${(x + bw).toFixed(1)} ${(c.y + c.h).toFixed(1)}Z`;
      }
      B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(blade, dark ? 0.95 : 0.8), d, 0);
    }
    // the sky above: a few still stars and a thin moon in a top-row key (static: free)
    const topRow = cells.filter((c) => c.row === grid.row);
    if (grid.rows >= 2) {
      const starC = dark ? '#ffffff' : T.colors.ink;
      for (const c of cells.filter((cc) => cc.row < bottom)) {
        let d = '';
        const ns = c.row === grid.row ? 6 : 3;
        for (let j = 0; j < ns; j++) d += dotD(c.x + c.w * hash(c.i, j, 31), c.y + c.h * hash(c.i, j, 32) * 0.85, Math.max(0.6, u * 0.45 * (0.6 + hash(c.i, j, 33))));
        B.add([c.x, c.y, c.x + c.w, c.y + c.h], fillP(starC, dark ? 0.45 : 0.18), d, 0);
      }
      const mc = topRow[Math.min(topRow.length - 1, Math.floor(topRow.length * 0.7))];
      const mx = mc.x + mc.w * 0.6, my = mc.y + mc.h * 0.38, mr = K * 0.13;
      const moonC = dark ? mix('#fff6e0', T.spectral(80), flat ? 0 : 0.1) : flat ? T.colors.ink : mix(T.colors.surface, '#ffffff', 0.6);
      B.dot(mx, my, mr * 2.4, fillP(moonC, dark ? 0.06 : 0.25), 0);
      B.dot(mx, my, mr, fillP(moonC, dark ? 0.95 : 0.9), 0);
      B.dot(mx + mr * 0.42, my - mr * 0.18, mr * 0.86, fillP(sky, flat ? 1 : 0.97), 0);
    }
    // the fireflies
    const glow = T.spectral(ctx.params.hue, { dl: dark ? 0.06 : -0.02 });
    const hot = flat ? (dark ? '#ffffff' : T.colors.ink) : mix(glow, dark ? '#fffbe6' : '#ffffff', dark ? 0.55 : 0.2);
    const gid = k.id('glow');
    k.def(radialGradient(gid, [[0, glow, dark ? 0.75 : 0.75], [0.25, glow, dark ? 0.3 : 0.36], [0.6, glow, dark ? 0.06 : 0.1], [1, glow, 0]]));
    const press = ctx.pressKey !== null ? cells.find((c) => c.i === ctx.pressKey) : null;
    const pc = press ? [press.x + press.w / 2, press.y + press.h / 2] : [w / 2, h / 2];
    const sw = syncing ? smoothstep(0, 0.4, age) * (1 - smoothstep(7, 9, age)) : 0;
    const vel = Math.hypot(w, h) / 0.7;               // the sync wave crosses the device in ~0.7 s, then they flash as one
    for (let i = 0; i < count; i++) {
      const a = (t / LOOP) * TAU;
      const fx = 1 + (i % 2), fy = 1 + ((i >> 1) % 2);
      const x = w * (0.06 + 0.88 * hash(i, ctx.seed, 1)) + Math.sin(a * fx + hash(i, 2) * TAU) * w * 0.07 + Math.sin(a * 3 + i) * K * 0.12;
      const yb = h * (0.12 + 0.8 * (1 - hash(i, ctx.seed, 3) ** 1.6));
      const y = yb + Math.sin(a * fy + hash(i, 4) * TAU) * h * 0.06 + Math.cos(a * 2 + i * 1.7) * K * 0.1;
      // its own rhythm: 3–6 blinks a loop at its own phase, each ~1.8 s (some double-flash)
      const m = 4 + Math.floor(hash(i, ctx.seed, 5) * 4), q = ((t / LOOP) * m + hash(i, ctx.seed, 6)) % 1;
      let b = q * (LOOP / m) < 1.8 ? flash(q * (LOOP / m) / 1.8) : 0;
      if (i % 5 === 0) { const q2 = q * (LOOP / m) - 1.4; if (q2 > 0 && q2 < 1.8) b = Math.max(b, 0.8 * flash(q2 / 1.8)); }
      if (sw > 0) {
        const lag = age - Math.hypot(x - pc[0], y - pc[1]) / vel;
        const bs = lag > 0 ? flash((lag % SYNC) / SYNC) : 0;
        b = b * (1 - sw) + bs * sw;
      }
      b = Math.round(clamp(b) * 4) / 4;              // 4 brightness steps: identical paints merge, fewer distinct frames
      if (b <= 0) continue;
      const R = K * 0.34;
      B.raw([x - R, y - R, x + R, y + R], `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(R)}" fill="${url(gid)}"${b < 1 ? ` fill-opacity="${b}"` : ''}/>`, 1);
      B.dot(x, y, Math.max(1.4, K * 0.03), fillP(hot, Math.min(1, 0.4 + 0.6 * b)), 3);
      if (!dark) B.dot(x, y + u * 0.6, Math.max(0.8, K * 0.012), fillP(T.colors.ink, 0.7), 4);
    }
    B.emit(k);
    return k.svg();
  },
};
