// A rotating barred-free spiral galaxy built on the density-wave trick: each
// star orbits on an ellipse whose tilt grows with radius, and inner orbits run
// faster (differential rotation). Where neighboring ellipses crowd together
// two spiral arms emerge — and, unlike real winding, they never wrap up.
// The glow is a pre-baked texture of that same star density plus a hot core,
// sampled per pixel through the view transform; stars are added on top.
import { mix, NONE } from '../../color.js';

const EXT = 1.15; // texture half-extent in galaxy units

export default {
  title: 'Spiral Galaxy',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['galaxy', 'spiral', 'stars', 'space'],
  order: 40,
  description: 'Density-wave spiral galaxy — thousands of stars on tilted elliptical orbits with differential rotation, glowing core and dust.',
  canvas: 'field',
  setup(ctx) {
    const cv = ctx.canvas();
    const { width: W, height: H, aspect, px } = cv;
    const rand = ctx.rng;
    const speed = ctx.param('speed', 1);
    const starCol = ctx.palette(['#ffcf9a', '#fff1dd', '#dfe7ff', '#9fb9ff', '#7f9cff']);
    const Hv = H * aspect;
    const incl = 0.62, tilt = -0.3, twist = 4.2;
    const Rg = Math.min(W * 0.47, (Hv * 0.47) / (incl + 0.25 * Math.abs(Math.sin(tilt))));
    const cx = W / 2, cy = H / 2;

    const ecc = (r) => 1 - 0.55 * Math.sqrt(Math.sin(Math.PI * Math.min(1, r)));
    const orbit = (r, th) => {
      const a = r, b = r * ecc(r), ph = r * twist;
      const c = Math.cos(th), s = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
      return [a * c * cp - b * s * sp, a * c * sp + b * s * cp];
    };
    // 75% disk (uniform by area, so the arms carry the mass) + 25% exponential bulge.
    const sampleR = () => (rand() < 0.75 ? Math.sqrt(rand()) : Math.min(1, -Math.log(1 - rand() * 0.98) * 0.12));

    // ── bake the glow texture from the orbit density ──
    const G = 160;
    const dens = new Float32Array(G * G);
    for (let n = 0; n < 70000; n++) {
      const [x, y] = orbit(sampleR(), rand() * Math.PI * 2);
      const ix = Math.floor(((x / EXT) * 0.5 + 0.5) * G), iy = Math.floor(((y / EXT) * 0.5 + 0.5) * G);
      if (ix >= 0 && iy >= 0 && ix < G && iy < G) dens[iy * G + ix]++;
    }
    const tmp = new Float32Array(G * G);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += dens[y * G + Math.min(G - 1, Math.max(0, x + k))];
        tmp[y * G + x] = s / 5;
      }
      for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += tmp[Math.min(G - 1, Math.max(0, y + k)) * G + x];
        dens[y * G + x] = s / 5;
      }
    }
    // Normalize against the disk (not the core spike) so the arms keep contrast.
    let ref = 0;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const gx = ((x + 0.5) / G * 2 - 1) * EXT, gy = ((y + 0.5) / G * 2 - 1) * EXT;
      if (Math.hypot(gx, gy) > 0.3) ref = Math.max(ref, dens[y * G + x]);
    }
    const tex = new Int32Array(G * G);
    // A galaxy is a night-sky object: on light themes it keeps its own deep-space
    // backdrop (additive starlight on pearl would wash out to white).
    const sky = ctx.theme.mode === 'light' ? 0x06070b : NONE;
    const core = 0xffe6b8, disk = 0x8aa6ff, arm = 0xc9a7ff, bg = sky !== NONE ? sky : ctx.bg < 0 ? 0 : ctx.bg;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const gx = ((x + 0.5) / G * 2 - 1) * EXT, gy = ((y + 0.5) / G * 2 - 1) * EXT, r = Math.hypot(gx, gy);
      const d = Math.min(1, dens[y * G + x] / (ref || 1));
      const dust = 0.7 + 0.3 * ctx.noise.fbm(gx * 5, gy * 5, 0.5, 3);
      const kc = Math.exp(-((r / 0.06) ** 2)) * 1.0 + Math.exp(-r / 0.1) * 0.35;
      const kd = Math.pow(d, 1.6) * 0.42 * dust * Math.min(1, r / 0.12);
      const R = ((bg >> 16) & 255) + ((core >> 16) & 255) * kc + ((mix(disk, arm, d) >> 16) & 255) * kd;
      const Gc = ((bg >> 8) & 255) + ((core >> 8) & 255) * kc + ((mix(disk, arm, d) >> 8) & 255) * kd;
      const B = (bg & 255) + (core & 255) * kc + (mix(disk, arm, d) & 255) * kd;
      tex[y * G + x] = kc + kd < 0.012 ? sky : (Math.min(255, R) << 16) | (Math.min(255, Gc) << 8) | Math.min(255, B);
    }

    // ── stars ──
    const NS = Math.max(600, Math.min(9000, Math.round(W * H * 0.22)));
    const SR = new Float32Array(NS), ST = new Float32Array(NS), SW = new Float32Array(NS), SC = new Int32Array(NS);
    for (let i = 0; i < NS; i++) {
      const r = sampleR();
      SR[i] = r;
      ST[i] = rand() * Math.PI * 2;
      SW[i] = (0.55 / Math.pow(0.12 + r, 0.8)) * (0.9 + rand() * 0.2);
      // Bulge stars overlap heavily under additive blending, so keep them faint.
      const b = (0.1 + 0.9 * Math.pow(rand(), 3.5)) * (0.3 + 0.7 * Math.min(1, r / 0.35));
      const c = rand() < 0.035 && r > 0.25 ? 0xff7fb0 : starCol(Math.min(1, r * 0.9 + (rand() - 0.5) * 0.35));
      SC[i] = (((c >> 16) & 255) * b << 16) | (((c >> 8) & 255) * b << 8) | (((c & 255) * b) | 0);
    }
    const FIELD = Math.round(W * H * 0.0025);
    const field = Array.from({ length: FIELD }, () => [rand() * W, rand() * H, mix(bg, 0xcfd8ff, 0.12 + rand() * 0.3)]);

    const ct = Math.cos(tilt), st = Math.sin(tilt);
    return (t) => {
      const rot = t * 0.04 * speed, cr = Math.cos(rot), sr = Math.sin(rot);
      // Glow: inverse-map each pixel into galaxy space and sample the texture.
      for (let y = 0, i = 0; y < H; y++) {
        const y3 = ((y + 0.5 - cy) * aspect) / Rg;
        for (let x = 0; x < W; x++, i++) {
          const x3 = (x + 0.5 - cx) / Rg;
          const x1 = x3 * ct + y3 * st, y1 = (-x3 * st + y3 * ct) / incl;
          const gx = x1 * cr + y1 * sr, gy = -x1 * sr + y1 * cr;
          const ix = Math.floor(((gx / EXT) * 0.5 + 0.5) * G), iy = Math.floor(((gy / EXT) * 0.5 + 0.5) * G);
          px[i] = ix >= 0 && iy >= 0 && ix < G && iy < G ? tex[iy * G + ix] : sky;
        }
      }
      for (const [x, y, c] of field) cv.add(x, y, c);
      // Stars: advance along their ellipse, rotate with the disk, incline, tilt.
      for (let i = 0; i < NS; i++) {
        const [gx, gy] = orbit(SR[i], ST[i] + SW[i] * t * speed);
        const x1 = gx * cr - gy * sr, y1 = (gx * sr + gy * cr) * incl;
        const x3 = x1 * ct - y1 * st, y3 = x1 * st + y1 * ct;
        cv.add(cx + x3 * Rg, cy + (y3 * Rg) / aspect, SC[i]);
      }
      cv.paint(ctx.buffer);
    };
  },
};
