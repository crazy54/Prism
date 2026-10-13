// Slides: the moves every UI uses. Push (the new scene shoves the old one
// out), cover (it slides over the top), reveal (the old one slides away), and
// a vertical push — each eased out so it lands softly.
import { transitionSetup } from './_lab.js';
import { easing } from '../../easing.js';

const VARIANTS = [
  {
    name: 'slide · push left',
    draw(px, A, B, W, H, asp, p) {
      const o = Math.round(p * W);
      for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) px[k] = x + o < W ? A[y * W + x + o] : B[y * W + x + o - W];
    },
  },
  {
    name: 'slide · cover from the right',
    draw(px, A, B, W, H, asp, p) {
      const e = Math.round((1 - p) * W);
      for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) px[k] = x >= e ? B[y * W + x - e] : A[k];
    },
  },
  {
    name: 'slide · reveal (old scene slides away)',
    draw(px, A, B, W, H, asp, p) {
      const o = Math.round(p * W);
      for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) px[k] = x + o < W ? A[y * W + x + o] : B[k];
    },
  },
  {
    name: 'slide · push up',
    draw(px, A, B, W, H, asp, p) {
      const o = Math.round(p * H);
      for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) px[k] = y + o < H ? A[(y + o) * W + x] : B[(y + o - H) * W + x];
    },
  },
];

export default {
  id: 'lab-slide',
  title: 'Slides & Pushes',
  gallery: 'lab',
  category: 'Transitions',
  kind: 'scene',
  tags: ['transition', 'slide', 'push', 'cover', 'reveal', 'ui motion'],
  order: 40,
  description: 'Slide transitions between two scenes: push, cover, reveal and a vertical push, each eased out to land softly.',
  size: { w: 60, h: 20 },
  minSize: { w: 20, h: 7 },
  loop: VARIANTS.length * 4,
  canvas: 'field',
  palette: 'theme',
  params: {},
  setup: (ctx) => transitionSetup(ctx, VARIANTS, { ease: easing.outCubic }),
};
