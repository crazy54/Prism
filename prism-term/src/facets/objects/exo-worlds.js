// Exo worlds — three planet studies: a procedural world turning through day
// and night with city lights on the dark side, an exoplanet transit with its
// live light curve, and a tidally locked lava world glowing at the substellar
// point with cracked embers on the night side.
import { sphere, starfield, blend, norm } from './_raster.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Equirect texture sampler: tex(dir) → texel index for a TW×TH grid. */
function equirect(TW, TH) {
  return (d) => {
    const lon = Math.atan2(d[0], -d[2]);
    const lat = Math.asin(Math.max(-1, Math.min(1, d[1])));
    const u = Math.min(TW - 1, Math.max(0, Math.floor((lon / TAU + 0.5) * TW)));
    const v = Math.min(TH - 1, Math.max(0, Math.floor((lat / Math.PI + 0.5) * TH)));
    return v * TW + u;
  };
}

// ---------------------------------------------------------------------------
// Day & Night — a procedural continental world spinning through its own day:
// sunlit ocean and terrain roll into a twilight band, and city lights come
// out along the dark-side coasts.
const dayNightGlobe = {
  id: 'objects-day-night-globe',
  since: '0.3.0',
  title: 'Day & Night',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['planet', 'terminator', 'day', 'night', 'city lights', 'clouds', 'space'],
  order: 240,
  description: 'A procedural world rolling through its day — sunlit seas and terrain cross the twilight band, city lights wake on the dark coasts.',
  size: { w: 56, h: 24 },
  minSize: { w: 16, h: 7 },
  loop: 18,
  canvas: 'field',
  palette: 'theme',
  setup(ctx) {
    const cv = ctx.canvas();
    const th = ctx.theme;
    const W = cv.width, H = cv.height, asp = cv.aspect;
    const R = Math.min(W * 0.28, H * asp * 0.4);
    const cx = W / 2, cy = H / 2;
    const stars = starfield(ctx.rng, Math.round((W * H) / 80));
    const noise = ctx.noise;
    const L = norm([-0.9, -0.18, -0.34]);
    // Bake the world once: day color + night city lights per equirect texel.
    const TW = 180, TH = 90;
    const tex = equirect(TW, TH);
    const dayCol = new Int32Array(TW * TH);
    const cities = new Float32Array(TW * TH);
    for (let v = 0; v < TH; v++) {
      const lat = ((v + 0.5) / TH - 0.5) * Math.PI;
      for (let u = 0; u < TW; u++) {
        const lon = ((u + 0.5) / TW - 0.5) * TAU;
        const d = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), -Math.cos(lat) * Math.cos(lon)];
        const e = noise.fbm(d[0] * 1.9 + 13, d[1] * 1.9, d[2] * 1.9, 4) + 0.35 * noise.fbm(d[0] * 4.3, d[1] * 4.3 + 5, d[2] * 4.3, 3);
        const polar = Math.abs(d[1]);
        let c;
        if (e > 0.16) {
          const hgt = clamp01((e - 0.16) / 0.5);
          c = blend(0x3f7a38, 0x8a7a52, hgt);
          if (hgt > 0.72 || polar > 0.86) c = blend(c, 0xeef3f7, clamp01((Math.max(hgt - 0.72, polar - 0.86)) * 6));
          const urban = noise.fbm(d[0] * 7.1 + 31, d[1] * 7.1, d[2] * 7.1, 2);
          if (e < 0.4 && urban > 0.22 && polar < 0.75) cities[v * TW + u] = clamp01((urban - 0.22) * 5);
        } else {
          c = blend(0x06264d, 0x1c5e8f, clamp01((e + 0.5) / 0.66));
          if (polar > 0.92) c = blend(c, 0xdfe9f2, clamp01((polar - 0.92) * 9));
        }
        dayCol[v * TW + u] = c;
      }
    }
    const dir = [0, 0, 0];

    return (t) => {
      cv.clear();
      stars(cv, t, 0.9, th.bg);
      const spin = (t / 18) * TAU * 2;
      const cs = Math.cos(spin), sn = Math.sin(spin);
      const cdrift = (t / 18) * TAU;
      cv.circle(cx, cy, R + 1.5, blend(th.bg, th.info, 0.4));
      sphere(cv, null, cx, cy, R, 0, (nx, ny, nz) => {
        dir[0] = nx * cs - nz * sn; dir[1] = ny; dir[2] = nx * sn + nz * cs;
        const i = tex(dir);
        const day = nx * L[0] + ny * L[1] + nz * L[2];
        const cl = clamp01((noise.fbm(dir[0] * 3.2 + Math.sin(cdrift) * 0.4, dir[1] * 3.2, dir[2] * 3.2 + Math.cos(cdrift) * 0.4, 3) - 0.08) * 2.4);
        let c;
        if (day > 0) {
          c = blend(0x060a14, dayCol[i], 0.2 + 0.8 * clamp01(day * 1.4));
          if (cl > 0.25) c = blend(c, 0xf4f7fb, cl * 0.75 * clamp01(day * 1.6));
        } else {
          c = blend(0x02040a, 0x0a1430, 0.5);
          const ci = cities[i];
          if (ci > 0) c = blend(c, 0xffd98c, ci * (0.55 + 0.25 * Math.sin(cdrift * 3 + i)));
          if (cl > 0.3) c = blend(c, 0x1a2338, cl * 0.5);
        }
        const tw = Math.exp(-Math.pow(day / 0.1, 2));
        if (tw > 0.04) c = blend(c, 0xe8863c, tw * 0.45);
        const rim = Math.pow(clamp01(1 + nz - 0.18), 6);
        if (day > -0.05) c = blend(c, 0x7fc4ff, rim * 0.5 * clamp01(day + 0.3));
        return c;
      });
      cv.paint(ctx.buffer);
    };
  },
};

// ---------------------------------------------------------------------------
// Exoplanet Transit — a limb-darkened star with drifting spots, a planet
// crossing its chord once per loop, and the live light curve dipping below:
// ingress shoulder, flat bottom, egress.
function overlap(Rs, Rp, d) {
  if (d >= Rs + Rp) return 0;
  if (d <= Rs - Rp) return Math.PI * Rp * Rp;
  const a = (d * d + Rs * Rs - Rp * Rp) / (2 * d);
  const b = d - a;
  const s1 = Rs * Rs * Math.acos(Math.max(-1, Math.min(1, a / Rs))) - a * Math.sqrt(Math.max(0, Rs * Rs - a * a));
  const s2 = Rp * Rp * Math.acos(Math.max(-1, Math.min(1, b / Rp))) - b * Math.sqrt(Math.max(0, Rp * Rp - b * b));
  return s1 + s2;
}

const exoTransit = {
  id: 'objects-exo-transit',
  since: '0.3.0',
  title: 'Exoplanet Transit',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['exoplanet', 'transit', 'light curve', 'star', 'photometry', 'space'],
  order: 250,
  description: 'A limb-darkened star with drifting spots, a planet transiting once per loop, and the live photometric light curve dipping below.',
  size: { w: 56, h: 24 },
  minSize: { w: 18, h: 7 },
  loop: 12,
  canvas: 'field',
  palette: 'fire',
  setup(ctx) {
    const th = ctx.theme;
    const stripRows = ctx.height >= 12 ? Math.max(4, Math.min(7, Math.round(ctx.height * 0.3))) : 0;
    const starRows = ctx.height - stripRows;
    const cv = ctx.canvas(undefined, { rows: starRows });
    const lc = stripRows ? ctx.canvas('line', { rows: stripRows }) : null;
    const W = cv.width, H = cv.height, asp = cv.aspect;
    const SR = Math.min(W * 0.26, H * asp * 0.36);
    const PR = SR * 0.24, B = SR * 0.32;
    const cx = W / 2, cy = H / 2;
    const stars = starfield(ctx.rng, Math.round((W * H) / 70));
    const noise = ctx.noise;
    const spots = [{ la: 0.3, lo: 0.8, r: 0.3 }, { la: -0.42, lo: 3.1, r: 0.22 }, { la: 0.05, lo: 4.8, r: 0.16 }];
    // Flux lookup over one loop: the transit chord runs u ∈ [0.2, 0.6].
    const FL = 256;
    const flux = new Float32Array(FL);
    const px = (u) => cx + (-1.9 + 3.8 * clamp01((u - 0.2) / 0.4)) * SR;
    for (let i = 0; i < FL; i++) {
      const u = i / FL;
      const d = Math.hypot(px(u) - cx, B);
      flux[i] = 1 - overlap(SR, PR, d) / (Math.PI * SR * SR);
    }
    const depth = 1 - Math.min(...flux);
    const fluxAt = (u) => flux[Math.max(0, Math.min(FL - 1, Math.floor((((u % 1) + 1) % 1) * FL)))];

    return (t) => {
      cv.clear();
      stars(cv, t, 0.85, th.bg);
      const u = ((t / 12) % 1 + 1) % 1;
      const rot = u * TAU;
      sphere(cv, null, cx, cy, SR, 0, (nx, ny, nz) => {
        const q = nx * nx + ny * ny;
        const mu = Math.sqrt(Math.max(0, 1 - q));
        let I = (1 - 0.62 * (1 - mu)) * (0.92 + 0.1 * noise.noise2(nx * 7 + Math.cos(rot) * 0.3, ny * 7 + Math.sin(rot) * 0.3));
        for (const s of spots) {
          const lo = s.lo + rot;
          const sv = [Math.cos(s.la) * Math.sin(lo), -Math.sin(s.la), -Math.cos(s.la) * Math.cos(lo)];
          if (sv[2] > 0) continue;
          const dd = Math.hypot(nx - sv[0], ny - sv[1], nz - sv[2]);
          if (dd < s.r) { const k = 1 - dd / s.r; I *= 1 - 0.55 * k * k; }
        }
        return blend(0x1a0500, blend(0xff8c2a, 0xfff3d0, clamp01(I)), clamp01(0.25 + I));
      });
      // Planet: a dark disk with a thin lit atmosphere rim.
      const pxNow = px(u), pyNow = cy - B / asp;
      if (u > 0.14 && u < 0.66) {
        sphere(cv, null, pxNow, pyNow, PR, 0, (nx, ny, nz) => {
          const edge = nx * nx + ny * ny;
          if (edge > 0.72) return blend(0x1b0f1e, 0xff9a4d, (edge - 0.72) * 2.6);
          return blend(0x0a0612, 0x1b1030, edge);
        });
      }
      cv.paint(ctx.buffer);
      if (!lc) return;
      lc.clear();
      const PW = lc.width, PH = lc.height;
      const y0 = PH * 0.22, y1 = PH * 0.86;
      const fy = (f) => y0 + ((1 - f) / Math.max(1e-6, depth * 1.12)) * (y1 - y0);
      for (let x = 0; x < PW; x += 3) lc.set(x, fy(1), blend(th.bg, th.dim, 0.7));
      for (let x = 0; x < PW; x++) {
        const uu = u - (1 - x / PW);
        const f = fluxAt(uu);
        const dip = (1 - f) / Math.max(1e-6, depth);
        lc.set(x, fy(f), blend(th.info, th.warn, clamp01(dip)));
      }
      const hy = fy(fluxAt(u));
      lc.set(PW - 1, hy, 0xffffff);
      lc.set(PW - 2, hy, blend(th.warn, 0xffffff, 0.5));
      lc.paint(ctx.buffer, 0, starRows);
    };
  },
};

// ---------------------------------------------------------------------------
// Lava World — tidally locked: the substellar hemisphere is an ocean of
// slowly convecting magma, the far side a black crust split by glowing
// cracks, an ember band solidifying along the fixed terminator.
const lavaWorld = {
  id: 'objects-lava-world',
  since: '0.3.0',
  title: 'Lava World',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['lava', 'magma', 'tidally locked', 'exoplanet', 'terminator', 'space'],
  order: 260,
  description: 'A tidally locked lava world — convecting magma at the substellar point, a fixed ember terminator, glowing cracks on the night crust.',
  size: { w: 52, h: 22 },
  minSize: { w: 16, h: 7 },
  loop: 10,
  canvas: 'field',
  palette: 'magma',
  setup(ctx) {
    const cv = ctx.canvas();
    const th = ctx.theme;
    const pal = ctx.palette();
    const W = cv.width, H = cv.height, asp = cv.aspect;
    const R = Math.min(W * 0.3, H * asp * 0.42);
    const cx = W / 2, cy = H / 2;
    const stars = starfield(ctx.rng, Math.round((W * H) / 85));
    const noise = ctx.noise;
    const L = norm([-0.82, -0.12, -0.55]);
    // Bake the night-side crack network once.
    const TW = 160, TH = 80;
    const tex = equirect(TW, TH);
    const cracks = new Float32Array(TW * TH);
    const phase = new Float32Array(TW * TH);
    for (let v = 0; v < TH; v++) {
      const lat = ((v + 0.5) / TH - 0.5) * Math.PI;
      for (let u = 0; u < TW; u++) {
        const lon = ((u + 0.5) / TW - 0.5) * TAU;
        const d = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), -Math.cos(lat) * Math.cos(lon)];
        const rdg = 1 - Math.abs(noise.fbm(d[0] * 3.1 + 7, d[1] * 3.1, d[2] * 3.1, 3)) * 4.5;
        cracks[v * TW + u] = clamp01(rdg - 0.42) * 1.8;
        phase[v * TW + u] = noise.noise3(d[0] * 5, d[1] * 5, d[2] * 5) * 6;
      }
    }
    const dir = [0, 0, 0];

    return (t) => {
      cv.clear();
      stars(cv, t, 0.8, th.bg);
      const ph = (t / 10) * TAU;
      const wob = 0.07 * Math.sin(ph);
      const cw = Math.cos(wob), sw = Math.sin(wob);
      const fx = Math.sin(ph) * 0.45, fz = Math.cos(ph) * 0.45;
      cv.circle(cx, cy, R + 1.5, blend(th.bg, 0xff6a22, 0.35));
      sphere(cv, null, cx, cy, R, 0, (nx, ny, nz) => {
        dir[0] = nx * cw - nz * sw; dir[1] = ny; dir[2] = nx * sw + nz * cw;
        const day = dir[0] * L[0] + dir[1] * L[1] + dir[2] * L[2];
        let c;
        if (day > 0.08) {
          const flow = noise.fbm(dir[0] * 2.7 + fx, dir[1] * 2.7, dir[2] * 2.7 + fz, 3);
          const heat = clamp01(Math.pow(day, 1.15) * (0.55 + 0.9 * clamp01(flow + 0.45)));
          c = pal(clamp01(0.12 + heat * 0.88));
        } else {
          const i = tex(dir);
          c = blend(0x0c0507, 0x1d0e10, clamp01(ny + 0.5));
          const g = cracks[i];
          if (g > 0.02) c = blend(c, 0xff5a1f, g * (0.5 + 0.3 * Math.sin(ph * 2 + phase[i])) * clamp01((0.08 - day) * 8));
        }
        const emb = Math.exp(-Math.pow((day - 0.08) / 0.08, 2));
        if (emb > 0.05) c = blend(c, 0xc43808, emb * 0.6);
        const rim = Math.pow(clamp01(1 + nz - 0.2), 6);
        if (day > 0) c = blend(c, 0xffb36b, rim * 0.55 * day);
        return c;
      });
      cv.paint(ctx.buffer);
    };
  },
};

export default [dayNightGlobe, exoTransit, lavaWorld];
