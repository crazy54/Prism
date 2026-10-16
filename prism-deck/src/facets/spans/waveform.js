// span-waveform — a live audio waveform running across a row of keys. Each key keeps
// its own glass; the wave is one continuous line behind the bezels (gap pixels are
// hidden), scrolling right → left with the newest sound at the right edge.
//
// ctx.data.audio (optional): { levels: number[] } — recent peak levels 0–1, oldest
// first, from an audio source (src/audio/). Without it the facet synthesizes music.

import { surface, keyInto, path, linearGradient, url, circle, n, P } from '../../scene/index.js';
import { noise1 } from '../../scene/noise.js';

/** Synthetic music envelope at time x: beat-driven kick + phrase swell + texture. */
function synth(x, seed) {
  const beat = x * 2; // 120 BPM
  const kick = Math.exp(-((beat % 1) * 5));
  const phrase = 0.55 + 0.45 * Math.sin(x * 0.4 + noise1(x * 0.1, seed) * 3);
  const tex = noise1(x * 7, seed + 11);
  return Math.min(1, (0.18 + 0.5 * kick * phrase + 0.32 * tex * phrase));
}

export default {
  id: 'span-waveform',
  title: 'Waveform',
  category: 'Waveforms & Audio',
  description: 'A live audio waveform running across a whole row of keys — one continuous line behind the bezels, newest sound at the right.',
  tags: ['audio', 'waveform', 'music', 'live', 'span', 'oscilloscope'],
  surface: 'span',
  span: { cols: 'all', rows: 1 },
  data: ['audio'],
  fps: 15,
  loop: 8,
  params: {
    speed: { type: 'number', default: 1, min: 0.25, max: 3, step: 0.05, label: 'Scroll speed' },
  },
  order: 10,
  render(ctx) {
    const d = surface(ctx);
    const { w, h, t, grid } = ctx;
    d.add(`<rect width="${n(w)}" height="${n(h)}" fill="#000000"/>`);
    // every key keeps its own material
    for (const cell of grid.cells) keyInto(d, cell, (k) => { k.background({ tone: 'active' }); }, { tag: `k${cell.i}`, clip: false });
    const levels = ctx.data.audio?.levels;
    const cols = Math.max(24, Math.round(w / 3));
    const seconds = 4 / ctx.params.speed;                 // the strip shows the last 4 s at speed 1
    const mid = h / 2, amp = grid.key.h * 0.38;
    let top = '', bot = '';
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * w;
      const age = (1 - i / cols) * seconds;
      const v = levels?.length ? levels[Math.max(0, Math.min(levels.length - 1, Math.round((i / cols) * (levels.length - 1))))] : synth(t - age, ctx.seed);
      const a = Math.max(0.03, v) * amp;
      top += `${i ? 'L' : 'M'}${n(x)} ${n(mid - a)}`;
      bot = `L${n(x)} ${n(mid + a * 0.82)}${bot}`;
    }
    const gid = d.id('wave');
    const hue = ctx.hue;
    d.def(linearGradient(gid, [[0, ctx.theme.spectral(hue + 60), 0.25], [0.5, ctx.theme.spectral(hue), 0.85], [1, ctx.theme.spectral(hue - 70), 1]], { x1: 0, y1: 0, x2: w, y2: 0, gradientUnits: 'userSpaceOnUse' }));
    d.add(path(`${top}${bot}Z`, { fill: url(gid), fillOpacity: d.dark ? 0.85 : 0.7 }));
    // the center Beam and the live head
    d.add(path(P().M(0, mid).L(w, mid).d, { stroke: d.colors.beam || '#ffffff', strokeWidth: d.m.hair, strokeOpacity: 0.35 }));
    d.add(circle({ cx: w - d.m.safe, cy: mid, r: d.m.bold, fill: d.dark ? '#ffffff' : d.tone('active') }));
    return d.svg();
  },
};
