// Planetary motion — four space scenes for Globes & Planets: a comet swinging
// its tails around a Kepler ellipse, a gas giant walked by two phase-lit
// moons, a cratered asteroid tumbling end over end, and a clockwork orrery
// of five planets on brass arms.
import { sphere, starfield, zbuffer, drawMesh, perspective, rotX, rotY, rotZ, mul, apply, norm, blend } from './_raster.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------------------------------------------------------------------------
// Comet — one full Kepler orbit per loop: the comet rushes perihelion and
// crawls aphelion, the straight blue ion tail streams anti-sunward while the
// curved dust tail lags along the orbit, both growing as the sun nears.
const cometOrbit = {
  id: 'objects-comet-orbit',
  since: '0.3.0',
  title: 'Comet',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['comet', 'orbit', 'kepler', 'tail', 'sun', 'space'],
  order: 200,
  description: 'A comet on a true Kepler ellipse — fast at perihelion, slow at aphelion — with an anti-sunward ion tail and a lagging dust tail.',
  size: { w: 64, h: 24 },
  minSize: { w: 18, h: 7 },
  loop: 18,
  canvas: 'field',
  palette: 'ice',
  setup(ctx) {
    const cv = ctx.canvas();
    const th = ctx.theme;
    const W = cv.width, H = cv.height, asp = cv.aspect;
    const a = Math.min(W * 0.3, (H * asp * 0.56)), e = 0.72, b = a * Math.sqrt(1 - e * e);
    const flat = 0.5;
    const sunX = W / 2 + a * e * 0.92, sunY = H / 2;
    const stars = starfield(ctx.rng, Math.round((W * H) / 75));
    // Kepler LUT: mean anomaly → position relative to the sun (flattened orbit plane).
    const LUT = 512;
    const ox = new Float32Array(LUT + 1), oy = new Float32Array(LUT + 1);
    for (let i = 0; i <= LUT; i++) {
      const M = (i / LUT) * TAU;
      let E = M;
      for (let k = 0; k < 7; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      ox[i] = a * (Math.cos(E) - e);
      oy[i] = b * Math.sin(E) * flat;
    }
    const at = (m) => {
      const f = ((m % 1) + 1) % 1 * LUT, i = Math.floor(f), u = f - i;
      return [ox[i] + (ox[Math.min(LUT, i + 1)] - ox[i]) * u, oy[i] + (oy[Math.min(LUT, i + 1)] - oy[i]) * u];
    };
    const jit = Array.from({ length: 50 }, () => (ctx.rng() - 0.5) * 2);
    const sunR = Math.max(1.5, a * 0.07);

    return (t) => {
      cv.clear();
      stars(cv, t, 0.9, th.bg);
      const m = t / 18;
      // Orbit path, dotted and dim.
      for (let i = 0; i < 150; i += 2) {
        const p = at(i / 150);
        cv.set(sunX + p[0], sunY + p[1] / asp, blend(th.bg, th.dim, 0.55));
      }
      // Sun with a twinkling corona.
      sphere(cv, null, sunX, sunY, sunR, 0, (nx, ny, nz) => blend(0xffc24d, 0xfff6d8, clamp01(-nz)));
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * TAU + Math.sin(t * 0.7 + k) * 0.1;
        const rr = sunR * (1.6 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.2 + k * 2.1)));
        cv.set(sunX + Math.cos(ang) * rr, sunY + (Math.sin(ang) * rr) / asp, blend(th.bg, 0xffc24d, 0.6));
      }
      const hp = at(m);
      const hx = sunX + hp[0], hy = sunY + hp[1] / asp;
      const r = Math.hypot(hp[0], hp[1]) + 1e-3;
      const q = a * (1 - e);
      const heat = clamp01(Math.pow(q / r, 1.3));
      const dir = [hp[0] / r, hp[1] / r];
      // Dust tail: earlier orbit positions pushed radially out, with jitter.
      for (let k = 1; k < 46; k++) {
        const pp = at(m - k * 0.004);
        const pr = Math.hypot(pp[0], pp[1]) + 1e-3;
        const push = 1 + (k * k * 0.0013) * heat * 2;
        const x = sunX + (pp[0] / pr) * pr * push + jit[k] * k * 0.12;
        const y = sunY + ((pp[1] / pr) * pr * push) / asp + jit[(k + 17) % 50] * k * 0.06;
        const fade = (1 - k / 46) * heat;
        if (fade > 0.03) cv.set(x, y, blend(th.bg, 0xe8c080, fade * 0.9));
      }
      // Ion tail: straight anti-sunward, fluttering.
      const ionL = a * (0.25 + 1.1 * heat);
      for (let k = 0; k < 34; k++) {
        const u = k / 34;
        const fl = Math.sin(k * 0.65 + (t / 18) * TAU * 8) * u * 1.6;
        const x = hx + dir[0] * ionL * u - dir[1] * fl;
        const y = hy + (dir[1] * ionL * u + dir[0] * fl) / asp;
        const fade = (1 - u) * (0.4 + 0.6 * heat);
        cv.set(x, y, blend(th.bg, blend(th.info, 0xffffff, 0.25), fade));
      }
      // Coma and nucleus.
      const comaR = 1 + heat * 2.2;
      cv.circle(hx, hy, comaR, blend(th.bg, 0xbfe4ff, 0.35 + heat * 0.3), true);
      cv.set(hx, hy, 0xffffff);
      cv.set(hx + 1, hy, 0xe8f4ff); cv.set(hx - 1, hy, 0xe8f4ff);
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Planet & Moons — a banded gas giant with two moons on tilted orbits, all in
// one z-buffer: moons show phases from the shared sun, slip behind the limb
// and transit the disk.
const planetMoons = {
  id: 'objects-planet-moons',
  since: '0.3.0',
  title: 'Planet & Moons',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['planet', 'moons', 'orbit', 'transit', 'gas giant', 'space'],
  order: 210,
  description: 'A banded gas giant with two phase-lit moons on tilted orbits, transiting the disk and slipping behind the limb in one z-buffer.',
  size: { w: 60, h: 24 },
  minSize: { w: 18, h: 7 },
  loop: 15,
  canvas: 'field',
  palette: 'aurora',
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const th = ctx.theme;
    const pal = ctx.palette();
    const W = cv.width, H = cv.height, asp = cv.aspect;
    const R = Math.min(W * 0.17, H * asp * 0.3);
    const cx = W / 2, cy = H / 2;
    const stars = starfield(ctx.rng, Math.round((W * H) / 75));
    const noise = ctx.noise;
    const L = norm([-0.75, -0.25, -0.6]);
    // Banded texture: a latitude ramp with longitude-warped wiggle.
    const BANDS = 48;
    const bandCol = new Array(BANDS + 1);
    for (let i = 0; i <= BANDS; i++) {
      const v = i / BANDS;
      const w = 0.5 + 0.5 * Math.sin(v * 19 + noise.noise2(v * 3.1, 7.7) * 4);
      bandCol[i] = blend(pal(0.25 + v * 0.5), pal(0.55 + v * 0.3), w);
    }
    const moons = [
      { orb: R * 1.8, size: R * 0.24, revs: 1, incl: 0.34, ph0: 0.12, seed: 3.7 },
      { orb: R * 2.55, size: R * 0.15, revs: 3, incl: -0.2, ph0: 0.55, seed: 9.2 },
    ];
    const shadeMoon = (seed) => (nx, ny, nz) => {
      const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const alb = 0.65 + noise.fbm(nx * 2.5 + seed, ny * 2.5, nz * 2.5, 2) * 0.5;
      const k = 0.06 + 0.94 * d;
      return blend(0x05070d, blend(0x8d93a1, 0xf2f4f8, clamp01(alb - 0.5)), clamp01(k));
    };

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      stars(cv, t, 0.85, th.bg);
      const spin = (t / 15) * TAU * 2;
      // Orbit guides.
      for (const mn of moons) {
        for (let i = 0; i < 120; i += 2) {
          const a = (i / 120) * TAU;
          const wx = Math.cos(a) * mn.orb, wz = Math.sin(a) * mn.orb;
          cv.set(cx + wx, cy + (wz * 0.32 + wx * mn.incl * 0.22) / asp, blend(th.bg, th.dim, 0.4));
        }
      }
      sphere(cv, z, cx, cy, R, 0, (nx, ny, nz) => {
        const lat = clamp01((ny + 1) / 2);
        const lon = Math.atan2(nx, -nz) + spin;
        const wig = Math.sin(lon * 3 + lat * 14) * 0.035 + Math.sin(lon * 7 - lat * 9) * 0.015;
        const bi = Math.max(0, Math.min(BANDS, Math.round((lat + wig) * BANDS)));
        const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const rim = Math.pow(1 + nz, 2.2) * 0.25;
        return blend(blend(0x04060c, bandCol[bi], 0.12 + 0.88 * d), 0xffffff, rim * d);
      }, R * 0.01);
      for (const mn of moons) {
        const a = TAU * ((t / 15) * mn.revs + mn.ph0);
        const wx = Math.cos(a) * mn.orb, wz = Math.sin(a) * mn.orb;
        const mx = cx + wx, my = cy + (wz * 0.32 + wx * mn.incl * 0.22) / asp;
        sphere(cv, z, mx, my, mn.size, wz * 0.01, shadeMoon(mn.seed), mn.size * 0.01);
      }
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Asteroid — a fbm-dented, crater-bitten rock tumbling about two axes at once,
// flat-shaded so the facets glitter, with layered dust motes drifting past
// for parallax.
function rockMesh(ctx) {
  // Icosahedron subdivided twice, then displaced by fbm and dented by craters.
  let verts = [[-1, 1.618, 0], [1, 1.618, 0], [-1, -1.618, 0], [1, -1.618, 0], [0, -1, 1.618], [0, 1, 1.618], [0, -1, -1.618], [0, 1, -1.618], [1.618, 0, -1], [1.618, 0, 1], [-1.618, 0, -1], [-1.618, 0, 1]].map(norm);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < 2; s++) {
    const mids = new Map(), nf = [];
    const mid = (a, b) => {
      const key = a < b ? a * 65536 + b : b * 65536 + a;
      if (!mids.has(key)) {
        mids.set(key, verts.length);
        verts.push(norm([(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2, (verts[a][2] + verts[b][2]) / 2]));
      }
      return mids.get(key);
    };
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = nf;
  }
  const craters = Array.from({ length: 5 }, () => {
    const u = ctx.rng() * TAU, v = Math.acos(2 * ctx.rng() - 1);
    return { v: [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)], r: 0.3 + ctx.rng() * 0.3 };
  });
  verts = verts.map((d) => {
    let r = 1 + 0.32 * ctx.noise.fbm(d[0] * 1.6 + 11, d[1] * 1.6, d[2] * 1.6, 3);
    for (const c of craters) {
      const ang = Math.acos(Math.max(-1, Math.min(1, d[0] * c.v[0] + d[1] * c.v[1] + d[2] * c.v[2])));
      if (ang < c.r) { const k = 1 - ang / c.r; r -= 0.2 * k * k * (3 - 2 * k); }
    }
    return [d[0] * r * 0.92, d[1] * r * 0.92, d[2] * r * 0.92];
  });
  return { vertices: verts, faces };
}

const asteroidTumble = {
  id: 'objects-asteroid-tumble',
  since: '0.3.0',
  title: 'Asteroid',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['asteroid', 'rock', 'tumble', 'craters', 'space', '3d'],
  order: 220,
  description: 'A crater-bitten rock tumbling end over end about two axes, flat-shaded facets glittering, dust motes drifting past for depth.',
  size: { w: 52, h: 22 },
  minSize: { w: 16, h: 7 },
  loop: 16,
  canvas: 'field',
  palette: 'mono',
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const th = ctx.theme;
    const mesh = rockMesh(ctx);
    const stars = starfield(ctx.rng, Math.round((cv.width * cv.height) / 80));
    const dist = 4;
    const project = perspective(cv, { distance: dist, fill: 0.3 });
    const light = norm([-0.6, -0.5, -0.62]);
    const motes = Array.from({ length: 16 }, (_, i) => ({ x: ctx.rng(), y: ctx.rng(), sp: 1 + (i % 3), b: 0.2 + ctx.rng() * 0.4 }));
    const rockC = blend(th.muted, 0x9a7f63, 0.55);

    return (t) => {
      cv.clear();
      z.fill(Infinity);
      stars(cv, t, 0.8, th.bg);
      const ph = (t / 16) * TAU;
      for (const mo of motes) {
        const x = ((mo.x + (t / 16) * mo.sp) % 1) * cv.width;
        cv.set(x, mo.y * cv.height, blend(th.bg, 0xcfd6e4, mo.b * (0.4 + 0.2 * mo.sp)));
      }
      const M = mul(rotZ(0.3 * Math.sin(ph)), mul(rotX(ph), rotY(2 * ph + 1.1)));
      drawMesh(cv, z, mesh, {
        transform: (p) => apply(M, p),
        project, light, camera: [0, 0, -dist], specular: 0.12, shininess: 6, ambient: 0.14,
        shade: (i) => (i <= 1 ? blend(0x030405, rockC, Math.max(0.05, i)) : blend(rockC, 0xfff3e0, Math.min(1, i - 1))),
      });
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Orrery — a clockwork solar system: five planets on faint brass arms, inner
// ones lapping the outer in whole-number ratios (8:5:3:2:1 per loop), a moon
// ticking around the third planet, trails fading along each orbit.
const orrery = {
  id: 'objects-orrery',
  since: '0.3.0',
  title: 'Orrery',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['orrery', 'solar system', 'planets', 'orbits', 'clockwork', 'braille'],
  order: 230,
  description: 'A clockwork solar system on faint brass arms — five planets lapping in 8:5:3:2:1 ratios, a moon ticking round the third.',
  size: { w: 56, h: 24 },
  minSize: { w: 18, h: 8 },
  loop: 16,
  canvas: 'line',
  palette: 'theme',
  setup(ctx) {
    const cv = ctx.canvas('line');
    const th = ctx.theme;
    const W = cv.width, H = cv.height, asp = cv.aspect;
    const cx = W / 2, cy = H / 2;
    const tiltK = 0.42;
    const maxR = Math.min(W * 0.47, (H * asp * 0.47) / tiltK);
    const R0 = maxR * 0.3;
    const planets = [8, 5, 3, 2, 1].map((revs, k) => ({
      revs,
      orb: R0 + ((maxR - R0) * k) / 4,
      col: [th.muted, th.warn, th.info, th.pos, th.accent2][k],
      size: [0.8, 1.1, 1.3, 1.2, 1.6][k],
      ph0: k * 0.17,
    }));
    const pos = (orb, ang) => [cx + Math.cos(ang) * orb, cy + (Math.sin(ang) * orb * tiltK) / asp];

    return (t) => {
      cv.clear();
      const u = t / 16;
      // Orbit rings, dotted.
      for (const p of planets) {
        const n = Math.max(40, Math.round(p.orb * 2.5));
        for (let i = 0; i < n; i += 3) {
          const q = pos(p.orb, (i / n) * TAU);
          cv.set(q[0], q[1], blend(th.bg, th.dim, 0.5));
        }
      }
      // Sun and its flicker.
      cv.circle(cx, cy, 2.4, blend(th.warn, 0xffffff, 0.45), true);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + u * TAU;
        const rr = 3.6 + 0.8 * Math.sin(t * 2 + k * 1.9);
        cv.set(cx + Math.cos(a) * rr, cy + (Math.sin(a) * rr * tiltK) / asp, blend(th.bg, th.warn, 0.6));
      }
      for (const p of planets) {
        const ang = TAU * (u * p.revs + p.ph0);
        const [px, py] = pos(p.orb, ang);
        // Brass arm from the sun hub to the planet.
        const n = Math.max(2, Math.ceil(p.orb / 2));
        for (let s = 0; s <= n; s++) {
          const q = pos((p.orb * s) / n, ang);
          cv.set(q[0], q[1], blend(th.bg, 0xb08d4f, 0.3 + 0.2 * (s / n)));
        }
        // Fading trail along the orbit.
        for (let j = 1; j < 22; j++) {
          const q = pos(p.orb, ang - j * 0.016 * p.revs);
          cv.set(q[0], q[1], blend(th.bg, p.col, (1 - j / 22) * 0.6));
        }
        cv.circle(px, py, p.size, p.col, true);
        cv.set(px, py, blend(p.col, 0xffffff, 0.5));
        if (p.revs === 3) {
          const ma = TAU * (u * 12 + 0.3);
          cv.set(px + Math.cos(ma) * 4, py + (Math.sin(ma) * 4 * 0.7) / asp, blend(th.ink, 0xffffff, 0.3));
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};

export default [cometOrbit, planetMoons, asteroidTumble, orrery];
