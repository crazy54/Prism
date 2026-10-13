// A gas giant with a tilted ring system: noise-warped cloud bands that
// rotate, a soft terminator, the ring split by the planet (back half hidden,
// front half crossing the disk), the planet's shadow falling across the ring,
// and a twinkling starfield behind it all.
import { sphere, starfield, blend } from './_raster.js';
import { gradient, NONE } from '../../color.js';

export default {
  title: 'Ringed Planet',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['planet', 'saturn', 'rings', 'space', '3d'],
  order: 20,
  description: 'A banded gas giant turning under a tilted ring system, with the planet shadowing its own rings.',
  size: { w: 72, h: 24 },
  minSize: { w: 20, h: 7 },
  loop: 20,
  canvas: 'field',
  palette: 'gold',
  params: { tilt: { default: 0.32, min: 0.08, max: 0.7, label: 'Ring tilt' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const tilt = ctx.param('tilt', 0.32);
    const W = cv.width, H = cv.height, asp = cv.aspect;
    const R = Math.min(W * 0.16, H * asp * 0.3);
    const cx = W / 2, cy = H / 2;
    const stars = starfield(ctx.rng, Math.round((W * H) / 70));
    const bands = ctx.params.palette ? ctx.palette() : gradient(['#5b3a1e', '#c9925a', '#f3d8a8', '#b06a3a', '#e8c594', '#7a4b2a', '#f6e2bd', '#a8693d']);
    const ringPal = gradient(['#6b5a45', '#d8c39b', '#efe1c0', '#8a7357', '#cdb68c', '#5d4e3c']);
    const noise = ctx.noise;
    const L = (() => { const v = [-0.82, -0.18, -0.55]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
    const sinT = Math.sin(tilt), cosT = Math.cos(tilt);
    const rin = R * 1.35, rout = R * 2.25;

    // Ring sample at canvas pixel; returns color or NONE, and which half it's in.
    const ringAt = (x, y) => {
      const dx = x + 0.5 - cx, dy = ((y + 0.5 - cy) * asp);
      // In-plane coordinates: the ring plane is tilted about the x axis.
      const u = dx, v = dy / sinT;
      const rr = Math.hypot(u, v);
      if (rr < rin || rr > rout) return null;
      const f = (rr - rin) / (rout - rin);
      // Cassini division and fine ringlets.
      // Cassini division, a few broad ringlets, soft inner and outer edges.
      const gap = 1 - 0.85 * Math.exp(-Math.pow((f - 0.62) / 0.03, 2));
      const dens = gap * (0.7 + 0.3 * Math.sin(f * 17 + 0.6)) * Math.min(1, f / 0.08, (1 - f) / 0.06);
      // Planet shadow: ring points on the far side of the planet from the light.
      const P = [u, v * sinT, -v * cosT];
      const along = P[0] * L[0] + P[1] * L[1] + P[2] * L[2];
      const perp = Math.hypot(P[0] - along * L[0], P[1] - along * L[1], P[2] - along * L[2]);
      const shade = along < 0 && perp < R ? 0.22 : 1;
      return { c: blend(0x000000, ringPal(f), Math.min(1, shade * 1.05)), front: v > 0, a: dens };
    };

    return (t) => {
      cv.clear();
      stars(cv, t, 0.9, ctx.theme.bg);
      const rot = t * 0.18;
      const x0 = Math.max(0, Math.floor(cx - rout)), x1 = Math.min(W - 1, Math.ceil(cx + rout));
      const y0 = Math.max(0, Math.floor(cy - (rout * sinT) / asp) - 1), y1 = Math.min(H - 1, Math.ceil(cy + (rout * sinT) / asp) + 1);
      const ringPass = (front) => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const s = ringAt(x, y);
          if (!s || s.front !== front || s.a < 0.05) continue;
          const i = y * W + x;
          const under = cv.px[i] === NONE ? ctx.theme.bg : cv.px[i];
          cv.px[i] = blend(under, s.c, Math.min(1, s.a * 0.95));
        }
      };
      ringPass(false);
      sphere(cv, null, cx, cy, R, 1, (nx, ny, nz) => {
        // Rotate the surface under the bands (longitude), tilt with the rings.
        const lat = Math.asin(Math.max(-1, Math.min(1, ny * cosT + nz * sinT)));
        const lon = Math.atan2(nx, ny * sinT - nz * cosT) + rot;
        const warp = noise.fbm(Math.cos(lon) * 1.6, lat * 5, Math.sin(lon) * 1.6, 3) * 0.22;
        const f = ((lat / Math.PI + 0.5) * 3.2 + warp) % 1;
        const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const k = Math.min(1, 0.05 + Math.pow(diff, 0.8) * 1.05);
        const limb = 0.75 + 0.25 * Math.pow(-nz, 0.4);
        return blend(0x000000, bands((f + 1) % 1), k * limb);
      });
      ringPass(true);
      cv.paint(ctx.buffer);
    };
  },
};
