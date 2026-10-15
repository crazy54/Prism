// span-life — Conway's Game of Life over the whole device. The board is one uniform
// grid across the panel INCLUDING the bezels: each key shows a whole number of cells,
// and the gaps between keys hold hidden columns and rows of the board, so a glider that
// slips behind a bezel keeps living there and comes out in the next key. Newborn cells
// flash white, settled ones take the Spectrum by position, the dead leave a brief
// afterglow. A fresh soup is sown every 48 generations (with a fade), so it never stalls.

import { surface, linearGradient, url, n } from '../../scene/index.js';
import { hash } from '../../scene/noise.js';
import { BUDGET, frameClock, materials, spectrumHue } from './_d3-span.js';

const GENS = 48;

/** The board for a grid: cells per key, hidden cells per gap, size. */
function board(grid, per) {
  const cell = grid.key.w / per;
  const gx = Math.max(1, Math.round(grid.gapX / cell)), gy = Math.max(1, Math.round(grid.gapY / (grid.key.h / per)));
  const W = grid.cols * per + (grid.cols - 1) * gx, H = grid.rows * per + (grid.rows - 1) * gy;
  return { per, gx, gy, W, H, cw: grid.key.w / per, ch: grid.key.h / per };
}

/** Run `steps` generations from a seeded soup → { alive: Uint8Array, age: Uint16Array, dead: Uint8Array (just died) }. */
function simulate(B, epoch, steps, seed) {
  const { W, H } = B;
  let a = new Uint8Array(W * H), age = new Uint16Array(W * H), dead = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = hash(x, y, epoch, seed) < 0.3 ? 1 : 0;
  for (let s = 0; s < steps; s++) {
    const b = new Uint8Array(W * H), ag = new Uint16Array(W * H), dd = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) c += a[((y + dy + H) % H) * W + ((x + dx + W) % W)];
      const i = y * W + x, live = a[i] ? c === 2 || c === 3 : c === 3;
      b[i] = live ? 1 : 0;
      ag[i] = live ? (a[i] ? Math.min(999, age[i] + 1) : 0) : 0;
      dd[i] = !live && a[i] ? 1 : 0;
    }
    a = b; age = ag; dead = dd;
  }
  return { alive: a, age, dead };
}

export default {
  id: 'span-life',
  title: 'Life',
  category: 'Whole Device',
  description: "Conway's Game of Life across the whole device — the board continues behind the bezels, so gliders vanish into one key and emerge from the next.",
  tags: ['life', 'conway', 'cellular', 'automaton', 'generative', 'ambient', 'wall', 'span'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  fps: 2,
  loop: 24,
  params: {
    cells: { type: 'number', default: 6, min: 4, max: 10, step: 1, label: 'Cells per key' },
    budget: BUDGET,
  },
  order: 50,
  render(ctx) {
    const k = surface(ctx);
    const { grid, theme: T } = ctx;
    // a generation is one frame: the budget sets how many per second (≤ 2)
    const { frame } = frameClock(ctx, { fps: 2, changing: grid.cells.length, still: 6 });
    materials(k);
    const B = board(grid, Math.round(ctx.params.cells));
    const epoch = Math.floor(frame / GENS), step = frame % GENS;
    const { alive, age, dead } = simulate(B, epoch, step, ctx.seed);
    const fadeIn = Math.min(1, (step + 1) / 3), fadeOut = Math.min(1, (GENS - step) / 3);
    const vis = Math.min(fadeIn, fadeOut);
    const gid = k.id('hue');
    const stops = [0, 0.25, 0.5, 0.75, 1].map((f) => [f, T.spectral(spectrumHue(f), { dl: T.dark ? 0.02 : 0 })]);
    k.def(linearGradient(gid, stops, { x1: 0, y1: 0, x2: ctx.w, y2: 0, gradientUnits: 'userSpaceOnUse' }));
    const pad = Math.max(1, Math.round(k.m.u * 1.1));
    const hot = T.dark ? (T.colors.beam || '#ffffff') : T.colors.ink;
    for (const c of grid.cells) {
      const bx = (c.col - grid.col) * (B.per + B.gx), by = (c.row - grid.row) * (B.per + B.gy);
      let mature = '', born = '', ghost = '';
      for (let y = 0; y < B.per; y++) for (let x = 0; x < B.per; x++) {
        const i = (by + y) * B.W + (bx + x);
        const px = c.x + x * B.cw + pad / 2, py = c.y + y * B.ch + pad / 2, w = B.cw - pad, h = B.ch - pad;
        const sq = `M${n(px)} ${n(py)}h${n(w)}v${n(h)}h${n(-w)}Z`;
        if (alive[i]) { if (age[i] === 0) born += sq; else mature += sq; } else if (dead[i]) ghost += sq;
      }
      if (ghost) k.add(`<path d="${ghost}" fill="${url(gid)}" fill-opacity="${n(0.22 * vis, 3)}"/>`);
      if (mature) k.add(`<path d="${mature}" fill="${url(gid)}"${vis < 1 ? ` fill-opacity="${n(vis, 3)}"` : ''}/>`);
      if (born) k.add(`<path d="${born}" fill="${hot}" fill-opacity="${n(0.78 * vis, 3)}"/>`);
    }
    return k.svg();
  },
};
