// Storm cells — the violent end of the weather gallery: a gusting thunderstorm
// over open fields, a hurricane's spiral banding from orbit, a roping tornado
// funnel, and hail hammering and bouncing off a frozen paddock.
import { mix } from '../../color.js';

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export default [
  {
    id: 'sim-thunderstorm',
    since: '0.3.0',
    title: 'Thunderstorm Cell',
    gallery: 'sim',
    category: 'Weather',
    kind: 'scene',
    tags: ['thunderstorm', 'lightning', 'rain', 'wind', 'gusts', 'storm'],
    order: 200,
    description: 'A churning cloud deck drives gusts of slanted rain across open fields; forked lightning floods the scene and bends the lone tree.',
    size: { w: 80, h: 24 },
    minSize: { w: 24, h: 8 },
    loop: 20,
    canvas: 'field',
    params: { intensity: { default: 1, min: 0.3, max: 2.5, label: 'Rain intensity' } },
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const gy = Math.max(3, Math.round(H * 0.84)), cloudH = Math.max(2, Math.round(H * 0.42));
      const skyHi = mix(th.bg, 0x11161f, 0.6), skyLo = mix(th.bg, 0x2a3440, 0.55);
      const cloudDark = mix(th.bg, 0x0a0e14, 0.75), cloudLit = mix(th.bg, 0x3d4a52, 0.5);
      const stormGreen = 0x25332c;
      const fieldC = mix(th.bg, 0x14240f, 0.6), fieldD = mix(th.bg, 0x0b1608, 0.65);
      const rainC = mix(th.info, 0xc8d6ff, 0.5);
      const flashC = 0xe8eeff;
      const N = clamp(Math.round((ctx.width * ctx.height) / 10) * ctx.param('intensity', 1), 40, 420) | 0;
      const RX = new Float32Array(N), RY = new Float32Array(N), RS = new Float32Array(N);
      for (let i = 0; i < N; i++) { RX[i] = rand() * W; RY[i] = rand() * H; RS[i] = 0.75 + rand() * 0.5; }
      // One wind-bent tree, grown once; redrawn each frame with the gust lean.
      const tx = W * 0.24, trunkH = Math.max(3, (gy - cloudH) * 0.55);
      const limbs = [];
      const mkLimbs = (x, y, ang, len, depth) => {
        limbs.push([x, y, ang, len]);
        if (depth <= 0 || len < 1.3) return;
        mkLimbs(x + Math.cos(ang) * len, y - Math.sin(ang) * len, ang + 0.4 + rand() * 0.25, len * 0.62, depth - 1);
        mkLimbs(x + Math.cos(ang) * len, y - Math.sin(ang) * len, ang - 0.4 - rand() * 0.25, len * 0.62, depth - 1);
      };
      mkLimbs(0, 0, Math.PI / 2, trunkH * 0.55, 3);
      const plot = (x0, y0, x1, y1, c) => {
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let k = 0; k <= n; k++) {
          const x = Math.round(x0 + (x1 - x0) * (k / n)), y = Math.round(y0 + (y1 - y0) * (k / n));
          if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c;
        }
      };
      let nextBolt = 1.5 + rand() * 2, boltAt = -10, bolt = [];
      const mkBolt = () => {
        const segs = [];
        const descend = (x, y, depth) => {
          while (y < gy - 1) {
            const ny = y + 1.5 + rand() * 3, nx = x + (rand() - 0.5) * 5;
            segs.push([x, y, nx, ny]);
            if (depth < 2 && rand() < 0.14) descend(nx, ny, depth + 1);
            if (depth > 0 && rand() < 0.1) return;
            x = nx; y = ny;
          }
        };
        descend(W * (0.2 + rand() * 0.6), cloudH * (0.5 + rand() * 0.4), 0);
        return segs;
      };

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        const wind = 0.35 + 0.35 * noise.noise2(t * 0.33, 2.2) + 0.45 * Math.max(0, noise.noise2(t * 1.1, 9.1));
        if (t >= nextBolt) { boltAt = t; bolt = mkBolt(); nextBolt = t + 3.5 + rand() * 4; }
        const u = t - boltAt;
        const f = u < 0 || u > 1 ? 0 : Math.min(1, Math.exp(-u * 9) + (u > 0.14 ? 0.65 * Math.exp(-(u - 0.14) * 8) : 0));
        for (let y = 0; y < H; y++) {
          const row = y * W;
          if (y < cloudH) {
            const ky = y / cloudH;
            for (let x = 0; x < W; x++) {
              const d = noise.fbm(x * 0.045 - t * (0.35 + wind * 0.5), y * 0.12, t * 0.05, 2) + (1 - ky) * 0.45;
              let c = d > 0.08 ? mix(mix(skyLo, cloudDark, clamp(d * 1.5, 0, 1)), cloudLit, clamp(d - 0.45, 0, 0.4)) : mix(skyHi, skyLo, ky);
              if (d > 0.2 && ky > 0.6) c = mix(c, stormGreen, 0.3);
              if (f > 0.02) c = mix(c, flashC, f * clamp(0.25 + d * 0.6, 0, 0.9));
              px[row + x] = c;
            }
          } else if (y < gy) {
            const ky = (y - cloudH) / Math.max(1, gy - cloudH);
            let c = mix(skyLo, mix(skyHi, 0x3a4450, 0.4), ky);
            if (f > 0.02) c = mix(c, flashC, f * 0.5);
            for (let x = 0; x < W; x++) px[row + x] = c;
          } else {
            for (let x = 0; x < W; x++) {
              let c = (x * 13 + y * 29) % 9 < 2 ? fieldD : fieldC;
              if (f > 0.02) c = mix(c, flashC, f * 0.3);
              px[row + x] = c;
            }
          }
        }
        // Tree, leaning with the gust.
        const lean = (wind - 0.35) * 2.2;
        const treeC = mix(0x05070a, th.bg, 0.12);
        for (const [lx, ly, ang, len] of limbs) {
          const bend = lean * (ly / Math.max(1, trunkH));
          const x0 = tx + lx + lean * (ly / trunkH) * 3, y0 = gy - ly;
          const a = ang - bend * 0.5;
          plot(x0, y0, x0 + Math.cos(a) * len, y0 - Math.sin(a) * len, f > 0.3 ? mix(treeC, 0x000000, 0.5) : treeC);
        }
        plot(tx, gy, tx + lean * 3, gy - trunkH * 0.55, treeC);
        // Rain: slant follows the gust; drops splash at the ground line.
        const vy = H * 1.6, lit = Math.min(1, 0.55 + f);
        for (let i = 0; i < N; i++) {
          RY[i] += vy * RS[i] * dt;
          RX[i] += vy * RS[i] * wind * 0.55 * dt;
          if (RX[i] >= W) RX[i] -= W; else if (RX[i] < 0) RX[i] += W;
          if (RY[i] >= gy) {
            const xi = RX[i] | 0;
            if (xi >= 0 && xi < W) px[(gy - 1) * W + xi] = mix(px[(gy - 1) * W + xi], rainC, 0.8);
            RY[i] = -rand() * H * 0.2; RX[i] = rand() * W;
            continue;
          }
          const c = mix(px[clamp(RY[i] | 0, 0, H - 1) * W + clamp(RX[i] | 0, 0, W - 1)], rainC, 0.6 * lit);
          for (let k = 0; k < 3; k++) {
            const x = (RX[i] - wind * 0.55 * k) | 0, y = (RY[i] - k) | 0;
            if (x >= 0 && x < W && y >= 0 && y < H && y < gy) px[y * W + x] = k ? mix(px[y * W + x], c, 0.55) : c;
          }
        }
        if (f > 0.18) {
          const bc = mix(rainC, 0xf4f7ff, Math.min(1, f * 1.3));
          for (const [x0, y0, x1, y1] of bolt) plot(x0, y0, x1, y1, bc);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-hurricane',
    since: '0.3.0',
    title: 'Hurricane Eye',
    gallery: 'sim',
    category: 'Weather',
    kind: 'scene',
    tags: ['hurricane', 'cyclone', 'satellite', 'spiral', 'eye', 'storm'],
    order: 210,
    description: 'Satellite view of a cyclone: rainbands spiral into a bright eyewall around a calm eye, crawling toward a dark coastline.',
    size: { w: 64, h: 24 },
    minSize: { w: 20, h: 8 },
    loop: 24,
    canvas: 'field',
    palette: 'ocean',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px, asp = cv.aspect;
      const th = ctx.theme, noise = ctx.noise;
      const cx = W * 0.52, cy = (H * 0.46) * asp;
      const R = Math.max(6, Math.min(W, H * asp) * 0.52);
      const re = R * 0.14;
      const seaC = mix(th.bg, 0x062a44, 0.62), seaD = mix(th.bg, 0x04121f, 0.7);
      const landC = mix(th.bg, 0x1c2b1a, 0.6), shoreC = mix(th.bg, 0x44573e, 0.5);
      const cloudLo = 0x8fa3b8, cloudHi = 0xffffff;
      const land = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        // A ragged landmass hugging the lower-left corner.
        const d = Math.hypot(x / W, (H - y) / H);
        const edge = 0.52 + 0.2 * noise.fbm(x * 0.05 + 31, y * 0.08 + 17, 0, 2);
        if (d < edge * 0.75) land[y * W + x] = d > edge * 0.62 ? 2 : 1;
      }
      const w1 = TAU * 2 / 24; // two full rotations per loop — closes exactly

      return (t) => {
        const ca = Math.cos(w1 * t), sa = Math.sin(w1 * t);
        const drift = Math.sin(t * w1 * 0.5) * R * 0.04;
        for (let y = 0; y < H; y++) {
          const row = y * W, dyv = y * asp - cy - drift * 0.4;
          for (let x = 0; x < W; x++) {
            const dx = x - cx - drift;
            const r = Math.hypot(dx, dyv);
            let base = land[row + x] ? (land[row + x] === 2 ? shoreC : landC) : ((x * 7 + y * 13) % 17 < 1 ? mix(seaC, 0x2f6a8f, 0.4) : mix(seaC, seaD, r / (R * 2)));
            if (r < R * 1.9) {
              const th0 = Math.atan2(dyv, dx);
              const xr = dx * ca + dyv * sa, yr = dyv * ca - dx * sa;
              const tex = noise.fbm(xr * 0.045 + 3.1, yr * 0.045 + 7.7, 0, 2);
              const band = Math.sin(4.6 * Math.log(r + 4) - 3 * th0 + 3 * w1 * t);
              const radial = Math.exp(-r / (R * 0.75));
              const eyeK = clamp((r - re * 0.55) / (re * 0.8), 0, 1);
              const wall = Math.exp(-Math.pow((r - re * 1.15) / (re * 0.5), 2)) * 0.55;
              let dens = clamp(((tex + 0.42) * (0.52 + 0.48 * band)) * radial * 1.6 * eyeK + wall, 0, 1);
              if (dens > 0.04) {
                const lit = clamp(0.55 + 0.45 * ((dx - dyv) / (r + 4)) * 0.5 + dens * 0.5, 0, 1);
                base = mix(base, mix(cloudLo, cloudHi, lit), Math.min(1, dens * 1.5));
              }
            }
            px[row + x] = base;
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-tornado',
    since: '0.3.0',
    title: 'Tornado Funnel',
    gallery: 'sim',
    category: 'Weather',
    kind: 'scene',
    tags: ['tornado', 'funnel', 'debris', 'vortex', 'storm', 'dust'],
    order: 220,
    description: 'A roping funnel sways under its wall cloud, striations spinning down the column while debris orbits up out of the dust skirt.',
    size: { w: 64, h: 24 },
    minSize: { w: 20, h: 8 },
    loop: 25,
    canvas: 'field',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const ch = Math.max(2, Math.round(H * 0.2)), gyv = Math.max(ch + 2, Math.round(H * 0.84));
      const skyC = mix(th.bg, 0x232b2c, 0.6), skyD = mix(th.bg, 0x11171a, 0.7);
      const cloudC = mix(th.bg, 0x090d10, 0.75);
      const groundC = mix(th.bg, 0x332817, 0.55), groundD = mix(th.bg, 0x201808, 0.6);
      const funnelC = mix(th.bg, 0x4a5258, 0.45), funnelD = mix(th.bg, 0x1a2024, 0.7);
      const dustC = mix(th.bg, 0x6b573a, 0.5);
      const M = clamp(Math.round((W * H) / 180), 16, 48);
      const deb = Array.from({ length: M }, () => ({ y: gyv - rand() * (gyv - ch) * 0.6, a: rand() * TAU, r: 0.6 + rand() * 0.7, v: 5 + rand() * 4 }));
      const cxAt = (y, t) => {
        const ky = clamp((y - ch) / Math.max(1, gyv - ch), 0, 1);
        return W * 0.5 + W * 0.1 * Math.sin(t * 0.1)
          + noise.noise2(t * 0.33, 1.1) * W * 0.07 * ky
          + noise.noise2(t * 0.9, 5.5) * W * 0.045 * ky * ky;
      };
      const wAt = (y, t) => {
        const ky = clamp((y - ch) / Math.max(1, gyv - ch), 0, 1);
        return Math.max(1.2, (W * 0.15 * Math.pow(1 - ky, 0.85) + W * 0.02) * (1 + 0.1 * Math.sin(t * 0.7)));
      };

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        for (let y = 0; y < H; y++) {
          const row = y * W;
          if (y < ch) {
            for (let x = 0; x < W; x++) {
              const d = noise.fbm(x * 0.05 - t * 0.25, y * 0.3, t * 0.04, 2) + 0.3;
              px[row + x] = mix(skyD, cloudC, clamp(d * 1.6, 0, 1));
            }
          } else if (y < gyv) {
            const ky = (y - ch) / Math.max(1, gyv - ch);
            const c = mix(skyD, skyC, ky);
            for (let x = 0; x < W; x++) px[row + x] = c;
          } else {
            for (let x = 0; x < W; x++) px[row + x] = (x * 11 + y * 23) % 7 < 2 ? groundD : groundC;
          }
        }
        // The funnel: a translucent column with striations spiralling down.
        for (let y = ch; y <= gyv; y++) {
          const cx = cxAt(y, t), w = wAt(y, t), row = y * W;
          const x0 = Math.max(0, Math.floor(cx - w - 1)), x1 = Math.min(W - 1, Math.ceil(cx + w + 1));
          for (let x = x0; x <= x1; x++) {
            const u = (x - cx) / w;
            if (u < -1 || u > 1) continue;
            const dens = Math.sqrt(1 - u * u);
            const stri = 0.5 + 0.5 * Math.sin(u * 2.6 + y * 0.42 - t * 9);
            const nd = noise.noise2(u * 1.8 + t * 1.6, y * 0.18) * 0.25;
            const k = clamp(dens * (0.55 + 0.3 * stri + nd), 0, 1);
            px[row + x] = mix(px[row + x], Math.abs(u) > 0.78 ? funnelD : mix(funnelD, funnelC, stri), k);
          }
        }
        // Dust skirt boiling at the contact point.
        const cg = cxAt(gyv, t), skirtW = Math.max(3, W * 0.12);
        for (let y = gyv - 2; y < Math.min(H, gyv + 3); y++) {
          const row = y * W;
          const x0 = Math.max(0, Math.floor(cg - skirtW)), x1 = Math.min(W - 1, Math.ceil(cg + skirtW));
          for (let x = x0; x <= x1; x++) {
            const k = Math.max(0, 1 - Math.abs(x - cg) / skirtW);
            const d = Math.max(0, noise.noise2(x * 0.3 - t * 2.4, y * 0.5 + t * 0.8)) * k;
            if (d > 0.04) px[row + x] = mix(px[row + x], dustC, Math.min(0.85, d * 1.8));
          }
        }
        // Debris rides the vortex upward, then recycles into the skirt.
        for (const d of deb) {
          d.a += d.v * dt;
          d.y -= (1.6 + d.v * 0.25) * dt * (H / 24);
          if (d.y < ch + 1) { d.y = gyv - rand() * 2; d.a = rand() * TAU; d.v = 5 + rand() * 4; }
          const w = wAt(d.y, t);
          const x = cxAt(d.y, t) + Math.cos(d.a) * w * (0.9 + d.r * 0.4);
          const xi = x | 0, yi = d.y | 0;
          if (xi >= 0 && xi < W && yi >= 0 && yi < H) {
            const front = Math.sin(d.a) > 0;
            px[yi * W + xi] = mix(px[yi * W + xi], front ? 0x8a7a5a : 0x2a241a, front ? 0.9 : 0.6);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'sim-hailstorm',
    since: '0.3.0',
    title: 'Hailstorm',
    gallery: 'sim',
    category: 'Weather',
    kind: 'scene',
    tags: ['hail', 'bounce', 'ice', 'storm', 'weather', 'physics'],
    order: 230,
    description: 'Hailstones streak down, bounce two or three times with real restitution, and pile into a rattling white crust over the paddock.',
    size: { w: 72, h: 22 },
    minSize: { w: 24, h: 8 },
    loop: 22,
    canvas: 'field',
    palette: 'ice',
    setup(ctx) {
      const cv = ctx.canvas();
      const W = cv.width, H = cv.height, px = cv.px;
      const th = ctx.theme, rand = ctx.rng, noise = ctx.noise;
      const base = Math.round(H * 0.8);
      const gy = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        let g = base + Math.sin(x * 0.1) * 0.8;
        // Two low bushes the crust will bury.
        for (const [bx, bw, bh] of [[W * 0.22, W * 0.07, H * 0.1], [W * 0.68, W * 0.09, H * 0.13]]) {
          const d = Math.abs(x - bx) / bw;
          if (d < 1) g -= bh * Math.sqrt(1 - d * d);
        }
        gy[x] = g;
      }
      const accum = new Float32Array(W);
      const skyHi = mix(th.bg, 0x27332f, 0.6), skyLo = mix(th.bg, 0x47545a, 0.5);
      const fieldC = mix(th.bg, 0x1d2a14, 0.6);
      const bushC = mix(th.bg, 0x0f1a0a, 0.7);
      const iceA = 0xeef5ff, iceB = mix(th.bg, 0x9fb8cc, 0.4);
      const stoneC = 0xe8f2ff, streakC = mix(th.info, 0xdce9ff, 0.6);
      const N = clamp(Math.round((ctx.width * ctx.height) / 34), 22, 110);
      const SX = new Float32Array(N), SY = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N);
      const SR = new Float32Array(N), SB = new Uint8Array(N);
      const reset = (i, top) => {
        SX[i] = rand() * W; SY[i] = top ? -rand() * H * 0.4 : rand() * H * 0.5;
        SR[i] = rand() < 0.08 ? 2 : 1; SB[i] = 0;
        VY[i] = H * (0.9 + rand() * 0.5); VX[i] = H * (0.08 + rand() * 0.12);
      };
      for (let i = 0; i < N; i++) reset(i, false);
      const hits = [];
      const G = H * 2;

      return (t, dt) => {
        dt = clamp(dt, 0, 0.1);
        const wind = 0.5 + 0.5 * noise.noise2(t * 0.4, 3.3);
        // Sky with fast scud.
        for (let y = 0; y < H; y++) {
          const row = y * W, ky = y / Math.max(1, H - 1);
          if (y < H * 0.3) {
            for (let x = 0; x < W; x++) {
              const d = noise.fbm(x * 0.05 - t * (0.8 + wind), y * 0.25, 0, 2) + 0.2;
              px[row + x] = mix(mix(skyHi, skyLo, ky * 2), mix(th.bg, 0x121a18, 0.7), clamp(d * 1.3, 0, 1));
            }
          } else {
            const c = mix(skyHi, skyLo, ky);
            for (let x = 0; x < W; x++) px[row + x] = c;
          }
        }
        // Ground, bushes and the hail crust.
        for (let x = 0; x < W; x++) {
          const g = gy[x], surf = g - accum[x];
          for (let y = Math.max(0, surf | 0); y < H; y++) {
            const i = y * W + x;
            if (y < g) px[i] = (x * 31 + y * 17) % 7 < 2 ? iceB : iceA;
            else px[i] = g < base - 1 ? bushC : (x * 13 + y * 11) % 9 < 2 ? mix(fieldC, 0x0c1408, 0.5) : fieldC;
          }
        }
        // Light slump keeps the crust natural.
        for (let x = 1; x < W - 1; x++) {
          const h0 = gy[x] - accum[x], h1 = gy[x + 1] - accum[x + 1];
          if (h1 - h0 > 1.7 && accum[x] > 0.3) { accum[x] -= 0.1; accum[x + 1] += 0.1; }
          else if (h0 - h1 > 1.7 && accum[x + 1] > 0.3) { accum[x + 1] -= 0.1; accum[x] += 0.1; }
        }
        // Stones: gravity, restitution, then they join the crust.
        for (let i = 0; i < N; i++) {
          VY[i] += G * dt;
          SX[i] += (VX[i] * wind) * dt; SY[i] += VY[i] * dt;
          if (SX[i] < 0) SX[i] += W; else if (SX[i] >= W) SX[i] -= W;
          const xi = clamp(SX[i] | 0, 0, W - 1);
          const surf = gy[xi] - accum[xi];
          if (SY[i] >= surf) {
            const maxB = SR[i] > 1 ? 3 : 2;
            if (SB[i] < maxB && VY[i] > H * 0.3) {
              VY[i] = -VY[i] * (0.42 + rand() * 0.12);
              VX[i] += (rand() - 0.5) * H * 0.3;
              SY[i] = surf - 0.01; SB[i]++;
              if (hits.length < 40) hits.push({ x: SX[i], y: surf - 1, life: 0.14 });
            } else {
              accum[xi] = Math.min(accum[xi] + SR[i] * 0.55, H * 0.25);
              reset(i, true);
            }
            continue;
          }
          if (SY[i] > H + 2) { reset(i, true); continue; }
          // Streak, then the stone itself.
          const sx = SX[i], sy = SY[i];
          for (let k = 1; k <= 2; k++) {
            const x = (sx - VX[i] * wind * dt * k * 2) | 0, y = (sy - VY[i] * dt * k * 2) | 0;
            if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = mix(px[y * W + x], streakC, 0.45);
          }
          const r = SR[i] | 0;
          for (let dy2 = 0; dy2 < r; dy2++) for (let dx2 = 0; dx2 < r; dx2++) {
            const x = (sx | 0) + dx2, y = (sy | 0) + dy2;
            if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = stoneC;
          }
        }
        for (let i = hits.length - 1; i >= 0; i--) {
          const s = hits[i];
          s.life -= dt;
          if (s.life <= 0) { hits.splice(i, 1); continue; }
          const xi = s.x | 0, yi = s.y | 0;
          for (const [ox, oy] of [[0, 0], [1, -1], [-1, -1]]) {
            const x = xi + ox, y = yi + oy;
            if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = mix(px[y * W + x], 0xffffff, s.life * 5);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
