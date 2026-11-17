// Six more cellular automata at canvas-pixel resolution: a scrolling Wolfram
// elementary rule, the Drossel–Schwabl forest-fire model, Griffeath's cyclic
// spirals, the Bak–Tang–Wiesenfeld sandpile, Silverman's Seeds, and Vichniac's
// twisted majority vote. All grids are typed arrays stepped on fixed-rate
// accumulators; every random draw goes through ctx.rng.
import { NONE, mix } from '../../color.js';
import { clamp } from '../../easing.js';
import { fadeMark } from '../../palettes.js';

/** Torus index helpers: xm[x] = x-1, xp[x] = x+1 with wraparound. */
const wraps = (n) => {
  const m = new Int32Array(n), p = new Int32Array(n);
  for (let i = 0; i < n; i++) { m[i] = (i - 1 + n) % n; p[i] = (i + 1) % n; }
  return [m, p];
};

const rule110 = {
  id: 'sim-rule-110',
  since: '0.3.0',
  title: 'Rule 110',
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['rule 110', 'elementary', 'wolfram', '1d', 'turing complete'],
  order: 200,
  description: 'A Wolfram elementary automaton scrolls one generation per pixel row — rule 110 cascades triangles leftward from a single seed.',
  size: { w: 64, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 12,
  canvas: 'field',
  credits: "after Stephen Wolfram's elementary automata",
  params: { rule: { default: 110, min: 1, max: 255, label: 'Rule' }, speed: { default: 1, min: 0.2, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas('field');
    const { width: W, height: H, px } = cv;
    const rand = ctx.rng, th = ctx.theme;
    const rule = clamp(Math.round(ctx.param('rule', 110)), 1, 255) | 0;
    const hz = 14 * ctx.param('speed', 1);
    const grid = new Uint8Array(W * H), row = new Uint8Array(W);
    const last = (H - 1) * W;
    const seed = () => {
      grid.fill(0, last);
      grid[last + Math.max(0, W - 2)] = 1; // one seed: the classic clean cascade
    };
    seed();
    const rowCol = new Int32Array(H);
    for (let y = 0; y < H; y++) {
      const f = H === 1 ? 1 : y / (H - 1);
      rowCol[y] = fadeMark(th, y === H - 1 ? mix(th.accent, th.ink, 0.35) : th.accent, 0.2 + 0.8 * Math.pow(f, 1.5));
    }
    const step = () => {
      let sum = 0;
      for (let x = 0; x < W; x++) {
        const a = grid[last + (x === 0 ? W - 1 : x - 1)], b = grid[last + x], c = grid[last + (x === W - 1 ? 0 : x + 1)];
        row[x] = (rule >> ((a << 2) | (b << 1) | c)) & 1;
        sum += row[x];
      }
      grid.copyWithin(0, W);
      grid.set(row, last);
      if (sum === 0 || sum === W) seed(); // dead or saturated: start a fresh run
    };
    let acc = 0;
    return (t, dt) => {
      acc += dt * hz;
      for (let k = 0; acc >= 1 && k < 6; k++, acc--) step();
      if (acc > 6) acc = 0;
      for (let y = 0, i = 0; y < H; y++) { const c = rowCol[y]; for (let x = 0; x < W; x++, i++) px[i] = grid[i] ? c : NONE; }
      cv.paint(ctx.buffer);
    };
  },
};

const forestFire = {
  id: 'sim-forest-fire',
  since: '0.3.0',
  title: 'Forest Fire',
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['forest fire', 'drossel-schwabl', 'percolation', 'wildfire', 'ecology'],
  order: 210,
  description: 'The Drossel–Schwabl forest-fire model: saplings fill the gaps, lightning strikes, and fire fronts carve glowing clearings.',
  size: { w: 72, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 24,
  canvas: 'field',
  credits: 'after the Drossel–Schwabl forest-fire model',
  params: { speed: { default: 1, min: 0.2, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas('field');
    const { width: W, height: H, px } = cv;
    const rand = ctx.rng, th = ctx.theme;
    const hz = 13 * ctx.param('speed', 1);
    const N = W * H;
    const P = 0.012, F = 0.00022; // regrowth and lightning odds per cell per step
    let cur = new Uint8Array(N), nxt = new Uint8Array(N); // 0 empty, 1 tree, 2 fire
    const tint = new Uint8Array(N), heat = new Float32Array(N);
    const [xm, xp] = wraps(W);
    for (let i = 0; i < N; i++) { tint[i] = (rand() * 16) | 0; if (rand() < 0.52) cur[i] = 1; }
    const tLut = new Int32Array(16);
    for (let k = 0; k < 16; k++) tLut[k] = mix(th.pos, th.bg, 0.14 + (0.5 * k) / 15);
    const flameCore = th.mode === 'light' ? th.ink : 0xffffff;
    const step = () => {
      for (let y = 0; y < H; y++) {
        const r0 = ((y - 1 + H) % H) * W, r1 = y * W, r2 = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const i = r1 + x, s = cur[i];
          if (s === 2) { nxt[i] = 0; heat[i] = 1; continue; }
          if (s === 0) { nxt[i] = rand() < P ? 1 : 0; continue; }
          const a = xm[x], b = xp[x];
          const burn = cur[r0 + a] === 2 || cur[r0 + x] === 2 || cur[r0 + b] === 2
            || cur[r1 + a] === 2 || cur[r1 + b] === 2
            || cur[r2 + a] === 2 || cur[r2 + x] === 2 || cur[r2 + b] === 2
            || rand() < F;
          nxt[i] = burn ? 2 : 1;
        }
      }
      [cur, nxt] = [nxt, cur];
    };
    let acc = 0;
    return (t, dt) => {
      acc += dt * hz;
      for (let k = 0; acc >= 1 && k < 4; k++, acc--) step();
      if (acc > 4) acc = 0;
      const cool = Math.exp(-dt * 2.1);
      for (let i = 0; i < N; i++) {
        const s = cur[i];
        if (s === 1) { px[i] = tLut[tint[i]]; continue; }
        if (s === 2) {
          let c = mix(th.neg, th.warn, rand());
          if (rand() < 0.25) c = mix(c, flameCore, 0.4);
          px[i] = c;
          continue;
        }
        if (heat[i] > 0.035) { px[i] = fadeMark(th, th.neg, heat[i] * 0.55); heat[i] *= cool; }
        else px[i] = NONE;
      }
      cv.paint(ctx.buffer);
    };
  },
};

const cyclic = {
  id: 'sim-cyclic-ca',
  since: '0.3.0',
  title: 'Cyclic Spirals',
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['cyclic', 'spirals', 'griffeath', 'rock paper scissors', 'waves'],
  order: 220,
  description: "Griffeath's cyclic automaton: 14 species that each eat the next curdle random soup into whirling rainbow spirals.",
  size: { w: 64, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 18,
  canvas: 'field',
  credits: "after David Griffeath's cyclic cellular automata",
  params: { speed: { default: 1, min: 0.2, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas('field');
    const { width: W, height: H, px } = cv;
    const rand = ctx.rng, pal = ctx.palette();
    const hz = 13 * ctx.param('speed', 1);
    const K = 14, N = W * H;
    let cur = new Uint8Array(N), nxt = new Uint8Array(N);
    const [xm, xp] = wraps(W);
    for (let i = 0; i < N; i++) cur[i] = (rand() * K) | 0;
    const lut = new Int32Array(K);
    for (let s = 0; s < K; s++) lut[s] = pal(s / K);
    const step = () => {
      for (let y = 0; y < H; y++) {
        const r0 = ((y - 1 + H) % H) * W, r1 = y * W, r2 = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const i = r1 + x, s = cur[i], e = s + 1 === K ? 0 : s + 1;
          nxt[i] = (cur[r0 + x] === e || cur[r2 + x] === e || cur[r1 + xm[x]] === e || cur[r1 + xp[x]] === e) ? e : s;
        }
      }
      [cur, nxt] = [nxt, cur];
    };
    for (let k = 0; k < 110; k++) step(); // pre-run past the noisy phase into droplets & spirals
    let acc = 0;
    return (t, dt) => {
      acc += dt * hz;
      for (let k = 0; acc >= 1 && k < 4; k++, acc--) step();
      if (acc > 4) acc = 0;
      for (let i = 0; i < N; i++) px[i] = lut[cur[i]];
      cv.paint(ctx.buffer);
    };
  },
};

const sandpile = {
  id: 'sim-sandpile',
  since: '0.3.0',
  title: 'Abelian Sandpile',
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['sandpile', 'abelian', 'avalanche', 'self-organized criticality', 'fractal', 'mandala'],
  order: 230,
  description: 'Grains drip onto the centre of an abelian sandpile; every fourth topples, and avalanches flash across the growing fractal mandala.',
  size: { w: 60, h: 26 },
  minSize: { w: 20, h: 8 },
  loop: 30,
  canvas: 'field',
  credits: 'after Bak, Tang & Wiesenfeld',
  params: { pour: { default: 1, min: 0.2, max: 4, label: 'Pour rate' } },
  setup(ctx) {
    const cv = ctx.canvas('field');
    const { width: W, height: H, px } = cv;
    const th = ctx.theme;
    const pour = ctx.param('pour', 1);
    const N = W * H;
    const h = new Uint8Array(N), queued = new Uint8Array(N), stack = new Int32Array(N);
    const flash = new Float32Array(N);
    let sp = 0;
    const ci = (H >> 1) * W + (W >> 1);
    const push = (i) => { if (!queued[i] && h[i] >= 4) { queued[i] = 1; stack[sp++] = i; } };
    const relax = (budget, mark) => {
      while (sp > 0 && budget > 0) {
        const i = stack[--sp];
        queued[i] = 0;
        while (h[i] >= 4 && budget > 0) {
          h[i] -= 4;
          budget--;
          if (mark) flash[i] = 1;
          const x = i % W;
          if (x > 0) { h[i - 1]++; push(i - 1); }
          if (x < W - 1) { h[i + 1]++; push(i + 1); }
          if (i >= W) { h[i - W]++; push(i - W); }
          if (i < N - W) { h[i + W]++; push(i + W); }
        }
        if (h[i] >= 4) push(i); // ran out of budget mid-cell: requeue
      }
    };
    for (let k = 0, pre = Math.round(N / 2.4); k < pre; k++) { h[ci]++; push(ci); relax(1e7, false); }
    const lut = [NONE, fadeMark(th, th.info, 0.38), th.info, th.accent];
    const flashC = mix(th.accent, th.mode === 'light' ? th.ink : 0xffffff, 0.55);
    let acc = 0;
    return (t, dt) => {
      acc += dt * 240 * pour * clamp(N / 15360, 0.12, 1.2);
      for (let k = 0; acc >= 1 && k < 400; k++, acc--) { h[ci]++; push(ci); }
      if (acc > 400) acc = 0;
      relax(24000, true);
      const cool = Math.exp(-dt * 5.5);
      for (let i = 0; i < N; i++) {
        let c = lut[h[i] > 3 ? 3 : h[i]];
        const f = flash[i];
        if (f > 0.05) { c = mix(c === NONE ? th.bg : c, flashC, f * 0.85); flash[i] = f * cool; }
        px[i] = c;
      }
      cv.paint(ctx.buffer);
    };
  },
};

const seeds = {
  id: 'sim-seeds',
  since: '0.3.0',
  title: 'Seeds',
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['seeds', 'b2/s', 'silverman', 'explosive', 'afterglow'],
  order: 240,
  description: 'Seeds (B2/S): every live cell dies each tick yet pairs ignite new ones — an expanding lacework of sparks over its own afterglow.',
  size: { w: 64, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 18,
  canvas: 'field',
  credits: "after Brian Silverman's Seeds",
  params: { speed: { default: 1, min: 0.2, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas('field');
    const { width: W, height: H, px } = cv;
    const rand = ctx.rng, th = ctx.theme;
    const hz = 15 * ctx.param('speed', 1);
    const RUN = 18;
    const N = W * H;
    let cur = new Uint8Array(N), nxt = new Uint8Array(N);
    const heat = new Float32Array(N);
    const [xm, xp] = wraps(W);
    let pop = 0;
    const reseed = () => {
      cur.fill(0); nxt.fill(0); heat.fill(0);
      const cx = W >> 1, cy = H >> 1, r = Math.max(2, Math.min(W, H) * 0.17);
      for (let a = 0; a < Math.PI * 2; a += 0.32) {
        const x = Math.round(cx + Math.cos(a) * r + (rand() - 0.5) * 2);
        const y = Math.round(cy + Math.sin(a) * r * 0.75 + (rand() - 0.5) * 2);
        if (x >= 0 && x < W && y >= 0 && y < H) cur[y * W + x] = 1;
      }
      cur[cy * W + cx] = 1; cur[cy * W + xm[cx]] = 1;
      pop = 1;
    };
    reseed();
    const step = () => {
      pop = 0;
      for (let y = 0; y < H; y++) {
        const r0 = ((y - 1 + H) % H) * W, r1 = y * W, r2 = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const a = xm[x], b = xp[x], i = r1 + x;
          const n = cur[r0 + a] + cur[r0 + x] + cur[r0 + b] + cur[r1 + a] + cur[r1 + b] + cur[r2 + a] + cur[r2 + x] + cur[r2 + b];
          nxt[i] = n === 2 ? 1 : 0;
          if (cur[i]) heat[i] = 1;
          pop += nxt[i];
        }
      }
      [cur, nxt] = [nxt, cur];
      if (pop === 0) reseed();
    };
    const live = mix(th.mode === 'light' ? th.ink : 0xffffff, th.accent, 0.25);
    const web = mix(th.accent2, th.accent, 0.4);
    let acc = 0, run = 0;
    return (t, dt) => {
      const r = Math.floor(t / RUN);
      if (r !== run) { run = r; reseed(); acc = 0; }
      acc += dt * hz;
      for (let k = 0; acc >= 1 && k < 4; k++, acc--) step();
      if (acc > 4) acc = 0;
      const cool = Math.exp(-dt * 1.4);
      for (let i = 0; i < N; i++) {
        if (cur[i]) px[i] = live;
        else if (heat[i] > 0.04) { px[i] = fadeMark(th, web, heat[i] * 0.55); heat[i] *= cool; }
        else px[i] = NONE;
      }
      cv.paint(ctx.buffer);
    };
  },
};

const vote = {
  id: 'sim-majority-vote',
  since: '0.3.0',
  title: 'Twisted Majority',
  gallery: 'sim',
  category: 'Cellular Automata',
  kind: 'scene',
  tags: ['majority vote', 'vichniac', 'segregation', 'coarsening', 'domains', 'ising'],
  order: 250,
  description: "Vichniac's twisted majority vote: cells join their neighbourhood's majority (with the 4/5 swap), coarsening into wobbling domains.",
  size: { w: 64, h: 24 },
  minSize: { w: 20, h: 8 },
  loop: 20,
  canvas: 'field',
  credits: "after Gérard Vichniac's twisted majority rule",
  params: { speed: { default: 1, min: 0.2, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas('field');
    const { width: W, height: H, px } = cv;
    const rand = ctx.rng, th = ctx.theme;
    const hz = 18 * ctx.param('speed', 1);
    const N = W * H;
    // Twist: counts 4 and 5 swap outcomes, which keeps interfaces restless.
    const VOTE = [0, 0, 0, 0, 1, 0, 1, 1, 1, 1];
    let cur = new Uint8Array(N), nxt = new Uint8Array(N);
    const [xm, xp] = wraps(W);
    for (let i = 0; i < N; i++) cur[i] = rand() < 0.5 ? 1 : 0;
    const step = () => {
      for (let y = 0; y < H; y++) {
        const r0 = ((y - 1 + H) % H) * W, r1 = y * W, r2 = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const a = xm[x], b = xp[x], i = r1 + x;
          const n = cur[i] + cur[r0 + a] + cur[r0 + x] + cur[r0 + b] + cur[r1 + a] + cur[r1 + b] + cur[r2 + a] + cur[r2 + x] + cur[r2 + b];
          nxt[i] = rand() < 0.0008 ? 1 - VOTE[n] : VOTE[n]; // a breath of thermal noise
        }
      }
      [cur, nxt] = [nxt, cur];
    };
    for (let k = 0; k < 30; k++) step(); // past the first frantic coarsening
    const fill1 = fadeMark(th, th.accent, 0.38);
    const edge1 = mix(th.accent, th.ink, 0.4), edge0 = fadeMark(th, th.accent2, 0.75);
    let acc = 0;
    return (t, dt) => {
      acc += dt * hz;
      for (let k = 0; acc >= 1 && k < 4; k++, acc--) step();
      if (acc > 4) acc = 0;
      for (let y = 0; y < H; y++) {
        const r0 = ((y - 1 + H) % H) * W, r1 = y * W, r2 = ((y + 1) % H) * W;
        for (let x = 0; x < W; x++) {
          const i = r1 + x, s = cur[i];
          const boundary = cur[r0 + x] !== s || cur[r2 + x] !== s || cur[r1 + xm[x]] !== s || cur[r1 + xp[x]] !== s;
          px[i] = boundary ? (s ? edge1 : edge0) : s ? fill1 : NONE;
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};

export default [rule110, forestFire, cyclic, sandpile, seeds, vote];
