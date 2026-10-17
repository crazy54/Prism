// span-aurora — the northern lights across the whole device. Great soft arcs of light
// (mint, teal, a violet-rose crown) cross the keys diagonally, curtains of faint rays
// hang from the brightest arc and shimmer, stars twinkle behind them, and a glow sits on
// the horizon of the bottom row. Everything drifts on long, seamless periods — a wall
// that is still enough for an office and alive enough to stop and look at.

import { surface, rect, radialGradient, linearGradient, url, n } from '../../scene/index.js';
import { clamp } from '../../scene/easing.js';
import { noise1, hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials } from './_d3-span.js';

const LOOP = 24, TAU = Math.PI * 2;

/** A ring of light (userSpace radial gradient) passing through (px, py) — the arc's bright inner edge sits at `at`. */
function arc(k, { cx, cy, px, py, color, peak, at = 0.82, spread = 0.12, id }) {
  const R = Math.hypot(px - cx, py - cy), r = R / at;
  const gid = k.id(id);
  k.def(radialGradient(gid, [[0, color, 0], [Math.max(0, at - 0.012), color, 0], [at, color, n(peak, 3)], [Math.min(1, at + spread * 0.3), color, n(peak * 0.42, 3)], [Math.min(1, at + spread), color, 0], [1, color, 0]], { cx: n(cx), cy: n(cy), r: n(r), fx: n(cx), fy: n(cy), gradientUnits: 'userSpaceOnUse' }));
  k.add(rect({ width: n(k.w), height: n(k.h), fill: url(gid) }));
  return { cx, cy, R };
}

export default {
  id: 'span-aurora',
  title: 'Aurora',
  category: 'Whole Device',
  description: 'The northern lights across the whole device: soft arcs of mint and violet cross the keys, ray curtains shimmer beneath them, stars twinkle, all on long seamless drifts.',
  tags: ['aurora', 'northern-lights', 'sky', 'ambient', 'wall', 'calm', 'gradient', 'screensaver'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 6,
  loop: LOOP,
  params: {
    intensity: { type: 'number', default: 1, min: 0.3, max: 1.6, step: 0.05, label: 'Intensity' },
    budget: BUDGET,
  },
  order: 12,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T, w, h } = ctx;
    const { t } = frameClock(ctx, { fps: 6, changing: grid.cells.length, still: 7 });
    materials(k, { tone: 'off' });
    const dark = T.dark, I = ctx.params.intensity * (dark ? 1 : 0.85);
    const p = (t / LOOP) * TAU;
    const mint = T.spectral(160, { dl: dark ? 0.06 : 0 }), teal = T.spectral(195), violet = T.spectral(300, { dl: dark ? 0.03 : 0 }), rose = T.spectral(345);
    // a night sky over the keys (a veil, so each theme's material still shows through)
    if (dark) {
      const sky = k.id('sky');
      k.def(linearGradient(sky, [[0, '#02030a', 0.55], [0.7, '#050a18', 0.35], [1, '#0a1626', 0.2]], { x1: 0, y1: 0, x2: 0, y2: h, gradientUnits: 'userSpaceOnUse' }));
      k.add(rect({ width: n(w), height: n(h), fill: url(sky) }));
      // stars (fixed positions per key, twinkling)
      for (const c of grid.cells) {
        let d = '';
        const count = 3 + Math.floor(hash(c.i, 9) * 3);
        for (let j = 0; j < count; j++) {
          const sx = c.x + c.w * (0.08 + 0.84 * hash(c.i, j, 1)), sy = c.y + c.h * (0.06 + 0.6 * hash(c.i, j, 2));
          const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p * (1 + (j % 3)) + hash(c.i, j, 3) * 6));
          const r = k.m.u * (0.45 + 0.5 * hash(c.i, j, 4)) * (0.7 + 0.3 * tw);
          d += `M${n(sx - r)} ${n(sy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`;
        }
        k.add(`<path d="${d}" fill="#ffffff" fill-opacity="0.7"/>`);
      }
    }
    // the arcs: centers far below the deck, drifting on whole cycles of the loop
    const dx = Math.sin(p) * w * 0.05, dy = Math.cos(p) * h * 0.06;
    arc(k, { id: 'a2', cx: w * 0.95 - dx, cy: h * 1.6 + w * 0.4, px: w * 0.42 + dx * 0.5, py: h * 0.16 + dy * 0.6, color: violet, peak: 0.42 * I, at: 0.84, spread: 0.13 });
    const main = arc(k, { id: 'a1', cx: -w * 0.1 + dx, cy: h * 1.4 + w * 0.32, px: w * 0.55 - dx * 0.4, py: h * 0.46 + dy, color: mint, peak: 0.66 * I, at: 0.86, spread: 0.11 });
    arc(k, { id: 'a1f', cx: main.cx, cy: main.cy, px: w * 0.55 - dx * 0.4, py: h * 0.46 + dy, color: dark ? '#e9fff6' : mint, peak: (dark ? 0.32 : 0.22) * I, at: 0.86, spread: 0.018 });
    arc(k, { id: 'a3', cx: w * 0.3 - dx * 0.6, cy: h * 1.5 + w * 0.36, px: w * 0.7, py: h * 0.7 - dy * 0.5, color: teal, peak: 0.3 * I, at: 0.9, spread: 0.1 });
    // ray curtains hanging from the main arc's lower edge
    const rid = k.id('ray');
    k.def(linearGradient(rid, [[0, mint, 0], [0.7, mint, n(0.22 * I, 3)], [1, rose, 0]]));
    const rays = Math.max(8, grid.cols * 5);
    for (let i = 0; i < rays; i++) {
      const fx = (i + 0.5 + (hash(i, 7) - 0.5) * 0.8) / rays;
      const x = fx * w;
      const ddx = x - main.cx;
      if (Math.abs(ddx) >= main.R) continue;
      const yHem = main.cy - Math.sqrt(main.R * main.R - ddx * ddx);
      const len = h * (0.22 + 0.3 * hash(i, 8));
      const sh = clamp(0.25 + 0.75 * noise1(t * 0.35 + i * 1.37, ctx.seed));
      const rw = Math.max(1.5, (w / rays) * (0.22 + 0.3 * hash(i, 9)));
      if (yHem - len > h || yHem < 0) continue;
      // soft-sided: a wide faint sheet with a brighter core
      k.add(rect({ x: n(x - rw * 1.2), y: n(yHem - len * 0.9), width: n(rw * 2.4), height: n(len * 0.98), fill: url(rid), fillOpacity: n(sh * 0.32, 3) }));
      k.add(rect({ x: n(x - rw * 0.35), y: n(yHem - len), width: n(rw * 0.7), height: n(len * 1.06), fill: url(rid), fillOpacity: n(sh * 0.75, 3) }));
    }
    // the horizon glow along the bottom row
    const hz = k.id('hz');
    k.def(radialGradient(hz, [[0, teal, n(0.22 * I, 3)], [0.6, teal, n(0.06 * I, 3)], [1, teal, 0]], { cx: 0.5 + Math.sin(p) * 0.15, cy: 1.15, r: 0.65 }));
    k.add(rect({ width: n(w), height: n(h), fill: url(hz) }));
    return k.svg();
  },
};
