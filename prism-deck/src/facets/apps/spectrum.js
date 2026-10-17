// Spectrum analyzers — ctx.data.spectrum.bands (src/apps/sources/audio.js; simulated otherwise).
//
//   app-spectrum        span: LED bars across a block of keys. Gap-compensated the way discrete
//                       segments must be: every key holds whole segments (none is ever cut by a bezel),
//                       a band climbs through the rows of its column as one meter. Drawn per key cell.
//   app-spectrum-key    one key: rounded bars with falling peak caps over a faint reflection
//   app-spectrum-strip  Stream Deck + / + XL touch strip: the spectrum as a 4- (or 6-) band EQ — each
//                       dial's segment names its range, and the dial's value draws as its gain line

import { surface, path, rect, n, roundRectPath, P } from '../../scene/index.js';
import { spectrumOf } from './_data.js';
import { keyGlass, colorAt, lift, whiteOf, PALETTE_OPTIONS, clamp } from './_kit.js';
import { panelInto } from '../screens/_d5-kit.js';

const gainOf = (v, g) => clamp(v * g);

const span = {
  id: 'app-spectrum',
  title: 'Spectrum Across Keys',
  category: 'Audio',
  description: 'A spectrum analyzer across a block of keys: LED bars climb every row with falling peak caps. Live from sound capture in the plugin; simulated until one runs.',
  tags: ['audio', 'spectrum', 'analyzer', 'equalizer', 'bars', 'leds', 'live', 'span', 'gap-compensated', 'stream', 'streaming', 'visualizer'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  data: ['spectrum'],
  fps: 15,
  loop: 16,
  params: {
    perKey: { type: 'number', default: 3, min: 1, max: 8, step: 1, label: 'Bars per key' },
    segments: { type: 'number', default: 0, min: 0, max: 12, step: 1, label: 'LED segments per key (0 = auto)' },
    palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
    peaks: { type: 'bool', default: true, label: 'Peak caps' },
    gain: { type: 'number', default: 1, min: 0.3, max: 2, step: 0.05, label: 'Gain' },
  },
  order: 20,
  render(ctx) {
    const d = surface(ctx);
    const { grid, params: p } = ctx;
    keyGlass(d, grid, { index: false });
    const K = Math.min(grid.key.w, grid.key.h);
    const cols = [...new Set(grid.cells.map((c) => c.col))].sort((a, b) => a - b);
    const rows = [...new Set(grid.cells.map((c) => c.row))].sort((a, b) => a - b);
    const per = p.perKey, count = cols.length * per;
    const S = spectrumOf(ctx, count);
    const segPer = p.segments || (K >= 140 ? 8 : K >= 100 ? 7 : 6);
    const total = segPer * rows.length;
    const pad = K * 0.13, gx = Math.max(2, K * 0.05), gy = Math.max(1.5, K * 0.035);
    const bw = (grid.key.w - pad * 2 - gx * (per - 1)) / per;
    const sh = (grid.key.h - pad * 2 - gy * (segPer - 1)) / segPer;
    const r = Math.min(sh / 2, bw / 2, K * 0.025);
    const off = d.colors.line, dark = d.dark;
    for (const cell of grid.cells) {
      const ci = cols.indexOf(cell.col), ri = rows.length - 1 - rows.indexOf(cell.row); // ri: 0 = bottom row
      let dim = '';
      const peaks = [];
      const lit = [];
      for (let b = 0; b < per; b++) {
        const band = ci * per + b, f = count === 1 ? 0.5 : band / (count - 1);
        const on = Math.round(gainOf(S.bands[band], p.gain) * total), pk = Math.min(total - 1, Math.round(gainOf(S.peaks[band], p.gain) * total) - 1);
        const x = cell.x + pad + b * (bw + gx);
        let litD = '', headD = '';
        for (let s = 0; s < segPer; s++) {
          const gi = ri * segPer + s;                 // global segment index, 0 = bottom of the block
          const y = cell.y + grid.key.h - pad - (s + 1) * sh - s * gy;
          const seg = roundRectPath(x, y, bw, sh, r);
          if (gi < on) { if (gi === on - 1) headD += seg; else litD += seg; }
          else if (p.peaks && gi === pk && pk >= on) peaks.push(path(seg, { fill: dark ? '#ffffff' : lift(d, colorAt(ctx, p.palette, f), 0.45), fillOpacity: dark ? 0.85 : null }));
          else dim += seg;
        }
        const c = colorAt(ctx, p.palette, f);
        if (litD) lit.push(path(litD, { fill: c }));
        if (headD) lit.push(path(headD, { fill: lift(d, c, dark ? 0.45 : 0.3) }));
      }
      if (dim) d.add(path(dim, { fill: off, fillOpacity: dark ? 0.55 : 0.6 }));
      if (lit.length) d.add(lit.join(''));
      if (peaks.length) d.add(peaks.join(''));
    }
    return d.svg();
  },
};

const key = {
  id: 'app-spectrum-key',
  title: 'Spectrum Key',
  category: 'Audio',
  description: 'A spectrum analyzer on one key: rounded bars low to high, falling peak caps, a faint reflection. Live from sound capture in the plugin; simulated until one runs.',
  tags: ['audio', 'spectrum', 'analyzer', 'equalizer', 'bars', 'live', 'key'],
  surface: 'key',
  data: ['spectrum'],
  fps: 12,
  loop: 16,
  params: {
    bands: { type: 'number', default: 0, min: 0, max: 16, step: 1, label: 'Bands (0 = auto)' },
    palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
    gain: { type: 'number', default: 1, min: 0.3, max: 2, step: 0.05, label: 'Gain' },
  },
  order: 21,
  render(ctx) {
    const k = surface(ctx);
    const { w, h, params: p } = ctx;
    k.background({ tone: 'idle' });
    const m = Math.min(w, h);
    const count = p.bands || (m >= 140 ? 12 : m >= 96 ? 10 : 8);
    const S = spectrumOf(ctx, count);
    const x0 = k.m.text, x1 = w - k.m.text, base = h * 0.7, top = k.m.text * 1.1, hh = base - top;
    const gap = Math.max(1.5, (x1 - x0) / count * 0.28), bw = (x1 - x0 - gap * (count - 1)) / count, r = Math.min(bw / 2, m * 0.03);
    let reflect = '';
    const caps = [];
    const bars = [];
    for (let i = 0; i < count; i++) {
      const x = x0 + i * (bw + gap), v = gainOf(S.bands[i], p.gain), bh = Math.max(bw * 0.7, hh * v);
      const c = colorAt(ctx, p.palette, count === 1 ? 0.5 : i / (count - 1));
      bars.push(path(roundRectPath(x, base - bh, bw, bh, r), { fill: c }));
      reflect += P().M(x, base + gap).H(x + bw).V(base + gap + bh * 0.28).H(x).Z().d;
      const py = base - hh * gainOf(S.peaks[i], p.gain) - Math.max(1.5, m * 0.02) - 1;
      caps.push(path(roundRectPath(x, Math.max(top - 2, py), bw, Math.max(1.5, m * 0.02), 1), { fill: k.dark ? '#ffffff' : lift(k, c, 0.45), fillOpacity: k.dark ? 0.85 : null }));
    }
    const rid = k.id('refl');
    k.def(`<linearGradient id="${rid}" x1="0" y1="${n(base)}" x2="0" y2="${n(base + hh * 0.3)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${colorAt(ctx, p.palette, 0.5)}" stop-opacity="${k.dark ? 0.28 : 0.22}"/><stop offset="1" stop-color="${colorAt(ctx, p.palette, 0.5)}" stop-opacity="0"/></linearGradient>`);
    k.add(path(reflect, { fill: `url(#${rid})` }));
    k.add(bars.join(''));
    k.add(caps.join(''));
    k.add(rect({ x: x0, y: base + gap * 0.25, width: x1 - x0, height: Math.max(1, k.m.hair * 0.75), fill: k.colors.beam || whiteOf(k), fillOpacity: k.dark ? 0.35 : 0.4 }));
    return k.svg();
  },
};

const RANGES = { 4: ['Bass', 'Low mid', 'High mid', 'Treble'], 6: ['Sub', 'Bass', 'Low mid', 'Mid', 'Presence', 'Air'] };

const strip = {
  id: 'app-spectrum-strip',
  title: 'Spectrum EQ Strip',
  category: 'Audio',
  description: 'The touch strip as a spectrum and EQ: each dial names a frequency range and shows its gain. Display only; live from sound capture in the plugin, else simulated.',
  tags: ['audio', 'spectrum', 'equalizer', 'eq', 'strip', 'dials', 'stream deck +', 'live'],
  surface: 'strip',
  segments: 'all',
  data: ['spectrum'],
  fps: 12,
  loop: 16,
  params: {
    palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
    range: { type: 'number', default: 12, min: 3, max: 24, step: 1, label: 'EQ range ± dB' },
  },
  order: 22,
  render(ctx) {
    const s = surface(ctx);
    const { w, h, params: p } = ctx;
    const segs = ctx.strip.segments, sw = w / segs;
    const names = RANGES[segs] || RANGES[4];
    const perSeg = segs > 4 ? 6 : 8, count = perSeg * segs;
    const S = spectrumOf(ctx, count);
    s.add(rect({ width: w, height: h, fill: '#000000' }));
    for (let i = 0; i < segs; i++) {
      const val = ctx.values[i] ?? 0.5, db = Math.round((val - 0.5) * 2 * p.range);
      panelInto(s, { x: i * sw, y: 0, w: sw, h }, (q) => {
        q.background({ tone: 'idle' });
        const pad = 12, top = 30, base = h - 12, hh = base - top;
        const gap = 3, bw = (sw - pad * 2 - gap * (perSeg - 1)) / perSeg;
        let caps = '';
        const bars = [];
        for (let b = 0; b < perSeg; b++) {
          const band = i * perSeg + b, v = S.bands[band], bx = pad + b * (bw + gap), bh = Math.max(3, hh * v);
          bars.push(path(roundRectPath(bx, base - bh, bw, bh, Math.min(2.5, bw / 2)), { fill: colorAt(ctx, p.palette, band / (count - 1)), fillOpacity: 0.9 }));
          caps += roundRectPath(bx, Math.max(top - 2, base - hh * S.peaks[band] - 3), bw, 2, 1);
        }
        q.add(bars.join(''));
        q.add(path(caps, { fill: whiteOf(q), fillOpacity: 0.8 }));
        // the dial's gain line across its range (0 dB at mid height)
        const mid = base - hh * 0.5, gy = mid - hh * 0.45 * (val - 0.5) * 2;
        q.add(rect({ x: pad, y: mid - 0.5, width: sw - pad * 2, height: 1, fill: q.colors.line, fillOpacity: 0.9 }));
        q.add(rect({ x: pad, y: gy - 1, width: sw - pad * 2, height: 2, rx: 1, fill: whiteOf(q), fillOpacity: q.dark ? 0.9 : 0.8 }));
        q.eyebrow(names[i] || `Band ${i + 1}`, { align: 'left', x: pad, y: 19, size: 10, maxWidth: sw * 0.55 });
        q.caption(`${db > 0 ? '+' : db < 0 ? '–' : '±'}${Math.abs(db)} dB`, { align: 'right', x: sw - pad, y: 19, size: 10.5, color: db === 0 ? 'muted' : 'ink' });
      }, { kind: 'strip', tag: `s${i}` });
    }
    return s.svg();
  },
};

export default [span, key, strip];
