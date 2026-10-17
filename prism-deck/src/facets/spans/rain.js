// span-rain — spectral rain falling down the whole device. Each drop is a streak of
// light with a bright head and a fading tail; it falls through the rows (behind the
// bezels between them) and splashes in the bottom row. The tail is as long as the
// distance the drop travels between frames, so the rain reads as continuous at any
// frame rate the device budget allows. Drawn per key: a key with no drop in it stays
// still.

import { surface, rect, path, ellipse, linearGradient, url, n } from '../../scene/index.js';
import { clamp, outCubic } from '../../scene/easing.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, vClip, spectrumHue, half } from './_d3-span.js';

export default {
  id: 'span-rain',
  title: 'Spectral Rain',
  category: 'Ripples & Light',
  description: 'Streaks of colored light rain down the whole device, falling through the rows behind the bezels and splashing in the bottom row; calm, sparse and seamless.',
  tags: ['rain', 'drops', 'ambient', 'screensaver', 'spectrum', 'calm', 'span'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 10,
  loop: 12,
  params: {
    density: { type: 'number', default: 1.6, min: 0.5, max: 3, step: 0.1, label: 'Density (drops per column)' },
    color: { type: 'select', default: 'spectrum', options: ['spectrum', 'hue', 'white'], label: 'Color' },
    hue: { type: 'hue', default: 217.5, min: 0, max: 360, label: 'Hue' },
    budget: BUDGET,
  },
  order: 41,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    const streams = Math.max(2, Math.round(grid.cols * ctx.params.density));
    const { t, dt } = frameClock(ctx, { fps: 10, changing: Math.min(grid.cells.length, Math.ceil(streams * 2)), still: 3.3 });
    materials(k);
    const KW = grid.key.w, KH = grid.key.h, u = k.m.u;
    const bottomRow = grid.row + grid.rows - 1;
    const floor = grid.cells.find((c) => c.row === bottomRow).y + KH - k.m.safe;   // where drops land
    const LOOP = 12;
    for (let j = 0; j < streams; j++) {
      // each stream: its own column position, speed and color; whole cycles per LOOP (seamless)
      const laps = 2 + Math.floor(hash(j, ctx.seed, 2) * 3);           // 2–4 drops per loop
      const period = LOOP / laps;
      const ph = hash(j, ctx.seed, 3);
      const f = (t / period + ph) % 1;
      const col = grid.cells[j % grid.cols];                          // every column gets its share
      const x = half(col.x + KW * (0.18 + 0.64 * hash(j, ctx.seed, 4, Math.floor(t / period + ph))));
      const fall = 0.72;                                                // fraction of the period spent falling
      const top = -KH * 0.4, len = floor - top;
      const vel = len / (period * fall);
      const hue = ctx.params.color === 'spectrum' ? spectrumHue(hash(j, ctx.seed, 5)) : ctx.hue;
      const c = ctx.params.color === 'white' ? (T.dark ? (T.colors.beam || '#ffffff') : T.colors.ink) : T.spectral(hue, { dl: T.dark ? 0.04 : 0 });
      if (f < fall) {
        const yHead = top + (f / fall) * len;
        const tail = Math.max(KH * 0.55, vel * dt * 1.15);
        const y0 = yHead - tail;
        const gid = k.id(`r${j}`);
        k.def(linearGradient(gid, [[0, c, 0], [0.8, c, 0.75], [1, c, 1]], { x1: 0, y1: y0, x2: 0, y2: yHead, gradientUnits: 'userSpaceOnUse' }));
        const w = Math.max(2, 2.2 * u);
        for (const cell of grid.cells) {
          const seg = vClip(cell, x, y0, yHead);
          if (!seg) continue;
          k.add(rect({ x: n(x - w * 2), y: n(seg[0]), width: n(w * 4), height: n(seg[1] - seg[0]), rx: n(w * 2), fill: url(gid), fillOpacity: 0.16 }));
          k.add(rect({ x: n(x - w / 2), y: n(seg[0]), width: n(w), height: n(seg[1] - seg[0]), rx: n(w / 2), fill: url(gid) }));
          if (yHead >= cell.y && yHead <= cell.y + cell.h) k.add(rect({ x: n(x - w), y: n(yHead - w * 2), width: n(w * 2), height: n(w * 2), rx: n(w), fill: T.dark ? '#ffffff' : c, fillOpacity: 0.9 }));
        }
      } else {
        // the splash: a widening ellipse on the floor, in the bottom-row key under the drop
        const s = (f - fall) / (1 - fall);
        const cell = grid.cells.find((cc) => cc.row === bottomRow && x >= cc.x && x <= cc.x + cc.w);
        if (!cell || s > 0.8) continue;
        const e = outCubic(clamp(s / 0.8));
        const rx = KW * (0.06 + 0.3 * e), ry = rx * 0.24;
        k.add(ellipse({ cx: x, cy: n(floor - ry), rx: n(rx), ry: n(ry), fill: 'none', stroke: c, strokeWidth: n(Math.max(1.25, k.m.line)), strokeOpacity: n((1 - e) * 0.95, 3) }));
        if (s < 0.3) for (const sgn of [-1, 1]) k.add(path(`M${n(x + sgn * rx * 0.3)} ${n(floor - ry * 2)}l${n(sgn * KW * 0.05 * (0.5 + e))} ${n(-KH * 0.1 * (1 - e))}`, { stroke: c, strokeWidth: n(Math.max(1, k.m.hair * 1.2)), strokeOpacity: n(1 - s / 0.3, 3), strokeLinecap: 'round', fill: 'none' }));
      }
    }
    return k.svg();
  },
};
