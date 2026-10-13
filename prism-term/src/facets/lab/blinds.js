// Blinds and tiles: venetian blinds (every slat opening at once), vertical
// blinds swept left to right, a checkerboard in two passes, and square tiles
// that close in a diagonal stagger — the "many small transitions" family.
import { transitionSetup } from './_lab.js';

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const VARIANTS = [
  {
    name: 'blinds · venetian',
    mask: (x, y, p, W, H) => { const slat = Math.max(3, Math.round(H / 6)); return clamp((p * slat - (y % slat)) / 0.8); },
  },
  {
    name: 'blinds · vertical, swept',
    mask: (x, y, p, W) => {
      const slat = Math.max(4, Math.round(W / 10)), k = Math.floor(x / slat) / Math.ceil(W / slat);
      const q = clamp(p * 1.6 - k * 0.6); // later slats start later
      return clamp((q * slat - (x % slat)) / 0.8);
    },
  },
  {
    name: 'tiles · checkerboard, two passes',
    mask: (x, y, p, W, H, asp) => {
      const s = Math.max(3, Math.round(W / 12)), odd = (Math.floor(x / s) + Math.floor((y * asp) / s)) & 1;
      return clamp(p * 2 - odd);
    },
  },
  {
    name: 'tiles · diagonal stagger',
    mask: (x, y, p, W, H, asp) => {
      const s = Math.max(3, Math.round(W / 12)), cx = Math.floor(x / s), cy = Math.floor((y * asp) / s);
      const n = Math.ceil(W / s) + Math.ceil((H * asp) / s), d = (cx + cy) / n;
      const q = clamp((p - d * 0.6) / 0.4); // each tile's own progress
      // Each tile shrinks its A-colored square toward its center.
      const lx = Math.abs((x % s) / s - 0.5), ly = Math.abs((((y * asp) % s) / s) - 0.5);
      return Math.max(lx, ly) > 0.5 * (1 - q) ? 1 : 0;
    },
  },
];

export default {
  id: 'lab-blinds',
  title: 'Blinds & Tiles',
  gallery: 'lab',
  category: 'Transitions',
  kind: 'scene',
  tags: ['transition', 'blinds', 'venetian', 'checkerboard', 'tiles', 'stagger'],
  order: 50,
  description: 'Many small transitions at once: venetian blinds, swept vertical blinds, a checkerboard and diagonally staggered tiles.',
  size: { w: 60, h: 20 },
  minSize: { w: 20, h: 7 },
  loop: VARIANTS.length * 4,
  canvas: 'field',
  palette: 'theme',
  params: {},
  setup: (ctx) => transitionSetup(ctx, VARIANTS),
};
