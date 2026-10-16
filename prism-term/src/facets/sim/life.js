// Conway's Game of Life on a toroidal grid at canvas-pixel resolution (8 cells
// per terminal cell in braille). Cells are colored by age — newborns white-hot,
// survivors cooling through the theme's accents — and recently dead cells leave
// a ghost glow in block modes. A rolling state hash detects stagnation and
// short cycles, which trigger fresh soup; gliders are fired in periodically.

import { NONE } from '../../color.js';

const GLIDER = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
const LWSS = [[1, 0], [4, 0], [0, 1], [0, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3]];

export default {
  title: 'Game of Life',
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['game of life', 'conway', 'cellular automata', 'braille'],
  order: 10,
  description: "Conway's Life at braille resolution — age-colored cells, ghost trails, auto-reseeding on stagnation, injected gliders.",
  canvas: 'line',
  setup(ctx) {
    const cv = ctx.canvas();
    const { width: W, height: H, px } = cv;
    const rand = ctx.rng;
    const th = ctx.theme;
    const gps = 14 * ctx.param('speed', 1);
    // Newborn cells flash the brightest ink the theme has: white light at Night, ink by Day.
    const ageCol = ctx.palette([th.mode === 'light' ? th.ink : '#ffffff', th.accent, th.info, th.pos, th.crit]);
    const AGES = 90;
    const lut = new Int32Array(AGES);
    for (let a = 0; a < AGES; a++) lut[a] = ageCol(Math.pow(a / (AGES - 1), 0.6));
    const ghosts = cv.mode !== 'braille' && cv.mode !== 'ascii';
    const N = W * H;
    let cur = new Uint8Array(N), nxt = new Uint8Array(N);
    const age = new Uint16Array(N);
    const heat = new Float32Array(N);
    const xm = new Int32Array(W), xp = new Int32Array(W);
    for (let x = 0; x < W; x++) { xm[x] = (x - 1 + W) % W; xp[x] = (x + 1) % W; }

    const soup = (x0, y0, w, h, density) => {
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          const i = (((y % H) + H) % H) * W + (((x % W) + W) % W);
          if (rand() < density) { cur[i] = 1; age[i] = 0; }
        }
    };
    const stamp = (shape, ox, oy, fx, fy) => {
      const sw = Math.max(...shape.map((p) => p[0])), sh = Math.max(...shape.map((p) => p[1]));
      for (const [x, y] of shape) {
        const X = ((ox + (fx ? sw - x : x)) % W + W) % W, Y = ((oy + (fy ? sh - y : y)) % H + H) % H;
        cur[Y * W + X] = 1; age[Y * W + X] = 0;
      }
    };
    const reseed = () => {
      const n = 2 + Math.floor(rand() * 3), s = Math.max(6, Math.floor(Math.min(W, H) * 0.35));
      for (let k = 0; k < n; k++) soup(Math.floor(rand() * W), Math.floor(rand() * H), s, s, 0.38);
    };
    soup(0, 0, W, H, 0.27);

    const recent = new Map(); // state hash → generation it was seen
    let gen = 0, stuck = 0, acc = 0, nextShip = 2 + rand() * 3, pop = 0;

    const step = () => {
      let h = 0x811c9dc5, p = 0;
      for (let y = 0; y < H; y++) {
        const r0 = ((y - 1 + H) % H) * W, r1 = y * W, r2 = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const a = xm[x], b = xp[x];
          const n = cur[r0 + a] + cur[r0 + x] + cur[r0 + b] + cur[r1 + a] + cur[r1 + b] + cur[r2 + a] + cur[r2 + x] + cur[r2 + b];
          const i = r1 + x, alive = cur[i];
          const v = n === 3 || (alive && n === 2) ? 1 : 0;
          nxt[i] = v;
          if (v) {
            age[i] = alive ? Math.min(65535, age[i] + 1) : 0;
            p++;
            h = Math.imul(h ^ i, 16777619);
          } else if (alive) heat[i] = 1;
          else if (heat[i] > 0) heat[i] = heat[i] < 0.03 ? 0 : heat[i] * 0.78;
        }
      }
      [cur, nxt] = [nxt, cur];
      gen++;
      pop = p;
      h = (h ^ p) >>> 0;
      // Periodic (≤ 60 generations) or near-empty → stir in fresh soup.
      if (recent.has(h) && gen - recent.get(h) <= 60) stuck++;
      else stuck = Math.max(0, stuck - 1);
      recent.set(h, gen);
      if (recent.size > 120) recent.delete(recent.keys().next().value);
      if (stuck > 24 || pop < N * 0.015) { reseed(); stuck = 0; recent.clear(); }
    };

    return (t, dt) => {
      acc += dt * gps;
      for (let k = 0; acc >= 1 && k < 4; k++, acc--) step();
      if (acc > 4) acc = 0;
      if (t >= nextShip) {
        const shape = rand() < 0.7 ? GLIDER : LWSS;
        stamp(shape, Math.floor(rand() * W), Math.floor(rand() * H), rand() < 0.5, rand() < 0.5);
        nextShip = t + 2.5 + rand() * 3.5;
      }
      const ghostCol = th.crit, bg = ctx.bg < 0 ? 0 : ctx.bg;
      for (let i = 0; i < N; i++) {
        if (cur[i]) px[i] = lut[age[i] < AGES ? age[i] : AGES - 1];
        else if (ghosts && heat[i] > 0.04) {
          const k = heat[i] * 0.4;
          const r = ((bg >> 16) & 255) + ((((ghostCol >> 16) & 255) - ((bg >> 16) & 255)) * k);
          const g = ((bg >> 8) & 255) + ((((ghostCol >> 8) & 255) - ((bg >> 8) & 255)) * k);
          const b = (bg & 255) + (((ghostCol & 255) - (bg & 255)) * k);
          px[i] = (r << 16) | (g << 8) | (b | 0);
        } else px[i] = NONE;
      }
      cv.paint(ctx.buffer);
    };
  },
};
