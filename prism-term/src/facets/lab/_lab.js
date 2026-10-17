// Shared pieces for the Animation Lab: a time-cycler, clipped labels, panel
// grids in cells, a canvas-pixel ↔ cell mapper, and the two scenes every
// transition study cuts between (a daybreak landscape and a night skyline),
// rendered per pixel into plain Int32Arrays so transitions can mask them.
import { mix, NONE } from '../../color.js';
import { easing } from '../../easing.js';

/** Which step of an n-step cycle of `dur` seconds t falls in, and how far through it (0…1). */
export function cycle(t, n, dur) {
  const T = n * dur, tl = ((t % T) + T) % T, i = Math.min(n - 1, Math.floor(tl / dur));
  return { i, f: (tl - i * dur) / dur };
}

/** Text clipped to the surface (and to maxW), never wrapping. */
export function put(buf, x, y, s, fg, bg, attr, maxW = Infinity) {
  if (y < 0 || y >= buf.height || x >= buf.width) return;
  let str = String(s);
  if (x < 0) { str = str.slice(-x); x = 0; }
  str = str.slice(0, Math.max(0, Math.min(maxW, buf.width - x)));
  if (str) buf.text(x, y, str, fg, bg, attr);
}

/** Split a w×h cell area into cols×rows panels separated by `gap` cells. */
export function grid(w, h, cols, rows, gapX = 1, gapY = 1, x0 = 0, y0 = 0) {
  const pw = Math.floor((w - gapX * (cols - 1)) / cols), ph = Math.floor((h - gapY * (rows - 1)) / rows);
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: x0 + c * (pw + gapX), y: y0 + r * (ph + gapY), w: pw, h: ph });
  return out;
}

/** Cell rect → canvas pixel rect for a canvas `cv` (works in any canvas mode). */
export const pxRect = (cv, r) => ({ x: r.x * cv.sx, y: r.y * cv.sy, w: r.w * cv.sx, h: r.h * cv.sy });

/** A short eased A→B→A schedule: hold, go, hold, come back. Returns progress 0…1 toward B. */
export function pingPongProgress(f, ease, hold = 0.18) {
  const g = (1 - 2 * hold) / 2; // each move takes this share of the cycle
  if (f < hold / 2) return 0;
  if (f < hold / 2 + g) return ease((f - hold / 2) / g);
  if (f < hold * 1.5 + g) return 1;
  if (f < hold * 1.5 + 2 * g) return 1 - ease((f - hold * 1.5 - g) / g);
  return 0;
}

const hash = (x, y) => ((((x * 374761393) ^ (y * 668265263)) >>> 0) % 10007) / 10007;

/**
 * The two transition scenes. Each is a function (out, t) that fills `out`
 * (Int32Array, W×H canvas pixels) with an opaque picture.
 */
export function scenes(W, H, asp, rng) {
  // A: daybreak — graded sky, a haloed sun, drifting clouds, two hill ridges.
  const clouds = Array.from({ length: 4 }, () => ({ x: rng(), y: 0.12 + rng() * 0.3, w: 0.12 + rng() * 0.12, s: 0.01 + rng() * 0.015 }));
  const hill = (x, k) => H * (0.62 + k * 0.12) + Math.sin(x * (0.06 + k * 0.03) + k * 2) * H * 0.06 + Math.sin(x * 0.17 + k) * H * 0.02;
  const day = (out, t) => {
    const sx = W * 0.7, sy = H * 0.34, sr = Math.min(W, H * asp) * 0.11;
    for (let y = 0; y < H; y++) {
      const sky = mix(0x2f6fd0, 0xffcf8f, Math.pow(y / H, 1.4));
      for (let x = 0; x < W; x++) {
        let c = sky;
        const d = Math.hypot(x - sx, (y - sy) * asp) / sr;
        if (d < 1) c = mix(0xfff1b8, 0xffe07a, d);
        else if (d < 3) c = mix(c, 0xfff1b8, 0.5 * Math.pow(1 - (d - 1) / 2, 2));
        for (const cl of clouds) {
          const cx = (((cl.x + t * cl.s) % 1.3) - 0.15) * W, cy = cl.y * H, cw = cl.w * W;
          const q = ((x - cx) / cw) ** 2 + ((y - cy) / (cw * 0.28 / asp)) ** 2;
          if (q < 1) c = mix(c, 0xffffff, 0.85 * (1 - q * q));
        }
        if (y > hill(x, 0)) c = mix(0x3f8f4a, 0x2a6b36, (y - hill(x, 0)) / (H * 0.4));
        if (y > hill(x, 1)) c = mix(0x2f7a3a, 0x1d4d26, (y - hill(x, 1)) / (H * 0.3));
        out[y * W + x] = c;
      }
    }
  };
  // B: night — deep sky, twinkling stars, a crescent moon, a skyline with lit windows.
  const stars = Array.from({ length: Math.round((W * H) / 60) }, () => ({ x: Math.floor(rng() * W), y: Math.floor(rng() * H * 0.6), p: rng() * 6.28 }));
  const towers = [];
  for (let x = 0; x < W;) {
    const w = Math.max(3, Math.round(W * (0.05 + rng() * 0.06))), h = H * (0.22 + rng() * 0.38);
    towers.push({ x, w, top: H - h, seed: Math.floor(rng() * 1e6) });
    x += w + (rng() < 0.3 ? 1 : 0);
  }
  const sky = new Int32Array(H);
  for (let y = 0; y < H; y++) sky[y] = mix(0x070b1f, 0x2a2c66, Math.pow(y / H, 1.6));
  const night = (out, t) => {
    for (let y = 0; y < H; y++) out.fill(sky[y], y * W, (y + 1) * W);
    for (const s of stars) out[s.y * W + s.x] = mix(sky[s.y], 0xe8ecff, 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + s.p)));
    const mx = W * 0.22, my = H * 0.26, mr = Math.min(W, H * asp) * 0.09;
    for (let y = Math.floor(my - mr / asp - 1); y <= my + mr / asp + 1; y++) for (let x = Math.floor(mx - mr - 1); x <= mx + mr + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x - mx, (y - my) * asp), d2 = Math.hypot(x - mx - mr * 0.45, (y - my + mr * 0.15 / asp) * asp);
      if (d < mr && d2 > mr * 0.85) out[y * W + x] = 0xf4f1d0;
    }
    for (const tw of towers) {
      for (let y = Math.max(0, Math.floor(tw.top)); y < H; y++) for (let x = tw.x; x < Math.min(W, tw.x + tw.w); x++) {
        const lx = x - tw.x, ly = y - Math.floor(tw.top);
        const win = lx > 0 && lx < tw.w - 1 && ly > 0 && lx % 2 === 1 && ly % 2 === 1;
        const on = win && hash(x + tw.seed, y) < 0.45 + 0.1 * Math.sin(t * 0.7 + tw.seed);
        out[y * W + x] = on ? mix(0xffc861, 0xfff0b0, hash(x, y + tw.seed)) : mix(0x10142a, 0x1c2140, lx / tw.w);
      }
    }
  };
  return { day, night };
}

/** Composite two scene buffers through a mask (0 = A, 1 = B) into the canvas pixels. */
export function composite(px, A, B, n, mask) {
  for (let i = 0; i < n; i++) {
    const m = mask(i);
    px[i] = m <= 0 ? A[i] : m >= 1 ? B[i] : mix(A[i], B[i], m);
  }
}

export { NONE };

/**
 * Shared engine for the transition studies: cycles through `variants`, each
 * going day → night → day with an eased hold-move-hold schedule, and labels
 * the one on screen. A variant is { name, mask(x, y, p, W, H, asp) → 0…1 }
 * or { name, draw(px, A, B, W, H, asp, p) } for moves that resample.
 */
export function transitionSetup(ctx, variants, { dur = 4, ease = easing.inOutCubic } = {}) {
  const label = ctx.height >= 8;
  const cv = ctx.canvas('field', { rows: label ? ctx.height - 1 : ctx.height });
  const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme;
  const { day, night } = scenes(W, H, asp, ctx.rng);
  const A = new Int32Array(W * H), B = new Int32Array(W * H);
  return (t) => {
    const { i, f } = cycle(t, variants.length, dur);
    const v = variants[i];
    const p = pingPongProgress(f, v.ease || ease);
    day(A, t); night(B, t);
    if (v.draw) v.draw(cv.px, A, B, W, H, asp, p);
    else for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) {
      const m = p <= 0 ? 0 : p >= 1 ? 1 : v.mask(x + 0.5, y + 0.5, p, W, H, asp);
      cv.px[k] = m <= 0 ? A[k] : m >= 1 ? B[k] : mix(A[k], B[k], m);
    }
    cv.paint(ctx.buffer);
    if (label) {
      const name = `${i + 1}/${variants.length}  ${v.name}`;
      put(ctx.buffer, 1, ctx.height - 1, name, th.ink, undefined, undefined, ctx.width - 2);
      const pct = `${Math.round(p * 100)}%`.padStart(4);
      if (ctx.width > name.length + 8) put(ctx.buffer, ctx.width - 5, ctx.height - 1, pct, th.muted);
    }
  };
}
