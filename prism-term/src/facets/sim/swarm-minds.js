// Swarm minds — collective behaviour where simple local rules add up to one
// moving shape: a fish school wrapping around a hunting shark, a starling
// murmuration smeared into a living density cloud, fireflies pulse-coupling
// into synchrony, and an ant colony condensing pheromone highways.
import { NONE, mix } from '../../color.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export default [
  {
    id: 'sim-fish-school',
    since: '0.3.0',
    title: 'Fish School',
    gallery: 'sim',
    category: 'Life & Flocking',
    kind: 'scene',
    tags: ['fish', 'school', 'shark', 'predator', 'flocking', 'ocean', 'boids'],
    order: 200,
    description: 'A silver school schooling tight through god rays, scattering in a flash-expansion each time the patrolling shark lunges.',
    size: { w: 80, h: 24 },
    minSize: { w: 24, h: 8 },
    loop: 24,
    canvas: 'line',
    palette: 'ocean',
    credits: 'after Reynolds (1987)',
    params: { speed: { default: 1, min: 0.3, max: 2.5, label: 'Speed' } },
    setup(ctx) {
      const water = ctx.canvas('field');
      const view = ctx.canvas('line');
      const W = view.width, H = view.height;
      const FW = water.width, FH = water.height, fpx = water.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise, pal = ctx.palette();
      const speedK = ctx.param('speed', 1);
      const S = Math.max(8, Math.min(W, H));
      const N = clamp(Math.round((ctx.width * ctx.height) / 16), 24, 190);
      const X = new Float32Array(N), Y = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N), FEAR = new Float32Array(N);
      const a0 = rand() * TAU;
      for (let i = 0; i < N; i++) {
        X[i] = W * (0.25 + rand() * 0.3); Y[i] = H * (0.3 + rand() * 0.4);
        const a = a0 + (rand() - 0.5) * 0.9;
        VX[i] = Math.cos(a); VY[i] = Math.sin(a);
      }
      const cruise = S * 0.17 * speedK, burst = cruise * 2.7;
      const rN = S * 0.1, rS = rN * 0.42, rP = S * 0.34, margin = S * 0.09;
      // Spatial hash: neighbour queries stay O(N) even at full tile size.
      const cs = Math.max(2, rN), gw = Math.max(1, Math.ceil(W / cs)), gh = Math.max(1, Math.ceil(H / cs));
      const head = new Int32Array(gw * gh), next = new Int32Array(N);
      const shark = { x: -S * 0.2, y: H * 0.5, vx: cruise * 0.7, vy: 0, mode: 0 };
      let lungeAt = 4 + rand() * 3, lungeEnd = 0;
      const bubbles = Array.from({ length: Math.max(5, Math.round(FW / 16)) }, () => ({ x: rand() * FW, y: rand() * FH, s: 0.5 + rand() * 0.9, ph: rand() * TAU }));
      const colShaft = new Float32Array(Math.max(1, FW));
      const deepTop = mix(th.bg, 0x08365e, 0.55), deepBot = mix(th.bg, 0x02101f, 0.72);
      const shaftC = mix(th.info, 0xbfe9ff, 0.55);
      const sharkC = mix(th.ink, th.bg, 0.45);
      const size = view.mode === 'braille' ? 2.6 : 1.4;

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        // Water: depth gradient, slanted light shafts, rising bubbles.
        for (let x = 0; x < FW; x++) {
          const a = noise.noise2(x * 0.05 + t * 0.3, 1.7), b = noise.noise2(x * 0.012 + t * 0.05, 8.2);
          colShaft[x] = Math.max(0, a) * Math.max(0, b) * 1.6;
        }
        for (let y = 0; y < FH; y++) {
          const ky = y / Math.max(1, FH - 1), base = mix(deepTop, deepBot, ky);
          const row = y * FW, slant = Math.round(y * 0.45), fade = (1 - ky) * (1 - ky);
          for (let x = 0; x < FW; x++) {
            const s = colShaft[(x + slant) % FW] * fade;
            fpx[row + x] = s > 0.03 ? mix(base, shaftC, Math.min(0.42, s)) : base;
          }
        }
        for (const b of bubbles) {
          b.y -= (2.5 + b.s * 3) * dt * (FH / 24);
          b.x += Math.sin(t * 1.7 + b.ph) * dt * 2;
          if (b.y < 0) { b.y = FH - 1; b.x = rand() * FW; }
          const xi = b.x | 0, yi = b.y | 0;
          if (xi >= 0 && xi < FW && yi >= 0 && yi < FH) fpx[yi * FW + xi] = mix(fpx[yi * FW + xi], 0xcfe9ff, 0.45);
        }
        water.paint(ctx.buffer);

        // Shark: patrol an easy loop, then lunge at the school's centroid.
        let mx = 0, my = 0;
        for (let i = 0; i < N; i++) { mx += X[i]; my += Y[i]; }
        mx /= N; my /= N;
        if (shark.mode === 0 && t >= lungeAt) { shark.mode = 1; lungeEnd = t + 1.5; }
        if (shark.mode === 1 && t > lungeEnd) { shark.mode = 0; lungeAt = t + 4 + rand() * 4; }
        const tx = shark.mode ? mx : W * 0.5 + Math.cos(t * 0.21) * W * 0.4;
        const ty = shark.mode ? my : H * 0.5 + Math.sin(t * 0.13) * H * 0.32;
        const acc = shark.mode ? S * 1.5 : S * 0.3;
        const dd = Math.hypot(tx - shark.x, ty - shark.y) || 1;
        shark.vx += ((tx - shark.x) / dd) * acc * dt; shark.vy += ((ty - shark.y) / dd) * acc * dt;
        const sv = Math.hypot(shark.vx, shark.vy) || 1, smax = shark.mode ? cruise * 2.3 : cruise * 0.75;
        if (sv > smax) { shark.vx *= smax / sv; shark.vy *= smax / sv; }
        shark.x += shark.vx * dt; shark.y += shark.vy * dt;
        shark.x = clamp(shark.x, -S * 0.2, W + S * 0.2); shark.y = clamp(shark.y, 1, H - 2);

        // School: hashed neighbourhood, flash-expansion fear response.
        head.fill(-1);
        for (let i = 0; i < N; i++) {
          const gi = clamp((Y[i] / cs) | 0, 0, gh - 1) * gw + clamp((X[i] / cs) | 0, 0, gw - 1);
          next[i] = head[gi]; head[gi] = i;
        }
        for (let i = 0; i < N; i++) {
          const xi = X[i], yi = Y[i];
          let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0;
          const gx = clamp((xi / cs) | 0, 0, gw - 1), gy = clamp((yi / cs) | 0, 0, gh - 1);
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const cxg = gx + ox, cyg = gy + oy;
            if (cxg < 0 || cyg < 0 || cxg >= gw || cyg >= gh) continue;
            for (let j = head[cyg * gw + cxg]; j !== -1; j = next[j]) {
              if (j === i) continue;
              const dx = X[j] - xi, dy = Y[j] - yi, d2 = dx * dx + dy * dy;
              if (d2 > rN * rN) continue;
              n++; ax += VX[j]; ay += VY[j]; cx += X[j]; cy += Y[j];
              if (d2 < rS * rS) { const d = Math.sqrt(d2) || 0.01; sx -= dx / d * (rS - d); sy -= dy / d * (rS - d); }
            }
          }
          let vx = VX[i], vy = VY[i];
          if (n) {
            vx += (ax / n - vx) * 1.6 * dt; vy += (ay / n - vy) * 1.6 * dt;
            vx += (cx / n - xi) * 1.1 * dt; vy += (cy / n - yi) * 1.1 * dt;
          }
          vx += sx * 7 * dt; vy += sy * 7 * dt;
          const pdx = xi - shark.x, pdy = yi - shark.y, pd = Math.hypot(pdx, pdy);
          if (pd < rP) {
            const k = 1 - pd / rP;
            FEAR[i] = Math.max(FEAR[i], k);
            vx += (pdx / (pd || 1)) * burst * 4.5 * k * dt; vy += (pdy / (pd || 1)) * burst * 4.5 * k * dt;
          }
          FEAR[i] *= Math.exp(-dt * 1.3);
          if (xi < margin) vx += cruise * 3 * dt; else if (xi > W - margin) vx -= cruise * 3 * dt;
          if (yi < margin) vy += cruise * 3 * dt; else if (yi > H - margin) vy -= cruise * 3 * dt;
          const want = cruise * (1 + 1.8 * FEAR[i]);
          const v = Math.hypot(vx, vy) || 1;
          const cl = v > want ? want / v : v < cruise * 0.55 ? (cruise * 0.55) / v : 1;
          VX[i] = vx * cl; VY[i] = vy * cl;
        }

        view.clear();
        for (let i = 0; i < N; i++) {
          X[i] = clamp(X[i] + VX[i] * dt, 0, W - 0.5); Y[i] = clamp(Y[i] + VY[i] * dt, 0, H - 0.5);
          const v = Math.hypot(VX[i], VY[i]) || 1, dx = VX[i] / v, dy = VY[i] / v;
          const len = size * (1 + 0.5 * FEAR[i]);
          const depth = clamp(Y[i] / Math.max(1, H), 0, 1);
          const c = mix(pal(0.45 + 0.3 * (1 - depth)), th.ink, clamp(FEAR[i] * 0.9, 0, 0.8));
          view.line(X[i] - dx * len, Y[i] - dy * len, X[i], Y[i], c);
        }
        // Shark: a long-nosed body polygon with a tail fin.
        const sv2 = Math.hypot(shark.vx, shark.vy) || 1, sdx = shark.vx / sv2, sdy = shark.vy / sv2;
        const sl = size * 3.4, px0 = shark.x, py0 = shark.y;
        const c = mix(sharkC, th.neg, shark.mode ? 0.35 : 0.08);
        view.polygon([
          [px0 + sdx * sl, py0 + sdy * sl],
          [px0 - sdx * sl * 0.5 - sdy * sl * 0.45, py0 - sdy * sl * 0.5 + sdx * sl * 0.45],
          [px0 - sdx * sl * 0.9, py0 - sdy * sl * 0.9],
          [px0 - sdx * sl * 0.5 + sdy * sl * 0.45, py0 - sdy * sl * 0.5 - sdx * sl * 0.45],
        ], c);
        view.line(px0 - sdx * sl * 0.9 - sdy * sl * 0.5, py0 - sdy * sl * 0.9 + sdx * sl * 0.5, px0 - sdx * sl * 0.9 + sdy * sl * 0.5, py0 - sdy * sl * 0.9 - sdx * sl * 0.5, c);
        view.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-murmuration',
    since: '0.3.0',
    title: 'Murmuration',
    gallery: 'sim',
    category: 'Life & Flocking',
    kind: 'scene',
    tags: ['starlings', 'murmuration', 'flock', 'density', 'dusk', 'birds'],
    order: 210,
    description: 'Hundreds of starlings render as a breathing density cloud that folds and ribbons over a dusk horizon with bare trees.',
    size: { w: 80, h: 24 },
    minSize: { w: 24, h: 8 },
    loop: 24,
    canvas: 'field',
    palette: 'sunset',
    credits: 'after Reynolds (1987)',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise, pal = ctx.palette();
      const N = clamp(Math.round((ctx.width * ctx.height) / 8), 80, 420);
      const X = new Float32Array(N), Y = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N);
      const S = Math.max(8, Math.min(W, H));
      for (let i = 0; i < N; i++) {
        X[i] = W * (0.4 + rand() * 0.2); Y[i] = H * (0.3 + rand() * 0.25);
        const a = rand() * TAU; VX[i] = Math.cos(a) * S * 0.3; VY[i] = Math.sin(a) * S * 0.3;
      }
      let D = new Float32Array(W * H), tmp = new Float32Array(W * H);
      // Ground silhouette with two bare trees plotted into a static mask.
      const gy = new Float32Array(W);
      for (let x = 0; x < W; x++) gy[x] = H * (0.85 + 0.04 * noise.noise2(x * 0.03, 4.4));
      const mask = new Uint8Array(W * H);
      const plot = (x0, y0, x1, y1) => {
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let k = 0; k <= n; k++) {
          const x = Math.round(x0 + (x1 - x0) * (k / n)), y = Math.round(y0 + (y1 - y0) * (k / n));
          if (x >= 0 && x < W && y >= 0 && y < H) mask[y * W + x] = 1;
        }
      };
      const tree = (bx, scale) => {
        const base = gy[clamp(bx | 0, 0, W - 1)];
        const grow = (x, y, ang, len, depth) => {
          const nx = x + Math.cos(ang) * len, ny = y - Math.sin(ang) * len;
          plot(x, y, nx, ny);
          if (depth <= 0 || len < 1.2) return;
          grow(nx, ny, ang + 0.35 + rand() * 0.3, len * 0.66, depth - 1);
          grow(nx, ny, ang - 0.35 - rand() * 0.3, len * 0.66, depth - 1);
        };
        grow(bx, base, Math.PI / 2, H * 0.16 * scale, 4);
      };
      tree(W * 0.78, 1); tree(W * 0.15, 0.6);
      const birdC = mix(th.ink, 0x05070d, 0.78);
      const silC = mix(birdC, 0x000000, 0.25);
      const vmin = S * 0.22, vmax = S * 0.52;

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        // The roost target loops the sky; attraction breathes so the cloud
        // contracts to a knot and shakes back out into ribbons.
        const Tx = W * (0.5 + 0.3 * Math.sin(t * 0.37) + 0.1 * noise.noise2(t * 0.11, 3.3));
        const Ty = H * (0.38 + 0.2 * Math.sin(t * 0.53 + 1.3) + 0.1 * noise.noise2(t * 0.13, 7.7));
        const breath = 0.5 + 0.45 * Math.sin(t * 0.52 + noise.noise2(t * 0.07, 5.5) * 2);
        for (let i = 0; i < D.length; i++) D[i] *= 0.8;
        for (let i = 0; i < N; i++) {
          const ang = noise.noise3(X[i] * 0.016, Y[i] * 0.03, t * 0.12) * 2.8;
          VX[i] += Math.cos(ang) * S * 0.9 * dt + (Tx - X[i]) * (0.35 + breath) * dt;
          VY[i] += Math.sin(ang) * S * 0.9 * dt + (Ty - Y[i]) * (0.35 + breath) * dt;
          // Tangential slip makes the cloud orbit instead of collapsing.
          VX[i] += (Ty - Y[i]) * 0.5 * dt; VY[i] -= (Tx - X[i]) * 0.5 * dt;
          const v = Math.hypot(VX[i], VY[i]) || 1;
          const cl = v > vmax ? vmax / v : v < vmin ? vmin / v : 1;
          VX[i] *= cl; VY[i] *= cl;
          X[i] += VX[i] * dt; Y[i] += VY[i] * dt;
          if (X[i] < 1) { X[i] = 1; VX[i] = Math.abs(VX[i]); } else if (X[i] > W - 2) { X[i] = W - 2; VX[i] = -Math.abs(VX[i]); }
          const floor = gy[clamp(X[i] | 0, 0, W - 1)] - 2;
          if (Y[i] < 1) { Y[i] = 1; VY[i] = Math.abs(VY[i]); } else if (Y[i] > floor) { Y[i] = floor; VY[i] = -Math.abs(VY[i]); }
          D[(Y[i] | 0) * W + (X[i] | 0)] += 1;
        }
        // One separable 1-2-1 blur softens dots into a murmuration smear.
        for (let y = 0; y < H; y++) {
          const r = y * W;
          for (let x = 0; x < W; x++) {
            const a = D[r + Math.max(0, x - 1)], b = D[r + x], cc = D[r + Math.min(W - 1, x + 1)];
            tmp[r + x] = a * 0.25 + b * 0.5 + cc * 0.25;
          }
        }
        for (let y = 0; y < H; y++) {
          const up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W, r = y * W;
          for (let x = 0; x < W; x++) D[r + x] = tmp[up + x] * 0.25 + tmp[r + x] * 0.5 + tmp[dn + x] * 0.25;
        }
        const sunX = W * 0.3, sunY = H * 0.68, sunR = Math.max(2, S * 0.14);
        for (let y = 0; y < H; y++) {
          const ky = y / Math.max(1, H - 1);
          const row = mix(pal(0.08 + 0.05 * Math.sin(t * 0.04)), pal(0.8), Math.pow(ky, 1.4));
          for (let x = 0; x < W; x++) {
            const i = y * W + x;
            let c = row;
            const sd = Math.hypot(x - sunX, (y - sunY) * 1.6) / sunR;
            if (sd < 2.2) c = mix(c, 0xffd9a0, Math.max(0, 1 - sd * 0.45));
            const d = D[i];
            if (d > 0.04) c = mix(c, birdC, Math.min(0.94, d * 0.5));
            if (y > gy[x] || mask[i]) c = silC;
            px[i] = c;
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-fireflies',
    since: '0.3.0',
    title: 'Fireflies in Sync',
    gallery: 'sim',
    category: 'Life & Flocking',
    kind: 'scene',
    tags: ['fireflies', 'synchronization', 'kuramoto', 'meadow', 'night', 'emergence'],
    order: 220,
    description: 'Pulse-coupled fireflies drift over a night meadow, nudging neighbours each flash until the whole field blinks as one.',
    size: { w: 72, h: 22 },
    minSize: { w: 24, h: 8 },
    loop: 30,
    canvas: 'field',
    palette: 'toxic',
    credits: 'after Mirollo & Strogatz (1990)',
    params: { coupling: { default: 1, min: 0, max: 3, label: 'Coupling' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const eps = 0.04 * ctx.param('coupling', 1);
      const S = Math.max(8, Math.min(W, H));
      const N = clamp(Math.round((ctx.width * ctx.height) / 24), 26, 130);
      const X = new Float32Array(N), Y = new Float32Array(N), PH = new Float32Array(N), FR = new Float32Array(N), GL = new Float32Array(N), SD = new Float32Array(N);
      const grass = new Float32Array(W), blade = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        grass[x] = H * (0.72 + 0.05 * noise.noise2(x * 0.06, 2.2));
        blade[x] = rand() < 0.5 ? rand() * H * 0.1 : 0;
      }
      for (let i = 0; i < N; i++) {
        X[i] = 2 + rand() * (W - 4);
        Y[i] = H * 0.2 + rand() * (grass[clamp(X[i] | 0, 0, W - 1)] - H * 0.2 - 2);
        PH[i] = rand(); FR[i] = 0.42 + rand() * 0.12; SD[i] = rand() * 100;
      }
      const R2 = Math.pow(S * 0.38, 2);
      const stars = Array.from({ length: Math.max(4, W >> 3) }, () => ({ x: (rand() * W) | 0, y: (rand() * H * 0.4) | 0, ph: rand() * TAU }));
      const skyTop = mix(th.bg, 0x060b22, 0.6), skyHor = mix(th.bg, 0x14253a, 0.55);
      const grassC = mix(0x07130a, th.bg, 0.2), bladeC = mix(0x0d2412, th.bg, 0.15);
      const glowC = mix(th.warn, 0xd9ff7a, 0.55), coreC = 0xfaffd8;
      const flashed = new Int32Array(N);

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        let nf = 0;
        for (let i = 0; i < N; i++) {
          PH[i] += FR[i] * dt;
          if (PH[i] >= 1) { PH[i] -= 1; GL[i] = 1; flashed[nf++] = i; }
          GL[i] *= Math.exp(-3.6 * dt);
          // A lazy wander: drift along a personal noise path above the grass.
          X[i] += noise.noise2(t * 0.3, SD[i]) * S * 0.25 * dt;
          Y[i] += noise.noise2(t * 0.27, SD[i] + 40) * S * 0.18 * dt;
          X[i] = clamp(X[i], 1, W - 2);
          Y[i] = clamp(Y[i], H * 0.12, grass[clamp(X[i] | 0, 0, W - 1)] + Math.min(4, H * 0.08));
        }
        // Each flash nudges every neighbour's clock forward (Mirollo-Strogatz).
        for (let k = 0; k < nf; k++) {
          const f = flashed[k];
          for (let j = 0; j < N; j++) {
            if (j === f || GL[j] > 0.6) continue;
            const dx = X[j] - X[f], dy = Y[j] - Y[f];
            if (dx * dx + dy * dy < R2) PH[j] = Math.min(1, PH[j] + eps * (0.4 + PH[j]));
          }
        }
        // Night meadow backdrop.
        for (let y = 0; y < H; y++) {
          const row = y * W, sky = mix(skyTop, skyHor, Math.pow(y / Math.max(1, H - 1), 1.6));
          for (let x = 0; x < W; x++) {
            const g = grass[x];
            px[row + x] = y > g ? grassC : y > g - blade[x] && ((x * 7 + y * 3) % 5 < 2) ? bladeC : sky;
          }
        }
        for (const s of stars) {
          const k = 0.25 + 0.3 * Math.max(0, Math.sin(t * 0.9 + s.ph));
          if (s.y < H && s.x < W) px[s.y * W + s.x] = mix(px[s.y * W + s.x], 0xcfd8ff, k);
        }
        for (let i = 0; i < N; i++) {
          const xi = X[i] | 0, yi = Y[i] | 0, g = GL[i];
          if (g > 0.04) {
            for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
              const x = xi + dx, y = yi + dy;
              if (x < 0 || y < 0 || x >= W || y >= H) continue;
              const k = g * Math.max(0, 1 - (dx * dx + dy * dy * 4) / 6);
              if (k > 0.02) px[y * W + x] = mix(px[y * W + x], glowC, Math.min(0.95, k));
            }
            px[yi * W + xi] = mix(glowC, coreC, g * 0.7);
          } else if (xi >= 0 && xi < W && yi >= 0 && yi < H) {
            px[yi * W + xi] = mix(px[yi * W + xi], th.muted, 0.22);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-ant-trails',
    since: '0.3.0',
    title: 'Ant Trails',
    gallery: 'sim',
    category: 'Life & Flocking',
    kind: 'scene',
    tags: ['ants', 'pheromone', 'stigmergy', 'colony', 'trails', 'emergence', 'foraging'],
    order: 230,
    description: 'Foragers wander from the nest, and carriers lay pheromone home — trails condense to golden highways and dissolve as piles empty.',
    size: { w: 64, h: 22 },
    minSize: { w: 22, h: 8 },
    loop: 30,
    canvas: 'field',
    palette: 'gold',
    credits: 'after Deneubourg’s double-bridge experiments',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const nest = { x: Math.max(2, W * 0.16), y: H * 0.6 };
      const foods = Array.from({ length: 3 }, (_, k) => ({
        x: W * (0.5 + 0.44 * rand()), y: 3 + rand() * (H - 6), amt: 1, hue: k,
      }));
      let pher = new Float32Array(W * H), tmp = new Float32Array(W * H);
      const N = clamp(Math.round((W * H) / 48), 44, 300);
      const AX = new Float32Array(N), AY = new Float32Array(N), AA = new Float32Array(N), AS = new Uint8Array(N);
      for (let i = 0; i < N; i++) { AX[i] = nest.x; AY[i] = nest.y; AA[i] = rand() * TAU; }
      const soil = new Int32Array(W * H);
      const soilBase = mix(th.bg, 0x241509, 0.45);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        soil[y * W + x] = mix(soilBase, 0x3a2a16, 0.25 + 0.3 * noise.noise2(x * 0.2, y * 0.33));
      const trailC = mix(th.warn, 0xffd75e, 0.5);
      const antC = mix(th.ink, soilBase, 0.3), carryC = mix(th.pos, 0xbfff9a, 0.4);
      const foodC = mix(th.pos, 0x3f8f2a, 0.35);
      const speed = Math.max(4, Math.min(W, H)) * 0.42;
      const senseAt = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return -2;
        let v = pher[(y | 0) * W + (x | 0)];
        for (const f of foods) {
          const d = Math.hypot(x - f.x, y - f.y);
          const r = 1.5 + f.amt * 2.5;
          if (d < r + 5) v += (1 - d / (r + 5)) * 9 * f.amt;
        }
        return v;
      };

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        const step = speed * dt;
        for (let i = 0; i < N; i++) {
          let a = AA[i];
          const x = AX[i], y = AY[i];
          if (AS[i] === 0) {
            // Searcher: three pheromone sensors plus jitter.
            const d = 3.5;
            const c = senseAt(x + Math.cos(a) * d, y + Math.sin(a) * d);
            const l = senseAt(x + Math.cos(a - 0.65) * d, y + Math.sin(a - 0.65) * d);
            const r = senseAt(x + Math.cos(a + 0.65) * d, y + Math.sin(a + 0.65) * d);
            if (l > c && l >= r) a -= 0.3; else if (r > c && r > l) a += 0.3;
            a += (rand() - 0.5) * 0.4;
            for (const f of foods) {
              if (f.amt > 0.02 && Math.hypot(x - f.x, y - f.y) < 1.6 + f.amt * 2.5) {
                AS[i] = 1; f.amt = Math.max(0, f.amt - 0.012); a += Math.PI; break;
              }
            }
          } else {
            // Carrier: head home, drop scent as it goes.
            const want = Math.atan2(nest.y - y, nest.x - x);
            let diff = want - a;
            while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
            a += clamp(diff, -0.35, 0.35) + (rand() - 0.5) * 0.12;
            const pi = (y | 0) * W + (x | 0);
            if (pi >= 0 && pi < pher.length) pher[pi] = Math.min(30, pher[pi] + 3);
            if (Math.hypot(x - nest.x, y - nest.y) < 2.5) { AS[i] = 0; a += Math.PI; }
          }
          let nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
          if (nx < 1 || nx > W - 2) { a = Math.PI - a; nx = clamp(nx, 1, W - 2); }
          if (ny < 1 || ny > H - 2) { a = -a; ny = clamp(ny, 1, H - 2); }
          AX[i] = nx; AY[i] = ny; AA[i] = a;
        }
        for (const f of foods) if (f.amt <= 0.02) { f.x = W * (0.45 + 0.5 * rand()); f.y = 3 + rand() * (H - 6); f.amt = 1; }
        // Evaporate + separable diffuse keeps trails crisp but mortal.
        for (let y = 0; y < H; y++) {
          const r = y * W;
          for (let x = 0; x < W; x++) {
            const a = pher[r + Math.max(0, x - 1)], b = pher[r + x], c = pher[r + Math.min(W - 1, x + 1)];
            tmp[r + x] = a * 0.2 + b * 0.6 + c * 0.2;
          }
        }
        for (let y = 0; y < H; y++) {
          const up = Math.max(0, y - 1) * W, dn = Math.min(H - 1, y + 1) * W, r = y * W;
          for (let x = 0; x < W; x++) pher[r + x] = (tmp[up + x] * 0.2 + tmp[r + x] * 0.6 + tmp[dn + x] * 0.2) * 0.985;
        }
        // Soil, trails, nest, food, ants.
        px.set(soil);
        for (let i = 0; i < pher.length; i++) {
          const p = pher[i];
          if (p > 0.08) px[i] = mix(px[i], trailC, Math.min(0.8, p * 0.08));
        }
        for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) {
          const x = (nest.x | 0) + dx, y = (nest.y | 0) + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const d = Math.hypot(dx, dy * 1.6);
          if (d < 3) px[y * W + x] = d < 1.2 ? 0x120a04 : mix(px[y * W + x], 0x4a3820, 0.5);
        }
        for (const f of foods) {
          const r = 1 + f.amt * 2.5;
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
            const x = (f.x | 0) + dx, y = (f.y | 0) + dy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const d = Math.hypot(dx, dy * 1.4);
            if (d < r) px[y * W + x] = mix(foodC, 0xd8ffb0, Math.max(0, 1 - d / (r + 0.01)) * 0.5);
          }
        }
        for (let i = 0; i < N; i++) {
          const xi = AX[i] | 0, yi = AY[i] | 0;
          if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue;
          px[yi * W + xi] = AS[i] ? carryC : antC;
          const bx = (AX[i] - Math.cos(AA[i])) | 0, by = (AY[i] - Math.sin(AA[i])) | 0;
          if (bx >= 0 && by >= 0 && bx < W && by < H) px[by * W + bx] = mix(px[by * W + bx], AS[i] ? carryC : antC, 0.6);
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
