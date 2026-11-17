// Light & Sky — the night shift: a radiant meteor shower, searchlights
// sweeping a cloud deck over a skyline, and cloud banks drifting across a
// full moon. Everything is scheduled inside the loop so the cycle closes.
import { clamp01, hash2 } from '../retro/_kit.js';

const SPEED = { speed: { default: 1, min: 0.1, max: 4, label: 'Speed' } };
const TAU = Math.PI * 2;
const pack = (r, g, b) =>
  ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | ((b > 255 ? 255 : b) | 0);

export default [
  {
    id: 'fx-meteor-shower',
    since: '0.3.0',
    title: 'Meteor Shower',
    category: 'Light & Sky',
    kind: 'scene',
    tags: ['meteor', 'shooting star', 'radiant', 'bolide', 'night sky', 'stars', 'astronomy'],
    order: 230,
    description: 'A radiant-point meteor shower over a dark ridge: streaks fan out across twinkling stars and one bolide flares, leaving a drifting train.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 18,
    canvas: 'field',
    palette: 'ice',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const rand = ctx.rng;
      const { fbm } = ctx.noise;
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const Hu = H * aspect;
      const rowCol = new Int32Array(H);
      for (let y = 0; y < H; y++) {
        const v = y / H;
        rowCol[y] = pack(3 + 9 * v, 5 + 12 * v, 14 + 28 * v);
      }
      const ridge = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        ridge[x] = Math.max(2, Math.min(H - 1, H * (0.84 + fbm(x * 0.045, 7.7, 0, 2) * 0.09)));
      }
      const stars = Array.from({ length: Math.max(16, Math.round(W * H * 0.035)) }, () => ({
        x: Math.floor(rand() * W), y: Math.floor(rand() * H * 0.8),
        s: 0.35 + rand() * 0.65, p: rand() * TAU, f: (6 + Math.floor(rand() * 4) * 6) * (TAU / 18),
      }));
      const radX = W * 0.6, radY = Hu * 0.24;
      const mets = Array.from({ length: 14 }, (_, i) => {
        const a = rand() * TAU;
        return {
          s0: rand() * 18, dur: 0.45 + rand() * 0.75,
          dx: Math.cos(a), dy: Math.sin(a),
          v: (0.55 + rand() * 0.75) * Math.max(W, Hu) * 0.9,
          r0: 3 + rand() * 9, big: i === 0,
        };
      });
      mets[0].dur = 1.7; mets[0].v *= 0.7; mets[0].s0 = 11.2; mets[0].dy = Math.abs(mets[0].dy) * 0.7 + 0.2;
      mets[0].dx = -Math.abs(mets[0].dx) - 0.3;
      const n0 = Math.hypot(mets[0].dx, mets[0].dy); mets[0].dx /= n0; mets[0].dy /= n0;
      return (t) => {
        const tt = t * speed;
        const tl = (((tt / 18) % 1 + 1) % 1) * 18;
        for (let y = 0; y < H; y++) px.fill(rowCol[y], y * W, y * W + W);
        for (const s of stars) {
          const tw = s.s * (0.5 + 0.5 * Math.sin(tt * s.f + s.p));
          if (tw > 0.06) cv.add(s.x, s.y, pack(tw * 170, tw * 180, tw * 215));
        }
        for (const m of mets) {
          let d0 = tl - m.s0; if (d0 < 0) d0 += 18;
          if (d0 > m.dur) {
            if (m.big && d0 < m.dur + 2.4) {
              const q = (d0 - m.dur) / 2.4;
              const head = m.r0 + m.v * m.dur;
              for (let k = 0; k < 14; k++) {
                const qq = k / 14;
                const dd = head - qq * 22;
                const ux = radX + m.dx * dd + Math.sin(qq * 9 + tt * (TAU / 18) * 3) * q * 3;
                const uy = radY + m.dy * dd + q * 2;
                const I = (1 - q) * (1 - qq) * 0.6;
                cv.add(Math.round(ux), Math.round(uy / aspect), pack(90 * I, 230 * I, 160 * I));
              }
            }
            continue;
          }
          const env = Math.sin(Math.PI * Math.min(1, d0 / m.dur));
          const head = m.r0 + m.v * d0;
          const hx = radX + m.dx * head, hy = radY + m.dy * head;
          const len = m.big ? 26 : 9 + m.v * 0.05;
          const steps = Math.min(48, Math.max(6, len | 0));
          for (let k = 0; k <= steps; k++) {
            const q = k / steps;
            const I = env * ((1 - q) ** 2) * (m.big ? 1.25 : 1);
            cv.add(Math.round(hx - m.dx * q * len), Math.round((hy - m.dy * q * len) / aspect),
              pack(255 * I, (225 + 20 * q) * I, 255 * I * (0.75 + q * 0.3)));
          }
          if (m.big && d0 / m.dur > 0.7) {
            const fe = Math.sin(Math.PI * clamp01((d0 / m.dur - 0.7) / 0.3));
            for (let oy = -2; oy <= 2; oy++) for (let ox = -4; ox <= 4; ox++) {
              const dd = Math.exp(-(ox * ox + oy * oy * aspect * aspect) / 7) * fe;
              cv.add(Math.round(hx) + ox, Math.round(hy / aspect) + oy, pack(255 * dd, 245 * dd, 210 * dd));
            }
          }
        }
        for (let x = 0; x < W; x++) {
          for (let y = Math.round(ridge[x]); y < H; y++) {
            const deep = (y - ridge[x]) / Math.max(1, H - ridge[x]);
            px[y * W + x] = pack(6 - deep * 3, 8 - deep * 4, 11 - deep * 5);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-searchlights',
    since: '0.3.0',
    title: 'Searchlights',
    category: 'Light & Sky',
    kind: 'scene',
    tags: ['searchlight', 'beams', 'night', 'clouds', 'skyline', 'city', 'volumetric', 'sweep'],
    order: 240,
    description: 'Rooftop searchlights sweep and cross over a night skyline, dust shimmering in the cones and bright spots crawling along the cloud deck.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 16,
    canvas: 'field',
    palette: 'ice',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const rand = ctx.rng;
      const { fbm } = ctx.noise;
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const Hu = H * aspect;
      const bh = new Int32Array(W);
      let x0 = 0;
      while (x0 < W) {
        const bwid = 3 + Math.floor(rand() * 8);
        const h2 = Math.max(1, Math.round((0.05 + rand() * 0.2) * H));
        for (let x = x0; x < Math.min(W, x0 + bwid); x++) bh[x] = h2;
        x0 += bwid;
      }
      const nB = W > 60 ? 4 : 3;
      const beams = Array.from({ length: nB }, (_, i) => {
        const bx = Math.min(W - 1, Math.max(0, Math.round(W * (0.14 + 0.72 * (i / Math.max(1, nB - 1))) + (rand() - 0.5) * W * 0.05)));
        return {
          bx, byU: (H - 1 - bh[bx]) * aspect,
          amp: 0.3 + rand() * 0.22, n: 1 + Math.floor(rand() * 2), ph: rand() * TAU,
          tint: i % 2 ? [255, 236, 200] : [215, 234, 255],
          dx: 0, dyU: -1,
        };
      });
      const cloudBot = Hu * 0.52;
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 16) % 1 + 1) % 1;
        for (const bm of beams) {
          const a = bm.amp * Math.sin(TAU * p * bm.n + bm.ph);
          bm.dx = Math.sin(a); bm.dyU = -Math.cos(a);
        }
        const zx = Math.sin(TAU * p) * 1.4, zz = Math.cos(TAU * p) * 0.8;
        const fr = (tt * 9) | 0;
        for (let y = 0; y < H; y++) {
          const uy = y * aspect, v = y / H;
          const sR = 4 + 6 * v, sG = 6 + 8 * v, sB = 16 + 24 * v;
          const inCloud = uy < cloudBot;
          for (let x = 0; x < W; x++) {
            let r = sR, g = sG, b = sB, dens = 0;
            if (inCloud) {
              dens = clamp01(fbm(x * 0.05 + zx, uy * 0.1, zz, 2) * 1.4 + 0.12);
              r += dens * 9; g += dens * 10; b += dens * 14;
            }
            for (const bm of beams) {
              const rx = x - bm.bx, ryU = uy - bm.byU;
              const sp = rx * bm.dx + ryU * bm.dyU;
              if (sp > 2) {
                const lat = Math.abs(rx * bm.dyU - ryU * bm.dx);
                const hw = 1.1 + sp * 0.055;
                if (lat < hw * 2.4) {
                  let I = Math.exp(-((lat / hw) ** 2)) * Math.max(0, 1 - sp / (Hu * 1.35));
                  I *= 0.8 + 0.4 * hash2(x, y, fr);
                  if (inCloud) I *= 1 + dens * 2.2;
                  r += bm.tint[0] * I * 0.55; g += bm.tint[1] * I * 0.55; b += bm.tint[2] * I * 0.55;
                }
              }
            }
            px[y * W + x] = pack(r, g, b);
          }
        }
        for (let x = 0; x < W; x++) {
          const top = H - 1 - bh[x];
          for (let y = Math.max(0, top); y < H; y++) {
            if (y > top + 1 && hash2(x, y, 5) > 0.93 && ((x + y) & 1)) px[y * W + x] = pack(240, 205, 120);
            else px[y * W + x] = pack(6, 7, 10);
          }
        }
        for (const bm of beams) {
          const sy = Math.round(bm.byU / aspect);
          cv.add(bm.bx, sy, pack(255, 250, 230));
          cv.add(bm.bx + 1, sy, pack(140, 135, 120));
          cv.add(bm.bx - 1, sy, pack(140, 135, 120));
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-moonlit-clouds',
    since: '0.3.0',
    title: 'Moonlit Drift',
    category: 'Light & Sky',
    kind: 'scene',
    tags: ['moon', 'clouds', 'night', 'moonlight', 'silver lining', 'halo', 'drift', 'craters'],
    order: 250,
    description: 'Cloud banks drift across a full cratered moon: silver linings flare at their edges, the halo dims when it is swallowed, stars own the gaps.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 28,
    canvas: 'field',
    palette: 'ice',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const rand = ctx.rng;
      const { fbm } = ctx.noise;
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const Hu = H * aspect;
      const mX = W * 0.64, mY = Hu * 0.3;
      const Rm = Math.max(1.6, Math.min(W * 0.09, Hu * 0.16));
      const craters = Array.from({ length: 6 }, () => {
        const a = rand() * TAU, rr = rand() * 0.62;
        return { ox: Math.cos(a) * rr * Rm, oy: Math.sin(a) * rr * Rm, r: Rm * (0.1 + rand() * 0.2), d: 0.72 + rand() * 0.16 };
      });
      const stars = Array.from({ length: Math.max(14, Math.round(W * H * 0.03)) }, () => ({
        x: Math.floor(rand() * W), y: Math.floor(rand() * H),
        s: 0.35 + rand() * 0.6, p: rand() * TAU, f: (7 + Math.floor(rand() * 3) * 7) * (TAU / 28),
      }));
      const wrap = W * 1.6;
      const clouds = [];
      for (let l = 0; l < 2; l++) {
        const count = 4 + l;
        for (let i = 0; i < count; i++) {
          clouds.push({
            x0: rand() * wrap, yU: Hu * (0.1 + rand() * 0.42),
            rw: W * (0.12 + rand() * 0.13) * (l ? 0.7 : 1), rh: Hu * (0.06 + rand() * 0.07) * (l ? 0.8 : 1),
            seed: rand() * 20, k: l ? 1 : 2, soft: l ? 0.55 : 0.8,
          });
        }
      }
      const dens = new Float32Array(W * H);
      const densAt = (ux, uy, p) => {
        let d = 0;
        for (const c of clouds) {
          const cxp = ((c.x0 + p * c.k * wrap) % wrap + wrap) % wrap - wrap * 0.3;
          const dx = ux - cxp, dy = uy - c.yU;
          const e = 1 - (dx * dx) / (c.rw * c.rw) - (dy * dy) / (c.rh * c.rh);
          if (e > 0) d += e * c.soft * (0.55 + 0.75 * (fbm(dx * 0.09 + c.seed, dy * 0.16, c.seed, 2) * 0.5 + 0.5));
        }
        return Math.min(1.3, d);
      };
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 28) % 1 + 1) % 1;
        const occl = clamp01(densAt(mX, mY, p));
        const glowK = 1 / (1 + occl * 4);
        for (let y = 0; y < H; y++) {
          const uy = y * aspect, v = y / H;
          for (let x = 0; x < W; x++) {
            let r = 4 + 5 * v, g = 6 + 7 * v, b = 15 + 19 * v;
            const dx = x - mX, dyU = uy - mY;
            const d = Math.sqrt(dx * dx + dyU * dyU);
            const hal = Math.exp(-Math.max(0, d - Rm) / (Rm * 1.9)) * glowK;
            r += hal * 46; g += hal * 50; b += hal * 58;
            if (d < Rm) {
              const limb = 1 - 0.25 * ((d / Rm) ** 2);
              let mr = 228 * limb, mg = 230 * limb, mb = 236 * limb;
              for (const c of craters) {
                const dc = Math.hypot(dx - c.ox, dyU - c.oy);
                if (dc < c.r) { mr *= c.d; mg *= c.d; mb *= c.d * 1.02; }
              }
              r = mr * glowK + r * 0.2; g = mg * glowK + g * 0.2; b = mb * glowK + b * 0.2;
            }
            const de = densAt(x, uy, p);
            dens[y * W + x] = de;
            if (de > 0.01) {
              const a = Math.min(0.94, de * 1.25);
              const rim = clamp01(de * (1.15 - de) * 3) * hal;
              const cr = 14 + 176 * rim, cg = 16 + 184 * rim, cb = 22 + 204 * rim;
              r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
            }
            px[y * W + x] = pack(r, g, b);
          }
        }
        for (const s of stars) {
          if (dens[s.y * W + s.x] > 0.28) continue;
          const tw = s.s * (0.5 + 0.5 * Math.sin(tt * s.f + s.p));
          if (tw > 0.06) cv.add(s.x, s.y, pack(tw * 165, tw * 175, tw * 210));
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
