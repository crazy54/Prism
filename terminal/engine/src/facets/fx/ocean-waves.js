// Open sea at sunset, looking toward the horizon. Every water pixel is a
// point on a sum-of-waves height field seen in perspective: its normal
// reflects the sky (more of it at grazing angles), and where it tilts toward
// the low sun the glitter path flickers. Distant waves fade so nothing aliases.
import { lerpc, clamp01 } from '../retro/_kit.js';

const WAVES = [
  [0.9, 0.42, 0.55, 1.0], [-0.6, 0.8, 0.9, 0.55], [0.2, 1, 1.7, 0.3], [-0.95, 0.3, 2.9, 0.16], [0.7, -0.7, 4.3, 0.09],
].map(([dx, dz, k, a]) => {
  // Deep-water dispersion (ω = √gk), rounded so every wave repeats over the 20 s loop.
  const l = Math.hypot(dx, dz), w = Math.max(1, Math.round((Math.sqrt(9.8 * k) * 1.2 * 20) / (2 * Math.PI))) * ((2 * Math.PI) / 20);
  return { dx: dx / l, dz: dz / l, k, a, w };
});

export default {
  title: 'Ocean at Sunset',
  gallery: 'fx',
  category: 'Fire & Water',
  kind: 'scene',
  tags: ['ocean', 'sea', 'waves', 'sunset', 'reflection', 'glitter', 'water'],
  order: 80,
  description: 'Open sea at sunset in perspective: a height field of waves reflecting the sky, with a flickering sun-glitter path.',
  size: { w: 80, h: 24 },
  minSize: { w: 20, h: 6 },
  loop: 20,
  canvas: 'field',
  palette: 'sunset',
  setup(ctx) {
    const cv = ctx.canvas();
    const pal = ctx.palette(undefined, { size: 512 });
    const { fbm } = ctx.noise;
    const { width: W, height: H, px, aspect } = cv;
    const hz = Math.floor(H * 0.42);
    const sunX = W * 0.5, sunR = Math.min(W * 0.09, hz * aspect * 0.5);
    const sky = (e) => pal(clamp01(0.86 - e * 1.9));                 // elevation 0 = horizon
    const deep = lerpc(pal(0.04), 0x000814, 0.4);
    const clouds = new Float32Array(W * hz);
    // Cloud bands, tiled horizontally (two fbm copies cross-faded) so they can drift forever.
    for (let y = 0; y < hz; y++) for (let x = 0; x < W; x++) {
      const k = x / W, f = (xx) => fbm(xx * 0.03, y * aspect * 0.22, 3.3, 4);
      clouds[y * W + x] = clamp01((f(x) * (1 - k) + f(x - W) * k) * 1.6 - 0.05) * clamp01((y / hz) * 1.6 - 0.15);
    }
    const focal = W * 0.6, camH = 2.2;
    return (t) => {
      const drift = (t / 20) * W;
      // Sky: gradient, banks of cloud lit from below, and a sun sitting on the horizon.
      for (let y = 0; y < hz; y++) {
        const e = (hz - y) / (H * 0.9);
        for (let x = 0; x < W; x++) {
          let c = sky(e);
          const dx = x + 0.5 - sunX, dy = (y + 0.5 - hz + sunR * 0.35 / aspect) * aspect, d = Math.hypot(dx, dy);
          if (d < sunR) c = lerpc(pal(0.97), pal(0.85), clamp01(dy / sunR + 0.5));
          else c = lerpc(c, pal(0.9), clamp01(1 - (d - sunR) / (sunR * 2.5)) * 0.35);
          const cl = clouds[y * W + (Math.floor(x + drift) % W)];
          if (cl > 0) c = lerpc(c, lerpc(pal(0.25), pal(0.75), clamp01(1 - e * 2.5)), Math.min(0.5, cl * 0.7));
          px[y * W + x] = c;
        }
      }
      // Sea.
      for (let y = hz; y < H; y++) {
        const r = y - hz + 0.5, z = (camH * focal) / (r * aspect);
        const fade = clamp01(1 - z / 140);                            // far waves average out to flat
        for (let x = 0; x < W; x++) {
          const wx = ((x + 0.5 - W / 2) * z) / focal;
          let sx = 0, sz = 0, h = 0;
          for (const wv of WAVES) {
            const lod = clamp01(1.4 - (z * wv.k) / 60);
            if (lod <= 0) continue;
            const ph = (wx * wv.dx + z * wv.dz) * wv.k - wv.w * t;
            const a = wv.a * lod * fade;
            h += Math.sin(ph) * a;
            const g = Math.cos(ph) * a * wv.k;
            sx += g * wv.dx; sz += g * wv.dz;
          }
          // Normal, view ray, reflection.
          let nx = -sx * 0.22, ny = 1, nz = -sz * 0.22;
          const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          let vx = wx, vy = -camH, vz = z;
          const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
          const dn = vx * nx + vy * ny + vz * nz;
          const ry = vy - 2 * dn * ny, rx = vx - 2 * dn * nx;
          const fres = 0.25 + 0.75 * Math.pow(1 - Math.max(0, -dn), 4);
          let c = lerpc(deep, sky(Math.min(0.42, Math.max(0, ry) * 0.7)), fres);
          // Sun glitter: reflections that point back at the low sun.
          const toSun = Math.max(0, 1 - Math.hypot((rx - (sunX - W / 2) / focal) * 1.6, ry - 0.04) * 6);
          if (toSun > 0) c = lerpc(c, pal(0.98), Math.min(1, Math.pow(toSun, 2.5) * 2.6));
                    px[y * W + x] = c;
        }
      }
      cv.paint(ctx.buffer);
    };
  },
};
