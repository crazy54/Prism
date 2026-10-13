// The atom symbol, built for real: a nucleus of lit, z-buffered protons and
// neutrons, three tilted orbits drawn as anti-aliased (bilinear-splatted) rings
// that pass behind and in front of it, and electrons with glowing heads and
// fading trails. Everything loops exactly every twelve seconds.
import { zbuffer, sphere, perspective, rotX, rotY, rotZ, mul, apply, norm, blend } from './_raster.js';
import { NONE, luminance } from '../../color.js';

const LOOP = 12;

export default {
  title: 'Atom',
  gallery: 'objects',
  category: 'Icons & Logos',
  kind: 'art',
  tags: ['atom', 'science', 'orbit', 'electron', 'nucleus', 'physics'],
  order: 20,
  description: 'A lit nucleus of protons and neutrons inside three tilted orbits, with glowing electrons trailing light.',
  size: { w: 56, h: 22 },
  minSize: { w: 18, h: 7 },
  loop: LOOP,
  canvas: 'field',
  palette: 'prism',
  params: { electrons: { default: 3, min: 1, max: 6, label: 'Electrons' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme;
    const pal = ctx.palette();
    const nE = Math.round(ctx.param('electrons', 3));
    const dist = 5;
    const project = perspective(cv, { distance: dist, fill: 0.43 });
    const scale = Math.min(W, H * asp) * 0.43; // pixels per world unit at the origin
    const light = norm([-0.5, -0.65, -0.6]);
    const half = norm([light[0], light[1], light[2] - 1]); // Blinn half-vector (viewer at -z)
    const dark = luminance(th.bg) < 0.5;
    const proton = blend(0xe8505b, th.neg, 0.35), neutron = blend(0x9fb3c8, th.muted, 0.3);
    // Nucleons packed on two shells; protons and neutrons alternate (seeded).
    const nucleons = [];
    const shell = (n, rad) => {
      for (let i = 0; i < n; i++) {
        const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996;
        nucleons.push({ p: [Math.cos(a) * r * rad, y * rad, Math.sin(a) * r * rad], c: ctx.rng() < 0.5 ? proton : neutron });
      }
    };
    shell(10, 0.2); shell(3, 0.07);
    const nr = Math.max(0.12, 0.9 / scale); // nucleon radius (world), never below ~1px
    const orbitCol = [0.02, 0.36, 0.68].map((f) => blend(pal(f), th.info, 0.2));
    const tilt = [0, 1, 2].map((k) => mul(rotZ((k * Math.PI) / 3 + 0.1), rotX(1.08)));
    const spd = [4, -3, 5, 6, -4, 7];

    const acc = new Float32Array(W * H * 4); // r, g, b, alpha (premultiplied)
    const splat1 = (i, d, col, a) => {
      if (z[i] < d - 0.02) return; // hidden behind the nucleus
      const o = i * 4;
      acc[o] += ((col >> 16) & 255) * a; acc[o + 1] += ((col >> 8) & 255) * a; acc[o + 2] += (col & 255) * a; acc[o + 3] += a;
    };
    const splat = (x, y, d, col, a) => {
      x -= 0.5; y -= 0.5;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      for (let j = 0; j < 4; j++) {
        const xx = x0 + (j & 1), yy = y0 + (j >> 1);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        splat1(yy * W + xx, d, col, a * ((j & 1) ? fx : 1 - fx) * ((j >> 1) ? fy : 1 - fy));
      }
    };
    const glow = (x, y, d, col, a, sigma) => {
      const R = Math.ceil(sigma * 2.5), Ry = Math.ceil(R / asp);
      for (let yy = Math.floor(y) - Ry; yy <= Math.floor(y) + Ry; yy++) for (let xx = Math.floor(x) - R; xx <= Math.floor(x) + R; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const dx = xx + 0.5 - x, dy = (yy + 0.5 - y) * asp;
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        if (w > 0.02) splat1(yy * W + xx, d, col, a * w);
      }
    };

    // Splat orbit M from angle a0 to a1 in n steps, each weighted by the screen
    // distance it covers, so the line is evenly bright even where it is seen edge-on.
    const arc = (M, a0, a1, n, col, k) => {
      let prev = null;
      for (let s = 0; s <= n; s++) {
        const f = s / n, a = a0 + (a1 - a0) * f;
        const q = apply(M, [Math.cos(a), Math.sin(a), 0]);
        const p = project(q);
        if (prev) splat((p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2, p[2], col, Math.hypot(p[0] - prev[0], p[1] - prev[1]) * k(f, q));
        prev = p;
      }
    };

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      acc.fill(0);
      const ph = (t / LOOP) * Math.PI * 2;
      const G = mul(rotY(Math.sin(ph) * 0.45), mul(rotX(0.18 + Math.cos(ph) * 0.14), rotZ(Math.sin(ph * 2) * 0.08)));
      // Nucleus: slowly tumbling, lit spheres, z-buffered against each other.
      const N = mul(G, mul(rotY(ph), rotX(ph * 2)));
      for (const n of nucleons) {
        const q = apply(N, n.p), [sx, sy, sd] = project(q);
        const rp = (nr * scale * dist) / sd;
        sphere(cv, z, sx, sy, rp, sd, (nx, ny, nz) => {
          const dif = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
          const spec = Math.pow(Math.max(0, nx * half[0] + ny * half[1] + nz * half[2]), 28);
          return blend(blend(0x000000, n.c, 0.22 + 0.78 * dif), 0xffffff, spec * 0.8);
        }, nr);
      }
      // Orbits, brighter on the near side.
      const orbits = tilt.map((T) => mul(G, T));
      const steps = Math.ceil(Math.PI * 2 * scale * 4);
      orbits.forEach((M, k) => arc(M, 0, Math.PI * 2, steps, orbitCol[k], (f, q) => 0.42 - q[2] * 0.22));
      // Electrons: a glowing head and a trail fading back along the orbit.
      for (let e = 0; e < nE; e++) {
        const k = e % 3, M = orbits[k], w = (spd[e] * Math.PI * 2) / LOOP;
        const a0 = w * t + e * 2.1;
        const col = blend(orbitCol[k], 0xffffff, 0.55);
        arc(M, a0 - Math.sign(w) * 1.3, a0, Math.ceil(scale * 2.5), col, (f) => 0.6 * Math.pow(f, 2.2));
        const q = apply(M, [Math.cos(a0), Math.sin(a0), 0]);
        const [x, y, d] = project(q);
        glow(x, y, d, col, 1.1, Math.max(0.7, scale * 0.06));
      }
      // Composite the light: additive on dark themes, ink-like on light ones.
      const px = cv.px;
      for (let i = 0; i < W * H; i++) {
        const o = i * 4, a = acc[o + 3];
        if (a < 0.01) continue;
        const base = px[i] === NONE ? th.bg : px[i];
        if (dark) {
          const r = Math.min(255, ((base >> 16) & 255) + acc[o]), g = Math.min(255, ((base >> 8) & 255) + acc[o + 1]), b = Math.min(255, (base & 255) + acc[o + 2]);
          px[i] = (r << 16) | (g << 8) | (b | 0);
        } else {
          const col = ((acc[o] / a) << 16) | ((acc[o + 1] / a) << 8) | ((acc[o + 2] / a) | 0);
          px[i] = blend(base, blend(col, th.ink, 0.35), Math.min(1, a * 1.8));
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
