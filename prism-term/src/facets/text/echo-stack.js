// Banners & Fonts — a contour echo: rings traced at even distances around every
// letter flow outward from the face in tiered theme colors, a new one born each
// beat while the oldest fades, like ripples off the type.
import { NONE, mix, mixOklab } from '../../color.js';
import { bannerCanvas, measureBanner } from '../../text/banner.js';
import { MODES } from '../../canvas.js';
import { smoothstep } from '../../easing.js';
import { bannerMode, fitType, canvasLike } from './_text.js';

const shared = { gallery: 'text', category: 'Banners & Fonts', kind: 'text', glyphs: 'unicode', color: 'truecolor', animated: true };

const LOOP = 8;            // seconds — eight beats, so the outward flow closes on itself
const BEAT = 1;            // a new ring leaves the face every beat
const RING = 2, GAP = 1;   // ring width and the keyline between rings, in cell widths
const RINGS = 4;           // visible rings, one per color tier
const EDGE = 0.35;         // soft ring edge (cell widths): sub-cell motion instead of whole-cell jumps

// 1-D squared distance transform (Felzenszwalb & Huttenlocher): d[q] = min_p a·(q−p)² + f[p].
function edt1(f, n, a, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) {
      const p = v[k];
      s = ((f[q] + a * q * q) - (f[p] + a * p * p)) / (2 * a * (q - p));
      if (s > z[k]) break;
      k--;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = a * (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Exact Euclidean distance (in cell widths) from every pixel to the nearest ink pixel; kx/ky = pixel size. */
function distanceField(ink, w, h, kx, ky) {
  const INF = 1e20, n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const g = new Float64Array(w * h), out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = ink[y * w + x] ? 0 : INF;
    edt1(f, h, ky * ky, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1(f, w, kx * kx, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
  }
  return out;
}

const echoStack = {
  ...shared,
  id: 'text-echo-stack',
  since: '0.3.0',
  title: 'Echo Stack',
  tags: ['echo', 'contour', 'ripple', 'rings', 'outline', 'offset', 'retro', 'banner', 'topographic'],
  order: 200,
  loop: LOOP,
  size: { w: 76, h: 18 },
  minSize: { w: 36, h: 9 },
  description: 'Contour echoes ripple off the word: rings traced at even distances around every letter flow outward in tiered theme colors, a new one born each beat as the oldest fades.',
  setup(ctx) {
    const { width: W, height: H, theme: th } = ctx;
    const mode = bannerMode(ctx, 'half');
    const text = String(ctx.param('text', 'ECHO'));
    const { sx: msx, sy: msy } = MODES[mode] || MODES.half;
    // Leave room for the rings: generous margins first, tighter ones on small screens.
    let fit = null;
    for (const [mx, my] of [[18, 5], [12, 4], [8, 3], [4, 2], [2, 1]]) {
      const f = fitType(text, { mode }, Math.max(4, W - mx), Math.max(3, H - my));
      const m = measureBanner(text, { mode, ...f });
      if (m.width <= W - mx && m.height <= H - my) { fit = f; break; }
    }
    fit ||= fitType(text, { mode }, W, H);
    const face = bannerCanvas(text, { ...fit, mode, fill: [th.ink, mixOklab(th.ink, th.accent, 0.35)], direction: 'vertical', theme: th });
    const cv = canvasLike(face, W, H);
    const cw = cv.width, ch = cv.height, N = cw * ch;
    // Cell-aligned placement keeps the letters' own block shapes.
    const ox = Math.floor((cw - face.width) / 2 / msx) * msx, oy = Math.floor((ch - face.height) / 2 / msy) * msy;
    const ink = new Uint8Array(N), faceC = new Int32Array(N).fill(NONE);
    for (let y = 0; y < face.height; y++) for (let x = 0; x < face.width; x++) {
      const c = face.px[y * face.width + x], X = x + ox, Y = y + oy;
      if (c === NONE || X < 0 || Y < 0 || X >= cw || Y >= ch) continue;
      ink[Y * cw + X] = 1; faceC[Y * cw + X] = c;
    }
    const dist = distanceField(ink, cw, ch, 1 / msx, cv.aspect / msx);
    // Mono / no-Unicode: whole cells take one ring value (their mean distance), so rings paint
    // as shaded cells instead of split half blocks.
    const ascii = mode === 'ascii';
    if (ctx.caps.depth === 'mono' || ascii) {
      for (let cy = 0; cy < ch; cy += msy) for (let cx = 0; cx < cw; cx += msx) {
        let sum = 0, k = 0;
        for (let y = cy; y < Math.min(ch, cy + msy); y++) for (let x = cx; x < Math.min(cw, cx + msx); x++) { sum += dist[y * cw + x]; k++; }
        for (let y = cy; y < Math.min(ch, cy + msy); y++) for (let x = cx; x < Math.min(cw, cx + msx); x++) dist[y * cw + x] = sum / k;
      }
    }
    // Four tier colors; each ring keeps the color of the beat it was born on (they cycle), and
    // fades toward the background as it travels out.
    const tiers = [th.warn, th.accent, th.accent2, th.info].map((c) => mixOklab(c, th.bg, th.mode === 'light' ? 0.08 : 0.12));
    const P = RING + GAP, reach = RINGS * P, mid = GAP + RING / 2;
    const level = ascii ? new Float32Array(N) : null; // ring strength per cell, for the 7-bit glyphs
    const RAMP = '..::-'; // light 7-bit ring glyphs, so the '#' letters stay the heaviest thing on screen
    // Mono shades by luminance: rings at half strength and no face flush keep the letters the solid blocks.
    const mono = ctx.caps.depth === 'mono', ringK = mono ? 0.5 : 1;
    return (t) => {
      // Beats since the loop began, quantized so t and t + loop give bit-identical frames.
      const beats = Math.round(((t % LOOP) / BEAT) * 1e6) / 1e6;
      const now = Math.floor(beats), ph = beats - now;
      const pulse = mono ? 0 : 0.32 * Math.exp(-ph * 6); // the face flushes in the color of the ring it is emitting
      const born = tiers[((now % RINGS) + RINGS) % RINGS];
      cv.clear();
      if (level) level.fill(0);
      for (let i = 0; i < N; i++) {
        if (ink[i]) { cv.px[i] = pulse > 0.01 ? mix(faceC[i], born, pulse) : faceC[i]; continue; }
        const d = dist[i];
        if (d > reach || (ascii && d < 1.6)) continue; // 7-bit: a clear cell around the letters keeps them legible
        // ring m is centred where (d − mid)/P − beats = m; it left the face on beat −m
        const x = (d - mid) / P - beats, m = Math.round(x);
        const cover = Math.min(1, Math.max(0, (RING / 2 - Math.abs(x - m) * P) / EDGE + 0.5));
        const age = d / reach;
        const a = ringK * cover * (1 - smoothstep(0.7, 1, age)) * (d < 1.5 ? 0.85 : 1); // the ring hugging the face sits back
        if (a < 0.06) continue;
        const col = mixOklab(tiers[((-m % RINGS) + RINGS) % RINGS], th.bg, age * 0.45);
        cv.px[i] = a >= 0.98 ? col : mix(th.bg, col, a);
        if (level) level[i] = a;
      }
      cv.paint(ctx.buffer, 0, 0);
      if (level) for (let i = 0; i < N; i++) if (level[i] > 0) ctx.buffer.set(i % cw, Math.floor(i / cw), RAMP[Math.min(RAMP.length - 1, Math.floor(level[i] * RAMP.length))]);
    };
  },
};

export default echoStack;
