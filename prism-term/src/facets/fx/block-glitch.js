// Glitch & Noise — digital decay: datamosh block smear across a scene cut,
// chromatic aberration breathing over a lens target, and an LCD panel losing
// pixels, lines and finally its driver before rebooting clean.
import { clamp01, hash2 } from '../retro/_kit.js';

const SPEED = { speed: { default: 1, min: 0.1, max: 4, label: 'Speed' } };
const TAU = Math.PI * 2;
const pack = (r, g, b) =>
  ((r > 255 ? 255 : r < 0 ? 0 : r) << 16) | ((g > 255 ? 255 : g < 0 ? 0 : g) << 8) | ((b > 255 ? 255 : b < 0 ? 0 : b) | 0);

export default [
  {
    id: 'fx-datamosh',
    since: '0.3.0',
    title: 'Datamosh',
    category: 'Glitch & Noise',
    kind: 'scene',
    tags: ['datamosh', 'compression', 'macroblock', 'motion vectors', 'i-frame', 'codec', 'glitch', 'smear'],
    order: 230,
    description: 'A scene cut with the keyframe deleted: motion vectors smear the old shot into soup, wrong blocks bloom through, a sweep finally re-keys it.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 15,
    canvas: 'field',
    palette: 'synthwave',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const rand = ctx.rng;
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const Hu = H * aspect;
      const A = new Int32Array(W * H), B = new Int32Array(W * H);
      for (let y = 0; y < H; y++) {
        const uy = y * aspect, v = y / H;
        for (let x = 0; x < W; x++) {
          const hill = Hu * (0.55 + 0.14 * Math.sin(x * 0.08) + 0.08 * Math.sin(x * 0.21 + 2));
          if (uy > hill) {
            const dp = clamp01((uy - hill) / (Hu * 0.5));
            A[y * W + x] = pack(140 - dp * 90, 80 - dp * 50, 60 - dp * 30);
          } else {
            const dx = x - W * 0.3, dy = uy - Hu * 0.3;
            const d2 = dx * dx + dy * dy, sr = Math.max(2, W * 0.07);
            let r = 250 - v * 120, g = 160 - v * 60, b = 90 + v * 40;
            if (d2 < sr * sr) { r = 255; g = 240; b = 200; }
            else { const gl = Math.exp(-d2 / (sr * sr * 10)) * 70; r += gl; g += gl; b += gl * 0.5; }
            A[y * W + x] = pack(r, g, b);
          }
        }
      }
      const colW = Math.max(2, Math.round(W / 16));
      const colH = Array.from({ length: Math.ceil(W / colW) }, () => 0.25 + rand() * 0.6);
      for (let y = 0; y < H; y++) {
        const uy = y * aspect;
        for (let x = 0; x < W; x++) {
          const ci = Math.floor(x / colW);
          const top = Hu * (1 - colH[ci]);
          let r = 8, g = 10, b = 24 + (y / H) * 20;
          if (uy > top) {
            const c = pal(0.55 + (ci % 5) * 0.09);
            const lit = hash2(x, y, 7) > 0.82;
            r = lit ? (c >> 16) & 255 : 16; g = lit ? (c >> 8) & 255 : 18; b = lit ? c & 255 : 34;
          }
          B[y * W + x] = pack(r, g, b);
        }
      }
      const cur = new Int32Array(W * H), tmp = new Int32Array(W * H);
      cur.set(A);
      const bs = 6;
      const F1 = (TAU / 15) * 3, F2 = (TAU / 15) * 2;
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 15) % 1 + 1) % 1;
        const fr = (tt * 10) | 0;
        if (p < 0.015) cur.set(A);
        const mosh = p >= 0.33;
        const refreshP = mosh ? 0.045 : 0.3;
        const sweepY = p > 0.66 && p < 0.9 ? ((p - 0.66) / 0.24) * H : -1;
        for (let by = 0; by < H; by += bs) {
          for (let bx = 0; bx < W; bx += bs) {
            const yMax = Math.min(H, by + bs), xMax = Math.min(W, bx + bs);
            const fresh = hash2(bx, by, fr) < refreshP;
            const keyed = fresh || (sweepY >= 0 && by < sweepY);
            if (keyed) {
              const src = mosh || sweepY >= 0 ? B : A;
              for (let y = by; y < yMax; y++) for (let x = bx; x < xMax; x++) tmp[y * W + x] = src[y * W + x];
              continue;
            }
            const mvx = Math.round(2.6 * Math.sin(by * 0.35 + tt * F1) + (mosh ? -2.4 : 0));
            const mvy = Math.round(1.8 * Math.cos(bx * 0.3 + tt * F2));
            const dr = mosh ? (hash2(bx, by, 17) - 0.45) * 6 : 0;
            for (let y = by; y < yMax; y++) {
              const sy = Math.min(H - 1, Math.max(0, y + mvy));
              for (let x = bx; x < xMax; x++) {
                const sx = Math.min(W - 1, Math.max(0, x + mvx));
                const c = cur[sy * W + sx];
                tmp[y * W + x] = dr === 0 ? c : pack(((c >> 16) & 255) + dr, ((c >> 8) & 255) + dr * 0.6, (c & 255) + dr * 1.4);
              }
            }
          }
        }
        cur.set(tmp);
        px.set(cur);
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-chroma-drift',
    since: '0.3.0',
    title: 'Chroma Drift',
    category: 'Glitch & Noise',
    kind: 'scene',
    tags: ['chromatic aberration', 'rgb split', 'lens', 'fringing', 'drift', 'glitch', 'optics'],
    order: 240,
    description: 'A lens-test target whose color channels come unglued: red and blue drift apart radially, breathing in and out as the target slowly rotates.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 10,
    canvas: 'field',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const Hu = H * aspect;
      const cx = W * 0.5, cyU = Hu * 0.5;
      const F = new Float32Array(W * H);
      const maxD = Math.hypot(cx, cyU) || 1;
      const ringK = 42 / maxD;
      for (let y = 0; y < H; y++) {
        const uy = y * aspect;
        for (let x = 0; x < W; x++) {
          const dx = x - cx, dy = uy - cyU;
          const d = Math.hypot(dx, dy);
          let v = clamp01(Math.sin(d * ringK) * 2.2 - 0.5) * clamp01(1.25 - d / maxD);
          if (Math.abs(dx) < 0.8 || Math.abs(dy) < 0.8) v = Math.max(v, d > maxD * 0.12 ? 0.85 : v);
          const d1 = Math.hypot(dx - W * 0.3, dy + Hu * 0.22), d2 = Math.hypot(dx + W * 0.3, dy - Hu * 0.22);
          if (d1 < Math.max(1.5, W * 0.05) || d2 < Math.max(1.5, W * 0.05)) v = 1;
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) v = 0.7;
          F[y * W + x] = v;
        }
      }
      const samp = (xs, ys) => {
        const xi = xs < 0 ? 0 : xs >= W ? W - 1 : xs | 0;
        const yi = ys < 0 ? 0 : ys >= H ? H - 1 : ys | 0;
        return F[yi * W + xi];
      };
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 10) % 1 + 1) % 1;
        const ca = Math.cos(TAU * p), sa = Math.sin(TAU * p);
        const ab = 0.5 - 0.5 * Math.cos(TAU * p * 2);
        const split = 0.004 + ab * 0.055;
        const trx = Math.sin(TAU * p * 3) * 2.2 * ab, trY = Math.cos(TAU * p * 3) * 1.1 * ab;
        for (let y = 0; y < H; y++) {
          const uy = y * aspect;
          const flick = 0.93 + 0.07 * Math.sin(y * 0.9 + tt * (TAU / 10) * 6);
          for (let x = 0; x < W; x++) {
            const dx = x - cx, dy = uy - cyU;
            const xr = dx * ca - dy * sa, yr = dx * sa + dy * ca;
            const rS = 1 + split, bS = 1 - split;
            const rV = samp(cx + xr * rS + trx, (cyU + yr * rS + trY) / aspect);
            const gV = samp(cx + xr, (cyU + yr) / aspect);
            const bV = samp(cx + xr * bS - trx, (cyU + yr * bS - trY) / aspect);
            const vig = 1 - (dx * dx + dy * dy) / (maxD * maxD) * 0.45;
            px[y * W + x] = pack(
              (12 + rV * 235) * vig * flick,
              (14 + gV * 230) * vig * flick,
              (20 + bV * 245) * vig * flick,
            );
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-dead-pixels',
    since: '0.3.0',
    title: 'Panel Decay',
    category: 'Glitch & Noise',
    kind: 'scene',
    tags: ['dead pixels', 'lcd', 'stuck pixel', 'panel', 'subpixel', 'decay', 'hardware', 'glitch'],
    order: 250,
    description: 'An ambient gradient plays while the panel dies around it: stuck and dead pixels accumulate, blotches spread, whole lines fail, driver reboots.',
    size: { w: 80, h: 24 },
    minSize: { w: 20, h: 6 },
    loop: 20,
    canvas: 'field',
    palette: 'candy',
    params: SPEED,
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette();
      const rand = ctx.rng;
      const speed = ctx.param('speed', 1);
      const { width: W, height: H, px, aspect } = cv;
      const STUCK = [pack(2, 2, 3), pack(235, 24, 24), pack(26, 225, 40), pack(30, 60, 240), pack(248, 248, 248)];
      const fails = Array.from({ length: Math.max(30, Math.min(700, Math.round(W * H * 0.045))) }, () => {
        const tv = rand();
        return {
          x: Math.floor(rand() * W), y: Math.floor(rand() * H),
          die: 0.9 * 20 * Math.sqrt(rand()),
          type: tv < 0.5 ? 0 : tv < 0.62 ? 1 : tv < 0.72 ? 2 : tv < 0.8 ? 3 : tv < 0.92 ? 4 : 5,
          grow: rand() < 0.14 ? 0.3 + rand() * 0.7 : 0,
        };
      });
      const lines = [
        { col: true, at: Math.floor(rand() * W), die: 9 + rand() * 6, c: pack(60, 200, 220) },
        { col: true, at: Math.floor(rand() * W), die: 11 + rand() * 6, c: pack(230, 70, 160) },
        { col: true, at: Math.floor(rand() * W), die: 13 + rand() * 5, c: pack(4, 4, 6) },
        { col: false, at: Math.floor(rand() * H), die: 14 + rand() * 4, c: pack(4, 4, 6) },
      ];
      return (t) => {
        const tt = t * speed;
        const p = ((tt / 20) % 1 + 1) % 1;
        const pt = p * 20;
        if (p > 0.957) {
          const on = ((tt * 14) | 0) & 1;
          px.fill(on ? pack(3, 3, 4) : pack(14, 14, 18));
          if (!on) for (let x = 0; x < W; x++) px[(H >> 1) * W + x] = pack(120, 124, 132);
          cv.paint(ctx.buffer);
          return;
        }
        const tP = TAU * p;
        for (let y = 0; y < H; y++) {
          const uy = y * aspect;
          for (let x = 0; x < W; x++) {
            const v = 0.5 + 0.3 * Math.sin(x * 0.045 + tP * 2 + Math.sin(uy * 0.06)) + 0.2 * Math.sin(uy * 0.07 - tP * 3);
            px[y * W + x] = pal(clamp01(v));
          }
        }
        for (const ln of lines) {
          if (ln.die > pt) continue;
          const c = ln.c, cr = (c >> 16) & 255, cg = (c >> 8) & 255, cb = c & 255;
          if (ln.col) {
            for (let y = 0; y < H; y++) {
              const i = y * W + ln.at, o = px[i];
              px[i] = pack(((o >> 16) & 255) * 0.25 + cr * 0.75, ((o >> 8) & 255) * 0.25 + cg * 0.75, (o & 255) * 0.25 + cb * 0.75);
            }
          } else {
            for (let x = 0; x < W; x++) {
              const i = ln.at * W + x, o = px[i];
              px[i] = pack(((o >> 16) & 255) * 0.25 + cr * 0.75, ((o >> 8) & 255) * 0.25 + cg * 0.75, (o & 255) * 0.25 + cb * 0.75);
            }
          }
        }
        const fr = (tt * 10) | 0;
        for (const f of fails) {
          if (f.die > pt) continue;
          const c = f.type === 5 ? (hash2(f.x, f.y, fr) > 0.5 ? STUCK[4] : STUCK[0]) : STUCK[f.type];
          if (f.grow > 0) {
            const rad = Math.min(3.5, (pt - f.die) * f.grow);
            const ry = Math.max(0, Math.ceil(rad / aspect));
            for (let dy = -ry; dy <= ry; dy++) {
              for (let dx = -Math.ceil(rad); dx <= Math.ceil(rad); dx++) {
                if (dx * dx + dy * dy * aspect * aspect <= rad * rad) cv.set(f.x + dx, f.y + dy, c);
              }
            }
          } else {
            cv.set(f.x, f.y, c);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
