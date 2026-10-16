// Flow field: particles drift through a slowly evolving curl-noise field (the
// curl of a Perlin potential is divergence-free, so streams swirl without
// collapsing into sinks), painting silky braille trails on a persistent canvas
// that fades toward the background. Hue follows heading, brightness speed.
import { NONE } from '../../color.js';
export default {
  title: 'Flow Field',
  gallery: 'sim',
  category: 'Particles',
  kind: 'scene',
  tags: ['flow field', 'particles', 'noise', 'trails'],
  order: 50,
  description: 'Particles advected through an evolving curl-noise flow field, leaving fading silk trails colored by heading.',
  canvas: 'line',
  palette: 'prism',
  setup(ctx) {
    const cv = ctx.canvas();
    const { width: W, height: H, aspect } = cv;
    const rand = ctx.rng;
    const pal = ctx.palette();
    const { noise3 } = ctx.noise;
    const speedK = ctx.param('speed', 1);
    const Hv = H * aspect;
    const sc = 2.6 / Math.max(W, Hv);
    const spd = Math.min(W, Hv) * 0.16 * speedK;
    const N = Math.max(150, Math.min(2600, Math.round(W * H * 0.012)));
    const X = new Float32Array(N), Y = new Float32Array(N), A = new Float32Array(N), L = new Float32Array(N);
    const spawn = (i) => { X[i] = rand() * W; Y[i] = rand() * Hv; A[i] = 0; L[i] = 2 + rand() * 5; };
    for (let i = 0; i < N; i++) { spawn(i); A[i] = rand() * L[i]; }

    const bg = ctx.bg === NONE ? 0 : ctx.bg;
    const bgR = (bg >> 16) & 255, bgG = (bg >> 8) & 255, bgB = bg & 255;
    const px = cv.px;
    // Fade toward the background color (not black) so old trails never read as
    // dark smudges; pixels that reach the background become transparent again.
    const fade = (k) => {
      for (let i = 0; i < px.length; i++) {
        const c = px[i];
        if (c === NONE) continue;
        const r = bgR + (((c >> 16) & 255) - bgR) * k, g = bgG + (((c >> 8) & 255) - bgG) * k, b = bgB + ((c & 255) - bgB) * k;
        px[i] = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) < 12 ? NONE : (r << 16) | (g << 8) | (b | 0);
      }
    };
    // Ink on paper needs longer trails than light on glass to read.
    const decay = ctx.theme.mode === 'light' ? 0.7 : 1.5;
    const e = 0.75; // finite-difference step, in noise space units ÷ sc
    return (t, dt) => {
      fade(Math.exp(-dt * decay));
      const z = t * 0.07;
      for (let i = 0; i < N; i++) {
        const x0 = X[i], y0 = Y[i];
        const nx = x0 * sc, ny = y0 * sc;
        // Curl of the potential ψ: v = (∂ψ/∂y, −∂ψ/∂x).
        const dpy = noise3(nx, ny + e * sc, z) - noise3(nx, ny - e * sc, z);
        const dpx = noise3(nx + e * sc, ny, z) - noise3(nx - e * sc, ny, z);
        let vx = dpy / (2 * e * sc), vy = -dpx / (2 * e * sc);
        const m = Math.hypot(vx, vy) || 1e-6;
        const sp = Math.min(1.6, 0.35 + m * 0.6);
        vx = (vx / m) * sp; vy = (vy / m) * sp;
        X[i] += vx * spd * dt;
        Y[i] += vy * spd * dt;
        A[i] += dt;
        // Fade in on spawn and out at end of life so respawns never pop.
        const life = Math.min(1, A[i] / 0.6, (L[i] - A[i]) / 0.6);
        if (life <= 0 || X[i] < 0 || X[i] >= W || Y[i] < 0 || Y[i] >= Hv) { spawn(i); continue; }
        const hue = Math.atan2(vy, vx) / (Math.PI * 2) + 0.5;
        const c = pal(hue + t * 0.02);
        const k = Math.min(1, 0.45 + 0.4 * sp) * life;
        const r = bgR + (((c >> 16) & 255) - bgR) * k, g = bgG + (((c >> 8) & 255) - bgG) * k, bl = bgB + ((c & 255) - bgB) * k;
        cv.line(x0, y0 / aspect, X[i], Y[i] / aspect, (r << 16) | (g << 8) | (bl | 0));
      }
      cv.paint(ctx.buffer);
    };
  },
};
