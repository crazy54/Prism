// span-progress — one progress bar across a row of keys. The track runs key to key
// (hidden behind the bezels between them, so the fill reads as one bar), the fill is
// the Spectrum, the head is a point of white light, and the last key reads out the
// percent. Simulated it runs a plausible job (bursts, a stall, a finish that flashes
// every key ok); with `source: value` it shows ctx.value (a runtime's 0–1 input).
// Per frame only the head's key and the readout change.

import { surface, rect, circle, linearGradient, url, n } from '../../scene/index.js';
import { clamp, lerp, smoothstep, outCubic, phase } from '../../scene/easing.js';
import { noise1 } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, inCell, middleRow, rowCells, half } from './_d3-span.js';

const RUN = 11, DONE = 2, LOOP = 14;

/** A believable job: uneven bursts, a stall around 70 %, then the final stretch. */
function simulated(tt, seed) {
  if (tt >= RUN) return 1;
  const u = tt / RUN;
  const base = u < 0.62 ? outCubic(u / 0.62) * 0.7 : u < 0.74 ? 0.7 + 0.02 * smoothstep(0.62, 0.74, u) : lerp(0.72, 1, smoothstep(0.74, 1, u));
  return clamp(base - 0.03 * noise1(tt * 1.7, seed) * (1 - u));
}

export default {
  id: 'span-progress',
  title: 'Progress Across a Row',
  category: 'Bars & Meters',
  description: 'One progress bar across a row of keys: a Spectrum fill with a white-light head that passes behind the bezels, the percent in the last key, a flash when done.',
  tags: ['progress', 'bar', 'upload', 'render', 'export', 'download', 'meter', 'span'],
  surface: 'span',
  span: { cols: 'all', rows: 1 },
  fps: 8,
  loop: LOOP,
  params: {
    label: { type: 'text', default: 'Exporting', maxLength: 16, label: 'Label' },
    source: { type: 'select', default: 'simulate', options: ['simulate', 'value'], label: 'Source' },
    value: { type: 'number', default: 0.62, min: 0, max: 1, step: 0.01, label: 'Value (source: value)' },
    hue: { type: 'hue', default: 191.3, min: 0, max: 360, label: 'Hue' },
    budget: BUDGET,
  },
  order: 31,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    const row = middleRow(grid);
    const cells = rowCells(grid, row);
    const { t } = frameClock(ctx, { fps: 8, changing: 3, still: 6.5 });
    const tt = phase(t, LOOP) * LOOP;
    const live = ctx.params.source === 'value';
    const p = live ? clamp(ctx.value) : simulated(tt, ctx.seed);
    const done = p >= 1;
    const flash = live ? 0 : smoothstep(RUN, RUN + 0.25, tt) * (1 - smoothstep(RUN + 0.6, RUN + DONE, tt));
    const reset = live ? 1 : 1 - smoothstep(RUN + DONE, LOOP, tt);
    materials(k);
    const KH = grid.key.h, u = k.m.u, hue = ctx.hue;
    const y = cells[0].y + KH * 0.64, th = Math.max(3, Math.round(4 * u));
    const x0 = cells[0].x + k.m.safe * 1.4, x1 = cells[cells.length - 1].x + grid.key.w - k.m.safe * 1.4;
    const head = half(lerp(x0, x1, p));
    const fid = k.id('fill');
    k.def(linearGradient(fid, [[0, T.spectral(hue + 105)], [0.5, T.spectral(hue)], [1, T.spectral(hue - 52)]], { x1: x0, y1: 0, x2: x1, y2: 0, gradientUnits: 'userSpaceOnUse' }));
    const beamC = T.colors.beam || '#ffffff';
    for (const c of cells) {
      const a = Math.max(c.x, x0), b = Math.min(c.x + c.w, x1);
      if (b <= a) continue;
      // track + ticks every 10 % (static)
      k.add(rect({ x: a, y: y - th / 2, width: b - a, height: th, rx: th / 2, fill: T.colors.line, fillOpacity: T.dark ? 0.85 : 1 }));
      let ticks = '';
      for (let i = 0; i <= 10; i++) { const tx = half(lerp(x0, x1, i / 10)); if (tx >= a && tx <= b) ticks += `M${n(tx)} ${n(y + th * 1.4)}v${n(i % 5 ? th * 0.9 : th * 1.6)}`; }
      if (ticks) k.add(`<path d="${ticks}" stroke="${T.colors.dim}" stroke-width="${n(Math.max(1, k.m.hair))}" fill="none"/>`);
      // the lit run (only the head's key changes)
      const lit = Math.min(b, head) - a;
      if (lit > 0.5 && reset > 0.01) k.add(rect({ x: a, y: y - th / 2, width: half(lit), height: th, rx: th / 2, fill: url(fid), fillOpacity: reset < 1 ? n(reset, 3) : null }));
      if (head >= a - th && head <= b + th && !done && reset > 0.01) {
        k.add(circle({ cx: head, cy: y, r: th * 2.2, fill: beamC, fillOpacity: T.dark ? 0.16 : 0.12 }));
        k.add(rect({ x: head - Math.max(1, k.m.hair) / 2, y: y - th * 2.6, width: Math.max(1, k.m.hair), height: th * 5.2, fill: T.dark ? beamC : T.ink(hue), fillOpacity: 0.85 }));
        k.add(circle({ cx: head, cy: y, r: th * 0.9, fill: T.dark ? beamC : T.ink(hue) }));
      }
      // done: every key flashes ok
      if (flash > 0.01) {
        const gid = k.id(`ok${c.i}`);
        k.def(`<radialGradient id="${gid}" cx="0.5" cy="1.05" r="0.85"><stop offset="0" stop-color="${T.colors.pos}" stop-opacity="${n(0.4 * flash, 3)}"/><stop offset="1" stop-color="${T.colors.pos}" stop-opacity="0"/></radialGradient>`);
        k.add(rect({ x: c.x, y: c.y, width: c.w, height: c.h, fill: url(gid) }));
      }
    }
    // the readout (last key) and the label (first key)
    const last = cells[cells.length - 1], first = cells[0];
    const pct = `${Math.floor(p * 100 + 1e-6)}%`;
    inCell(k, last, (kk) => {
      if (done && reset > 0.5) kk.value('✓', { cy: kk.h * 0.33, color: 'pos' });
      else kk.value(pct, { cy: kk.h * 0.33, opacity: reset > 0.5 ? 1 : 0.4 });
    }, `ro${last.i}`);
    if (first !== last) inCell(k, first, (kk) => kk.eyebrow(done && reset > 0.5 ? 'Done' : ctx.params.label, { y: kk.h * 0.38, x: kk.m.text, color: done ? 'pos' : 'muted' }), `lb${first.i}`);
    return k.svg();
  },
};
