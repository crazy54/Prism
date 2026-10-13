// Wipes, four ways, between a daybreak and a night skyline: a soft-edged
// linear wipe, a diagonal, a clock (radial sweep) and barn doors. Each runs
// day → night and back on an eased hold-move-hold beat.
import { transitionSetup } from './_lab.js';

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const VARIANTS = [
  { name: 'wipe · linear, soft edge', mask: (x, y, p, W) => { const soft = W * 0.08, e = p * (W + soft * 2) - soft; return clamp((e - x) / soft + 0.5); } },
  { name: 'wipe · diagonal', mask: (x, y, p, W, H, asp) => { const u = x + y * asp, span = W + H * asp, soft = span * 0.05, e = p * (span + soft * 2) - soft; return clamp((e - u) / soft + 0.5); } },
  { name: 'wipe · clock', mask: (x, y, p, W, H, asp) => { const a = (Math.atan2(x - W / 2, -(y - H / 2) * asp) / (Math.PI * 2) + 1) % 1; return clamp((p * 1.04 - a) / 0.04); } },
  { name: 'wipe · barn doors', mask: (x, y, p, W) => { const u = Math.abs(x - W / 2) / (W / 2), soft = 0.06; return clamp((p * (1 + soft * 2) - soft - u) / soft + 0.5); } },
];

export default {
  id: 'lab-wipe',
  title: 'Wipes',
  gallery: 'lab',
  category: 'Transitions',
  kind: 'scene',
  tags: ['transition', 'wipe', 'clock wipe', 'barn doors', 'soft edge', 'scene change'],
  order: 10,
  description: 'Four wipes between a daybreak and a night skyline: soft linear, diagonal, clock sweep and barn doors.',
  size: { w: 60, h: 20 },
  minSize: { w: 20, h: 7 },
  loop: VARIANTS.length * 4,
  canvas: 'field',
  palette: 'theme',
  params: {},
  setup: (ctx) => transitionSetup(ctx, VARIANTS),
};
