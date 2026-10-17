// Pure ASCII — animations. Every glyph is 7-bit ASCII; color is optional
// (each facet still reads in mono). Classics re-implemented from first
// principles: donut.c, the aalib-era fire, a demo starfield, plasma, and more.
import { RAMP, RAMP_DONUT, RAMP_FIRE, hash, line, bounce } from './_ascii.js';
import { mix } from '../../color.js';

const shared = { gallery: 'ascii', glyphs: 'ascii', color: '16', size: { w: 80, h: 24 }, minSize: { w: 32, h: 10 } };

const donut = {
  ...shared,
  id: 'ascii-donut',
  title: 'donut.c',
  category: 'ASCII Animations',
  kind: 'art',
  tags: ['donut', 'donut.c', 'torus', 'classic', '3d'],
  order: 10,
  loop: 10,
  description: 'The canonical spinning ASCII torus: z-buffered, lit with the twelve-step .,-~:;=!*#$@ ramp, scaled to any window.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const z = new Float32Array(W * H);
    const lum = new Int8Array(W * H);
    const k = Math.min(W / 80, H / 22);
    const sx = 30 * k, sy = 15 * k;
    const di = 0.02 / Math.max(1, k), dj = 0.07 / Math.max(1, k);
    const tones = [th.dim, th.dim, th.muted, th.muted, th.muted, th.ink, th.ink, th.ink, th.accent, th.accent, th.info, th.info];
    return (t) => {
      z.fill(0); lum.fill(-1);
      const A = t * 1.15, B = t * 0.55;
      const sA = Math.sin(A), cA = Math.cos(A), sB = Math.sin(B), cB = Math.cos(B);
      for (let j = 0; j < 6.28; j += dj) {
        const sj = Math.sin(j), cj = Math.cos(j), h = cj + 2;
        for (let i = 0; i < 6.28; i += di) {
          const si = Math.sin(i), ci = Math.cos(i);
          const D = 1 / (si * h * sA + sj * cA + 5);
          const tt = si * h * cA - sj * sA;
          const x = Math.round(W / 2 + sx * D * (ci * h * cB - tt * sB));
          const y = Math.round(H / 2 + sy * D * (ci * h * sB + tt * cB));
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const o = x + W * y;
          if (D <= z[o]) continue;
          z[o] = D;
          const N = Math.round(8 * ((sj * sA - si * cj * cA) * cB - si * cj * sA - sj * cA - ci * cj * sB));
          lum[o] = Math.max(0, Math.min(11, N));
        }
      }
      for (let o = 0; o < lum.length; o++) {
        if (lum[o] < 0) continue;
        ctx.buffer.set(o % W, (o / W) | 0, RAMP_DONUT[lum[o]], tones[lum[o]]);
      }
    };
  },
};

const fire = {
  ...shared,
  id: 'ascii-fire',
  title: 'ASCII Fire',
  category: 'ASCII Animations',
  kind: 'art',
  tags: ['fire', 'aalib', 'flames', 'classic'],
  order: 20,
  loop: 6,
  description: 'Old-school text-mode fire: heat averages upward and cools through the " .:*sS#$" ramp, with gusting flicker.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const heat = new Float32Array(W * (H + 2));
    const ramp = RAMP_FIRE, last = ramp.length - 1;
    const colors = [th.dim, mix(th.neg, th.bg, 0.45), th.neg, th.neg, th.warn, th.warn, th.ink, th.ink];
    let acc = 0;
    const step = () => {
      for (let x = 0; x < W; x++) {
        const base = 0.6 + 0.4 * Math.sin(x * 0.21) * Math.sin(x * 0.07 + 1.3);
        heat[(H + 1) * W + x] = rng() < 0.7 * base + 0.25 ? 1.25 : 0.2 * rng();
        heat[H * W + x] = heat[(H + 1) * W + x] * (0.8 + 0.2 * rng());
      }
      const cool = 0.95 / H;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const l = x > 0 ? x - 1 : x, r = x < W - 1 ? x + 1 : x;
          const v = (heat[(y + 1) * W + l] + heat[(y + 1) * W + x] + heat[(y + 1) * W + r] + heat[(y + 2) * W + x]) / 4.02 - cool * (0.6 + rng() * 0.8);
          heat[y * W + x] = v > 0 ? v : 0;
        }
      }
    };
    for (let i = 0; i < H * 2; i++) step();
    return (t, dt) => {
      acc += Math.min(0.25, dt || 0.05);
      while (acc > 0.04) { step(); acc -= 0.04; }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = heat[y * W + x];
          const i = Math.min(last, Math.floor(v * last * 1.15));
          if (i <= 0) continue;
          ctx.buffer.set(x, y, ramp[i], colors[i]);
        }
      }
    };
  },
};

const rain = {
  ...shared,
  id: 'ascii-rain',
  title: 'ASCII Rain',
  category: 'ASCII Animations',
  kind: 'art',
  tags: ['rain', 'storm', 'weather', 'splash'],
  order: 30,
  loop: 8,
  description: 'Slanting rain in three depths, splashing on a street line, with a lightning flash every few seconds.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const ground = H - 2;
    const drops = Array.from({ length: Math.round(W * H / 18) }, () => ({
      x: rng() * W, y: rng() * ground, z: rng(), off: rng() * 100,
    }));
    const flashes = [2.6, 5.9, 7.1];
    return (t) => {
      const b = ctx.buffer;
      const wind = 0.35 + 0.15 * Math.sin(t * 0.4);
      const flash = flashes.reduce((m, f) => Math.max(m, 1 - Math.abs(((t % 8) - f) * 7)), 0);
      if (flash > 0.2) b.fill(0, 0, W, ground, ' ', undefined, mix(th.bg, th.muted, flash * 0.35));
      for (const d of drops) {
        const speed = 10 + d.z * 22;
        const yy = ((d.y + t * speed) % (ground + 4)) - 2;
        const xx = ((d.x + yy * wind + W * 4) % W);
        const ch = d.z > 0.66 ? '|' : d.z > 0.33 ? ':' : "'";
        const glyph = wind > 0.42 && d.z > 0.66 ? '/' : ch;
        if (yy >= 0 && yy < ground) b.set(Math.floor(xx), Math.floor(yy), glyph, d.z > 0.66 ? th.info : d.z > 0.33 ? th.muted : th.dim);
        const landing = (t * speed + d.y + d.off) % (ground + 4);
        if (d.z > 0.5 && landing > ground + 2.2 && landing < ground + 3.6) {
          const sx = Math.floor((d.x + ground * wind + W * 4) % W);
          b.set(sx - 1, ground - 1, '.', th.muted);
          b.set(sx + 1, ground - 1, '.', th.muted);
          b.set(sx, ground - 1, landing < ground + 2.9 ? 'o' : '.', th.info);
        }
      }
      b.text(0, ground, '_'.repeat(W), th.dim);
      for (let x = 0; x < W; x += 1) if (hash(x, Math.floor(t * 3)) < 0.06) b.set(x, ground + 1, '~', th.dim);
      if (flash > 0.6) {
        let x = Math.floor(W * (0.3 + 0.4 * hash(Math.floor(t / 8))));
        for (let y = 0; y < ground * 0.7; y++) { const dx = hash(y, Math.floor(t)) < 0.5 ? -1 : 1; b.set(x, y, dx < 0 ? '/' : '\\', th.ink); x += dx; }
      }
    };
  },
};

const starfield = {
  ...shared,
  id: 'ascii-starfield',
  title: 'ASCII Starfield',
  category: 'ASCII Animations',
  kind: 'art',
  tags: ['starfield', 'space', 'warp', 'demoscene'],
  order: 40,
  loop: 8,
  description: 'Stars fly out of the center of the screen, growing from . to + to * to @ as they near the viewer.',
  setup(ctx) {
    const { width: W, height: H, theme: th, rng } = ctx;
    const N = Math.round(W * H / 9);
    const stars = Array.from({ length: N }, () => ({ x: rng() * 2 - 1, y: rng() * 2 - 1, z: rng() }));
    const glyphs = ['.', '.', '+', '*', '@'];
    const colors = [th.dim, th.muted, th.ink, th.ink, th.info];
    return (t) => {
      const b = ctx.buffer;
      const speed = 0.35 + 0.25 * Math.sin(t * 0.6) ** 2;
      for (const s of stars) {
        const z = 1 - ((s.z + t * speed) % 1);
        const px = W / 2 + (s.x / z) * W * 0.25;
        const py = H / 2 + (s.y / z) * H * 0.25;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const i = Math.min(4, Math.floor((1 - z) * 5));
        b.set(Math.floor(px), Math.floor(py), glyphs[i], colors[i]);
      }
    };
  },
};

const plasma = {
  ...shared,
  id: 'ascii-plasma',
  title: 'ASCII Plasma',
  category: 'ASCII Animations',
  kind: 'art',
  tags: ['plasma', 'demoscene', 'ramp', 'sine'],
  order: 50,
  loop: 10,
  description: 'Four interfering sine fields mapped onto the " .:-=+*#%@" density ramp and cycled through the theme colors.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const cols = [th.info, th.accent, th.crit, th.neg, th.warn, th.pos];
    const k = 17 / Math.max(W, H * 2);
    return (t) => {
      const b = ctx.buffer;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const fx = x * k, fy = y * 2 * k;
        const v = Math.sin(fx * 1.3 + t) + Math.sin(fy + t * 1.2) + Math.sin((fx + fy) * 0.7 + t * 0.6) + Math.sin(Math.hypot(fx - 8, fy - 5) * 1.4 - t * 1.6);
        const u = (v + 4) / 8;
        const ch = RAMP[Math.min(9, Math.max(1, Math.floor(u * 10)))];
        b.set(x, y, ch, cols[Math.floor(((u * 3 + t * 0.15) % 1) * cols.length)]);
      }
    };
  },
};

const cube = {
  ...shared,
  id: 'ascii-cube',
  title: 'ASCII Wireframe Cube',
  category: 'ASCII Animations',
  kind: 'art',
  tags: ['cube', 'wireframe', '3d', 'vector'],
  order: 60,
  loop: 12,
  description: 'A tumbling wireframe cube in perspective, edges drawn with - | / \\ chosen by slope, vertices marked with o.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const V = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]);
    const E = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const d = V[i].reduce((n, v, k) => n + (v !== V[j][k] ? 1 : 0), 0);
      if (d === 1) E.push([i, j]);
    }
    const s = Math.min(W / 2.6, H * 1.1);
    return (t) => {
      const b = ctx.buffer;
      const ax = t * 0.7, ay = t * 0.9, az = t * 0.3;
      const P = V.map(([x, y, z]) => {
        let c = Math.cos(ax), sn = Math.sin(ax);
        [y, z] = [y * c - z * sn, y * sn + z * c];
        c = Math.cos(ay); sn = Math.sin(ay);
        [x, z] = [x * c + z * sn, -x * sn + z * c];
        c = Math.cos(az); sn = Math.sin(az);
        [x, y] = [x * c - y * sn, x * sn + y * c];
        const p = 3.2 / (z + 4.2);
        return [W / 2 + x * s * p * 0.5, H / 2 + y * s * p * 0.25, z];
      });
      const order = E.map(([i, j]) => [i, j, (P[i][2] + P[j][2]) / 2]).sort((a, c) => c[2] - a[2]);
      for (const [i, j, z] of order) line(b, P[i][0], P[i][1], P[j][0], P[j][1], z > 0 ? th.muted : th.accent);
      for (const p of P) b.set(Math.round(p[0]), Math.round(p[1]), p[2] > 0 ? 'o' : 'O', p[2] > 0 ? th.muted : th.ink);
    };
  },
};

// Our own logo, not a disc-format trademark — the corner-hit joke is what matters.
const LOGO = [
  ' ___  ___  ___  ___  __  __ ',
  '| _ \\| _ \\|_ _|/ __||  \\/  |',
  '|  _/|   / | | \\__ \\| |\\/| |',
  '|_|  |_|_\\|___||___/|_|  |_|',
  '    ~~~ screensaver ~~~     ',
];

const dvd = {
  ...shared,
  id: 'ascii-bounce-logo',
  title: 'Bouncing Screensaver Logo',
  category: 'ASCII Animations',
  kind: 'art',
  tags: ['screensaver', 'bounce', 'logo', 'corner', 'nostalgia'],
  order: 70,
  loop: 16,
  minSize: { w: 30, h: 8 },
  description: 'The screensaver everyone waited on: a logo drifts, changes color at every wall, and celebrates the corner hit.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const lw = LOGO[0].length, lh = LOGO.length;
    const spanX = Math.max(0, W - lw), spanY = Math.max(0, H - lh);
    const palette = [th.accent, th.pos, th.warn, th.crit, th.info, th.neg];
    return (t) => {
      const b = ctx.buffer;
      const X = bounce(t, spanX, 9.0);
      const Y = bounce(t, spanY, 4.0, spanY * 0.35);
      const col = palette[(X.hits + Y.hits) % palette.length];
      for (let r = 0; r < lh; r++) b.text(Math.round(X.pos), Math.round(Y.pos) + r, LOGO[r].slice(0, W), col);
      const nearX = Math.min(X.pos, spanX - X.pos), nearY = Math.min(Y.pos, spanY - Y.pos);
      if (nearX < 1.2 && nearY < 0.8 && H > lh + 1) {
        const msg = '* CORNER! *';
        b.text(Math.floor((W - msg.length) / 2), Y.pos < spanY / 2 ? H - 1 : 0, msg, th.ink);
      }
    };
  },
};

export default [donut, fire, rain, starfield, plasma, cube, dvd];
