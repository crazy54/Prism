// A 1998 media-player spectrum analyser: log-spaced bars in eighth-block
// resolution, green-to-red by height, falling bars and peak caps that drop
// with gravity — dancing to the shared chiptune. A dim floor reflection when tall.
import { lerpc } from './_kit.js';
import { bands } from './_music.js';

const EIGHTHS = ' ▁▂▃▄▅▆▇█';
const K = 26, STEP = 1 / 30;

export default {
  title: 'Spectrum Analyzer',
  gallery: 'retro',
  category: 'Chiptune Visuals',
  kind: 'scene',
  tags: ['spectrum', 'analyzer', 'fft', 'eq', 'audio', 'bars', 'chiptune', 'winamp'],
  order: 20,
  description: 'A media-player spectrum analyser: log-spaced bars in eighth-blocks, falling peak caps and a floor reflection.',
  size: { w: 64, h: 16 },
  minSize: { w: 20, h: 6 },
  loop: 7.68,
  params: { style: { default: 'classic', options: ['classic', 'palette'], label: 'Colors' } },
  setup(ctx) {
    const { theme } = ctx;
    const b = ctx.buffer;
    const W = ctx.width, H = ctx.height;
    const pal = ctx.palette('prism');
    const classic = ctx.param('style', 'classic') !== 'palette';
    const barW = W >= 48 ? 2 : 1, pitch = barW + 1;
    const n = Math.max(4, Math.floor((W - 1) / pitch));
    const x0 = Math.floor((W - (n * pitch - 1)) / 2);
    const labels = H >= 10;
    const reflect = H >= 12 ? Math.max(2, Math.round(H * 0.18)) : 0;
    const rows = H - (labels ? 1 : 0) - reflect;
    const hist = Array.from({ length: K }, () => new Float32Array(n));
    const color = (f) => (!classic ? pal(f) : f < 0.55 ? theme.pos : f < 0.8 ? lerpc(theme.pos, theme.warn, (f - 0.55) / 0.25) : lerpc(theme.warn, theme.neg, (f - 0.8) / 0.2));
    const rowColor = Array.from({ length: rows }, (_, r) => color((r + 0.5) / rows));
    const freqs = [[60, '60'], [250, '250'], [1000, '1k'], [4000, '4k'], [10000, '10k']];
    return (t) => {
      b.fill(0, 0, W, H, ' ', theme.ink, theme.bg);
      for (let k = 0; k < K; k++) bands(t - k * STEP, n, hist[k]);
      for (let i = 0; i < n; i++) {
        // Bars fall at a fixed rate; caps hold briefly then fall with gravity.
        let bar = 0, peak = 0;
        for (let k = 0; k < K; k++) {
          const v = hist[k][i], age = k * STEP;
          bar = Math.max(bar, v - age * 2.2);
          peak = Math.max(peak, v - Math.max(0, age - 0.2) ** 2 * 3.2);
        }
        const h = Math.max(0, bar) * rows, ph = Math.max(h / rows, peak) * rows;
        const x = x0 + i * pitch;
        for (let r = 0; r < rows; r++) {
          const y = rows - 1 - r, fill = Math.min(1, Math.max(0, h - r));
          if (fill <= 0) break;
          const ch = EIGHTHS[Math.max(1, Math.round(fill * 8))];
          for (let dx = 0; dx < barW; dx++) b.set(x + dx, y, ch, rowColor[r]);
        }
        // The cap sits on the cell above the bar's top when there's room.
        const pr = Math.min(rows - 1, Math.floor(ph));
        if (ph > 0.05 && pr >= Math.ceil(h)) for (let dx = 0; dx < barW; dx++) b.set(x + dx, rows - 1 - pr, '▔', lerpc(rowColor[pr], theme.ink, 0.5));
        // Floor reflection: dim, upside down, fading away.
        for (let r = 0; r < reflect; r++) {
          const fill = Math.min(1, Math.max(0, h - r));
          if (fill <= 0) break;
          const fade = 0.28 * (1 - r / reflect);
          for (let dx = 0; dx < barW; dx++) b.set(x + dx, rows + r, fill > 0.5 ? '█' : '▀', lerpc(theme.bg, rowColor[r], fade));
        }
      }
      if (labels) {
        const y = H - 1;
        const lo = Math.log2(40), hi = Math.log2(12000);
        for (const [f, s] of freqs) {
          const x = Math.round(x0 + ((Math.log2(f) - lo) / (hi - lo)) * (n * pitch - 1) - s.length / 2);
          if (x >= 0 && x + s.length <= W) b.text(x, y, s, theme.muted);
        }
      }
    };
  },
};
