// A four-channel LFO oscilloscope: sine, triangle, saw and square at musical
// LFO rates, drawn by a sweeping beam over a dotted graticule. Ahead of the
// beam the previous sweep lingers dimmer, like phosphor persistence; each
// channel is labeled with its shape and rate.
import { mix } from '../../color.js';
import { fadeMark } from '../../palettes.js';
import { put } from './_lab.js';

const SWEEP = 2;
const CHANNELS = [
  ['SIN', 0.5, (p) => Math.sin(p * Math.PI * 2)],
  ['TRI', 1, (p) => 1 - 4 * Math.abs((((p + 0.25) % 1) + 1) % 1 - 0.5)],
  ['SAW', 1.5, (p) => 2 * ((((p % 1) + 1) % 1)) - 1],
  ['SQR', 2, (p) => ((((p % 1) + 1) % 1) < 0.5 ? 1 : -1)],
];

export default {
  id: 'lab-lfo-scope',
  title: 'LFO Scope',
  gallery: 'lab',
  category: 'Loops & Cycles',
  kind: 'chart',
  tags: ['lfo', 'oscilloscope', 'sine', 'saw', 'square', 'triangle', 'waveform', 'phosphor'],
  order: 10,
  description: 'A four-channel oscilloscope sweeping sine, triangle, saw and square LFOs over a graticule with phosphor persistence.',
  size: { w: 64, h: 20 },
  minSize: { w: 24, h: 8 },
  loop: SWEEP * 2,
  canvas: 'line',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const cv = ctx.canvas('line');
    const W = cv.width, H = cv.height, th = ctx.theme, pal = ctx.palette();
    const chans = CHANNELS.slice(0, Math.max(1, Math.floor(ctx.height / 4)));
    const band = H / chans.length;
    const grat = mix(th.bg, th.line, 0.85);
    const cols = chans.map((_, k) => mix(pal(0.3 + k * 0.17), th.ink, 0.1));
    return (t) => {
      cv.clear();
      // Graticule: dotted divisions every eighth, and each channel's zero line.
      for (let d = 1; d < 8; d++) { const x = Math.round((W * d) / 8); for (let y = 0; y < H; y += 3) cv.set(x, y, grat); }
      const sweepStart = Math.floor(t / SWEEP) * SWEEP, beam = ((t - sweepStart) / SWEEP) * W;
      chans.forEach(([, hz, fn], k) => {
        const cy = band * (k + 0.5), amp = band * 0.38;
        for (let x = 0; x < W; x += 4) cv.set(x, cy, grat);
        let px = null, py = null;
        for (let x = 0; x < W; x++) {
          const live = x <= beam, tt = (live ? sweepStart : sweepStart - SWEEP) + (x / W) * SWEEP;
          const y = cy - fn(tt * hz) * amp;
          const c = live ? cols[k] : fadeMark(th, cols[k], 0.3);
          if (px !== null && Math.abs(x - beam) > 1) cv.line(px, py, x, y, c);
          px = x; py = y;
        }
        const hy = cy - fn(t * hz) * amp;
        cv.circle(beam, hy, 1.4, th.ink, true);
      });
      cv.paint(ctx.buffer);
      chans.forEach(([name, hz], k) => put(ctx.buffer, 1, Math.floor((ctx.height / chans.length) * k), `${name} ${hz.toFixed(2)} Hz`, cols[k], undefined, undefined, ctx.width - 2));
    };
  },
};
