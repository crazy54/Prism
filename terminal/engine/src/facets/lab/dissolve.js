// Dissolves, four ways: a straight cross-fade, an ordered (Bayer 8×8) dither
// dissolve, a random-pixel dissolve, and a noise "burn" whose leading edge
// glows like smouldering paper.
import { transitionSetup } from './_lab.js';
import { mix } from '../../color.js';

const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((v) => (v + 0.5) / 64);
// Integer hash (well mixed, so the random dissolve has no streaks).
const hash = (x, y) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export default {
  id: 'lab-dissolve',
  title: 'Dissolves',
  gallery: 'lab',
  category: 'Transitions',
  kind: 'scene',
  tags: ['transition', 'dissolve', 'cross-fade', 'dither', 'bayer', 'burn'],
  order: 20,
  description: 'Four dissolves between two scenes: cross-fade, ordered Bayer dither, random pixels and a glowing noise burn.',
  size: { w: 60, h: 20 },
  minSize: { w: 20, h: 7 },
  loop: 16,
  canvas: 'field',
  palette: 'theme',
  params: {},
  setup(ctx) {
    const noise = ctx.noise;
    const VARIANTS = [
      { name: 'dissolve · cross-fade', mask: (x, y, p) => p },
      { name: 'dissolve · ordered dither (Bayer 8×8)', mask: (x, y, p) => (p > BAYER[((y | 0) & 7) * 8 + ((x | 0) & 7)] ? 1 : 0) },
      { name: 'dissolve · random pixels', mask: (x, y, p) => (p > hash(x | 0, y | 0) ? 1 : 0) },
      {
        name: 'dissolve · noise burn',
        draw(px, A, B, W, H, asp, p) {
          for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) {
            if (p <= 0) { px[k] = A[k]; continue; }
            if (p >= 1) { px[k] = B[k]; continue; }
            const n = 0.5 + 0.5 * noise.fbm(x * 0.07, y * 0.07 * asp, 0.3, 4);
            const d = p * 1.3 - 0.15 - n;
            if (d > 0.04) px[k] = B[k];
            else if (d > -0.04) px[k] = mix(0xff5a1f, 0xffe08a, 1 - Math.abs(d) / 0.04); // the burning edge
            else if (d > -0.09) px[k] = mix(A[k], 0x2a1206, ((d + 0.09) / 0.05) * 0.8); // scorch
            else px[k] = A[k];
          }
        },
      },
    ];
    return transitionSetup(ctx, VARIANTS);
  },
};
