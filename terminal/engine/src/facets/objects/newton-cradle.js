// Newton's cradle: five chrome balls on strings. The end ball swings in on a
// pendulum arc, the momentum passes through the row, and the far ball swings
// out — with a glint at each strike, faint motion ghosts on the moving balls,
// chrome that reflects a studio sky and floor, and a brushed-steel frame.
import { sphere, blend } from './_raster.js';
import { NONE } from '../../color.js';

const BALLS = 5;
const PERIOD = 1.6; // seconds for a full right → left exchange and back
const AMP = 0.55;   // swing amplitude (radians)

export default {
  title: "Newton's Cradle",
  gallery: 'objects',
  category: 'Mechanical',
  kind: 'scene',
  tags: ['newton', 'cradle', 'pendulum', 'momentum', 'chrome', 'desk toy'],
  order: 40,
  description: 'Five chrome balls on strings trading momentum on pendulum arcs, with strike glints and motion ghosts.',
  size: { w: 64, h: 20 },
  minSize: { w: 36, h: 10 },
  loop: PERIOD * 5,
  canvas: 'field',
  palette: 'ice',
  params: {},
  setup(ctx) {
    const cv = ctx.canvas();
    const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme;
    const HP = H * asp; // canvas height in horizontal-pixel units
    // Fit: the row plus both swings across the width; strings and ball down the height.
    const rb = Math.max(1.4, Math.min(HP / 9.5, W / (2 * BALLS + 2 * Math.sin(AMP) * 5.6 + 3.6)));
    const Ls = Math.min(rb * 5.6, HP - rb * 3.4);
    const pivotY = Math.max(1, (HP - (Ls + rb * 1.8)) / 2);
    const cx = W / 2;
    const reach = (BALLS - 1) * rb + Math.sin(AMP) * Ls + rb;
    const steel = blend(th.muted, 0x9aa4ae, 0.5);
    const env = (rx, ry) => {
      // Chrome: a graded sky with a softbox, a thin dark horizon, a graded floor.
      if (ry < -0.04) return blend(blend(0x4f6a88, 0xeef4ff, Math.min(1, -ry * 0.95)), 0xffffff, Math.pow(Math.max(0, -rx * 0.5 - ry * 0.85), 12));
      if (ry < 0.07) return 0x161b22;
      return blend(0x262b31, 0x8d939b, Math.min(1, (ry - 0.07) * 1.4));
    };
    const ballAt = (i, a) => {
      const x0 = cx + (i - (BALLS - 1) / 2) * rb * 2;
      return [x0 + Math.sin(a) * Ls, pivotY + Math.cos(a) * Ls, x0];
    };
    // The right ball swings out and back on the first half, the left on the second.
    const angle = (i, p) => {
      const v = Math.sin(p * Math.PI * 2);
      if (i === BALLS - 1) return v > 0 ? AMP * v : 0;
      if (i === 0) return v < 0 ? AMP * v : 0;
      return 0;
    };

    return (t) => {
      cv.clear();
      const ph = (((t % PERIOD) + PERIOD) % PERIOD) / PERIOD;
      // Frame: top bar, two posts, base.
      const barY = pivotY / asp, baseY = (pivotY + Ls + rb * 1.6) / asp;
      const fx0 = cx - reach - rb * 0.8, fx1 = cx + reach + rb * 0.8;
      for (let x = Math.floor(fx0); x <= Math.ceil(fx1); x++) {
        const k = 0.75 + 0.12 * Math.sin(x * 0.9);
        cv.set(x, barY, blend(0x000000, steel, k));
        cv.set(x, baseY, blend(0x000000, steel, k * 0.85));
        if (rb > 2.5) cv.set(x, baseY + 1, blend(0x000000, steel, 0.45));
      }
      for (let y = Math.floor(barY); y <= Math.ceil(baseY); y++) { cv.set(fx0, y, blend(0x000000, steel, 0.7)); cv.set(fx1, y, blend(0x000000, steel, 0.55)); }
      // Soft contact shadows on the base, under wherever each ball is.
      if (rb > 2.5) for (let i = 0; i < BALLS; i++) {
        const [bx] = ballAt(i, angle(i, ph));
        for (let x = Math.floor(bx - rb); x <= Math.ceil(bx + rb); x++) {
          const k = 1 - Math.abs(x + 0.5 - bx) / rb;
          if (k > 0) cv.set(x, baseY - 1, blend(th.bg, 0x000000, 0.35 * k));
        }
      }
      // Strings, then motion ghosts, then the balls.
      const stringC = blend(th.bg, th.muted, 0.75);
      for (let i = 0; i < BALLS; i++) {
        const a = angle(i, ph), [bx, by, x0] = ballAt(i, a);
        cv.line(x0, barY, bx - Math.sin(a) * rb * 0.9, (by - rb * 0.9 * Math.cos(a)) / asp, stringC);
      }
      for (const i of [0, BALLS - 1]) {
        for (let g = 3; g >= 1; g--) {
          const a = angle(i, ph - g * 0.018);
          if (Math.abs(a - angle(i, ph)) < 0.04) continue;
          const [bx, by] = ballAt(i, a);
          sphere(cv, null, bx, by / asp, rb * 0.92, 0, () => blend(th.bg, 0x9fc2e6, 0.1 + 0.05 * (3 - g)));
        }
      }
      for (let i = 0; i < BALLS; i++) {
        const [bx, by] = ballAt(i, angle(i, ph));
        sphere(cv, null, bx, by / asp, rb, 0, (nx, ny, nz) => {
          let c = env(-2 * nz * nx, -2 * nz * ny); // reflect the view ray (0, 0, 1) about n
          c = blend(c, 0xffffff, Math.pow(Math.max(0, -nx * 0.45 - ny * 0.6 - nz * 0.66), 40));
          return blend(c, 0x000000, 0.35 * (1 + nz * 1.2)); // darken toward the limb
        });
      }
      // A glint where the returning ball strikes the row (ph ≈ 0 on the left, 0.5 on the right).
      for (const hit of [0, 0.5]) {
        let d = Math.abs(ph - hit); d = Math.min(d, 1 - d);
        if (d > 0.05) continue;
        const k = 1 - d / 0.05, side = hit === 0 ? -1 : 1;
        const [bx, by] = ballAt(side < 0 ? 0 : BALLS - 1, 0);
        const gx = bx - side * rb, gy = by / asp, gr = Math.max(1.2, rb * 0.9);
        for (let y = Math.floor(gy - gr / asp); y <= Math.ceil(gy + gr / asp); y++) for (let x = Math.floor(gx - gr); x <= Math.ceil(gx + gr); x++) {
          const r = Math.hypot(x + 0.5 - gx, (y + 0.5 - gy) * asp) / gr;
          if (r >= 1) continue;
          const old = cv.get(x, y);
          cv.set(x, y, blend(old === NONE ? th.bg : old, 0xfff4c2, k * (1 - r) * (1 - r)));
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
