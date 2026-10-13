// Irises: the old cinema in-camera trick. A circle opening on the scene
// beneath, a diamond, a five-pointed star, and a circle that opens on — and
// then closes back to — a point of interest instead of the center.
import { transitionSetup } from './_lab.js';

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Signed distance to a five-pointed star of radius r (iq), y up.
function star(x, y, r) {
  const k1x = 0.809016994375, k1y = -0.587785252292, k2x = -k1x, k2y = k1y;
  x = Math.abs(x);
  let d = 2 * Math.max(k1x * x + k1y * y, 0); x -= d * k1x; y -= d * k1y;
  d = 2 * Math.max(k2x * x + k2y * y, 0); x -= d * k2x; y -= d * k2y;
  x = Math.abs(x); y -= r;
  const bax = 0.5 * -k1y, bay = 0.5 * k1x - 1;
  const h = Math.min(Math.max((x * bax + y * bay) / (bax * bax + bay * bay), 0), r);
  return Math.hypot(x - bax * h, y - bay * h) * Math.sign(y * bax - x * bay);
}
const VARIANTS = [
  { name: 'iris · circle', mask: (x, y, p, W, H, asp) => { const R = Math.hypot(W / 2, (H / 2) * asp) * 1.05 * p; return clamp((R - Math.hypot(x - W / 2, (y - H / 2) * asp)) / 1.5 + 0.5); } },
  { name: 'iris · diamond', mask: (x, y, p, W, H, asp) => { const R = (W / 2 + (H / 2) * asp) * 1.02 * p; return clamp((R - Math.abs(x - W / 2) - Math.abs((y - H / 2) * asp)) / 1.5 + 0.5); } },
  { name: 'iris · star', mask: (x, y, p, W, H, asp) => { const R = Math.hypot(W, H * asp) * 1.6 * p; return clamp(-star(x - W / 2, -(y - H / 2) * asp, R) / 1.5 + 0.5); } },
  { name: 'iris · on a point of interest', mask: (x, y, p, W, H, asp) => { const cx = W * 0.22, cy = H * 0.26, R = Math.hypot(W, H * asp) * p; return clamp((R - Math.hypot(x - cx, (y - cy) * asp)) / 1.5 + 0.5); } },
];

export default {
  id: 'lab-iris',
  title: 'Irises',
  gallery: 'lab',
  category: 'Transitions',
  kind: 'scene',
  tags: ['transition', 'iris', 'iris in', 'iris out', 'cinema', 'mask'],
  order: 30,
  description: 'Cinema irises between two scenes: circle, diamond, five-pointed star, and one that opens on a point of interest.',
  size: { w: 60, h: 20 },
  minSize: { w: 20, h: 7 },
  loop: VARIANTS.length * 4,
  canvas: 'field',
  palette: 'theme',
  params: {},
  setup: (ctx) => transitionSetup(ctx, VARIANTS),
};
