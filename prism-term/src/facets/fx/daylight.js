// Light & Sky — the sun's side of the sky: a full dawn-to-dusk day over calm
// water, a total solar eclipse end to end, and white light fanning through a
// glass prism. All three are field canvases driven by one looping phase.
import { clamp01, hash2 } from '../retro/_kit.js';

const SPEED = { speed: { default: 1, min: 0.1, max: 4, label: 'Speed' } };
const TAU = Math.PI * 2;
const pack = (r, g, b) =>
  ((r > 255 ? 255 : r) << 16) | ((g > 255 ? 255 : g) << 8) | ((b > 255 ? 255 : b) | 0);

export default [
  {
    id: 'fx-daybreak',
    since: '0.3.0',
    title: 'Daybreak',
    category: 'Light & Sky',
    kind: 'scene',
    tags: ['sunrise', 'sunset', 'sun', 'sea', 'ocean', 'day cycle', 'glitter path', 'dawn', 'dusk', 'stars'],
    order: 200,
    description: 'A whole day over a calm sea: dawn flares, the sun arcs west with a glitter path tracking it on the water, dusk burns down to stars.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 30,
    canvas: 'field',
    palette: 'sunset',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const rand = ctx.rng;
      const { fbm } = ctx.noise;
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const horizon = Math.max(2, Math.min(H - 2, Math.round(H * 0.6)));
      const seaH = Math.max(1, H - horizon);
      const R = Math.max(1.4, Math.min(W * 0.045, H * aspect * 0.09));
      const stars = Array.from({ length: Math.max(10, Math.round(W * horizon * 0.02)) }, () => ({
        x: Math.floor(rand() * W), y: Math.floor(rand() * horizon),
        p: rand() * TAU, f: (7 + Math.floor(rand() * 3) * 7) * (TAU / 30), s: 0.5 + rand() * 0.5,
      }));
      const row = new Float32Array(horizon * 3);
      const c0 = Math.round(horizon * 0.14), c1 = Math.round(horizon * 0.74);
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 30) % 1 + 1) % 1;
        const u = clamp01((p - 0.06) / 0.88);
        const e = -0.25 + 1.25 * Math.sin(Math.PI * u);     // sun elevation
        const k = clamp01(e * 1.6 + 0.22);                  // daylight amount
        const w = (u > 0 && u < 1 ? 1 : 0) * Math.exp(-((e / 0.26) ** 2)); // dawn/dusk warmth
        const sx = W * (0.16 + 0.68 * u);
        const sy = horizon - e * horizon * 0.96;
        const sg = 246 - 120 * (1 - clamp01(e * 1.4 + 0.3));
        const sb = 214 - 174 * (1 - clamp01(e * 1.4 + 0.2));
        const zR = 4 + 58 * k, zG = 7 + 120 * k, zB = 20 + 192 * k;
        let lR = 10 + 158 * k, lG = 16 + 190 * k, lB = 38 + 196 * k;
        lR += (255 - lR) * w * 0.85; lG += (150 - lG) * w * 0.8; lB += (64 - lB) * w * 0.8;
        for (let y = 0; y < horizon; y++) {
          const v = (y / horizon) ** 1.35, j = y * 3;
          row[j] = zR + (lR - zR) * v; row[j + 1] = zG + (lG - zG) * v; row[j + 2] = zB + (lB - zB) * v;
        }
        let cR = 24 + 212 * k, cG = 24 + 206 * k, cB = 32 + 214 * k;
        cR += (255 - cR) * w * 0.75; cG += (164 - cG) * w * 0.6; cB += (92 - cB) * w * 0.6;
        const zx = Math.sin(TAU * p) * 1.7, zz = Math.cos(TAU * p) * 0.8;
        const R2 = R * R;
        for (let y = 0; y < horizon; y++) {
          const j = y * 3, dyU = (y - sy) * aspect, inBand = y >= c0 && y <= c1;
          for (let x = 0; x < W; x++) {
            let r = row[j], g = row[j + 1], b = row[j + 2];
            if (inBand) {
              const dens = clamp01(fbm(x * 0.055 + zx, y * 0.16, zz, 2) * 1.5 - 0.22);
              if (dens > 0.01) { r += (cR - r) * dens * 0.9; g += (cG - g) * dens * 0.9; b += (cB - b) * dens * 0.9; }
            }
            const dx = x - sx, d2 = dx * dx + dyU * dyU;
            const glow = Math.exp(-d2 / (R2 * 22)) * (90 + 130 * w);
            r += glow; g += glow * (0.62 + 0.3 * k); b += glow * (0.35 + 0.42 * k);
            if (d2 < R2) {
              const limb = 1 - 0.3 * (d2 / R2);
              r = 255 * limb; g = sg * limb; b = sb * limb;
            }
            px[y * W + x] = pack(r, g, b);
          }
        }
        if (k < 0.5) {
          const sa = 1 - k * 2;
          for (const s of stars) {
            const tw = sa * s.s * (0.55 + 0.45 * Math.sin(tt * s.f + s.p));
            if (tw > 0.05) cv.add(s.x, s.y, pack(tw * 190, tw * 200, tw * 235));
          }
        }
        for (let y = horizon; y < H; y++) {
          const d = y - horizon + 1;
          const wob = Math.sin(y * 1.9 + tt * (TAU / 30) * 7) * (0.35 + d * 0.16);
          const dk = 0.55 - (d / seaH) * 0.3;
          const my = Math.max(0, horizon - 1 - Math.round(d * 1.45));
          const gw = Math.max(1.2, R * (1.05 + d * 0.3));
          for (let x = 0; x < W; x++) {
            const sxm = Math.min(W - 1, Math.max(0, Math.round(x + wob)));
            const src = px[my * W + sxm];
            let r = ((src >> 16) & 255) * dk, g = ((src >> 8) & 255) * dk + 2, b = (src & 255) * dk + 6;
            if (e > -0.06) {
              const ax = Math.abs(x - sx);
              if (ax < gw && hash2(x, y, (tt * 7) | 0) > 0.9 + (ax / gw) * 0.09 - clamp01(e) * 0.04) {
                r = 255; g = sg * 0.98; b = sb * 0.92;
              }
            }
            px[y * W + x] = pack(r, g, b);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-eclipse',
    since: '0.3.0',
    title: 'Totality',
    category: 'Light & Sky',
    kind: 'scene',
    tags: ['eclipse', 'solar eclipse', 'corona', 'diamond ring', 'moon', 'sun', 'totality', 'astronomy'],
    order: 210,
    description: 'A total solar eclipse end to end: the moon bites in, daylight collapses, the diamond ring flashes and the corona blooms over a dark land.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 24,
    canvas: 'field',
    palette: 'gold',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const rand = ctx.rng;
      const { noise3, fbm } = ctx.noise;
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const Hu = H * aspect;
      const sunX = W * 0.5, sunY = Hu * 0.42;
      const R = Math.max(2, Math.min(W * 0.13, Hu * 0.17));
      const Rm = R * 1.12;
      const gy = Math.max(1, Math.min(H - 1, Math.round(H * 0.84)));
      const ridge = new Float32Array(W);
      for (let x = 0; x < W; x++) {
        ridge[x] = Math.min(H - 1, gy + (fbm((x / Math.max(8, W)) * 5, 4.2, 0, 2) * 0.5 + 0.5) * (H - gy) * 0.6);
      }
      const stars = Array.from({ length: Math.max(12, Math.round(W * gy * 0.015)) }, () => ({
        x: Math.floor(rand() * W), y: Math.floor(rand() * Math.max(1, gy - 1)),
        s: 0.4 + rand() * 0.6, p: rand() * TAU, f: (8 + Math.floor(rand() * 6)) * (TAU / 24),
      }));
      const ca = Math.cos(0.18), sa = Math.sin(0.18);
      const row = new Float32Array(H * 3);
      const box = R * 3.4;
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 24) % 1 + 1) % 1;
        const off = (p - 0.5) * 2 * 3.1 * R;
        const mx = sunX + off * ca, myU = sunY + off * sa;
        const dcc = Math.abs(off);
        const cover = clamp01((R + Rm - dcc) / (2 * R));
        const L = Math.max(0.02, (1 - cover) ** 0.62);
        const cor = clamp01((cover - 0.86) / 0.14);
        const fl = Math.exp(-(((cover - 0.972) / 0.014) ** 2));
        const ring = clamp01(1.3 - L * 3.2) * cover;
        for (let y = 0; y < H; y++) {
          const v = Math.min(1, y / gy), j = y * 3, rr = (v ** 5) * ring;
          row[j] = 90 * L + 6 + (60 * L + 4) * v + 200 * rr;
          row[j + 1] = 150 * L + 8 + (40 * L + 4) * v + 92 * rr;
          row[j + 2] = 220 * L + 26 + (15 * L + 4) * v + 30 * rr;
        }
        for (let y = 0; y < H; y++) {
          const uy = y * aspect, j = y * 3, dyS = uy - sunY, dyM = uy - myU;
          for (let x = 0; x < W; x++) {
            if (y >= ridge[x]) {
              const vn = 0.75 + 0.25 * hash2(x, y, 9);
              px[y * W + x] = pack((7 + 48 * L) * vn, (9 + 56 * L) * vn, (9 + 38 * L) * vn);
              continue;
            }
            let r = row[j], g = row[j + 1], b = row[j + 2];
            const dxS = x - sunX, dxM = x - mx;
            if (dxS > -box && dxS < box && dyS > -box && dyS < box) {
              const d1 = Math.sqrt(dxS * dxS + dyS * dyS);
              if (cor > 0 && d1 > R * 0.92 && d1 < box) {
                const ang = Math.atan2(dyS, dxS);
                const n = 0.5 + 0.5 * noise3(Math.cos(ang) * 1.6, Math.sin(ang) * 1.6, tt * 0.1);
                const ci = cor * Math.exp(-(d1 - R) / (R * (0.22 + 0.85 * n * n))) * (0.5 + 0.5 * n);
                r += 225 * ci; g += 232 * ci; b += 255 * ci;
              }
              if (d1 < R) {
                const limb = 1 - 0.35 * ((d1 / R) ** 2);
                r = 255; g = 243 * limb; b = 205 * limb;
              }
              const gl = Math.exp(-(d1 * d1) / (R * R * 9)) * 120 * (1 - cover);
              r += gl; g += gl * 0.9; b += gl * 0.7;
              const dm2 = dxM * dxM + dyM * dyM;
              if (dm2 < Rm * Rm && (d1 < R * 1.05 || cor > 0.25)) {
                const ed = Math.sqrt(dm2) / Rm;
                r = 10 + 20 * (ed ** 8); g = r; b = r + 4;
              }
            }
            px[y * W + x] = pack(r, g, b);
          }
        }
        if (fl > 0.02) {
          const inv = dcc > 0.001 ? 1 / dcc : 0;
          const dirx = (sunX - mx) * inv, diry = (sunY - myU) * inv;
          const cxP = Math.round(sunX + dirx * R * 0.98);
          const cyP = Math.round((sunY + diry * R * 0.98) / aspect);
          const span = Math.max(2, Math.round(R * 1.3));
          for (let q = -span; q <= span; q++) {
            const fall = fl * Math.max(0, 1 - Math.abs(q) / span) ** 2;
            const c = pack(255 * fall, 250 * fall, 235 * fall);
            cv.add(cxP + q, cyP, c);
            cv.add(cxP, cyP + Math.round(q / (aspect * 1.5)), c);
          }
          for (let oy = -2; oy <= 2; oy++) for (let ox = -3; ox <= 3; ox++) {
            const dd = Math.exp(-(ox * ox + oy * oy * aspect * aspect) / 6) * fl;
            cv.add(cxP + ox, cyP + oy, pack(255 * dd, 252 * dd, 240 * dd));
          }
        }
        const starA = clamp01((0.3 - L) / 0.27);
        if (starA > 0.02) {
          for (const s of stars) {
            if (s.y >= ridge[s.x]) continue;
            const tw = starA * s.s * (0.6 + 0.4 * Math.sin(tt * s.f + s.p));
            cv.add(s.x, s.y, pack(tw * 185, tw * 195, tw * 230));
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-prism-beam',
    since: '0.3.0',
    title: 'Refraction',
    category: 'Light & Sky',
    kind: 'scene',
    tags: ['prism', 'refraction', 'spectrum', 'rainbow', 'dispersion', 'optics', 'light', 'beam', 'dust'],
    order: 220,
    description: 'White light meets a glass prism and fans out into a breathing spectrum, dust motes riding the beam and the bands shimmering in the dark.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 12,
    canvas: 'field',
    palette: 'prism',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const rand = ctx.rng;
      const { noise3 } = ctx.noise;
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const Hu = H * aspect;
      const cx = W * 0.42, cy = Hu * 0.52;
      const s = Math.max(2, Math.min(W * 0.2, Hu * 0.3));
      const Ax = cx, Ay = cy - s, Bx = cx - s * 0.866, By = cy + s * 0.5, Cx = cx + s * 0.866, Cy = cy + s * 0.5;
      const E1x = (Ax + Bx) / 2, E1y = (Ay + By) / 2;
      const E2x = (Ax + Cx) / 2, E2y = (Ay + Cy) / 2;
      const P0y = Math.min(Hu - 1, E1y + E1x * 0.22);
      const inLen = Math.hypot(E1x, E1y - P0y) || 1;
      const idx = E1x / inLen, idy = (E1y - P0y) / inLen;
      const gLen = Math.hypot(E2x - E1x, E2y - E1y) || 1;
      const gx = (E2x - E1x) / gLen, gyv = (E2y - E1y) / gLen;
      const bw = Math.max(0.8, Hu * 0.03);
      const mseed = Array.from({ length: 24 }, () => [rand(), rand(), rand(), rand()]);
      const F1 = (TAU / 12) * 4, F2 = (TAU / 12) * 5, F3 = (TAU / 12) * 2;
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 12) % 1 + 1) % 1;
        const spread = 0.5 * (1 + 0.07 * Math.sin(TAU * p));
        const a0 = 0.06 - spread / 2;
        for (let y = 0; y < H; y++) {
          const uy = y * aspect;
          for (let x = 0; x < W; x++) {
            const vdx = (x - W / 2) / W, vdy = (uy - Hu / 2) / Hu;
            let r = 3 + 6 * (1 - (vdx * vdx + vdy * vdy) * 2);
            let g = r * 0.9, b = r * 1.35;
            const s1 = (Bx - Ax) * (uy - Ay) - (By - Ay) * (x - Ax);
            const s2 = (Cx - Bx) * (uy - By) - (Cy - By) * (x - Bx);
            const s3 = (Ax - Cx) * (uy - Cy) - (Ay - Cy) * (x - Cx);
            const inside = (s1 <= 0 && s2 <= 0 && s3 <= 0) || (s1 >= 0 && s2 >= 0 && s3 >= 0);
            if (inside) {
              const shade = 0.5 + 0.5 * clamp01((uy - Ay) / (s * 1.5));
              r = 16 + 18 * shade; g = 20 + 24 * shade; b = 30 + 34 * shade;
              const nz = noise3(x * 0.14, uy * 0.14, tt * 0.25);
              r += nz * 6 + 6; g += nz * 8 + 8; b += nz * 10 + 10;
              const rx = x - E1x, ry = uy - E1y;
              const sp = rx * gx + ry * gyv;
              if (sp > -1 && sp < gLen + 1) {
                const lat = Math.abs(rx * gyv - ry * gx);
                const I = Math.exp(-((lat / (bw * 1.1)) ** 2)) * 200;
                const hue = clamp01(sp / gLen);
                r += I * (1 - hue * 0.1); g += I * (1 - hue * 0.25); b += I;
              }
              if (Math.min(Math.abs(s1), Math.abs(s2), Math.abs(s3)) < s * s * 0.07) { r += 60; g += 72; b += 95; }
            } else if (x <= E1x) {
              const rx = x, ry = uy - P0y;
              const sp = rx * idx + ry * idy;
              if (sp > 0 && sp <= inLen) {
                const lat = Math.abs(rx * idy - ry * idx);
                const I = Math.exp(-((lat / bw) ** 2)) * (195 + 25 * Math.sin(tt * F1 + sp * 0.2));
                r += I; g += I * 0.97; b += I * 0.9;
              }
            }
            if (!inside && x >= E2x - 1) {
              const rx = x - E2x, ry = uy - E2y;
              const rr = Math.hypot(rx, ry);
              if (rr > 0.6) {
                const uu = (Math.atan2(ry, rx) - a0) / spread;
                if (uu > 0 && uu < 1) {
                  const env = Math.min(1, uu * 7, (1 - uu) * 7);
                  const fade = clamp01(1.25 - rr / (W * 0.95));
                  const shim = 0.82 + 0.18 * Math.sin(uu * 26 - tt * F2 + rr * 0.1);
                  const c = pal(0.03 + (1 - uu) * 0.88);
                  const I = env * fade * shim;
                  const core = Math.max(0, 1 - rr / (s * 0.5));
                  r += ((c >> 16) & 255) * I + 220 * core;
                  g += ((c >> 8) & 255) * I + 220 * core;
                  b += (c & 255) * I + 225 * core;
                }
              }
            }
            px[y * W + x] = pack(r, g, b);
          }
        }
        for (let i = 0; i < 24; i++) {
          const m = mseed[i];
          if (i < 10) {
            const q = ((m[0] + tt * ((1 + Math.floor(m[1] * 2)) / 12)) % 1 + 1) % 1;
            const ux = idx * q * inLen + Math.sin(tt * F3 + i) * (m[2] - 0.5) * 2;
            const uyv = P0y + idy * q * inLen + (m[3] - 0.5) * 2;
            const br = 120 + 100 * Math.sin(tt * F3 + i * 2.4);
            cv.add(Math.round(ux), Math.round(uyv / aspect), pack(br, br * 0.97, br * 0.9));
          } else {
            const uu = m[0];
            const ang = a0 + uu * spread;
            const rr = (((m[1] + tt * ((1 + Math.floor(m[2] * 2)) / 12)) % 1 + 1) % 1) * W * 0.6;
            const ux = E2x + Math.cos(ang) * rr, uyv = E2y + Math.sin(ang) * rr;
            const c = pal(0.03 + (1 - uu) * 0.88);
            cv.add(Math.round(ux), Math.round(uyv / aspect),
              pack(((c >> 16) & 255) * 0.7, ((c >> 8) & 255) * 0.7, (c & 255) * 0.7));
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
