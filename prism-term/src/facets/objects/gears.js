// A gear train: three spur gears of 16, 10 and 8 teeth meshing at their pitch
// circles, each turning at the ratio it should (and in alternating directions).
// Rendered per pixel from the analytic tooth profile, so every edge is
// anti-aliased: spun-metal highlights that stay put while the gear turns,
// bevelled rims, recessed webs with lightening holes, raised hubs, steel axles
// and a soft drop shadow seen through the holes.
import { blend } from './_raster.js';
import { NONE } from '../../color.js';

const N = [16, 10, 8];
const HOLES = [6, 5, 0];
const METALS = [0xc9a43a, 0xa9b8c8, 0xc8804c];
const LIGHT = Math.atan2(-1, -1); // from the upper left (screen y grows down)

export default {
  title: 'Gear Train',
  gallery: 'objects',
  category: 'Mechanical',
  kind: 'scene',
  tags: ['gears', 'mechanical', 'machine', 'ratio', 'clockwork'],
  order: 10,
  description: 'Three spur gears (16, 10 and 8 teeth) meshing at true ratios, anti-aliased, with spun-metal shading and drop shadows.',
  size: { w: 64, h: 22 },
  minSize: { w: 20, h: 7 },
  loop: 6,
  canvas: 'field',
  palette: 'gold',
  params: { speed: { default: 1, min: 0.1, max: 5, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const speed = ctx.param('speed', 1);
    const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme;
    // Layout in "unit" space (gear 0 pitch radius = 1), then fit and center.
    const r = N.map((n) => n / N[0]);
    const add = 1 / (N[0] / 2); // addendum = one module (2r/N)
    const a01 = -0.42, a12 = 1.2;
    const u0 = [0, 0];
    const u1 = [u0[0] + Math.cos(a01) * (r[0] + r[1]), u0[1] + Math.sin(a01) * (r[0] + r[1])];
    const u2 = [u1[0] + Math.cos(a12) * (r[1] + r[2]), u1[1] + Math.sin(a12) * (r[1] + r[2])];
    const U = [u0, u1, u2];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    U.forEach(([x, y], g) => { const R = r[g] + add; x0 = Math.min(x0, x - R); x1 = Math.max(x1, x + R); y0 = Math.min(y0, y - R); y1 = Math.max(y1, y + R); });
    const unit = Math.min((W - 3) / (x1 - x0), (H * asp - 3) / (y1 - y0));
    const C = U.map(([x, y]) => [W / 2 + (x - (x0 + x1) / 2) * unit, H / 2 + ((y - (y0 + y1) / 2) * unit) / asp]);
    const R = r.map((v) => v * unit);
    const tip = add * unit, root = add * 1.25 * unit;
    const sh = [Math.max(1, unit * 0.05), Math.max(1, (unit * 0.05) / asp)]; // shadow offset (px)

    // Tooth profile radius at angle a (gear-local): root land, flank, tip land.
    const prof = (g, a) => {
      const u = (a * N[g]) / (Math.PI * 2);
      const f = Math.abs(u - Math.round(u));
      if (f < 0.17) return R[g] + tip;
      if (f < 0.31) return R[g] + tip - ((f - 0.17) / 0.14) * (tip + root);
      return R[g] - root;
    };
    // Coverage of gear g at a point (dx, dy in horizontal-pixel units from its center).
    const cover = (g, dx, dy, ang) => {
      const d = Math.hypot(dx, dy);
      if (d > R[g] + tip + 1) return 0;
      const a = Math.atan2(dy, dx) - ang[g];
      let c = Math.min(1, Math.max(0, prof(g, a) - d + 0.5));
      if (c > 0 && HOLES[g]) {
        const step = (Math.PI * 2) / HOLES[g];
        const s = a - Math.round(a / step) * step;
        const hx = d * Math.cos(s) - R[g] * 0.58, hy = d * Math.sin(s);
        c *= Math.min(1, Math.max(0, Math.hypot(hx, hy) - R[g] * 0.15 + 0.5));
      }
      return c;
    };
    const shade = (g, dx, dy, ang) => {
      const d = Math.hypot(dx, dy) + 1e-6, Rg = R[g], a = Math.atan2(dy, dx);
      const facing = Math.cos(a - LIGHT); // +1 on the edge nearest the light
      // Spun finish: a bright bow-tie streak aimed at the light, fixed on screen.
      let k = 0.5 + 0.34 * Math.pow(Math.abs(facing), 10) + 0.08 * facing;
      const local = a - ang[g];
      const edge = prof(g, local) - d;
      if (edge < 1.4) k += 0.32 * facing; // bevelled outline (teeth and rim)
      const web0 = Rg * 0.32, web1 = Rg - root - Rg * 0.12;
      if (HOLES[g] && d > web0 && d < web1) {
        k -= 0.14; // recessed web
        if (d - web0 < 1.1) k -= 0.2 * facing; // inner wall of the recess
        if (web1 - d < 1.1) k += 0.2 * facing; // outer wall
        const step = (Math.PI * 2) / HOLES[g];
        const s = local - Math.round(local / step) * step;
        const hx = d * Math.cos(s) - Rg * 0.58, hy = d * Math.sin(s);
        if (Math.hypot(hx, hy) - Rg * 0.15 < 1.2) k += 0.22 * Math.cos(Math.atan2(hy, hx) + a - s + Math.PI - LIGHT); // hole wall
      }
      if (d < Rg * 0.26) {
        k += 0.1; // raised hub
        if (Rg * 0.26 - d < 1.1) k += 0.3 * facing;
      }
      if (d < Rg * 0.1) return blend(0x2a2e33, 0xe8eef4, Math.max(0, 0.35 + 0.5 * facing * (d / (Rg * 0.1)))); // steel axle
      if (d < Rg * 0.14) return blend(0x000000, METALS[g], 0.22); // bore
      return k <= 1 ? blend(0x000000, METALS[g], Math.max(0.08, k)) : blend(METALS[g], 0xffffff, Math.min(0.85, k - 1));
    };

    return (t) => {
      cv.clear();
      // Gear 0 turns half a revolution per loop; the others follow by rolling
      // contact: θb = -(Na/Nb)(θa - α) + α + π - π/Nb (a tooth of a along α sits in a gap of b).
      const follow = (ta, na, nb, alpha) => -(na / nb) * (ta - alpha) + alpha + Math.PI - Math.PI / nb;
      const ang = [(t * speed * Math.PI) / 6];
      ang[1] = follow(ang[0], N[0], N[1], a01);
      ang[2] = follow(ang[1], N[1], N[2], a12);
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        let col = NONE, best = 0;
        let shadowC = 0;
        for (let g = 0; g < 3; g++) {
          const dx = px + 0.5 - C[g][0], dy = (py + 0.5 - C[g][1]) * asp;
          const c = cover(g, dx, dy, ang);
          if (c > best) { best = c; col = shade(g, dx, dy, ang); }
          shadowC = Math.max(shadowC, cover(g, dx - sh[0], dy - sh[1] * asp, ang));
        }
        if (best <= 0 && shadowC <= 0) continue;
        const under = shadowC > 0 ? blend(th.bg, 0x000000, 0.45 * shadowC) : th.bg;
        cv.set(px, py, best >= 1 ? col : best > 0 ? blend(under, col, best) : under);
      }
      cv.paint(ctx.buffer);
    };
  },
};
