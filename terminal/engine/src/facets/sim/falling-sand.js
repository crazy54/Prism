// A falling-sand automaton like the old sand-art toys: three spouts sweep back
// and forth pouring grains whose hue drifts slowly, so the pile builds up in
// colored strata over sloped ledges. Grains fall, then slide diagonally when
// blocked (never squeezing between two diagonal walls). Every cycle a trapdoor
// opens, the whole pile drains out through the floor, and pouring starts again.
import { NONE, mix } from '../../color.js';

const CYCLE = 24, DRAIN = 6;

export default {
  title: 'Falling Sand',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['sand', 'falling sand', 'automaton', 'granular', 'pile', 'sand art'],
  order: 20,
  description: 'Sweeping spouts pour color-drifting grains that pile into strata over ledges, then drain through a trapdoor.',
  size: { w: 60, h: 22 },
  minSize: { w: 20, h: 8 },
  loop: CYCLE,
  canvas: 'field',
  palette: 'prism',
  params: { rate: { default: 1, min: 0.2, max: 3, label: 'Pour rate' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const W = cv.width, H = cv.height, px = cv.px, th = ctx.theme;
    const rand = ctx.rng, pal = ctx.palette();
    const rate = ctx.param('rate', 1);
    const EMPTY = 0, SAND = 1, WALL = 2;
    const grid = new Uint8Array(W * H), col = new Int32Array(W * H);
    const wallC = th.muted, wallTop = th.ink;
    // Ledges: sloped shelves alternating sides, each stopping short of the far wall.
    const ledge = (x0, y0, x1, y1) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let s = 0; s <= n; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / n), y = Math.round(y0 + ((y1 - y0) * s) / n);
        if (x >= 0 && x < W && y >= 0 && y < H) grid[y * W + x] = WALL;
      }
    };
    const build = () => {
      grid.fill(EMPTY);
      const rows = H >= 24 ? 3 : H >= 14 ? 2 : 1;
      for (let k = 0; k < rows; k++) {
        const y = Math.round(H * (rows === 1 ? 0.5 : 0.3 + (0.42 * k) / (rows - 1)));
        const left = k % 2 === 0, len = Math.round(W * (0.38 + rand() * 0.08)), drop = Math.max(1, Math.round(len * 0.22));
        if (left) ledge(Math.round(W * 0.06), y - drop, Math.round(W * 0.06) + len, y);
        else ledge(W - 1 - Math.round(W * 0.06), y - drop, W - 1 - Math.round(W * 0.06) - len, y);
      }
    };
    build();
    const spouts = [0.2, 0.5, 0.8].map((f, i) => ({ f, ph: rand() * 6.28, sp: 0.25 + rand() * 0.2, hue: i / 3 }));
    let acc = 0, steps = 0, lastCycle = 0;

    const step = (t, draining) => {
      // Bottom-up so a grain moves at most once per step; alternate the scan
      // direction per row and per step so piles don't lean one way.
      const gate0 = Math.floor(W * 0.4), gate1 = Math.ceil(W * 0.6);
      if (draining) for (let x = gate0; x < gate1; x++) { const i = (H - 1) * W + x; if (grid[i] === SAND) grid[i] = EMPTY; }
      for (let y = H - 2; y >= 0; y--) {
        const rtl = (y + steps) & 1;
        for (let k = 0; k < W; k++) {
          const x = rtl ? W - 1 - k : k, i = y * W + x;
          if (grid[i] !== SAND) continue;
          const d = i + W;
          if (grid[d] === EMPTY) { grid[d] = SAND; col[d] = col[i]; grid[i] = EMPTY; continue; }
          const first = rand() < 0.5 ? -1 : 1;
          for (const s of [first, -first]) {
            const nx = x + s;
            if (nx < 0 || nx >= W) continue;
            if (grid[d + s] === EMPTY && grid[i + s] === EMPTY) { grid[d + s] = SAND; col[d + s] = col[i]; grid[i] = EMPTY; break; }
          }
        }
      }
      if (!draining) {
        for (const s of spouts) {
          const x = Math.round((s.f + Math.sin(t * s.sp + s.ph) * 0.12) * (W - 1));
          if (rand() > 0.55 * rate || x < 0 || x >= W || grid[x] !== EMPTY) continue;
          grid[x] = SAND;
          const hue = (s.hue + t * 0.021) % 1;
          col[x] = mix(pal(hue + (rand() - 0.5) * 0.03), 0xd9b77a, 0.3 + rand() * 0.12);
        }
      }
      steps++;
    };

    return (t, dt) => {
      const c = Math.floor(t / CYCLE);
      if (c !== lastCycle) { lastCycle = c; build(); }
      const local = t - c * CYCLE, draining = local > CYCLE - DRAIN;
      acc += dt * 60;
      for (let k = 0; acc >= 1 && k < 10; k++, acc--) step(t, draining);
      if (acc > 10) acc = 0;
      for (let i = 0; i < W * H; i++) {
        const g = grid[i];
        if (g === EMPTY) px[i] = NONE;
        else if (g === WALL) px[i] = i >= W && grid[i - W] !== WALL ? wallTop : wallC;
        else {
          // Surface grains catch the light; buried ones sit a touch darker.
          const top = i < W || grid[i - W] === EMPTY;
          const c0 = col[i];
          const k = top ? 1.12 : 0.92;
          px[i] = (Math.min(255, ((c0 >> 16) & 255) * k) << 16) | (Math.min(255, ((c0 >> 8) & 255) * k) << 8) | Math.min(255, (c0 & 255) * k);
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
