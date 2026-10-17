// Langton's ant at braille resolution: on a white cell turn right, on a black
// cell turn left, flip the cell, step. Two ants share the grid and the cells
// they flip carry their color. The step rate ramps up through each run so
// the famous transition — ten thousand steps of chaos, then the endless
// diagonal "highway" — arrives inside the loop. A step counter ticks below.
import { NONE } from '../../color.js';

const RUN = 30;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export default {
  title: "Langton's Ant",
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['langton', 'ant', 'turmite', 'cellular automata', 'emergence', 'braille'],
  order: 20,
  description: "Two Langton's ants at braille resolution, accelerating through ten thousand steps of chaos into the highway.",
  size: { w: 60, h: 22 },
  minSize: { w: 20, h: 7 },
  loop: RUN,
  canvas: 'line',
  palette: 'prism',
  params: { ants: { default: 2, min: 1, max: 4, label: 'Ants' } },
  setup(ctx) {
    const label = ctx.height >= 10;
    const cv = ctx.canvas('line', { rows: label ? ctx.height - 1 : ctx.height });
    const W = cv.width, H = cv.height, px = cv.px, th = ctx.theme;
    const pal = ctx.palette();
    const nAnts = Math.round(ctx.param('ants', 2));
    const cell = new Uint8Array(W * H), owner = new Uint8Array(W * H);
    const cols = Array.from({ length: nAnts }, (_, i) => pal(0.55 + i * 0.27));
    let ants = [], steps = 0, run = -1, acc = 0;
    const reset = () => {
      cell.fill(0);
      ants = Array.from({ length: nAnts }, (_, i) => ({
        x: Math.floor(W * (nAnts === 1 ? 0.5 : 0.3 + (0.4 * i) / (nAnts - 1))),
        y: Math.floor(H * (0.5 + (i % 2 ? 0.12 : -0.12) * (nAnts > 1 ? 1 : 0))),
        d: i % 4,
      }));
      steps = 0;
    };
    const step = () => {
      for (let k = 0; k < ants.length; k++) {
        const a = ants[k], i = a.y * W + a.x;
        a.d = (a.d + (cell[i] ? 3 : 1)) & 3; // white (0) → right, black (1) → left
        cell[i] ^= 1; owner[i] = k;
        a.x = (a.x + DIRS[a.d][0] + W) % W; a.y = (a.y + DIRS[a.d][1] + H) % H;
      }
      steps++;
    };

    return (t, dt) => {
      const r = Math.floor(t / RUN);
      if (r !== run) { run = r; reset(); acc = 0; }
      // Steps per second ramp from 150 to ~2400 across the run.
      const local = t - r * RUN, rate = 150 + 2250 * Math.pow(local / RUN, 1.5);
      acc += Math.min(0.25, Math.max(0, dt)) * rate;
      for (; acc >= 1; acc--) step();
      for (let i = 0; i < W * H; i++) px[i] = cell[i] ? cols[owner[i]] : NONE;
      for (const a of ants) px[a.y * W + a.x] = th.ink;
      cv.paint(ctx.buffer);
      if (label) {
        const txt = `step ${steps.toLocaleString('en-US')}`;
        ctx.buffer.text(1, ctx.height - 1, txt.slice(0, ctx.width - 2), th.muted);
      }
    };
  },
};
