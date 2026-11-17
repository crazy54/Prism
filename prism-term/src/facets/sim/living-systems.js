// Living systems — ecology in a tile: predator-prey populations boom and bust
// over a grazed meadow, coral colonies accrete particle by particle, and a
// mycelial network creeps toward buried nutrients, dies back, and regrows.
import { mix } from '../../color.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export default [
  {
    id: 'sim-lotka-volterra',
    since: '0.3.0',
    title: 'Predator & Prey',
    gallery: 'sim',
    category: 'Life & Flocking',
    kind: 'scene',
    tags: ['lotka-volterra', 'predator', 'prey', 'ecology', 'population', 'foxes', 'rabbits'],
    order: 240,
    description: 'Rabbits graze a regrowing meadow while foxes hunt them; live population traces show the boom-and-bust Lotka-Volterra cycle.',
    size: { w: 72, h: 24 },
    minSize: { w: 24, h: 9 },
    loop: 40,
    canvas: 'field',
    credits: 'after Lotka (1925) & Volterra (1926)',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const S = Math.max(8, Math.min(W, H));
      const G = new Float32Array(W * H);
      for (let i = 0; i < G.length; i++) G[i] = 0.5 + 0.4 * rand();
      const soilC = mix(th.bg, 0x2b1d0e, 0.5);
      const grassC = mix(th.pos, 0x3f9a3f, 0.45);
      const rabbitC = mix(th.ink, 0xffffff, 0.4);
      const foxC = mix(th.warn, th.neg, 0.45);
      const RCAP = clamp(Math.round((W * H) / 90), 40, 170), FCAP = Math.max(10, RCAP >> 2);
      const rabbits = [], foxes = [];
      const spawnR = (x, y, e) => rabbits.length < RCAP && rabbits.push({ x, y, a: rand() * TAU, e, hop: 0 });
      const spawnF = (x, y, e) => foxes.length < FCAP && foxes.push({ x, y, a: rand() * TAU, e });
      for (let i = 0; i < RCAP * 0.45; i++) spawnR(rand() * W, rand() * H, 0.6 + rand() * 0.4);
      for (let i = 0; i < 4; i++) spawnF(rand() * W, rand() * H, 0.8 + rand() * 0.3);
      const chartW = Math.max(10, Math.min(W - 4, 60)), chartH = Math.max(3, Math.round(H * 0.2));
      const rh = new Float32Array(chartW), fh = new Float32Array(chartW);
      let sampleAt = 0;
      const vR = S * 0.28, vF = S * 0.33;

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        for (let i = 0; i < G.length; i++) { const g = G[i]; G[i] = Math.min(1, g + dt * (0.22 * g * (1 - g) + 0.015)); }
        // Rabbits: graze, flee the nearest fox, breed on surplus.
        for (let i = rabbits.length - 1; i >= 0; i--) {
          const r = rabbits[i];
          let fx = 0, fy = 0, fd = 1e9;
          for (const f of foxes) { const d = (f.x - r.x) * (f.x - r.x) + (f.y - r.y) * (f.y - r.y); if (d < fd) { fd = d; fx = f.x; fy = f.y; } }
          const scared = fd < S * S * 0.04;
          if (scared) r.a = Math.atan2(r.y - fy, r.x - fx) + (rand() - 0.5) * 0.5;
          else { r.hop -= dt; if (r.hop <= 0) { r.a += (rand() - 0.5) * 1.6; r.hop = 0.4 + rand() * 0.9; } }
          const v = scared ? vR * 1.7 : vR * (r.hop > 0.25 ? 1 : 0.15);
          r.x = clamp(r.x + Math.cos(r.a) * v * dt, 1, W - 2);
          r.y = clamp(r.y + Math.sin(r.a) * v * dt, 1, H - 2);
          const gi = (r.y | 0) * W + (r.x | 0);
          if (G[gi] > 0.25 && r.e < 1.3) { G[gi] -= Math.min(0.45, G[gi]) * 0.9; r.e += 0.22; }
          r.e -= dt * 0.075;
          if (r.e > 1.05 && rand() < 0.6 * dt) { r.e -= 0.45; spawnR(r.x + rand() * 2 - 1, r.y + rand() * 2 - 1, 0.5); }
          if (r.e <= 0) rabbits.splice(i, 1);
        }
        // Foxes: lock onto the nearest rabbit in range, starve without kills.
        for (let i = foxes.length - 1; i >= 0; i--) {
          const f = foxes[i];
          let best = -1, bd = S * S * 0.3;
          for (let j = 0; j < rabbits.length; j++) {
            const r = rabbits[j], d = (r.x - f.x) * (r.x - f.x) + (r.y - f.y) * (r.y - f.y);
            if (d < bd) { bd = d; best = j; }
          }
          if (best >= 0) {
            const r = rabbits[best];
            f.a = Math.atan2(r.y - f.y, r.x - f.x);
            if (bd < 1.6) { rabbits.splice(best, 1); f.e = Math.min(1.7, f.e + 0.5); }
          } else if (rand() < 2 * dt) f.a += (rand() - 0.5) * 1.4;
          f.x = clamp(f.x + Math.cos(f.a) * vF * dt, 1, W - 2);
          f.y = clamp(f.y + Math.sin(f.a) * vF * dt, 1, H - 2);
          f.e -= dt * 0.1;
          if (f.e > 1.25 && rand() < 0.3 * dt) { f.e -= 0.55; spawnF(f.x, f.y, 0.6); }
          if (f.e <= 0) foxes.splice(i, 1);
        }
        // A trickle of immigration keeps the cycle from extinguishing.
        if (rabbits.length < 8) for (let k = 0; k < 4; k++) spawnR(rand() * W, rand() * H, 0.8);
        if (foxes.length < 2) spawnF(rand() < 0.5 ? 1 : W - 2, rand() * H, 0.9);
        if (t >= sampleAt) {
          sampleAt = t + 0.3;
          rh.copyWithin(0, 1); fh.copyWithin(0, 1);
          rh[chartW - 1] = rabbits.length / RCAP; fh[chartW - 1] = foxes.length / FCAP;
        }
        // Meadow, animals, then the population chart band.
        for (let y = 0; y < H; y++) {
          const row = y * W;
          for (let x = 0; x < W; x++) px[row + x] = mix(soilC, grassC, G[row + x] * 0.9);
        }
        for (const r of rabbits) {
          const xi = r.x | 0, yi = r.y | 0;
          px[yi * W + xi] = rabbitC;
          if (yi > 0) px[(yi - 1) * W + xi] = mix(px[(yi - 1) * W + xi], rabbitC, 0.5);
        }
        for (const f of foxes) {
          const xi = f.x | 0, yi = f.y | 0;
          px[yi * W + xi] = foxC;
          const bx = clamp(xi - Math.sign(Math.cos(f.a)), 0, W - 1);
          px[yi * W + bx] = mix(px[yi * W + bx], foxC, 0.7);
        }
        const x0 = 2, y0 = 1;
        for (let y = 0; y < chartH + 2; y++) for (let x = 0; x < chartW + 2; x++) {
          const i = (y0 + y - 1) * W + x0 + x - 1;
          if (y0 + y - 1 >= 0 && x0 + x - 1 >= 0 && x0 + x - 1 < W && y0 + y - 1 < H) px[i] = mix(px[i], 0x05070a, 0.55);
        }
        for (let k = 0; k < chartW; k++) {
          const xr = x0 + k;
          if (xr >= W) break;
          const yr = clamp(y0 + chartH - 1 - Math.round(rh[k] * (chartH - 1)), 0, H - 1);
          const yf = clamp(y0 + chartH - 1 - Math.round(fh[k] * (chartH - 1)), 0, H - 1);
          px[yr * W + xr] = rabbitC;
          px[yf * W + xr] = yf === yr ? foxC : mix(px[yf * W + xr], foxC, 0.95);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-coral-growth',
    since: '0.3.0',
    title: 'Coral Reef Accretion',
    gallery: 'sim',
    category: 'Life & Flocking',
    kind: 'scene',
    tags: ['coral', 'dla', 'growth', 'reef', 'ocean', 'accretion'],
    order: 250,
    description: 'Drifting plankton stick to three coral colonies by diffusion-limited aggregation, growing branched reefs under caustic light.',
    size: { w: 64, h: 24 },
    minSize: { w: 22, h: 8 },
    loop: 45,
    canvas: 'field',
    palette: 'candy',
    credits: 'after Witten & Sander (1981)',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise, pal = ctx.palette();
      const sandY = new Int32Array(W);
      for (let x = 0; x < W; x++) sandY[x] = clamp(Math.round(H * (0.86 + 0.05 * noise.noise2(x * 0.08, 5.5))), 2, H - 1);
      const colony = new Uint8Array(W * H);
      const age = new Float32Array(W * H);
      let grown = 0;
      const seeds = [0.22, 0.52, 0.8];
      for (let s = 0; s < seeds.length; s++) {
        const x = clamp(Math.round(W * (seeds[s] + (rand() - 0.5) * 0.08)), 1, W - 2);
        const y = sandY[x] - 1;
        if (y >= 0) { colony[y * W + x] = s + 1; age[y * W + x] = grown++; }
      }
      const hueBase = [0.02, 0.38, 0.72];
      const maxGrow = Math.round(W * H * 0.16);
      const K = clamp(Math.round((W * H) / 700), 6, 24);
      const waterTop = mix(th.bg, 0x0a3d66, 0.6), waterBot = mix(th.bg, 0x041828, 0.7);
      const sandC = mix(th.bg, 0xc2a36b, 0.5), sandD = mix(th.bg, 0x8a7148, 0.5);
      const fish = Array.from({ length: 3 }, (_, i) => ({ y: H * (0.2 + 0.18 * i), v: (0.04 + 0.03 * rand()) * W, off: rand() * W, s: rand() < 0.5 ? 1 : -1 }));
      const fishC = mix(th.bg, 0x0a141f, 0.75);
      const tryStick = (x, y) => {
        const i = y * W + x;
        const n = (x > 0 && colony[i - 1]) || (x < W - 1 && colony[i + 1]) || (y > 0 && colony[i - W]) || (y < H - 1 && colony[i + W]);
        if (n && rand() < 0.75) { colony[i] = n; age[i] = grown++; return true; }
        return false;
      };

      return (t) => {
        // Random-walk plankton; each sticks when it brushes the reef.
        if (grown < maxGrow) for (let k = 0; k < K; k++) {
          let x = (rand() * W) | 0, y = (rand() * H * 0.3) | 0;
          for (let s = 0; s < 80; s++) {
            x += rand() < 0.5 ? -1 : 1;
            y += rand() < 0.52 ? 1 : rand() < 0.6 ? -1 : 0;
            if (x < 1) x = W - 2; else if (x > W - 2) x = 1;
            if (y < 0) y = 0;
            if (y >= sandY[x]) break;
            if (colony[y * W + x]) break;
            if (tryStick(x, y)) break;
          }
        }
        const norm = 1 / Math.max(1, grown);
        for (let y = 0; y < H; y++) {
          const ky = y / Math.max(1, H - 1), row = y * W;
          const water = mix(waterTop, waterBot, ky);
          // Two crossing caustic waves, strongest near the surface.
          const cw = Math.max(0, 1 - ky * 2.2);
          for (let x = 0; x < W; x++) {
            const i = row + x;
            const c = colony[i];
            if (c) {
              const a = age[i] * norm;
              const base = pal(hueBase[c - 1] + a * 0.16);
              px[i] = mix(base, 0xffffff, 0.12 + 0.14 * Math.sin(t * 2.1 + age[i] * 0.045));
            } else if (y >= sandY[x]) {
              px[i] = (x * 13 + y * 7) % 11 < 3 ? sandD : sandC;
            } else {
              let w = water;
              if (cw > 0.02) {
                const k = Math.max(0, Math.sin(x * 0.42 + t * 1.6) * Math.sin(x * 0.13 - t * 0.9 + y * 0.5));
                if (k > 0.55) w = mix(w, 0x9fdcff, (k - 0.55) * cw);
              }
              px[i] = w;
            }
          }
        }
        for (const f of fish) {
          const span = W + 12;
          let fx = (f.off + t * f.v) % span;
          if (f.s < 0) fx = span - fx;
          fx -= 6;
          const fy = (f.y + Math.sin(t * 1.3 + f.off) * 1.5) | 0;
          for (let d = 0; d < 3; d++) {
            const x = (fx | 0) - d * f.s;
            if (x >= 0 && x < W && fy >= 0 && fy < H && !colony[fy * W + x]) px[fy * W + x] = d ? mix(px[fy * W + x], fishC, 0.7) : fishC;
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-mycelium',
    since: '0.3.0',
    title: 'Mycelium Run',
    gallery: 'sim',
    category: 'Life & Flocking',
    kind: 'scene',
    tags: ['mycelium', 'fungus', 'hyphae', 'network', 'growth', 'soil'],
    order: 260,
    description: 'Hyphal tips branch through dark soil toward amber nutrient pockets, fuse into a pale web, exhaust the food, and regrow anew.',
    size: { w: 64, h: 22 },
    minSize: { w: 20, h: 7 },
    loop: 36,
    canvas: 'field',
    palette: 'ice',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise, pal = ctx.palette();
      const soil = new Int32Array(W * H);
      const soilBase = mix(th.bg, 0x161009, 0.55);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        soil[y * W + x] = mix(soilBase, 0x2a2014, 0.25 + 0.35 * noise.noise2(x * 0.3, y * 0.42));
      const nut = new Float32Array(W * H);
      const thread = new Float32Array(W * H);
      let tips = [], fadeT = 0, cycle = 0;
      const nutC = mix(th.warn, 0xffb640, 0.4);
      const tipC = mix(th.accent2, 0xffffff, 0.35);
      const seedWorld = () => {
        thread.fill(0);
        const oz = 11.3 * cycle + 2.7;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const v = noise.fbm(x * 0.06, y * 0.09, oz, 3);
          nut[y * W + x] = Math.max(0, (v - 0.12) * 2.4);
        }
        tips = [];
        const n = 2 + (cycle % 2);
        for (let k = 0; k < n; k++)
          tips.push({ x: W * (0.3 + rand() * 0.4), y: H * (0.35 + rand() * 0.3), a: rand() * TAU, life: 9 + rand() * 8, last: -1 });
        cycle++;
      };
      seedWorld();
      const sense = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : nut[(y | 0) * W + (x | 0)] - thread[(y | 0) * W + (x | 0)] * 0.08);
      const CAP = clamp(Math.round((W * H) / 110), 24, 130);

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        if (tips.length === 0) {
          // Die-back: the web fades, then a fresh spore network seeds.
          fadeT += dt;
          for (let i = 0; i < thread.length; i++) thread[i] *= 0.955;
          if (fadeT > 3) { fadeT = 0; seedWorld(); }
        }
        const speed = Math.max(5, Math.min(W, H)) * 0.38;
        for (let i = tips.length - 1; i >= 0; i--) {
          const p = tips[i];
          const d = 2.5;
          const c = sense(p.x + Math.cos(p.a) * d, p.y + Math.sin(p.a) * d);
          const l = sense(p.x + Math.cos(p.a - 0.6) * d, p.y + Math.sin(p.a - 0.6) * d);
          const r = sense(p.x + Math.cos(p.a + 0.6) * d, p.y + Math.sin(p.a + 0.6) * d);
          if (l > c && l >= r) p.a -= 0.28; else if (r > c && r > l) p.a += 0.28;
          p.a += (rand() - 0.5) * 0.3;
          p.x += Math.cos(p.a) * speed * dt;
          p.y += Math.sin(p.a) * speed * dt;
          p.life -= dt;
          const xi = p.x | 0, yi = p.y | 0;
          if (xi < 1 || yi < 1 || xi >= W - 1 || yi >= H - 1 || p.life <= 0) { tips.splice(i, 1); continue; }
          const pi = yi * W + xi;
          // Anastomosis: running into an established cord fuses and ends the tip.
          if (pi !== p.last && thread[pi] > 3.4) { thread[pi] = Math.min(6, thread[pi] + 1); tips.splice(i, 1); continue; }
          thread[pi] = Math.min(6, thread[pi] + 1.4);
          p.last = pi;
          const food = nut[pi];
          if (food > 0.01) nut[pi] = Math.max(0, food - 1.6 * dt);
          if (tips.length < CAP && rand() < (0.35 + 2.4 * food) * dt)
            tips.push({ x: p.x, y: p.y, a: p.a + (rand() < 0.5 ? -1 : 1) * (0.55 + rand() * 0.5), life: 6 + rand() * 7, last: pi });
        }
        for (let i = 0; i < soil.length; i++) {
          let c = soil[i];
          const n = nut[i];
          if (n > 0.03) c = mix(c, nutC, Math.min(0.45, n * 0.4));
          const w = thread[i];
          if (w > 0.06) c = mix(c, pal(0.55 + Math.min(0.4, w * 0.07)), Math.min(0.92, w * 0.24));
          px[i] = c;
        }
        for (const p of tips) {
          const xi = p.x | 0, yi = p.y | 0;
          if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
          px[yi * W + xi] = tipC;
          const pulse = 0.3 + 0.3 * Math.sin(t * 5 + p.life * 3);
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = xi + ox, y = yi + oy;
            if (x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = mix(px[y * W + x], tipC, pulse);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
