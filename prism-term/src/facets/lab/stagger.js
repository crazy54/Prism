// Stagger studies: a grid of tiles entering one after another, each popping in
// with an overshoot (outBack) and leaving on the same order reversed. Four
// orderings cycle — from the left, from the center out, a diagonal wave and a
// seeded shuffle — to show how much the order alone changes the feel.
import { easing } from '../../easing.js';
import { mix } from '../../color.js';
import { cycle, put } from './_lab.js';

const MODE = 3.4, SPREAD = 1.1, POP = 0.45;

export default {
  id: 'lab-stagger',
  title: 'Stagger',
  gallery: 'lab',
  category: 'Easing & Timing',
  kind: 'scene',
  tags: ['stagger', 'cascade', 'delay', 'outback', 'choreography', 'ui motion'],
  order: 50,
  description: 'A grid of tiles staggering in and out four ways — from the left, from the center, as a wave, and shuffled.',
  size: { w: 60, h: 20 },
  minSize: { w: 20, h: 7 },
  loop: MODE * 4,
  canvas: 'field',
  palette: 'prism',
  params: {},
  setup(ctx) {
    const label = ctx.height >= 8;
    const cv = ctx.canvas('field', { rows: label ? ctx.height - 1 : ctx.height });
    const W = cv.width, H = cv.height, th = ctx.theme, pal = ctx.palette(), rand = ctx.rng;
    const tw = Math.max(3, Math.round(W / 12)), thH = Math.max(3, Math.round(tw / cv.aspect * 0.9));
    const cols = Math.max(1, Math.floor((W + 1) / (tw + 1))), rows = Math.max(1, Math.floor((H + 1) / (thH + 1)));
    const ox = Math.floor((W - (cols * (tw + 1) - 1)) / 2), oy = Math.floor((H - (rows * (thH + 1) - 1)) / 2);
    const tiles = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles.push({ c, r, rnd: rand() });
    const maxD = Math.hypot((cols - 1) / 2, (rows - 1) / 2) || 1;
    const MODES = [
      ['from the left', (p) => p.c / Math.max(1, cols - 1)],
      ['from the centre', (p) => Math.hypot(p.c - (cols - 1) / 2, p.r - (rows - 1) / 2) / maxD],
      ['diagonal wave', (p) => (p.c + p.r) / Math.max(1, cols + rows - 2)],
      ['shuffled', (p) => p.rnd],
    ];
    return (t) => {
      const { i, f } = cycle(t, MODES.length, MODE);
      const [name, order] = MODES[i], lt = f * MODE;
      cv.clear();
      for (const p of tiles) {
        const d = order(p) * SPREAD;
        const qIn = Math.min(1, Math.max(0, (lt - d) / POP));
        const qOut = Math.min(1, Math.max(0, (lt - 2.1 - d * 0.6) / (POP * 0.7)));
        const k = qOut > 0 ? 1 - easing.inQuad(qOut) : easing.outBack(qIn);
        if (k <= 0.01) continue;
        const cx = ox + p.c * (tw + 1) + tw / 2, cy = oy + p.r * (thH + 1) + thH / 2;
        const hw = (tw / 2) * k, hh = (thH / 2) * k, col = mix(th.bg, pal(order(p) * 0.85), Math.min(1, qIn * 1.5) * (1 - qOut * 0.5));
        for (let y = Math.round(cy - hh); y < Math.round(cy + hh); y++) for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) cv.set(x, y, col);
      }
      cv.paint(ctx.buffer);
      if (label) put(ctx.buffer, 1, ctx.height - 1, `stagger · ${name} · ${Math.round((SPREAD / Math.max(1, tiles.length)) * 1000)} ms apart · outBack in, inQuad out`, th.muted, undefined, undefined, ctx.width - 2);
    };
  },
};
