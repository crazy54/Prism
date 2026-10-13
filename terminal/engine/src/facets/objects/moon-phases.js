// The lunar month in a loop: a cratered Moon (maria from fBm, ray craters
// with rims) lit by a Sun that swings around it — new, crescent, quarter,
// gibbous, full and back — with faint earthshine on the night side and the
// phase name and illumination underneath.
import { sphere, starfield, blend } from './_raster.js';
import { ATTR } from '../../buffer.js';

const PHASES = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];

export default {
  title: 'Moon Phases',
  gallery: 'objects',
  category: 'Globes & Planets',
  kind: 'scene',
  tags: ['moon', 'phases', 'lunar', 'craters', 'space'],
  order: 25,
  description: 'A cratered Moon cycling through its phases with earthshine on the dark side and the phase named below.',
  size: { w: 48, h: 22 },
  minSize: { w: 16, h: 8 },
  loop: 16,
  canvas: 'field',
  palette: 'mono',
  params: { month: { default: 16, min: 4, max: 60, label: 'Seconds per lunar month' } },
  setup(ctx) {
    const month = ctx.param('month', 16);
    const showLabel = ctx.height >= 10;
    const rows = showLabel ? ctx.height - 2 : ctx.height;
    const cv = ctx.canvas(undefined, { rows });
    const W = cv.width, H = cv.height, asp = cv.aspect;
    const R = Math.min(W * 0.32, H * asp * 0.42);
    const cx = W / 2, cy = H / 2;
    const stars = starfield(ctx.rng, Math.round((W * H) / 80));
    const noise = ctx.noise;
    const craters = Array.from({ length: 34 }, () => {
      const lon = (ctx.rng() - 0.5) * Math.PI * 1.9, lat = Math.asin(ctx.rng() * 2 - 1) * 0.92;
      return { v: [Math.cos(lat) * Math.sin(lon), Math.sin(lat), -Math.cos(lat) * Math.cos(lon)], r: 0.04 + Math.pow(ctx.rng(), 2.2) * 0.16 };
    });
    // Albedo per surface direction: highlands, darker maria, crater floors and bright rims.
    const albedo = (n) => {
      let a = 0.78 + noise.fbm(n[0] * 2.2 + 3, n[1] * 2.2, n[2] * 2.2, 4) * 0.25;
      const mare = noise.fbm(n[0] * 1.1 - 7, n[1] * 1.1 + 2, n[2] * 1.1, 3);
      if (mare > 0.06) a *= 0.62;
      for (const c of craters) {
        const d = Math.acos(Math.max(-1, Math.min(1, n[0] * c.v[0] + n[1] * c.v[1] + n[2] * c.v[2])));
        if (d < c.r) a *= 0.72 + 0.2 * (d / c.r);
        else if (d < c.r * 1.25) a *= 1.18;
      }
      return Math.max(0.15, Math.min(1.1, a));
    };
    // The Moon is tidally locked, so its face never turns: bake albedo per pixel once.
    const alb = new Float32Array(W * H);
    sphere(cv, null, cx, cy, R, 1, (nx, ny, nz, x, y) => { alb[y * W + x] = albedo([nx, ny, nz]); return 0; });
    const W2 = ctx.width;
    return (t) => {
      cv.clear();
      stars(cv, t, 0.8, ctx.theme.bg);
      const phase = ((t / month + 0.31) % 1 + 1) % 1; // 0 new → 0.5 full; opens on a waxing gibbous
      const ang = phase * Math.PI * 2;
      // Sun direction (towards the light), swinging from behind the Moon to behind the viewer.
      const L = [Math.sin(ang), -0.08, Math.cos(ang)];
      const ll = Math.hypot(...L);
      L[0] /= ll; L[1] /= ll; L[2] /= ll;
      sphere(cv, null, cx, cy, R, 1, (nx, ny, nz, x, y) => {
        const a = alb[y * W + x];
        const d = nx * L[0] + ny * L[1] + nz * L[2];
        const day = Math.max(0, Math.min(1, (d + 0.04) / 0.12)); // soft terminator
        const lambert = Math.max(0, d) * 0.85 + 0.15;
        const lightC = blend(0x000000, 0xf4efe2, Math.min(1, a * lambert * day));
        const earthshine = blend(0x000000, 0x5a6c8c, 0.12 * a * (1 - day));
        return day > 0 ? blend(earthshine, lightC, day) : earthshine;
      });
      cv.paint(ctx.buffer);
      if (showLabel) {
        const idx = Math.round(phase * 8) % 8;
        const illum = Math.round(((1 - Math.cos(ang)) / 2) * 100);
        const label = `${PHASES[idx]} · ${illum}% lit`;
        const x = Math.max(0, Math.floor((W2 - label.length) / 2));
        ctx.buffer.text(x, ctx.height - 1, label.length <= W2 ? label : PHASES[idx], ctx.theme.ink, undefined, ATTR.BOLD);
      }
    };
  },
};
