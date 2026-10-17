// span-spectrum — spectrum-analyzer bars across keys. Each key holds a few bands (the
// bars sit inside the keys; the bezels fall between them), colored along the Spectrum
// from warm bass to violet treble, with falling peak caps. On a taller span the bars
// rise from the bottom row up through the rows — continuous behind the bezels.
//
// ctx.data.spectrum (optional): { bands: number[] } 0–1, low → high, any length (resampled).
// Without it the facet plays a simulated mix: a 120 BPM kick in the lows, a moving
// melody in the mids, hats sparkling in the highs.

import { surface, rect, linearGradient, url, n } from '../../scene/index.js';
import { clamp } from '../../scene/easing.js';
import { noise1, fbm1 } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, spectrumHue } from './_d3-span.js';

/** A simulated band level (f = 0 low … 1 high, j = band index) at time t. */
function sim(f, j, t, seed) {
  const beat = t * 2;                                              // 120 BPM
  const kick = Math.exp(-(beat % 1) * 5.5), snare = Math.exp(-((beat + 0.5) % 2) * 4), hat = Math.exp(-((beat * 2) % 1) * 8);
  const tilt = 0.92 - 0.3 * f;
  const bass = Math.max(0, 1 - f / 0.32) * 0.72 * kick;
  const mid = (0.45 + 0.4 * Math.sin(t * 0.37 + 1.1)) * Math.exp(-(((f - (0.42 + 0.22 * Math.sin(t * 0.83))) / 0.16) ** 2)) * 0.62;
  const crack = Math.exp(-(((f - 0.55) / 0.2) ** 2)) * snare * 0.4;
  const air = Math.max(0, (f - 0.62) / 0.38) * hat * 0.5;
  const grain = 0.55 * noise1(t * (2.2 + 3.5 * f) + j * 7.31, seed) * (0.5 + 0.5 * fbm1(t * 0.6 + j * 0.13, seed + 9));
  return clamp(1.12 * Math.pow(Math.max(0, tilt * (0.08 + bass + mid + crack + air + grain * 0.6)), 0.82));
}

/** Resample live bands to n. */
function resample(bands, count) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * bands.length, b = ((i + 1) / count) * bands.length;
    let s = 0, w = 0;
    for (let j = Math.floor(a); j < Math.ceil(b); j++) { const o = Math.min(b, j + 1) - Math.max(a, j); s += clamp(+bands[j] || 0) * o; w += o; }
    return w ? s / w : 0;
  });
}

export default {
  id: 'span-spectrum',
  title: 'Spectrum Bars',
  category: 'Bars & Meters',
  description: 'Spectrum-analyzer bars across keys, warm bass to violet treble, with falling peak caps; on taller spans the bars rise through the rows behind the bezels.',
  tags: ['spectrum', 'analyzer', 'equalizer', 'audio', 'bars', 'music', 'visualizer', 'span'],
  surface: 'span',
  span: { cols: 'all', rows: 1 },
  data: ['spectrum'],
  fps: 12,
  loop: 8,
  params: {
    bars: { type: 'number', default: 3, min: 1, max: 6, step: 1, label: 'Bars per key' },
    style: { type: 'select', default: 'bars', options: ['bars', 'segments'], label: 'Style' },
    budget: BUDGET,
  },
  order: 30,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    const { t, dt } = frameClock(ctx, { fps: 12, changing: grid.cells.length, still: 2.1 });
    materials(k);
    const per = Math.round(ctx.params.bars), cols = grid.cols;
    const count = cols * per;
    const live = ctx.data.spectrum?.bands;
    const level = (i, tt) => sim(i / Math.max(1, count - 1), i, tt, ctx.seed);
    const vals = live?.length ? resample(live, count) : Array.from({ length: count }, (_, i) => level(i, t));
    // peak hold (simulated history): the highest recent level, falling under gravity
    const peaks = live?.length ? vals : vals.map((v, i) => {
      let p = v;
      for (let s = 1; s <= 10; s++) { const back = s * Math.max(dt, 0.1); p = Math.max(p, level(i, t - back) - 2.4 * back * back); }
      return clamp(p);
    });
    const u = k.m.u, KW = grid.key.w, KH = grid.key.h;
    const pad = k.m.safe * 1.1, gap = Math.max(2, Math.round(3 * u));
    const bw = (KW - pad * 2 - gap * (per - 1)) / per;
    const top0 = grid.cells[0].y + k.m.safe * 1.2;                               // top of the span's bar field
    const bot = grid.cells[grid.cells.length - 1].y + KH - k.m.safe * 1.4;      // bottom of the bar field
    const H = bot - top0;
    const cap = Math.max(2, Math.round(2.2 * u));
    const seg = ctx.params.style === 'segments';
    const segH = Math.max(3, Math.round(5 * u)), segGap = Math.max(1, Math.round(2 * u));
    // one gradient per band (bottom dimmer → top brighter), shared by its pieces in every row
    const cellsByCol = new Map();
    for (const c of grid.cells) { if (!cellsByCol.has(c.col)) cellsByCol.set(c.col, []); cellsByCol.get(c.col).push(c); }
    for (let i = 0; i < count; i++) {
      const col = grid.col + Math.floor(i / per), j = i % per;
      const column = cellsByCol.get(col);
      if (!column) continue;
      const x = column[0].x + pad + j * (bw + gap);
      const hue = spectrumHue(i / Math.max(1, count - 1));
      const c = T.spectral(hue, { dl: T.dark ? 0.02 : 0 });
      const gid = k.id(`b${i}`);
      k.def(linearGradient(gid, [[0, c, T.dark ? 0.55 : 0.7], [1, c, 1]], { x1: 0, y1: bot, x2: 0, y2: top0, gradientUnits: 'userSpaceOnUse' }));
      const yTop = bot - Math.max(0.02, vals[i]) * H;
      const yPeak = Math.round(bot - peaks[i] * H);
      for (const cell of column) {
        const a = Math.max(cell.y + k.m.safe * 0.6, yTop), b = Math.min(cell.y + cell.h - k.m.safe * 0.6, bot);
        if (b > a) {
          if (seg) {
            let d = '';
            for (let yy = bot; yy - segH >= a - segH * 0.5; yy -= segH + segGap) {
              const y1 = Math.min(yy, b), y0 = Math.max(yy - segH, cell.y);
              if (y0 >= b || y1 <= cell.y || y1 - y0 < 1) continue;
              d += `M${n(x)} ${n(y0)}h${n(bw)}V${n(y1)}h${n(-bw)}Z`;
            }
            if (d) k.add(`<path d="${d}" fill="${url(gid)}"/>`);
          } else k.add(rect({ x: n(x), y: n(Math.round(a)), width: n(bw), height: n(Math.round(b) - Math.round(a)), rx: n(Math.min(bw / 2, 2 * u)), fill: url(gid) }));
        }
        // the peak cap, in whichever key holds it
        if (yPeak - cap >= cell.y + k.m.safe * 0.4 && yPeak <= cell.y + cell.h - k.m.safe * 0.4 && peaks[i] > vals[i] + 0.015) {
          k.add(rect({ x: n(x), y: n(yPeak - cap - Math.max(1, u)), width: n(bw), height: cap, rx: n(cap / 2), fill: T.dark ? (T.colors.beam || '#ffffff') : T.ink(hue), fillOpacity: T.dark ? 0.9 : 1 }));
        }
      }
    }
    return k.svg();
  },
};
