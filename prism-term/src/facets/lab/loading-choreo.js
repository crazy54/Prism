// Loading choreography for a terminal card: skeleton bars with a shimmer
// sweep, then a spinner while a progress bar eases to full, then the real
// content staggering in line by line, then a success mark that pops — and a
// soft fade back to the skeleton. Each stage hands off to the next on cue.
import { easing } from '../../easing.js';
import { mix } from '../../color.js';
import { box } from '../../widgets/index.js';
import { put } from './_lab.js';

const LOOP = 8;
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const LINES = [
  ['api-gateway-03.example', 'ink'],
  ['region  lab-west-2   pool  10.20.4.0/24', 'muted'],
  ['p95 latency  182 ms      errors  0.02%', 'muted'],
  ['last deploy  14 min ago  build  4f1c2e7', 'muted'],
];

export default {
  id: 'lab-loading-choreo',
  title: 'Loading Choreography',
  gallery: 'lab',
  category: 'Loops & Cycles',
  kind: 'tui',
  tags: ['loading', 'skeleton', 'shimmer', 'spinner', 'progress', 'stagger', 'choreography'],
  order: 20,
  description: 'A card loading in stages: shimmering skeleton, spinner and eased progress, staggered content, then a popping success mark.',
  size: { w: 56, h: 14 },
  minSize: { w: 30, h: 9 },
  loop: LOOP,
  canvas: 'none',
  palette: 'theme',
  params: {},
  setup(ctx) {
    const th = ctx.theme, b = ctx.buffer;
    return (t) => {
      const tl = ((t % LOOP) + LOOP) % LOOP;
      const W = Math.min(ctx.width, 56), H = Math.min(ctx.height, 14);
      const x0 = Math.floor((ctx.width - W) / 2), y0 = Math.floor((ctx.height - H) / 2);
      box(b, x0, y0, W, H, { theme: th, fill: true, color: th.line });
      const ix = x0 + 2, iw = W - 4, rows = Math.min(LINES.length, H - 5);
      const fadeOut = tl > 7.3 ? (tl - 7.3) / 0.7 : 0;
      const rowY = (r) => y0 + 1 + (r ? r + 1 : 0); // title, a gap, then detail lines
      // Stage 1 (0–1.8 s) and the tail of the loop: skeleton bars with a shimmer.
      if (tl < 3.2 || fadeOut > 0) {
        const sweep = ((tl % 1.4) / 1.4) * (iw + 16) - 8;
        for (let r = 0; r < rows; r++) {
          const len = Math.max(4, Math.round(iw * [0.55, 0.9, 0.8, 0.7][r]));
          for (let x = 0; x < len; x++) {
            const sh = Math.exp(-(((x - sweep + r * 2) / 4) ** 2)) * 0.35;
            b.set(ix + x, rowY(r), ' ', undefined, mix(th.panel2, th.ink, sh * (1 - fadeOut * 0.5)));
          }
        }
      }
      // Stage 2 (1.8–3.2 s): spinner, status line and an eased progress bar.
      if (tl >= 1.8 && tl < 3.4) {
        const p = easing.inOutCubic(Math.min(1, (tl - 1.8) / 1.3));
        const sp = SPIN[Math.floor(tl * 12) % SPIN.length];
        put(b, ix, y0 + H - 3, `${sp} fetching service health…`, th.info, undefined, undefined, iw);
        const bw = iw - 5, fill = p * bw;
        for (let x = 0; x < bw; x++) {
          const part = Math.max(0, Math.min(1, fill - x));
          b.set(ix + x, y0 + H - 2, part >= 1 ? '█' : part > 0 ? '▌' : '─', part > 0 ? th.accent : th.line);
        }
        put(b, ix + bw + 1, y0 + H - 2, `${Math.round(p * 100)}%`.padStart(4), th.muted);
      }
      // Stage 3 (3.2–4.6 s): the real content staggers in, sliding two cells.
      if (tl >= 3.2 && fadeOut < 1) {
        for (let r = 0; r < rows; r++) {
          const q = Math.min(1, Math.max(0, (tl - 3.2 - r * 0.22) / 0.4));
          if (q <= 0) continue;
          const e = easing.outCubic(q), off = Math.round((1 - e) * 2);
          const [text, tone] = LINES[r];
          const fg = mix(th.panel, th[tone], e * (1 - fadeOut));
          put(b, ix + off, rowY(r), text, fg, undefined, r === 0 ? 1 : 0, iw - off);
        }
      }
      // Stage 4 (4.6–5.6 s): the success mark pops (·, •, ✓ with an overshoot in color).
      if (tl >= 4.6 && fadeOut < 1) {
        const q = Math.min(1, (tl - 4.6) / 0.5), mark = q < 0.33 ? '·' : q < 0.66 ? '•' : '✓';
        const glow = q < 1 ? mix(th.pos, 0xffffff, 0.4 * Math.sin(q * Math.PI)) : th.pos;
        put(b, ix, y0 + H - 2, `${mark} healthy`, mix(th.panel, glow, 1 - fadeOut), undefined, 1, iw);
        put(b, ix + 11, y0 + H - 2, 'all checks passed', mix(th.panel, th.muted, Math.min(1, (tl - 4.9) / 0.4) * (1 - fadeOut)), undefined, undefined, iw - 11);
      }
      const stage = tl < 1.8 ? 'skeleton' : tl < 3.2 ? 'fetch' : tl < 4.6 ? 'reveal' : tl < 7.3 ? 'done' : 'reset';
      put(b, x0 + W - stage.length - 3, y0, ` ${stage} `, th.muted);
    };
  },
};
