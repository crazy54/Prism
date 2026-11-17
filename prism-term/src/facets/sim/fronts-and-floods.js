// Fronts and floods — slow weather with real consequences: a fog bank rolling
// over pine ridges, a haboob wall swallowing the desert, a blizzard burying a
// fence line in drifts, and a monsoon that floods the hollow and drains again.
import { mix } from '../../color.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

export default [
  {
    id: 'sim-fog-bank',
    since: '0.3.0',
    title: 'Rolling Fog Bank',
    gallery: 'sim',
    category: 'Weather',
    kind: 'scene',
    tags: ['fog', 'mist', 'hills', 'pines', 'visibility', 'weather'],
    order: 240,
    description: 'A fog bank rolls over three pine ridges and back out again, swallowing fence posts while a pale sun glows through the murk.',
    size: { w: 80, h: 22 },
    minSize: { w: 24, h: 7 },
    loop: 40,
    canvas: 'field',
    palette: 'ice',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const scene = new Int32Array(W * H);
      const sunX = W * 0.68, sunY = H * 0.26, sunR = Math.max(2, Math.min(W, H) * 0.14);
      const skyHi = mix(th.bg, 0xb8c6d4, 0.4), skyLo = mix(th.bg, 0xd8c8b0, 0.35);
      const layers = [
        { k: 0.5, c: mix(th.bg, 0x5a6b74, 0.5) },
        { k: 0.66, c: mix(th.bg, 0x37464c, 0.6) },
        { k: 0.84, c: mix(th.bg, 0x1c282c, 0.7) },
      ];
      const ridges = layers.map((L, li) => {
        const r = new Float32Array(W);
        for (let x = 0; x < W; x++) r[x] = H * (L.k + 0.1 * noise.fbm(x * 0.025, 3 + li * 9, 0, 2));
        return r;
      });
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let c = mix(skyHi, skyLo, y / Math.max(1, H - 1));
        const sd = Math.hypot(x - sunX, (y - sunY) * 1.7) / sunR;
        if (sd < 1) c = mix(c, 0xfff4da, 1 - sd * 0.5);
        for (let li = 0; li < 3; li++) if (y > ridges[li][x]) c = layers[li].c;
        scene[y * W + x] = c;
      }
      // Pines on the middle ridge, fence posts on the near slope.
      const dark = (i, c) => { if (i >= 0 && i < scene.length) scene[i] = c; };
      for (let p = 0; p < Math.max(2, W / 14); p++) {
        const x = (rand() * W) | 0, base = ridges[1][clamp(x, 0, W - 1)], h = H * (0.08 + rand() * 0.08);
        for (let y = Math.max(0, Math.round(base - h)); y <= base; y++) {
          const half = Math.max(0, ((y - (base - h)) / h) * h * 0.35);
          for (let dx = -half; dx <= half; dx++) dark(y * W + ((x + dx) | 0), mix(layers[1].c, 0x0c1416, 0.6));
        }
      }
      for (let p = 1; p < 7; p++) {
        const x = Math.round((W * p) / 7), base = ridges[2][clamp(x, 0, W - 1)];
        const top = base + (H - base) * 0.25;
        for (let y = Math.round(top); y < Math.min(H, Math.round(top + H * 0.1) + 1); y++) dark(y * W + x, 0x10181a);
      }
      const fogC = mix(th.bg, 0xcfd8dc, 0.72);
      const sunGlow = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
        sunGlow[y * W + x] = Math.max(0, 1 - Math.hypot(x - sunX, (y - sunY) * 1.5) / (sunR * 3.2));
      const birds = [{ y: H * 0.3, v: W * 0.055, off: rand() * W }, { y: H * 0.38, v: W * 0.04, off: rand() * W }];

      return (t) => {
        const bank = 0.42 + 0.4 * Math.sin((TAU * t) / 40 - 1.2);
        for (let y = 0; y < H; y++) {
          const row = y * W, hk = 0.3 + 0.7 * smooth(y / Math.max(1, H - 1));
          for (let x = 0; x < W; x++) {
            const i = row + x;
            const d = bank * hk * (0.45 + 0.65 * noise.fbm(x * 0.03 + t * 0.55, y * 0.1, t * 0.05, 2));
            const k = clamp(d, 0, 0.96);
            px[i] = k > 0.01 ? mix(scene[i], mix(fogC, 0xfff0d2, sunGlow[i] * 0.8), k) : scene[i];
          }
        }
        for (const b of birds) {
          const span = W + 16;
          const bx = ((b.off + t * b.v) % span) - 8;
          const by = b.y + Math.sin(t * 2 + b.off) * 0.8;
          const vis = clamp(1 - bank * 0.9, 0.05, 1);
          const wing = Math.sin(t * 7 + b.off) > 0 ? -1 : 0;
          for (const [ox, oy] of [[0, 0], [-1, wing], [1, wing]]) {
            const x = (bx + ox) | 0, y = (by + oy) | 0;
            if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = mix(px[y * W + x], 0x14181c, vis);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-sandstorm',
    since: '0.3.0',
    title: 'Haboob Wall',
    gallery: 'sim',
    category: 'Weather',
    kind: 'scene',
    tags: ['sandstorm', 'haboob', 'desert', 'dust', 'wall', 'weather'],
    order: 250,
    description: 'A towering haboob front marches across the dunes, buries the homestead in boiling orange sand, then thins back to hard sunlight.',
    size: { w: 80, h: 22 },
    minSize: { w: 24, h: 7 },
    loop: 28,
    canvas: 'field',
    palette: 'gold',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const scene = new Int32Array(W * H);
      const skyHi = mix(th.bg, 0x9ec4e0, 0.42), skyLo = mix(th.bg, 0xe8cfa0, 0.4);
      const duneFar = mix(th.bg, 0xcaa368, 0.5), duneNear = mix(th.bg, 0x9a7442, 0.55);
      const far = new Float32Array(W), near = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        far[x] = H * (0.62 + 0.07 * noise.fbm(x * 0.02, 4.1, 0, 2));
        near[x] = H * (0.8 + 0.08 * noise.fbm(x * 0.03, 9.7, 0, 2));
      }
      const sunX = W * 0.3, sunY = H * 0.2, sunR = Math.max(2, Math.min(W, H) * 0.12);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let c = mix(skyHi, skyLo, Math.pow(y / Math.max(1, H - 1), 1.3));
        const sd = Math.hypot(x - sunX, (y - sunY) * 1.7) / sunR;
        if (sd < 1) c = mix(c, 0xfffbe8, 1 - sd * 0.35);
        if (y > far[x]) c = mix(duneFar, 0xe0bc80, clamp((y - far[x]) * 0.06, 0, 0.35));
        if (y > near[x]) c = mix(duneNear, 0x6b4e28, clamp((y - near[x]) * 0.08, 0, 0.4));
        scene[y * W + x] = c;
      }
      // Homestead: a shack and a dead tree on the near dune.
      const hx = Math.round(W * 0.62), hbase = Math.round(near[clamp(hx, 0, W - 1)]);
      const hw = Math.max(3, Math.round(W * 0.07)), hh = Math.max(2, Math.round(H * 0.1));
      for (let y = hbase - hh; y <= hbase; y++) for (let x = hx; x < hx + hw; x++)
        if (x >= 0 && x < W && y >= 0 && y < H) scene[y * W + x] = 0x241508;
      for (let x = hx - 1; x <= hx + hw; x++) {
        const y = hbase - hh - 1 - Math.round(Math.min(x - hx + 1, hx + hw - x) * 0.3);
        if (x >= 0 && x < W && y >= 0 && y < H) scene[y * W + x] = 0x160d04;
      }
      const txx = Math.round(W * 0.14), tbase = Math.round(near[clamp(txx, 0, W - 1)]);
      for (let k = 0; k < Math.max(2, H * 0.1); k++) {
        const y = tbase - k;
        if (y >= 0 && txx < W) scene[y * W + txx] = 0x1a1008;
        if (k > 1 && y >= 0) for (const b of [-1, 1]) { const x = txx + b * ((k / 2) | 0); if (x >= 0 && x < W) scene[y * W + x] = 0x1a1008; }
      }
      const N = clamp(Math.round((ctx.width * ctx.height) / 24), 40, 180);
      const PX = new Float32Array(N), PY = new Float32Array(N), PS = new Float32Array(N);
      for (let i = 0; i < N; i++) { PX[i] = rand() * W; PY[i] = rand() * H; PS[i] = 0.6 + rand() * 0.8; }
      const sandLo = mix(th.bg, 0x7a4a1c, 0.6), sandHi = mix(th.bg, 0xd8a050, 0.5);
      const loop = 28, faceW = Math.max(4, W * 0.07);

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        const u = (t / loop) % 1;
        const wallX = -W * 0.3 + (W * 1.7) * smooth((u - 0.04) / 0.5);
        const fade = u < 0.6 ? 1 : 1 - smooth((u - 0.6) / 0.36);
        for (let y = 0; y < H; y++) {
          const row = y * W, ky = y / Math.max(1, H - 1);
          const sand = mix(sandHi, sandLo, ky);
          for (let x = 0; x < W; x++) {
            const i = row + x;
            const engulf = clamp((wallX - x) / faceW, 0, 1);
            let d = 0;
            if (engulf > 0 && fade > 0.01) {
              const turb = 0.55 + 0.55 * noise.fbm(x * 0.035 - t * 1.1, y * 0.08, t * 0.12, 2);
              const edge = Math.exp(-Math.abs(x - wallX + faceW * 0.4) / faceW) * (0.5 + 0.5 * noise.noise2(y * 0.12 - t * 0.8, x * 0.02));
              d = clamp((engulf * 0.82 * turb + edge * 0.7) * fade, 0, 0.97);
            }
            px[i] = d > 0.01 ? mix(scene[i], sand, d) : scene[i];
          }
        }
        // Wind-driven grains streak only inside the storm body.
        if (fade > 0.05) for (let i = 0; i < N; i++) {
          PX[i] -= (W * 0.45 + PS[i] * W * 0.4) * dt * 0.8;
          PY[i] += Math.sin(t * 3 + i) * dt * 2;
          if (PX[i] < 0) { PX[i] += W; PY[i] = rand() * H; }
          const xi = PX[i] | 0, yi = clamp(PY[i] | 0, 0, H - 1);
          if (xi < 0 || xi >= W) continue;
          if (clamp((wallX - xi) / faceW, 0, 1) < 0.5) continue;
          const c = mix(sandHi, 0xf0c070, PS[i] * 0.5);
          for (let k = 0; k < 3; k++) {
            const x = xi + k;
            if (x < W) px[yi * W + x] = mix(px[yi * W + x], c, (0.7 - k * 0.2) * fade);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-blizzard',
    since: '0.3.0',
    title: 'Blizzard Whiteout',
    gallery: 'sim',
    category: 'Weather',
    kind: 'scene',
    tags: ['blizzard', 'snow', 'drifts', 'whiteout', 'wind', 'gusts', 'weather'],
    order: 260,
    description: 'Horizontal snow lashes a fence line and a road sign; drifts pile up in their lee while gusts pulse the whole scene to whiteout.',
    size: { w: 72, h: 22 },
    minSize: { w: 24, h: 7 },
    loop: 35,
    canvas: 'field',
    palette: 'ice',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const gb = Math.round(H * 0.84);
      // Obstacles: posts with two rails, and a road sign.
      const postH = Math.max(2, Math.round(H * 0.14));
      const posts = [];
      for (let x = Math.round(W * 0.08); x < W * 0.62; x += Math.max(4, Math.round(W / 9))) posts.push(x);
      const sgx = Math.round(W * 0.74), sgw = Math.max(3, Math.round(W * 0.1)), sgh = Math.max(2, Math.round(H * 0.16));
      const sgTop = gb - Math.round(H * 0.3);
      const poleX = sgx + (sgw >> 1);
      // Lee-side shelter (wind blows left to right) drives where drifts build.
      const shelter = new Float32Array(W);
      const addShelter = (cx0, h) => {
        for (let d = 1; d <= 8; d++) { const x = cx0 + d; if (x >= 0 && x < W) shelter[x] += (1 - d / 9) * (h / postH) * 0.9; }
        const x = cx0 - 1; if (x >= 0) shelter[x] += 0.25;
      };
      for (const p of posts) addShelter(p, postH);
      addShelter(poleX, postH * 1.4);
      const depth = new Float32Array(W);
      const N = clamp(Math.round((ctx.width * ctx.height) / 7), 90, 520);
      const FX = new Float32Array(N), FY = new Float32Array(N), FZ = new Float32Array(N);
      for (let i = 0; i < N; i++) { FX[i] = rand() * W; FY[i] = rand() * H; FZ[i] = 0.4 + rand() * 0.6; }
      const skyC = mix(th.bg, 0x8795a3, 0.45), skyD = mix(th.bg, 0x5e6c7a, 0.5);
      const snowC = 0xf2f6ff, snowS = mix(th.bg, 0xaebfd2, 0.4);
      const postC = mix(th.bg, 0x241a10, 0.75), signC = mix(th.warn, 0xd89a2a, 0.4);
      const veilC = 0xe8eef6;
      const maxD = H * 0.26;

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        const gust = Math.max(0, noise.noise2(t * 0.22, 7.7) * 2 - 0.5);
        const wind = 1 + 0.5 * noise.noise2(t * 0.4, 3.1) + gust * 1.6;
        for (let y = 0; y < H; y++) {
          const row = y * W, c = mix(skyC, skyD, y / Math.max(1, H - 1));
          for (let x = 0; x < W; x++) px[row + x] = c;
        }
        // Snowfield + drifts.
        for (let x = 0; x < W; x++) {
          const surf = gb - depth[x];
          for (let y = Math.max(0, surf | 0); y < H; y++) {
            const i = y * W + x;
            px[i] = (x * 13 + y * 7) % 11 < 2 ? snowS : y === (surf | 0) ? 0xffffff : snowC;
          }
        }
        // Fence and sign, buried from the bottom up.
        for (const p of posts) {
          const surf = gb - depth[p];
          for (let y = gb - postH; y < surf; y++) if (y >= 0) px[y * W + p] = postC;
        }
        for (const ry of [gb - Math.round(postH * 0.75), gb - Math.round(postH * 0.3)]) {
          for (let x = posts[0]; x <= posts[posts.length - 1]; x++) {
            if (x < 0 || x >= W || ry < 0) continue;
            if (ry < gb - depth[x]) px[ry * W + x] = mix(postC, 0x4a3a28, 0.4);
          }
        }
        for (let y = sgTop + sgh; y < gb; y++) if (y < gb - depth[poleX] && y >= 0 && poleX < W) px[y * W + poleX] = postC;
        for (let y = sgTop; y < sgTop + sgh; y++) for (let x = sgx; x < Math.min(W, sgx + sgw); x++) {
          if (y >= gb - depth[x] || y < 0) continue;
          const border = y === sgTop || y === sgTop + sgh - 1 || x === sgx || x === Math.min(W, sgx + sgw) - 1;
          px[y * W + x] = border ? 0x2a2318 : signC;
        }
        // Wind-lashed snow: streak length and slant grow with the gust.
        const len = 2 + Math.min(4, wind);
        for (let i = 0; i < N; i++) {
          FX[i] += wind * (14 + FZ[i] * 26) * dt * (W / 72);
          FY[i] += (4 + FZ[i] * 6) * dt * (H / 22) * (1 - gust * 0.3);
          if (FX[i] >= W) { FX[i] -= W; FY[i] = rand() * H * 0.8; }
          const xi = FX[i] | 0;
          const xc = clamp(xi, 0, W - 1);
          const surf = gb - depth[xc];
          if (FY[i] >= surf) {
            const d = 0.22 * (1 + 2.6 * shelter[xc]);
            depth[xc] = Math.min(maxD, depth[xc] + d * FZ[i]);
            FX[i] = rand() * W * 0.3; FY[i] = -rand() * 3;
            continue;
          }
          if (FY[i] > H) { FY[i] = -1; FX[i] = rand() * W; continue; }
          const k = 0.45 + FZ[i] * 0.5;
          for (let s = 0; s < len; s++) {
            const x = (FX[i] - s * wind * 0.5) | 0, y = (FY[i] - s * 0.25) | 0;
            if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = mix(px[y * W + x], snowC, k * (1 - s / len));
          }
        }
        // Drifts relax; gusts raise a whiteout veil.
        for (let x = 1; x < W - 1; x++) {
          if (depth[x] - depth[x + 1] > 1.6) { depth[x] -= 0.08; depth[x + 1] += 0.08; }
          if (depth[x] - depth[x - 1] > 2.2) { depth[x] -= 0.06; depth[x - 1] += 0.06; }
        }
        const veil = clamp(0.1 + 0.3 * gust, 0, 0.7);
        if (veil > 0.12) for (let y = 0; y < H; y++) {
          const row = y * W;
          for (let x = 0; x < W; x++) {
            const v = veil * (0.5 + 0.5 * noise.noise2(x * 0.05 - t * (3 + gust * 2), y * 0.12));
            if (v > 0.03) px[row + x] = mix(px[row + x], veilC, clamp(v, 0, 0.85));
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-monsoon',
    since: '0.3.0',
    title: 'Monsoon Flood',
    gallery: 'sim',
    category: 'Weather',
    kind: 'scene',
    tags: ['monsoon', 'rain', 'flood', 'puddle', 'ripples', 'palm', 'reflection'],
    order: 270,
    description: 'Monsoon rain floods the hollow under a whipping palm — the waterline climbs, rings spread where drops land, then it drains away.',
    size: { w: 72, h: 24 },
    minSize: { w: 24, h: 8 },
    loop: 32,
    canvas: 'field',
    palette: 'ocean',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const g = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        const d = (x - W * 0.55) / (W * 0.26);
        g[x] = H * 0.72 + H * 0.14 * Math.exp(-d * d) + noise.noise2(x * 0.1, 3.3) * 0.8;
      }
      const gMin = H * 0.72;
      const skyHi = mix(th.bg, 0x27333f, 0.6), skyLo = mix(th.bg, 0x49565e, 0.5);
      const mudC = mix(th.bg, 0x3a2d1a, 0.55), mudD = mix(th.bg, 0x241b0e, 0.6);
      const rainC = mix(th.info, 0xbcd2ee, 0.5);
      const waterC = mix(th.bg, 0x0c2e40, 0.5);
      const palmX = W * 0.24, trunkH = Math.max(4, H * 0.34);
      const hutX = Math.round(W * 0.84), hutW = Math.max(3, Math.round(W * 0.09)), hutH = Math.max(2, Math.round(H * 0.12));
      const N = clamp(Math.round((ctx.width * ctx.height) / 8), 80, 500);
      const RX = new Float32Array(N), RY = new Float32Array(N), RS = new Float32Array(N);
      for (let i = 0; i < N; i++) { RX[i] = rand() * W; RY[i] = rand() * H; RS[i] = 0.7 + rand() * 0.5; }
      const rings = [];
      const loop = 32;
      const plot = (x0, y0, x1, y1, c) => {
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let k = 0; k <= n; k++) {
          const x = Math.round(x0 + (x1 - x0) * (k / n)), y = Math.round(y0 + (y1 - y0) * (k / n));
          if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c;
        }
      };

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        const u = (t / loop) % 1;
        const lvl = u < 0.68 ? smooth(u / 0.68) : 1 - smooth((u - 0.68) / 0.32);
        const planeY = H * 0.88 - lvl * (H * 0.88 - (gMin + 1.5));
        const wind = 0.5 + 0.45 * noise.noise2(t * 0.5, 1.1) + 0.3 * Math.max(0, noise.noise2(t * 1.3, 8.8));
        for (let y = 0; y < H; y++) {
          const row = y * W, c = mix(skyHi, skyLo, y / Math.max(1, H - 1));
          for (let x = 0; x < W; x++) px[row + x] = y >= g[x] ? ((x * 17 + y * 5) % 9 < 2 ? mudD : mudC) : c;
        }
        // Hut on the high ground.
        for (let y = 0; y < hutH; y++) for (let x = 0; x < hutW; x++) {
          const yy = Math.round(g[clamp(hutX + x, 0, W - 1)]) - 1 - y, xx = hutX + x;
          if (xx < W && yy >= 0 && yy < H) px[yy * W + xx] = y === hutH - 1 ? 0x160f06 : 0x2b1c0c;
        }
        // Palm: trunk bends with the squall, fronds whip.
        const bend = (wind - 0.5) * W * 0.06;
        const baseY = g[clamp(palmX | 0, 0, W - 1)];
        let tx0 = palmX, ty0 = baseY;
        for (let s = 1; s <= 4; s++) {
          const k = s / 4;
          const tx1 = palmX + bend * k * k, ty1 = baseY - trunkH * k;
          plot(tx0, ty0, tx1, ty1, 0x33240f);
          tx0 = tx1; ty0 = ty1;
        }
        const topX = palmX + bend, topY = baseY - trunkH;
        for (let fIdx = 0; fIdx < 6; fIdx++) {
          const fa = -0.3 - fIdx * 0.5 + Math.PI * 0.15;
          const flap = Math.sin(t * 5 + fIdx) * 0.12 * wind;
          const len = Math.max(2, W * 0.08);
          const ex = topX + Math.cos(fa + flap) * len * (1 + wind * 0.3);
          const ey = topY - Math.sin(fa + flap) * len * 0.5 + (fIdx % 2) * 0.8;
          plot(topX, topY, ex, ey + len * 0.22, 0x1d3a16);
        }
        // Rain: steep, dense, squall-slanted.
        for (let i = 0; i < N; i++) {
          RY[i] += H * 1.9 * RS[i] * dt;
          RX[i] += H * 0.5 * wind * RS[i] * dt;
          if (RX[i] >= W) RX[i] -= W;
          const xi = clamp(RX[i] | 0, 0, W - 1);
          const flooded = planeY < g[xi];
          const surf = flooded ? planeY : g[xi];
          if (RY[i] >= surf) {
            if (flooded && rings.length < 36 && rand() < 0.4) rings.push({ x: RX[i], r: 0.6, life: 0.55 });
            RY[i] = -rand() * H * 0.25; RX[i] = rand() * W;
            continue;
          }
          const y0 = RY[i] | 0, x0 = xi;
          if (y0 >= 0 && y0 < H) {
            px[y0 * W + x0] = mix(px[y0 * W + x0], rainC, 0.7);
            const y1 = y0 - 1, x1 = (RX[i] - wind * 0.5) | 0;
            if (y1 >= 0 && x1 >= 0 && x1 < W) px[y1 * W + x1] = mix(px[y1 * W + x1], rainC, 0.4);
          }
        }
        // Water: mirror the world above the line, then draw spreading rings.
        if (lvl > 0.02) {
          const pY = Math.max(1, planeY);
          for (let x = 0; x < W; x++) {
            if (planeY >= g[x]) continue;
            for (let y = Math.max(0, pY | 0); y < H; y++) {
              const i = y * W + x;
              if (y >= g[x]) { px[i] = mix(px[i], waterC, 0.75); continue; }
              const wob = noise.noise2(x * 0.3, y * 0.5 + t * 1.8) * 1.6;
              const sy = clamp((2 * pY - y + wob) | 0, 0, H - 1);
              px[i] = mix(px[sy * W + x], waterC, 0.55);
            }
            px[(pY | 0) * W + x] = mix(px[(pY | 0) * W + x], 0x9fc8de, 0.5);
          }
          for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i];
            r.r += dt * 7; r.life -= dt;
            if (r.life <= 0) { rings.splice(i, 1); continue; }
            const k = r.life * 1.4;
            for (let a = 0; a < 10; a++) {
              const ang = (a / 10) * TAU;
              const x = (r.x + Math.cos(ang) * r.r) | 0, y = (pY + 0.6 + Math.sin(ang) * r.r * 0.22) | 0;
              if (x >= 0 && x < W && y >= 0 && y < H && y >= pY - 1 && planeY < g[clamp(x, 0, W - 1)])
                px[y * W + x] = mix(px[y * W + x], 0xcfe6f4, clamp(k, 0, 0.8));
            }
          }
        } else rings.length = 0;
        cv.paint(ctx.buffer);
      };
    },
  },
];
