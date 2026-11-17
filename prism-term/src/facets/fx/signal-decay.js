// Glitch & Noise — broadcast failure modes: vertical sync losing its grip on a
// dusk skyline, interlaced fields tearing apart on motion, and a test card
// rotting through copy generations until the signal gives out.
import { clamp01, hash2, textMask, maskAt } from '../retro/_kit.js';

const SPEED = { speed: { default: 1, min: 0.1, max: 4, label: 'Speed' } };
const TAU = Math.PI * 2;
const pack = (r, g, b) =>
  ((r > 255 ? 255 : r < 0 ? 0 : r) << 16) | ((g > 255 ? 255 : g < 0 ? 0 : g) << 8) | ((b > 255 ? 255 : b < 0 ? 0 : b) | 0);

export default [
  {
    id: 'fx-sync-roll',
    since: '0.3.0',
    title: 'Sync Roll',
    category: 'Glitch & Noise',
    kind: 'scene',
    tags: ['sync', 'vhold', 'roll', 'analog', 'tv', 'tear', 'blanking', 'glitch', 'crt'],
    order: 200,
    description: 'A dusk-skyline broadcast loses vertical hold: the frame rolls through the blanking bar, shears at the fold, then snaps back into lock.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 14,
    canvas: 'field',
    palette: 'synthwave',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const rand = ctx.rng;
      const { width: W, height: H, px } = cv;
      const speed = ctx.param('speed', 1);
      const base = new Int32Array(W * H);
      const hor = Math.max(2, Math.round(H * 0.72));
      const sunX = W * 0.63, sunY = hor * 0.82, sunR = Math.max(1.5, W * 0.055);
      for (let y = 0; y < hor; y++) {
        const v = y / hor;
        const c = pal(0.1 + v * 0.52);
        for (let x = 0; x < W; x++) {
          let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
          const dx = x - sunX, dy = (y - sunY) * 2;
          const d2 = dx * dx + dy * dy;
          if (d2 < sunR * sunR) { r = 255; g = 214; b = 120; }
          else { const gl = Math.exp(-d2 / (sunR * sunR * 14)) * 90; r += gl; g += gl * 0.7; b += gl * 0.3; }
          base[y * W + x] = pack(r, g, b);
        }
      }
      let x0 = 0;
      while (x0 < W) {
        const bwid = 2 + Math.floor(rand() * 7);
        const bh = Math.max(1, Math.round((0.1 + rand() * 0.5) * (H - hor) + H * 0.1));
        for (let x = x0; x < Math.min(W, x0 + bwid); x++) {
          for (let y = Math.max(0, hor - bh); y < H; y++) {
            const lit = y > hor - bh + 1 && hash2(x, y, 1) > 0.9;
            base[y * W + x] = lit ? pack(250, 208, 110) : pack(10, 9, 20);
          }
        }
        x0 += bwid;
      }
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 14) % 1 + 1) % 1;
        const fr = (tt * 24) | 0;
        let vr = 0, tear = 0, agc = 1;
        if (p < 0.35) {
          vr = Math.round(Math.sin(TAU * p * 16) * 0.6);
        } else if (p < 0.72) {
          const q = (p - 0.35) / 0.37;
          vr = Math.round(q * q * (3 - 2 * q) * H * 4);
          tear = Math.sin(Math.PI * q);
          agc = 1 - 0.3 * tear;
        } else if (p < 0.8) {
          const q = (p - 0.72) / 0.08;
          vr = Math.round(H * 4 + Math.sin(q * Math.PI * 3) * (1 - q) * H * 0.12);
          tear = (1 - q) * 0.4;
        }
        const vroll = ((vr % H) + H) % H;
        const barY = (H - vroll) % H;
        const hum0 = Math.floor(p * 2 * H);
        const humW = Math.max(1, H * 0.09);
        for (let y = 0; y < H; y++) {
          const sy = (y + vroll) % H;
          const dBar = (y - barY + H) % H;
          if (dBar < 2 && (tear > 0.02 || vroll !== 0)) {
            for (let x = 0; x < W; x++) px[y * W + x] = pack(hash2(x, y, fr) * 44, hash2(x, y, fr + 1) * 40, hash2(x, y, fr + 2) * 52);
            continue;
          }
          let off = (hash2(y, fr, 1) - 0.5) * 1.3;
          if (tear > 0.02) off += tear * Math.exp(-dBar / 3.2) * W * 0.14 * (hash2(y, fr, 2) - 0.3) * 2;
          const hum = ((y + hum0) % H) < humW ? 13 : 0;
          for (let x = 0; x < W; x++) {
            const sxx = Math.min(W - 1, Math.max(0, Math.round(x + off)));
            const c = base[sy * W + sxx];
            const n = (hash2(x, y, fr) - 0.5) * 14;
            px[y * W + x] = pack(
              ((c >> 16) & 255) * agc + n + hum,
              ((c >> 8) & 255) * agc + n + hum,
              (c & 255) * agc + n + hum,
            );
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-interlace',
    since: '0.3.0',
    title: 'Field Tear',
    category: 'Glitch & Noise',
    kind: 'scene',
    tags: ['interlace', 'combing', 'fields', 'deinterlace', 'scanlines', 'tv', 'glitch', 'temporal'],
    order: 210,
    description: 'Interlaced fields come unstuck: a bouncing ball combs apart as odd and even scanlines sample different moments, swap parity and drop lines.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 12,
    canvas: 'field',
    palette: 'neon',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const Hu = H * aspect;
      const floorY = Hu * 0.78;
      const br = Math.max(1.6, Hu * 0.17);
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 12) % 1 + 1) % 1;
        const delta = 0.03 + 0.55 * ((0.5 - 0.5 * Math.cos(TAU * p)) ** 2);
        const swap = p > 0.44 && p < 0.56;
        const drop = p > 0.68 && p < 0.78;
        for (let y = 0; y < H; y++) {
          const uy = y * aspect;
          let par = y & 1;
          if (swap) par ^= 1;
          if (drop && (y & 1)) {
            for (let x = 0; x < W; x++) {
              const c = px[(y - 1) * W + x];
              px[y * W + x] = pack(((c >> 16) & 255) * 0.88, ((c >> 8) & 255) * 0.88, (c & 255) * 0.88);
            }
            continue;
          }
          const T = tt - par * delta;
          const bx = W * (0.5 + 0.38 * Math.sin(TAU * T / 6));
          const byU = Hu * (0.56 - 0.34 * Math.abs(Math.sin(TAU * T / 3)));
          const scan = par ? 0.9 : 1;
          for (let x = 0; x < W; x++) {
            let r, g, b;
            if (uy >= floorY) {
              const chk = ((Math.floor(x * 0.5 - T * 10) + Math.floor(uy * 0.45)) & 1);
              r = chk ? 36 : 20; g = chk ? 30 : 16; b = chk ? 52 : 30;
            } else {
              const v = uy / floorY;
              r = 10 + 16 * v; g = 12 + 18 * v; b = 26 + 34 * v;
              const band = Math.sin(x * 0.3 - T * (TAU / 3) + uy * 0.12);
              if (band > 0.55) { r += 14; g += 8; b += 22; }
            }
            const dx = x - bx, dyU = uy - byU;
            const d = Math.sqrt(dx * dx + dyU * dyU);
            if (d < br) {
              const sh = 1 - 0.6 * clamp01((d + dx * 0.4 + dyU * 0.3) / br);
              r = 255 * sh; g = 120 * sh + 30; b = 60 * sh;
              if (d < br * 0.4 && dx < 0 && dyU < 0) { r = 255; g = 220; b = 190; }
            }
            px[y * W + x] = pack(r * scan, g * scan, b * scan);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-generation-loss',
    since: '0.3.0',
    title: 'Generation Loss',
    category: 'Glitch & Noise',
    kind: 'scene',
    tags: ['generation loss', 'degradation', 'posterize', 'bitrot', 'copy of a copy', 'noise', 'test card', 'glitch'],
    order: 220,
    description: 'A test card recopied until it dies: each generation posterizes harder, blocks coarsen, ghosts smear and noise climbs until the signal is lost.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 16,
    canvas: 'field',
    palette: 'prism',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const Hu = H * aspect;
      const base = new Int32Array(W * H);
      const ccx = W * 0.5, ccy = Hu * 0.46, cr = Math.min(W, Hu) * 0.34;
      const rampY = Math.round(H * 0.82);
      for (let y = 0; y < H; y++) {
        const uy = y * aspect;
        for (let x = 0; x < W; x++) {
          let r = 24 + (y / H) * 14, g = 26 + (y / H) * 14, b = 34 + (y / H) * 16;
          if (((x >> 3) + (y >> 2)) & 1) { r += 6; g += 6; b += 7; }
          if (y >= rampY) {
            const l = (x / Math.max(1, W - 1)) * 255;
            r = l; g = l; b = l;
          } else {
            const d = Math.hypot(x - ccx, uy - ccy);
            if (d < cr) {
              const c = pal(clamp01(d / cr) * 0.9);
              r = (c >> 16) & 255; g = (c >> 8) & 255; b = c & 255;
              if (d < cr * 0.18) { r = 235; g = 235; b = 235; }
            }
          }
          base[y * W + x] = pack(r, g, b);
        }
      }
      const mask = textMask('CH 07', { font: 'tiny' });
      if (mask.w + 3 < W && mask.h + 3 < H) {
        for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) {
          if (maskAt(mask, x, y)) base[(y + 1) * W + (x + 2)] = pack(240, 240, 240);
        }
      }
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 16) % 1 + 1) % 1;
        const fr = (tt * 12) | 0;
        const gen = 1 + Math.floor(p * 7.999);
        const levels = Math.max(2, Math.round(26 - p * 24));
        const stepQ = 255 / (levels - 1);
        const bs = 1 + Math.min(4, Math.floor(p * 5.2));
        const noiseAmp = p * p * 110;
        const ghost = Math.round(p * 8);
        const ghostA = p * 0.45;
        const sat = 1 - p * 0.85;
        const corruptP = p * 0.3;
        const rollSeed = (p * 20) | 0;
        const staticA = clamp01((p - 0.9) / 0.08);
        for (let by = 0; by < H; by += bs) {
          for (let bx = 0; bx < W; bx += bs) {
            const c = base[Math.min(H - 1, by + (bs >> 1)) * W + Math.min(W - 1, bx + (bs >> 1))];
            let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
            const l = (r + g + b) / 3;
            r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
            const h = hash2(bx, by, rollSeed);
            if (h < corruptP) {
              const h2 = hash2(bx, by, rollSeed + 31);
              if (h2 < 0.3) {
                const c2 = base[(Math.floor(h2 * 3137) % H) * W + (Math.floor(h2 * 7919) % W)];
                r = (c2 >> 16) & 255; g = (c2 >> 8) & 255; b = c2 & 255;
              } else if (h2 < 0.55) { r = 255 - r; g = 255 - g; b = 255 - b; }
              else if (h2 < 0.78) { r = 225; g = 45; b = 200; }
              else { r = g = b = h2 * 255; }
            }
            const n = (hash2(bx, by, fr) - 0.5) * noiseAmp;
            r = Math.round((r + n) / stepQ) * stepQ;
            g = Math.round((g + n) / stepQ) * stepQ;
            b = Math.round((b + n) / stepQ) * stepQ;
            const yMax = Math.min(H, by + bs), xMax = Math.min(W, bx + bs);
            for (let y = by; y < yMax; y++) {
              for (let x = bx; x < xMax; x++) {
                let rr = r, gg = g, bb = b;
                if (ghost > 0) {
                  const gc = base[y * W + Math.max(0, x - ghost)];
                  rr += ((gc >> 16) & 255) * ghostA; gg += ((gc >> 8) & 255) * ghostA; bb += (gc & 255) * ghostA;
                }
                if (staticA > 0) {
                  const sn = hash2(x, y, fr + 5) * 235;
                  rr += (sn - rr) * staticA; gg += (sn - gg) * staticA; bb += (sn - bb) * staticA;
                }
                px[y * W + x] = pack(rr, gg, bb);
              }
            }
          }
        }
        cv.paint(ctx.buffer);
        const b2 = ctx.buffer;
        if (ctx.width >= 14) b2.text(1, 0, 'GEN ' + gen, 0xe8e8e8);
        if (staticA > 0.45 && ctx.width >= 14) {
          const msg = 'NO SIGNAL';
          b2.text(Math.max(0, (ctx.width - msg.length) >> 1), Math.max(0, ctx.height >> 1), msg, 0xf2f2f2);
        }
      };
    },
  },
];
