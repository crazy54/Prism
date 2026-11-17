// Fire & Water — two close-up night moods: rain runnels wandering down a
// window over city bokeh, and embers drifting on the wind above a dying bed
// of coals.
import { mix, scale } from '../../color.js';
import { clamp } from '../../easing.js';

const TAU = Math.PI * 2;

export default [
  {
    id: 'fx-rain-on-glass',
    since: '0.3.0',
    title: 'Rain on Glass',
    category: 'Fire & Water',
    kind: 'scene',
    tags: ['rain', 'window', 'glass', 'bokeh', 'droplets', 'night', 'rivulets'],
    order: 230,
    description: 'Runnels slide and stick down a windowpane, refracting blurred city bokeh, while micro-droplets bead and twinkle on the glass.',
    loop: 12,
    canvas: 'field',
    palette: 'synthwave',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { noise2 } = ctx.noise;
      const { width: W, height: H, px, aspect } = cv;
      const rand = ctx.rng;
      const N = W * H;
      const day = ctx.theme.mode === 'light' && ctx.bg >= 0;
      const S = Math.max(8, Math.min(W, H * aspect));
      // The city beyond the glass: a dim gradient with soft out-of-focus lights.
      const bgA = new Int32Array(N);
      for (let y = 0, i = 0; y < H; y++) {
        const yn = H > 1 ? y / (H - 1) : 0;
        let c = mix(scale(pal(0.08), 0.7), pal(0.24), yn * yn);
        if (day) c = mix(c, ctx.bg, 0.3);
        for (let x = 0; x < W; x++, i++) bgA[i] = c;
      }
      const K = Math.max(5, Math.round(N / 1500));
      for (let b = 0; b < K; b++) {
        const bx = rand() * W, by = H * (0.15 + rand() * 0.75);
        const r = Math.max(2, (2.5 + rand() * 5) * (S / 50));
        const col = pal(0.4 + rand() * 0.55);
        const x0 = Math.max(0, Math.floor(bx - r)), x1 = Math.min(W - 1, Math.ceil(bx + r));
        const y0 = Math.max(0, Math.floor(by - r)), y1 = Math.min(H - 1, Math.ceil(by + r));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const dx = x - bx, dy = (y - by) * aspect;
            const f = 1 - (dx * dx + dy * dy) / (r * r);
            if (f > 0) bgA[y * W + x] = mix(bgA[y * W + x], col, f * f * 0.55);
          }
        }
      }
      const beads = [];
      const nmd = Math.min(140, Math.max(20, Math.round(N / 110)));
      for (let i = 0; i < nmd; i++) {
        beads.push({ j: Math.floor(rand() * H) * W + Math.floor(rand() * W), ph: rand() * TAU, k: 1 + Math.floor(rand() * 2), br: 0.4 + rand() * 0.6 });
      }
      const runnels = [];
      const nr = Math.max(6, Math.min(16, Math.round(W / 10)));
      for (let i = 0; i < nr; i++) {
        runnels.push({
          x0: rand() * W, off: rand(), dur: 0.45 + rand() * 0.45,
          wob: 0.8 + rand() * 1.6, seed: rand() * 90, len: 0.2 + rand() * 0.2,
        });
      }
      const wet = pal(0.92), head = pal(0.98);
      return (t) => {
        px.set(bgA);
        for (const bd of beads) {
          const tw = 0.5 + 0.5 * Math.sin(TAU * bd.k * (t / 12) + bd.ph);
          px[bd.j] = mix(bgA[bd.j], wet, (0.14 + 0.18 * tw) * bd.br);
        }
        for (const r of runnels) {
          const ag = ((t / 12 + r.off) % 1 + 1) % 1;
          if (ag > r.dur) continue;
          const prog = ag / r.dur;
          const pe = prog * prog * 0.6 + prog * 0.4; // picks up speed as it swells
          const hy = pe * (H + 4) - 2;
          const hx = r.x0 + r.wob * Math.sin(prog * 9 + r.seed) + 1.4 * noise2(r.seed, prog * 5);
          const L = Math.max(2, r.len * H * Math.min(1, prog * 3 + 0.2));
          for (let k = 0; k <= L; k++) {
            const ty = Math.floor(hy - k);
            if (ty < 0) break;
            if (ty >= H) continue;
            const txi = Math.floor(hx + 0.6 * Math.sin((prog * 9 + r.seed) - k * 0.12));
            if (txi < 0 || txi >= W) continue;
            const j = ty * W + txi;
            const j2 = Math.min(N - 1, j + 2 * W); // the streak bends light from below
            const a = 1 - k / L;
            px[j] = mix(bgA[j2], wet, 0.12 + 0.26 * a);
          }
          cv.blend(hx, hy, head, 0.9);
          cv.blend(hx, hy - 1, head, 0.45);
        }
        cv.paint(ctx.buffer);
      };
    },
  },

  {
    id: 'fx-ember-drift',
    since: '0.3.0',
    title: 'Ember Drift',
    category: 'Fire & Water',
    kind: 'scene',
    tags: ['embers', 'sparks', 'coals', 'fire', 'night', 'wind', 'glow'],
    order: 240,
    description: 'Sparks lift off a breathing bed of coals and ride gusts into the dark, wobbling and winking out as the cracks pulse below.',
    loop: 12,
    canvas: 'field',
    palette: 'fire',
    setup(ctx) {
      const cv = ctx.canvas();
      const pal = ctx.palette(undefined, { size: 512 });
      const { noise2 } = ctx.noise;
      const { width: W, height: H, px } = cv;
      const rand = ctx.rng;
      const day = ctx.theme.mode === 'light' && ctx.bg >= 0;
      const cH = Math.max(2, Math.round(H * 0.14));
      const bedY = H - cH;
      const bed = new Float32Array(W * cH), crack = new Float32Array(W * cH);
      for (let y = 0; y < cH; y++) {
        for (let x = 0; x < W; x++) {
          bed[y * W + x] = 0.5 + 0.5 * noise2(x * 0.5, y * 0.9 + 3);
          crack[y * W + x] = Math.pow(clamp(1 - Math.abs(noise2(x * 0.16, y * 0.5 + 7)) * 3), 4);
        }
      }
      const embers = [];
      const P = Math.max(24, Math.min(110, Math.round((W * H) / 150)));
      for (let i = 0; i < P; i++) {
        embers.push({
          x0: rand() * W, t0: rand() * 12, life: 2.2 + rand() * 2.6,
          v: H * (0.18 + 0.14 * rand()), drift: (rand() - 0.5) * 3,
          wob: 1.1 + rand() * 1.4, wph: rand() * TAU, h0: 0.55 + rand() * 0.45,
        });
      }
      const skyDark = day ? mix(ctx.bg, pal(0.3), 0.16) : scale(pal(0.06), 0.55);
      const glowC = pal(0.3), crackC = pal(0.9);
      return (t) => {
        const u = TAU * (t / 12);
        const breathe = 0.85 + 0.15 * Math.sin(2 * u);
        for (let y = 0, i = 0; y < H; y++) {
          if (y < bedY) {
            const g = clamp(1 - (bedY - y) / Math.max(1, H * 0.55));
            const glow = g * g;
            for (let x = 0; x < W; x++, i++) {
              let c = mix(skyDark, glowC, glow * 0.45 * breathe);
              const sh = 1 + 0.05 * Math.sin(y * 1.1 + 3 * u + x * 0.07) * glow;
              px[i] = sh > 1.001 || sh < 0.999 ? scale(c, sh) : c;
            }
          } else {
            const by = y - bedY;
            for (let x = 0; x < W; x++, i++) {
              const bb = bed[by * W + x];
              const pulse = 0.72 + 0.28 * Math.sin(2 * u + bb * 5 + x * 0.06);
              const heat = bb * pulse;
              let c = pal(0.1 + 0.5 * heat);
              const cr = crack[by * W + x];
              if (cr > 0.03) c = mix(c, crackC, cr * pulse * 0.8);
              px[i] = c;
            }
          }
        }
        const wind = 5 * Math.sin(u) + 2.2 * Math.sin(2 * u + 1.3);
        for (const e of embers) {
          const age = (((t - e.t0) % 12) + 12) % 12;
          if (age >= e.life) continue;
          const an = age / e.life;
          const ey = bedY - e.v * age * (1 - 0.22 * an);
          if (ey < -2) continue;
          const ex = e.x0 + e.drift * age + wind * an * 0.6 + 2.2 * Math.sin(age * e.wob * 3 + e.wph);
          const heat = e.h0 * (1 - an) * (0.72 + 0.28 * Math.sin(age * 8 + e.wph));
          if (heat <= 0.02) continue;
          const col = pal(0.32 + 0.6 * clamp(heat));
          cv.blend(ex, ey, col, Math.min(1, heat * 1.8));
          if (heat > 0.5) {
            const ga = (heat - 0.5) * 0.5;
            cv.blend(ex + 1, ey, col, ga);
            cv.blend(ex - 1, ey, col, ga);
            cv.blend(ex, ey + 1, col, ga);
            cv.blend(ex, ey - 1, col, ga);
          }
        }
        cv.paint(ctx.buffer);
      };
    },
  },
];
