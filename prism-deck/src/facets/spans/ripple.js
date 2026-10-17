// span-ripple — press a key and a ring of light spreads from it across the device,
// splitting into the Spectrum as it goes (red outermost, violet inside — refraction);
// each key it crosses lights for a moment. Idle, slow drops fall on random keys like
// rain on a pond. The ring is drawn per key (only the arc inside each key), so a key the
// wave isn't touching stays byte-identical and costs nothing to update.
//
// Reads ctx.pressKey (API 1.2: the device key index that was pressed); falls back to
// the center key when a runtime doesn't say.

import { surface, rect, path, radialGradient, url, n } from '../../scene/index.js';
import { clamp, smoothstep, outCubic, lerp } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, runsInRect, runsPath, circlePoints, half } from './_d3-span.js';

const LIFE = 3.2;       // seconds a ring travels
const DROP = 2.2;       // seconds between idle drops

export default {
  id: 'span-ripple',
  title: 'Ripple',
  category: 'Ripples & Light',
  description: 'Press a key and a ring of light spreads from it across the device, splitting into the Spectrum and lighting each key it crosses; idle, drops fall like rain on a pond.',
  tags: ['ripple', 'press', 'wave', 'water', 'refraction', 'touch', 'ambient', 'span'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  press: 'momentary',
  fps: 10,
  loop: DROP * 4,
  params: {
    drops: { type: 'bool', default: true, label: 'Idle drops' },
    speed: { type: 'number', default: 1, min: 0.4, max: 2.5, step: 0.05, label: 'Wave speed' },
    budget: BUDGET,
  },
  order: 40,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    const cells = grid.cells;
    const { t } = frameClock(ctx, { fps: 10, changing: Math.max(Math.ceil(cells.length * 0.55), Math.min(cells.length, 6)), still: 0.9 });
    materials(k);
    const KW = grid.key.w, KH = grid.key.h, K = Math.min(KW, KH);
    const pitch = Math.hypot(KW + grid.gapX, KH + grid.gapY);
    const reach = Math.hypot(ctx.w, ctx.h) * 1.05;
    const vel = (reach / LIFE) * ctx.params.speed;
    const center = (c) => [c.x + c.w / 2, c.y + c.h / 2];
    const centerCell = cells.reduce((best, c) => (Math.hypot(...center(c).map((v, i) => v - [ctx.w / 2, ctx.h / 2][i])) < Math.hypot(...center(best).map((v, i) => v - [ctx.w / 2, ctx.h / 2][i])) ? c : best), cells[0]);
    // the waves alive now: the press (strongest), then idle drops
    const waves = [];
    const pressAge = ctx.pressed ? 0 : ctx.pressAge;
    const quiet = !(pressAge < LIFE + 1.4);
    if (pressAge < LIFE * ctx.params.speed ** -1 + 0.3) {
      const origin = cells.find((c) => c.i === ctx.pressKey) || centerCell;
      const q = Math.max(0, pressAge - (ctx.t - t));                // quantized like everything else
      waves.push({ o: center(origin), age: q, gain: 1, held: !!ctx.pressed, cell: origin });
    }
    if (ctx.params.drops && quiet) {
      const idx = Math.floor(t / DROP);
      for (const d of [idx - 1, idx]) {
        const age = t - d * DROP;
        if (age < 0 || age > LIFE / ctx.params.speed) continue;
        const c = cells[Math.floor(hash(d, ctx.seed, 41) * cells.length)];
        const [cx, cy] = center(c);
        waves.push({ o: [cx + (hash(d, 3) - 0.5) * KW * 0.5, cy + (hash(d, 4) - 0.5) * KH * 0.5], age, gain: 0.55, cell: c });
      }
    }
    const hues = [24, 150, 296];                                   // outer red · green · inner violet
    const lw = Math.max(1.25, k.m.line * 1.15);
    for (const c of cells) {
      const cc = center(c);
      let glow = 0, glowHue = 191;
      let rings = '';
      const ringPaths = [];
      for (const wv of waves) {
        const R = wv.age * vel;
        const fade = (1 - smoothstep(0.55, 1, wv.age * ctx.params.speed / LIFE)) * wv.gain;
        if (fade <= 0.01) continue;
        // the key lights as the wave passes its center
        const d = Math.hypot(cc[0] - wv.o[0], cc[1] - wv.o[1]);
        const near = 1 - clamp(Math.abs(d - R) / (pitch * 0.55));
        if (near * fade > glow) { glow = near * fade; glowHue = lerp(296, 24, clamp(d / reach * 1.6)); }
        if (wv.held && c === wv.cell) glow = Math.max(glow, 0.7);
        // the ring, split into the Spectrum, only where it crosses this key
        for (const [lag, gain] of [[0, 1], [0.32, 0.45]]) {
          const Rr = (wv.age - lag) * vel;
          if (Rr <= 1) continue;
          const split = K * 0.06 * (0.6 + 0.8 * clamp(wv.age));
          const front = runsInRect(circlePoints(wv.o[0], wv.o[1], Rr, Math.max(3, K / 18)), c, lw * 4);
          if (front.length && gain === 1) ringPaths.push({ d: runsPath(front), color: T.colors.beam || '#ffffff', op: fade * (T.dark ? 0.16 : 0.22), width: lw * 5.5 });
          hues.forEach((h, j) => {
            const r = Rr - (j - 1) * split;
            if (r <= 0) return;
            const runs = runsInRect(circlePoints(wv.o[0], wv.o[1], r, Math.max(3, K / 18)), c, lw);
            if (runs.length) ringPaths.push({ d: runsPath(runs), color: T.spectral(h, { dl: T.dark ? 0.05 : 0 }), op: fade * gain * (j === 1 ? 1 : 0.85), width: lw * (j === 1 ? 1.2 : 1) });
          });
        }
      }
      if (glow > 0.02) {
        const gid = k.id(`g${c.i}`), col = T.spectral(glowHue);
        k.def(radialGradient(gid, [[0, col, n((T.dark ? 0.5 : 0.32) * glow, 3)], [0.6, col, n((T.dark ? 0.16 : 0.1) * glow, 3)], [1, col, 0]], { cx: 0.5, cy: 0.5, r: 0.75 }));
        k.add(rect({ x: c.x, y: c.y, width: c.w, height: c.h, fill: url(gid) }));
      }
      for (const rp of ringPaths) rings += path(rp.d, { fill: 'none', stroke: rp.color, strokeWidth: n(rp.width), strokeOpacity: n(clamp(rp.op), 3), strokeLinecap: 'round', strokeLinejoin: 'round' });
      if (rings) k.add(`<g>${rings}</g>`);
    }
    // the drop / touch point
    for (const wv of waves) {
      if (!wv.held && wv.age > 0.35) continue;
      const a = wv.held ? 1 : 1 - outCubic(clamp(wv.age / 0.35));
      const gid = k.id(`p${Math.round(wv.o[0])}x${Math.round(wv.o[1])}`);
      const c = T.colors.beam || '#ffffff';
      k.def(radialGradient(gid, [[0, c, n(0.9 * a, 3)], [0.35, c, n(0.3 * a, 3)], [1, c, 0]]));
      const r = K * (wv.held ? 0.3 : 0.18 + 0.2 * clamp(wv.age / 0.35));
      k.add(rect({ x: half(wv.o[0] - r), y: half(wv.o[1] - r), width: half(r * 2), height: half(r * 2), fill: url(gid) }));
    }
    return k.svg();
  },
};
