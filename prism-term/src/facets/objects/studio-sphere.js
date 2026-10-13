// A studio sphere: per-pixel Blinn-Phong with a key light that orbits the
// subject (you see it pass behind), a cool rim light, subtle latitude
// banding, and a floor shadow cast away from the light.
import { sphere, shadow, zbuffer, blend } from './_raster.js';

export default {
  title: 'Studio Sphere',
  gallery: 'objects',
  category: '3D Solids',
  kind: 'scene',
  tags: ['sphere', 'lighting', 'phong', 'rim light', '3d'],
  order: 12,
  description: 'Per-pixel lit sphere with an orbiting key light, cool rim light, soft banding and a moving floor shadow.',
  size: { w: 56, h: 22 },
  minSize: { w: 16, h: 7 },
  loop: 10,
  canvas: 'field',
  palette: 'ocean',
  params: { speed: { default: 1, min: 0.1, max: 4, label: 'Speed' } },
  setup(ctx) {
    const cv = ctx.canvas();
    const z = zbuffer(cv);
    const speed = ctx.param('speed', 1);
    const th = ctx.theme;
    const base = blend(th.accent, th.info, 0.35);
    const rim = blend(th.info, 0xffffff, 0.35);
    const W = cv.width, H = cv.height;
    const r = Math.min(W * 0.2, H * cv.aspect * 0.34);
    const cx = W / 2, cy = H * 0.45;
    return (t) => {
      const tt = t * speed;
      cv.clear();
      z.fill(Infinity);
      const a = tt * 0.7;
      const L = [Math.cos(a) * 0.85, -0.55, -0.55 + Math.sin(a) * 0.45];
      const ll = Math.hypot(...L);
      const l = [L[0] / ll, L[1] / ll, L[2] / ll];
      // Shadow slides away from the light across the floor.
      shadow(cv, cx - l[0] * r * 0.9, cy + r / cv.aspect * 1.18, r * (1.05 + Math.abs(l[0]) * 0.35), Math.max(1.2, (r * 0.22) / cv.aspect), 0.6, th.bg);
      // The light itself: a small glow dot on its orbit (in front or behind).
      const lx = cx + Math.cos(a) * r * 1.65, ly = cy - r * 0.95 / cv.aspect, behind = L[2] > 0;
      const glow = () => { for (let d = 3; d >= 0; d--) cv.circle(lx, ly, 0.6 + d, blend(th.bg, 0xfff2c8, 0.22 + (3 - d) * 0.25), true); };
      if (behind) glow();
      sphere(cv, z, cx, cy, r, 1, (nx, ny, nz) => {
        const n = [nx, ny, nz];
        const diff = Math.max(0, n[0] * l[0] + n[1] * l[1] + n[2] * l[2]);
        // Blinn half-vector with the viewer at -z.
        let hx = l[0], hy = l[1], hz = l[2] - 1;
        const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
        const spec = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 42);
        const fres = Math.pow(1 - Math.abs(nz), 3);
        const band = 0.94 + 0.06 * Math.sin(Math.asin(Math.max(-1, Math.min(1, ny))) * 14);
        let c = blend(0x020306, base, Math.min(1, (0.1 + diff * 0.9) * band));
        c = blend(c, rim, fres * 0.55);
        c = blend(c, 0xffffff, Math.min(1, spec * 0.95));
        return c;
      });
      if (!behind) glow();
      cv.paint(ctx.buffer);
    };
  },
};
